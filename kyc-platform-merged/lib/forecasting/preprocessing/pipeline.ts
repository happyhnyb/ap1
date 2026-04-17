/**
 * Preprocessing pipeline — takes raw MandiRecord arrays and produces
 * clean, typed TimeSeries objects ready for feature engineering.
 *
 * Steps:
 *   1. Normalize commodity alias → canonical id
 *   2. Build mandi_id slug
 *   3. Group by (commodity_id, mandi_id)
 *   4. Sort by date, deduplicate, aggregate same-day records
 *   5. Detect quality issues (zeros, stale, outliers, gaps)
 *   6. Clip outliers to rolling median
 *   7. Interpolate short gaps (≤ 3 days)
 *   8. Compute freshness
 */

import type { MandiRecord } from '../../mandi/types';
import type { TimeSeriesPoint, TimeSeries, DataQualityFlags } from '../schema/types';
import { normalizeCommodity, buildMandiId, displayName } from '../schema/commodity';
import { buildQualityFlags, clipOutliers } from './quality';
import { interpolateGaps } from './imputer';
import { DEFAULT_QUALITY } from '../schema/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseToIso(dateStr: string): string {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parts = dateStr.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

function avg(values: (number | null)[]): number | null {
  const clean = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!clean.length) return null;
  return clean.reduce((s, v) => s + v, 0) / clean.length;
}

type GroupKey = `${string}__${string}`;

interface DayAggregate {
  modal: (number | null)[];
  min:   (number | null)[];
  max:   (number | null)[];
  arrivals: (number | null)[];
  state:    string;
  district: string;
  market:   string;
}

// ── Pipeline ───────────────────────────────────────────────────────────────────

/**
 * Convert raw MandiRecord[] into a Map of (commodity_id × mandi_id) → TimeSeries.
 *
 * @param records  Raw records from Agmarknet (any date order, any commodity mix).
 * @param fetchedAt  ISO timestamp when this batch was fetched (for freshness calc).
 */
export function buildTimeSeries(
  records: MandiRecord[],
  fetchedAt: string = new Date().toISOString(),
): Map<GroupKey, TimeSeries> {
  // ── Step 1-2: Normalize and group ─────────────────────────────────────────
  const groups = new Map<GroupKey, Map<string, DayAggregate>>();

  for (const r of records) {
    const commodity_id = normalizeCommodity(r.commodity);
    const mandi_id     = buildMandiId(r.market, r.district, r.state);
    const date         = parseToIso(r.arrival_date);
    if (!date) continue;

    const key: GroupKey = `${commodity_id}__${mandi_id}`;

    if (!groups.has(key)) groups.set(key, new Map());
    const dayMap = groups.get(key)!;

    if (!dayMap.has(date)) {
      dayMap.set(date, {
        modal: [], min: [], max: [], arrivals: [],
        state: r.state, district: r.district, market: r.market,
      });
    }
    const agg = dayMap.get(date)!;
    agg.modal.push(r.modal_price);
    agg.min.push(r.min_price);
    agg.max.push(r.max_price);
    agg.arrivals.push(r.arrivals ?? null);
  }

  const result = new Map<GroupKey, TimeSeries>();

  for (const [key, dayMap] of groups) {
    const [commodity_id, mandi_id] = key.split('__');

    // ── Step 3: Sort dates ───────────────────────────────────────────────────
    const sortedDates = [...dayMap.keys()].sort();
    if (sortedDates.length === 0) continue;

    const rawPrices: (number | null)[]        = sortedDates.map((d) => avg(dayMap.get(d)!.modal));
    const rawMin: (number | null)[]           = sortedDates.map((d) => avg(dayMap.get(d)!.min));
    const rawMax: (number | null)[]           = sortedDates.map((d) => avg(dayMap.get(d)!.max));
    const rawArrivals: (number | null)[]      = sortedDates.map((d) => {
      const values = dayMap.get(d)!.arrivals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    });
    const meta = dayMap.get(sortedDates[0])!;

    // ── Step 4: Quality flags on raw prices ──────────────────────────────────
    const qflags: DataQualityFlags[] = buildQualityFlags(rawPrices);

    // ── Step 5: Clip outliers ────────────────────────────────────────────────
    const clipped = clipOutliers(rawPrices, qflags);

    // ── Step 6: Interpolate short gaps ───────────────────────────────────────
    const imputed = interpolateGaps(clipped, qflags);

    // ── Step 7: Freshness ─────────────────────────────────────────────────────
    const fetchMs  = new Date(fetchedAt).getTime();
    const lastDate = sortedDates.at(-1)!;
    const freshness_hours = (fetchMs - new Date(lastDate).getTime()) / 3_600_000;

    const nonNullCount = imputed.filter((v) => v !== null).length;
    const imputedCount = qflags.filter((f) => f.is_imputed).length;

    // ── Step 8: Build TimeSeriesPoint[] ──────────────────────────────────────
    const points: TimeSeriesPoint[] = sortedDates.map((date, i) => ({
      date,
      commodity_id,
      mandi_id,
      state:        meta.state,
      district:     meta.district,
      market:       meta.market,
      modal_price:  imputed[i],
      min_price:    rawMin[i],
      max_price:    rawMax[i],
      arrivals:     rawArrivals[i],
      source:       'agmarknet',
      freshness_hours,
      quality:      qflags[i] ?? DEFAULT_QUALITY,
    }));

    const freshness: TimeSeries['freshness'] =
      freshness_hours < 36 ? 'live'
      : nonNullCount < 7   ? 'insufficient'
      : 'stale';

    result.set(key, {
      commodity_id,
      commodity:    displayName(commodity_id),
      mandi_id,
      state:        meta.state,
      district:     meta.district,
      market:       meta.market,
      points,
      freshness,
      real_count:   nonNullCount - imputedCount,
      imputed_count: imputedCount,
    });
  }

  return result;
}

/**
 * Extract the numeric modal price array from a TimeSeries.
 * Null values remain null (used by feature engineering to determine lag availability).
 */
export function extractPrices(ts: TimeSeries): (number | null)[] {
  return ts.points.map((p) => p.modal_price);
}

/**
 * Filter the map by commodity and/or mandi key fragments.
 */
export function filterTimeSeries(
  seriesMap: Map<GroupKey, TimeSeries>,
  commodity_id: string,
  mandi_id?: string,
): TimeSeries[] {
  return [...seriesMap.values()].filter(
    (ts) =>
      ts.commodity_id === commodity_id &&
      (!mandi_id || ts.mandi_id === mandi_id)
  );
}

/**
 * Find a single (commodity, mandi) series; throws if not found.
 */
export function getTimeSeries(
  seriesMap: Map<GroupKey, TimeSeries>,
  commodity_id: string,
  mandi_id: string,
): TimeSeries | null {
  const key: GroupKey = `${commodity_id}__${mandi_id}`;
  return seriesMap.get(key) ?? null;
}

/**
 * Merge multiple daily snapshot record arrays into one de-duplicated set.
 * Use this when loading from disk snapshots with overlapping records.
 */
export function mergeRecords(batches: MandiRecord[][]): MandiRecord[] {
  const seen = new Set<string>();
  const result: MandiRecord[] = [];
  for (const batch of batches) {
    for (const r of batch) {
      const key = [
        r.state, r.district, r.market, r.commodity, r.variety, r.grade,
        r.arrival_date, r.modal_price,
      ].join('|');
      if (!seen.has(key)) {
        seen.add(key);
        result.push(r);
      }
    }
  }
  return result;
}
