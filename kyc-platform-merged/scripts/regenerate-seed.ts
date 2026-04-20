#!/usr/bin/env node
/**
 * Regenerate lib/forecasting/data/seed-series.json
 *
 * Fetches the last DAYS_BACK days of mandi data from data.gov.in (Agmarknet)
 * and writes a compact seed file used by the predictor at build/request time.
 *
 * Usage:
 *   npx tsx scripts/regenerate-seed.ts
 *
 * Requires env var: DATAGOV_API_KEY
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

// ── Config ────────────────────────────────────────────────────────────────────
// Env vars are injected by CI. For local use:
//   DATAGOV_API_KEY=xxx npx tsx scripts/regenerate-seed.ts

const RESOURCE_ID  = '9ef84268-d588-465a-a308-a864a43d0070';
const BASE_URL     = `https://api.data.gov.in/resource/${RESOURCE_ID}`;
const FETCH_LIMIT  = 500;
const MAX_PAGES    = 10;  // 5 000 records/day maximum
const DAYS_BACK    = Number(process.env.DAYS_BACK || 45);
const DAY_DELAY_MS = 800; // pause between days to avoid 429
const RETRY_MAX    = 3;   // retries per page on 429
const RETRY_DELAY  = 2000; // ms between retries

const API_KEY = process.env.DATAGOV_API_KEY;
if (!API_KEY) {
  console.error('[regenerate-seed] DATAGOV_API_KEY is not set');
  process.exit(1);
}

// ── Commodity alias normalisation (mirrors lib/forecasting/schema/commodity.ts) ─

const ALIAS_MAP: Array<{ fragment: string; id: string }> = [
  { fragment: 'arhar',       id: 'arhar'     },
  { fragment: 'pigeon pea',  id: 'arhar'     },
  { fragment: 'toor',        id: 'arhar'     },
  { fragment: 'tur',         id: 'arhar'     },
  { fragment: 'moong',       id: 'moong'     },
  { fragment: 'green gram',  id: 'moong'     },
  { fragment: 'urad',        id: 'urad'      },
  { fragment: 'black gram',  id: 'urad'      },
  { fragment: 'bengal gram', id: 'gram'      },
  { fragment: 'chickpea',    id: 'gram'      },
  { fragment: 'chana',       id: 'gram'      },
  { fragment: 'gram',        id: 'gram'      },
  { fragment: 'pearl millet',id: 'bajra'     },
  { fragment: 'bajra',       id: 'bajra'     },
  { fragment: 'sorghum',     id: 'jowar'     },
  { fragment: 'jowar',       id: 'jowar'     },
  { fragment: 'rapeseed',    id: 'mustard'   },
  { fragment: 'mustard',     id: 'mustard'   },
  { fragment: 'soya bean',   id: 'soybean'   },
  { fragment: 'soyabean',    id: 'soybean'   },
  { fragment: 'soybean',     id: 'soybean'   },
  { fragment: 'sugar cane',  id: 'sugarcane' },
  { fragment: 'sugarcane',   id: 'sugarcane' },
  { fragment: 'red chilli',  id: 'chilli'    },
  { fragment: 'dry chilli',  id: 'chilli'    },
  { fragment: 'chilli',      id: 'chilli'    },
  { fragment: 'chili',       id: 'chilli'    },
  { fragment: 'jaggery',     id: 'jaggery'   },
  { fragment: 'gur',         id: 'jaggery'   },
  { fragment: 'groundnut',   id: 'groundnut' },
  { fragment: 'peanut',      id: 'groundnut' },
  { fragment: 'turmeric',    id: 'turmeric'  },
  { fragment: 'garlic',      id: 'garlic'    },
  { fragment: 'barley',      id: 'barley'    },
  { fragment: 'maize',       id: 'maize'     },
  { fragment: 'corn',        id: 'maize'     },
  { fragment: 'cotton',      id: 'cotton'    },
  { fragment: 'potato',      id: 'potato'    },
  { fragment: 'tomato',      id: 'tomato'    },
  { fragment: 'onion',       id: 'onion'     },
  { fragment: 'rice',        id: 'rice'      },
  { fragment: 'paddy',       id: 'paddy'     },
  { fragment: 'wheat',       id: 'wheat'     },
].sort((a, b) => b.fragment.length - a.fragment.length);

function normalizeCommodity(raw: string): string {
  const lower = raw.toLowerCase().replace(/[()]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  for (const { fragment, id } of ALIAS_MAP) {
    if (lower.includes(fragment)) return id;
  }
  return lower.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function getIsoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function isoToAgmarknet(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ── API fetch ─────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(
  offset: number,
  arrivalDate: string,
): Promise<{ records: Record<string, unknown>[]; total: number }> {
  const url = new URL(BASE_URL);
  url.searchParams.set('api-key', API_KEY!);
  url.searchParams.set('format',  'json');
  url.searchParams.set('limit',   String(FETCH_LIMIT));
  url.searchParams.set('offset',  String(offset));
  url.searchParams.set('filters[arrival_date]', arrivalDate);

  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (res.status === 429) {
      if (attempt < RETRY_MAX) {
        await sleep(RETRY_DELAY * (attempt + 1));
        continue;
      }
      throw new Error(`HTTP 429 after ${RETRY_MAX} retries`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { records?: Record<string, unknown>[]; total?: number };
    return { records: data.records ?? [], total: Number(data.total ?? 0) };
  }
  throw new Error('fetchPage: unreachable');
}

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

async function fetchDay(isoDate: string): Promise<SeedRow[]> {
  const agDate = isoToAgmarknet(isoDate);
  let first: { records: Record<string, unknown>[]; total: number };

  try {
    first = await fetchPage(0, agDate);
  } catch (e) {
    console.warn(`  [warn] ${isoDate}: ${(e as Error).message}`);
    return [];
  }

  if (!first.records.length) return [];

  const pages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(first.total / FETCH_LIMIT)));
  let allRaw = [...first.records];

  // Sequential page fetches to avoid 429
  for (let p = 1; p < pages; p++) {
    try {
      await sleep(300);
      const page = await fetchPage(p * FETCH_LIMIT, agDate);
      allRaw.push(...page.records);
    } catch {
      // skip page on repeated failure
    }
  }

  return allRaw
    .map((r): SeedRow | null => {
      const modal = parseNumber(r.modal_price);
      if (modal == null) return null;
      const c = normalizeCommodity(String(r.commodity || ''));
      if (!c) return null;
      const s = String(r.state    || '').trim();
      const m = String(r.market   || '').trim();
      if (!s || !m) return null;
      return {
        c, s,
        dist:     String(r.district || '').trim(),
        m, d: isoDate,
        modal,
        min:      parseNumber(r.min_price),
        max:      parseNumber(r.max_price),
        arrivals: parseNumber(r.arrivals),
      };
    })
    .filter((r): r is SeedRow => r !== null);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Dates: oldest first so progress is chronological
  const dates = Array.from({ length: DAYS_BACK }, (_, i) => getIsoDate(DAYS_BACK - 1 - i));
  console.log(`[regenerate-seed] Fetching ${DAYS_BACK} days sequentially (${dates[0]} → ${dates.at(-1)}) …`);

  const allRows: SeedRow[] = [];

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    process.stdout.write(`  [${i + 1}/${dates.length}] ${date} … `);
    const rows = await fetchDay(date);
    allRows.push(...rows);
    console.log(`${rows.length} rows`);
    // Pause between days to respect rate limits
    if (i + 1 < dates.length) await sleep(DAY_DELAY_MS);
  }

  // Deduplicate by composite key
  const seen = new Set<string>();
  const deduped = allRows.filter((r) => {
    const key = `${r.c}|${r.s}|${r.dist}|${r.m}|${r.d}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Derive actual date range from data
  const sortedDates = deduped.map((r) => r.d).sort();
  const from = sortedDates[0]           ?? dates[0];
  const to   = sortedDates.at(-1) ?? dates.at(-1)!;

  const output = { from, to, rows: deduped };
  const outPath = join(process.cwd(), 'lib/forecasting/data/seed-series.json');
  writeFileSync(outPath, JSON.stringify(output), 'utf8');

  const states      = new Set(deduped.map((r) => r.s)).size;
  const markets     = new Set(deduped.map((r) => r.m)).size;
  const commodities = new Set(deduped.map((r) => r.c)).size;

  console.log(`\n[regenerate-seed] Done`);
  console.log(`  Rows:        ${deduped.length.toLocaleString()}`);
  console.log(`  States:      ${states}`);
  console.log(`  Markets:     ${markets}`);
  console.log(`  Commodities: ${commodities}`);
  console.log(`  Date range:  ${from} → ${to}`);
  console.log(`  Written to:  ${outPath}`);
}

main().catch((e) => {
  console.error('[regenerate-seed] Fatal:', e);
  process.exit(1);
});
