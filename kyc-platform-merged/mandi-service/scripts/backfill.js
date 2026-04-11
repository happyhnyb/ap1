/**
 * Backfill historical snapshots for the mandi service.
 *
 * Strategy (per day):
 *   1. Try the real Agmarknet API filtered by arrival_date=dd/mm/yyyy
 *   2. If the API returns ≥10 records, save as a real snapshot
 *   3. Otherwise generate a realistic synthetic snapshot via a seeded random-walk
 *      derived from today's real snapshot
 *
 * All arrival_date values are stored as ISO yyyy-mm-dd so sorting is correct.
 *
 * Usage:
 *   node scripts/backfill.js           # fills BACKFILL_DAYS (default 90)
 *   node scripts/backfill.js --force   # overwrites existing files too
 *
 * Safe to re-run without --force — skips dates that already have a file.
 */

import fs   from "node:fs";
import fsp  from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });
dotenv.config({ path: "../.env" });
dotenv.config();

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const snapshotsDir = path.resolve(__dirname, "../data/snapshots");
const BACKFILL_DAYS  = Number(process.env.BACKFILL_DAYS  || 90);
const FETCH_LIMIT    = Number(process.env.FETCH_LIMIT    || 500);
const API_KEY        = process.env.DATAGOV_API_KEY || "";
const RESOURCE_ID    = "9ef84268-d588-465a-a308-a864a43d0070";
const BASE_URL       = `https://api.data.gov.in/resource/${RESOURCE_ID}`;
const FORCE          = process.argv.includes("--force");
const DAILY_VOL      = 0.018;  // 1.8% daily price volatility
const MIN_REAL_RECORDS = 10;   // treat API response as real only if ≥ this many records

// ── Date helpers ────────────────────────────────────────────────

/** Returns ISO yyyy-mm-dd for N days ago (IST) */
function isoDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/** Returns dd/mm/yyyy for N days ago (Agmarknet filter format) */
function agmarkDate(daysAgo) {
  const iso = isoDate(daysAgo);       // yyyy-mm-dd
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ── Agmarknet API fetch ─────────────────────────────────────────

function parseNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeRecord(r, isoArrivalDate) {
  return {
    state:        r.state     || "",
    district:     r.district  || "",
    market:       r.market    || "",
    commodity:    r.commodity || "",
    variety:      r.variety   || "",
    grade:        r.grade     || "",
    arrival_date: isoArrivalDate,      // always ISO
    min_price:    parseNumber(r.min_price),
    max_price:    parseNumber(r.max_price),
    modal_price:  parseNumber(r.modal_price),
  };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchDatePage(dateStr, offset, retries = 3) {
  const url = new URL(BASE_URL);
  url.searchParams.set("api-key", API_KEY);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(FETCH_LIMIT));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("filters[arrival_date]", dateStr);  // dd/mm/yyyy

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === retries) return null;
        await sleep(attempt * 3000);
        continue;
      }
      if (!res.ok) return null;
      return res.json();
    } catch {
      if (attempt === retries) return null;
      await sleep(attempt * 2000);
    }
  }
  return null;
}

async function fetchRealRecordsForDate(isoDateStr) {
  if (!API_KEY) return null;
  const agDate = agmarkDate(0);   // we pass the date as dd/mm/yyyy
  // Compute dd/mm/yyyy from iso
  const [y, m, d] = isoDateStr.split("-");
  const dateFilter = `${d}/${m}/${y}`;

  const first = await fetchDatePage(dateFilter, 0);
  if (!first || !Array.isArray(first.records)) return null;

  const total   = Number(first.total || 0);
  const pages   = Math.max(1, Math.ceil(total / FETCH_LIMIT));
  const records = [...first.records];

  for (let p = 1; p < pages; p++) {
    await sleep(400);
    const page = await fetchDatePage(dateFilter, p * FETCH_LIMIT);
    if (page?.records) records.push(...page.records);
  }

  if (records.length < MIN_REAL_RECORDS) return null;

  // De-duplicate
  const seen = new Set();
  const deduped = [];
  for (const r of records) {
    const key = [r.state, r.district, r.market, r.commodity, r.variety, r.grade, r.min_price, r.max_price, r.modal_price].join("|");
    if (!seen.has(key)) { seen.add(key); deduped.push(normalizeRecord(r, isoDateStr)); }
  }
  return deduped;
}

// ── Synthetic fallback ──────────────────────────────────────────

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSyntheticRecords(baseRecords, isoDateStr, daysAgo) {
  const rng = makeRng(42 + daysAgo * 997);
  return baseRecords.map((r) => {
    const drift = 1 + (rng() - 0.5) * 2 * DAILY_VOL * daysAgo;
    const applyDrift = (price) => price == null ? null : Number(Math.max(1, price * drift).toFixed(2));
    return { ...r, arrival_date: isoDateStr, modal_price: applyDrift(r.modal_price), min_price: applyDrift(r.min_price), max_price: applyDrift(r.max_price) };
  });
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  await fsp.mkdir(snapshotsDir, { recursive: true });

  // Load today's real snapshot as synthetic baseline
  const todayIso  = isoDate(0);
  const todayFile = path.join(snapshotsDir, `${todayIso}.json`);
  if (!fs.existsSync(todayFile)) {
    console.error(`No snapshot for today (${todayIso}). Start the mandi service first to fetch today's data, then re-run.`);
    process.exit(1);
  }
  const today      = JSON.parse(fs.readFileSync(todayFile, "utf8"));
  const baseRecords = today.records;
  console.log(`Baseline: ${baseRecords.length} records from today (${todayIso}).`);
  console.log(`Backfilling ${BACKFILL_DAYS} days. Real API: ${API_KEY ? "yes" : "NO KEY — synthetic only"}`);
  console.log(`Force-overwrite: ${FORCE}\n`);

  let created = 0, skipped = 0, real = 0, synthetic = 0;

  for (let daysAgo = 1; daysAgo <= BACKFILL_DAYS; daysAgo++) {
    const isoDateStr = isoDate(daysAgo);
    const filePath   = path.join(snapshotsDir, `${isoDateStr}.json`);

    if (!FORCE && fs.existsSync(filePath)) {
      skipped++;
      continue;
    }

    process.stdout.write(`  [${daysAgo}/${BACKFILL_DAYS}] ${isoDateStr} — `);

    // Try real API first
    let records = await fetchRealRecordsForDate(isoDateStr);
    let isSynthetic = false;

    if (records && records.length >= MIN_REAL_RECORDS) {
      real++;
      process.stdout.write(`real (${records.length} records)\n`);
    } else {
      // Synthetic fallback
      records = buildSyntheticRecords(baseRecords, isoDateStr, daysAgo);
      isSynthetic = true;
      synthetic++;
      process.stdout.write(`synthetic (${records.length} records)\n`);
    }

    const snapshot = {
      snapshotDate: isoDateStr,
      fetchedAt:    new Date(Date.now() - daysAgo * 86400000).toISOString(),
      resourceId:   today.resourceId,
      recordCount:  records.length,
      synthetic:    isSynthetic,
      records,
    };

    await fsp.writeFile(filePath, JSON.stringify(snapshot), "utf8");
    created++;

    // Throttle API calls — don't hammer the endpoint
    if (!isSynthetic) await sleep(800);
  }

  console.log(`\nDone.`);
  console.log(`  Created: ${created}  Skipped (already exist): ${skipped}`);
  console.log(`  Real API: ${real}  Synthetic fallback: ${synthetic}`);
  console.log(`  Snapshots dir: ${snapshotsDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
