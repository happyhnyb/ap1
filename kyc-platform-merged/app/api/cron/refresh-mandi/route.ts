/**
 * Vercel Cron endpoint — daily mandi data refresh
 *
 * Runs at 00:30 IST (19:00 UTC) every day via vercel.json cron config.
 * Can also be triggered manually or by the GitHub Actions workflow dispatch.
 *
 * TWO-PHASE strategy:
 *
 *   Phase 1 — Direct MongoDB write (fast, runs in this request):
 *     Fetches yesterday's and today's Agmarknet data and upserts them into
 *     MongoDB.  This makes fresh data available to the loader immediately
 *     — no code deploy needed.  Works as long as DATAGOV_API_KEY is set.
 *
 *   Phase 2 — GitHub Actions dispatch (async, triggers seed regeneration):
 *     Dispatches the `refresh-mandi-data` workflow which fetches 45 days,
 *     regenerates seed-series.json, commits it, and deploys to Vercel.
 *     This ensures the git seed stays fresh so cold-start Vercel instances
 *     also get good data even before MongoDB accumulates enough history.
 *     Requires GITHUB_DISPATCH_TOKEN, GITHUB_OWNER, GITHUB_REPO.
 *
 * Required env vars (set in Vercel dashboard):
 *   CRON_SECRET           — shared secret validated by Vercel's cron caller
 *   DATAGOV_API_KEY       — data.gov.in API key for Agmarknet
 *
 * Optional env vars (for Phase 2 dispatch):
 *   GITHUB_DISPATCH_TOKEN — GitHub PAT with workflow:write scope
 *   GITHUB_OWNER          — repo owner (e.g. "happyhnyb")
 *   GITHUB_REPO           — repo name  (e.g. "ap1")
 */

import { NextRequest, NextResponse } from 'next/server';
import { upsertSnapshot } from '@/lib/forecasting/data/store';
import { getStoreStatus } from '@/lib/forecasting/data/store';
import { getSeedFetchedAt } from '@/lib/forecasting/data/seed';
import type { MandiRecord } from '@/lib/mandi/types';

export const runtime    = 'nodejs';
export const dynamic    = 'force-dynamic';
export const maxDuration = 60;  // Vercel Pro: up to 300s, Hobby: 60s

const RESOURCE_ID  = '9ef84268-d588-465a-a308-a864a43d0070';
const BASE_URL     = `https://api.data.gov.in/resource/${RESOURCE_ID}`;
const FETCH_LIMIT  = 500;
const MAX_PAGES    = 10;   // max 5 000 records per day
const WORKFLOW_ID  = 'refresh-mandi-data.yml';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getIstDate(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function isoToAgmarknet(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function parseNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeRecord(r: Record<string, unknown>): MandiRecord {
  return {
    state:        String(r.state        || ''),
    district:     String(r.district     || ''),
    market:       String(r.market       || ''),
    commodity:    String(r.commodity    || ''),
    variety:      String(r.variety      || ''),
    grade:        String(r.grade        || ''),
    arrival_date: String(r.arrival_date || ''),
    min_price:    parseNumber(r.min_price),
    max_price:    parseNumber(r.max_price),
    modal_price:  parseNumber(r.modal_price),
    arrivals:     parseNumber(r.arrivals),
  };
}

async function fetchDayRecords(
  apiKey: string,
  isoDate: string,
): Promise<MandiRecord[]> {
  const agDate = isoToAgmarknet(isoDate);
  const url    = new URL(BASE_URL);
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('format',  'json');
  url.searchParams.set('limit',   String(FETCH_LIMIT));
  url.searchParams.set('offset',  '0');
  url.searchParams.set('filters[arrival_date]', agDate);

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    cache:   'no-store',
  });
  if (!res.ok) throw new Error(`Agmarknet ${res.status} for ${isoDate}`);

  const data = await res.json() as { records?: Record<string, unknown>[]; total?: number };
  const first = data.records ?? [];
  const total = Number(data.total ?? first.length);

  // Fetch remaining pages in parallel (capped at MAX_PAGES)
  const pages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(total / FETCH_LIMIT)));
  let allRaw  = [...first];

  if (pages > 1) {
    const rest = await Promise.allSettled(
      Array.from({ length: pages - 1 }, (_, i) => {
        const u2 = new URL(BASE_URL);
        u2.searchParams.set('api-key', apiKey);
        u2.searchParams.set('format',  'json');
        u2.searchParams.set('limit',   String(FETCH_LIMIT));
        u2.searchParams.set('offset',  String((i + 1) * FETCH_LIMIT));
        u2.searchParams.set('filters[arrival_date]', agDate);
        return fetch(u2.toString(), { headers: { Accept: 'application/json' }, cache: 'no-store' })
          .then((r) => r.json() as Promise<{ records?: Record<string, unknown>[] }>)
          .then((d) => d.records ?? []);
      })
    );
    for (const r of rest) {
      if (r.status === 'fulfilled') allRaw.push(...r.value);
    }
  }

  // Normalize and deduplicate
  const seen = new Set<string>();
  const out: MandiRecord[] = [];
  for (const r of allRaw) {
    const norm = normalizeRecord(r);
    const key  = `${norm.state}|${norm.district}|${norm.market}|${norm.commodity}|${norm.arrival_date}`;
    if (!seen.has(key)) { seen.add(key); out.push(norm); }
  }
  return out;
}

