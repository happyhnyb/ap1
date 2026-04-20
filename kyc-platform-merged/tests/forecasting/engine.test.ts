import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadRecordsMock = vi.fn();

vi.mock('../../lib/forecasting/data/loader', () => ({
  loadRecords: (...args: unknown[]) => loadRecordsMock(...args),
}));

import type { MandiRecord } from '../../lib/mandi/types';
import { ForecastingEngine } from '../../lib/forecasting/engine';

function makeRecords(): MandiRecord[] {
  const rows: MandiRecord[] = [];
  const start = new Date('2026-03-01T00:00:00Z');

  for (let i = 0; i < 35; i++) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + i);
    rows.push({
      state: 'Bihar',
      district: 'Purnia',
      market: 'Gulabbagh APMC',
      commodity: 'Maize',
      variety: 'Local',
      grade: 'FAQ',
      arrival_date: date.toISOString().slice(0, 10),
      min_price: 1800 + i,
      max_price: 1900 + i,
      modal_price: 1850 + i,
      arrivals: 120 + i,
    });
  }

  return rows;
}

describe('ForecastingEngine mandi resolution', () => {
  beforeEach(() => {
    loadRecordsMock.mockReset();
    loadRecordsMock.mockResolvedValue({
      records: makeRecords(),
      fetchedAt: '2026-04-14T00:00:00.000Z',
      source: 'snapshots',
      snapshotCount: 35,
    });
  });

  it('matches a market even when district is omitted', async () => {
    const engine = new ForecastingEngine();
    const result = await engine.forecast({
      commodity: 'Maize',
      state: 'Bihar',
      market: 'Gulabbagh APMC',
      horizon: 7,
    });

    expect(result.insufficient).toBe(false);
    expect(result.market).toBe('Gulabbagh APMC');
  });

  it('matches fuzzy market text without requiring the APMC suffix', async () => {
    const engine = new ForecastingEngine();
    const result = await engine.forecast({
      commodity: 'Maize',
      state: 'Bihar',
      market: 'Gulabbagh',
      horizon: 7,
    });

    expect(result.insufficient).toBe(false);
    expect(result.market).toBe('Gulabbagh APMC');
  });

  it('marks quality warnings when data snapshots are stale', async () => {
    loadRecordsMock.mockResolvedValueOnce({
      records: makeRecords(),
      fetchedAt: '2026-04-10T00:00:00.000Z',
      source: 'snapshots',
      snapshotCount: 35,
    });

    const engine = new ForecastingEngine();
    const quality = await engine.quality({
      commodity: 'Maize',
      state: 'Bihar',
      market: 'Gulabbagh APMC',
    });

    expect(quality.warnings.some((warning) => warning.toLowerCase().includes('stale'))).toBe(true);
  });
});
