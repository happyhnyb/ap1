import seedSeries from './seed-series.json';
import type { MandiFilters, MandiRecord } from '@/lib/mandi/types';
import { buildOptions, buildSummary } from '@/lib/mandi/engine';
import { displayName, normalizeCommodity } from '@/lib/forecasting/schema/commodity';

type SeedRow = {
  c: string;
  s: string;
  dist: string;
  m: string;
  d: string;
  modal: number;
  min: number | null;
  max: number | null;
  arrivals: number | null;
};

function sameFilter(actual: string, expected: string) {
  return !expected || actual.trim().toLowerCase() === expected.trim().toLowerCase();
}

function toRecord(row: SeedRow): MandiRecord {
  return {
    state: row.s,
    district: row.dist,
    market: row.m,
    commodity: displayName(row.c),
    variety: '',
    grade: '',
    arrival_date: row.d,
    min_price: row.min,
    max_price: row.max,
    modal_price: row.modal,
    arrivals: row.arrivals,
  };
}

export function getSeedRecords(filters: Partial<MandiFilters> = {}): MandiRecord[] {
  const commodity = filters.commodity ? normalizeCommodity(filters.commodity) : '';
  return (seedSeries.rows as SeedRow[])
    .filter((row) =>
      (!commodity || row.c === commodity)
      && sameFilter(row.s, filters.state ?? '')
      && sameFilter(row.dist, filters.district ?? '')
      && sameFilter(row.m, filters.market ?? '')
    )
    .map(toRecord);
}

export function getSeedFetchedAt() {
  return `${seedSeries.to}T00:00:00.000Z`;
}

export function buildSeedOptions() {
  const records = getSeedRecords();
  const options = buildOptions(records);
  return {
    ...options,
    commodities: Array.from(
      new Set((seedSeries.rows as SeedRow[]).map((row) => displayName(row.c)))
    ).sort((a, b) => a.localeCompare(b)),
  };
}

export function buildSeedSummary(filters: Partial<MandiFilters>) {
  const records = getSeedRecords(filters);
  const latestDate = records.map((record) => record.arrival_date).sort().at(-1);
  const latestRecords = latestDate
    ? records.filter((record) => record.arrival_date === latestDate)
    : records;

  return buildSummary(latestRecords, getSeedFetchedAt());
}