// ── GitHub Actions dispatch ───────────────────────────────────────────────────

type DispatchStatus = 'triggered' | 'skipped' | 'not_configured' | 'error';

async function dispatchGitHubWorkflow(): Promise<{ status: DispatchStatus; error?: string }> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) return { status: 'not_configured' };

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_ID}/dispatches`,
      {
        method:  'POST',
        headers: {
          Accept:        'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      },
    );

    if (res.status === 204) return { status: 'triggered' };
    const body = await res.text();
    return { status: 'error', error: `HTTP ${res.status}: ${body}` };
  } catch (e) {
    return { status: 'error', error: (e as Error).message };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {

  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const apiKey    = process.env.DATAGOV_API_KEY || '';
  const fetchedAt = new Date().toISOString();
  const results: Array<{ date: string; stored: number; error?: string }> = [];

  // ── Phase 1: fetch & store today + yesterday ──────────────────────────────
  if (apiKey) {
    // Agmarknet often publishes yesterday's data only by midnight IST.
    // We fetch today AND yesterday to maximise the chance of fresh data.
    for (const daysAgo of [0, 1]) {
      const date = getIstDate(daysAgo);
      try {
        const records = await fetchDayRecords(apiKey, date);
        const stored  = records.length
          ? await upsertSnapshot(date, records, fetchedAt)
          : 0;
        results.push({ date, stored });
      } catch (e) {
        results.push({ date, stored: 0, error: (e as Error).message });
      }
    }
  }

  // ── Phase 2: dispatch GitHub Actions for seed regeneration ────────────────
  const dispatch = await dispatchGitHubWorkflow();

  // ── Response ──────────────────────────────────────────────────────────────
  const storeStatus = await getStoreStatus();
  const seedDate    = getSeedFetchedAt();
  const seedAgeDays = Math.floor(
    (Date.now() - new Date(seedDate).getTime()) / 86_400_000
  );

  return NextResponse.json({
    ok:         true,
    checkedAt:  fetchedAt,
    phase1: {
      apiKeySet: !!apiKey,
      days:      results,
      totalStored: results.reduce((s, r) => s + r.stored, 0),
    },
    phase2: {
      dispatch: dispatch.status,
      ...(dispatch.error ? { error: dispatch.error } : {}),
    },
    store: storeStatus,
    seed:  { date: seedDate, ageDays: seedAgeDays },
  });
}
