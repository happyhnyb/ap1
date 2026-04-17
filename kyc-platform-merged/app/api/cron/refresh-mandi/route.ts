/**
 * Vercel Cron endpoint — daily mandi data refresh
 *
 * Triggered by Vercel Cron at 00:30 IST (19:00 UTC) every day.
 * Configured in vercel.json: { "crons": [{ "path": "/api/cron/refresh-mandi", "schedule": "0 19 * * *" }] }
 *
 * What it does:
 *   1. Validates the cron secret so only Vercel (or authorised callers) can invoke it.
 *   2. Dispatches the "refresh-mandi-data" GitHub Actions workflow, which:
 *        - Fetches latest 45 days from Agmarknet
 *        - Regenerates seed-series.json
 *        - Commits and pushes → triggers a new Vercel production deploy with fresh data
 *   3. Returns a JSON status response with the current seed age.
 *
 * Required env vars (set in Vercel dashboard):
 *   CRON_SECRET           — a random secret shared with the Vercel cron config
 *   GITHUB_DISPATCH_TOKEN — a GitHub PAT with `workflow:write` scope
 *   GITHUB_OWNER          — repository owner (e.g. "happyhnybs-projects")
 *   GITHUB_REPO           — repository name (e.g. "kyc-platform-merged")
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSeedFetchedAt } from '@/lib/forecasting/data/seed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WORKFLOW_ID = 'refresh-mandi-data.yml';

export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // ── Seed freshness ──────────────────────────────────────────────────────────
  const seedFetchedAt = getSeedFetchedAt();
  const seedDate      = new Date(seedFetchedAt);
  const ageMs         = Date.now() - seedDate.getTime();
  const ageDays       = Math.floor(ageMs / 86_400_000);
  const isStale       = ageDays >= 2;

  // ── Dispatch GitHub Actions workflow ─────────────────────────────────────────
  const ghToken = process.env.GITHUB_DISPATCH_TOKEN;
  const ghOwner = process.env.GITHUB_OWNER;
  const ghRepo  = process.env.GITHUB_REPO;

  let dispatchStatus: 'skipped' | 'triggered' | 'error' | 'not_configured' = 'not_configured';
  let dispatchError: string | undefined;

  if (ghToken && ghOwner && ghRepo) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${ghOwner}/${ghRepo}/actions/workflows/${WORKFLOW_ID}/dispatches`,
        {
          method: 'POST',
          headers: {
            Accept:        'application/vnd.github+json',
            Authorization: `Bearer ${ghToken}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ref: 'main' }),
        }
      );

      if (res.status === 204) {
        dispatchStatus = 'triggered';
      } else {
        const body = await res.text();
        dispatchStatus = 'error';
        dispatchError  = `HTTP ${res.status}: ${body}`;
      }
    } catch (e) {
      dispatchStatus = 'error';
      dispatchError  = (e as Error).message;
    }
  } else {
    // If GitHub dispatch is not configured, just log the freshness check.
    // The seed data will be refreshed on the next Vercel deploy triggered by
    // the GitHub Actions schedule, or manually via `vercel --prod`.
    dispatchStatus = 'not_configured';
  }

  return NextResponse.json({
    ok:           true,
    seedDate:     seedFetchedAt,
    ageDays,
    isStale,
    dispatchStatus,
    ...(dispatchError ? { dispatchError } : {}),
    checkedAt:    new Date().toISOString(),
  });
}
