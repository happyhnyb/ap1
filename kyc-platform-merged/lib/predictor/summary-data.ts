import { filterRecords, buildSummary } from '@/lib/mandi/engine';
import { buildSeedSummary, getSeedRecords } from '@/lib/forecasting/data/seed';
import { loadRecords } from '@/lib/forecasting/data/loader';
import type { MandiFilters } from '@/lib/mandi/types';

export async function getPredictorSummaryData(filters: MandiFilters) {
  const { records, fetchedAt } = await loadRecords({
    commodity: filters.commodity,
    state: filters.state,
    market: filters.market,
  });

  const filtered = filterRecords(records, filters);
  if (filtered.length) {
    return buildSummary(filtered, fetchedAt);
  }

  const seedRecords = getSeedRecords(filters);
  if (seedRecords.length) {
    return buildSeedSummary(filters);
  }

  throw new Error('Predictor service unavailable.');
}
