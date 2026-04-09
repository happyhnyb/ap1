/**
 * Backfill historical snapshots for the mandi service.
 * Generates 30 days of synthetic price history using a random walk
 * derived from today's real snapshot, so the forecast algorithm has
 * enough data to produce projections.
 *
 * Run once:  node scripts/backfill.js
 * Safe to re-run — skips dates that already have a snapshot file.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const snapshotsDir = path.resolve(__dirname, '../data/snapshots');
const DAYS = 30;
const DAILY_VOL = 0.018; // 1.8% daily price volatility (realistic for agri commodities)
const SEED = 42;

// Deterministic pseudo-random (mulberry32)
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

function dateString(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  // Format dd/mm/yyyy to match Agmarknet format
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Asia/Kolkata'
  }); // returns dd/mm/yyyy on en-IN
}

function isoDateString(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d); // yyyy-mm-dd
}

async function main() {
  await fsp.mkdir(snapshotsDir, { recursive: true });

  // Load today's snapshot as baseline
  const todayIso = isoDateString(0);
  const todayFile = path.join(snapshotsDir, `${todayIso}.json`);
  if (!fs.existsSync(todayFile)) {
    console.error('No snapshot for today found. Run the mandi service first to fetch today\'s data.');
    process.exit(1);
  }

  const today = JSON.parse(fs.readFileSync(todayFile, 'utf8'));
  const baseRecords = today.records;
  console.log(`Loaded ${baseRecords.length} records from today's snapshot (${todayIso}).`);

  let created = 0;
  let skipped = 0;

  // Generate snapshots for each past day
  for (let daysAgo = 1; daysAgo <= DAYS; daysAgo++) {
    const isoDate = isoDateString(daysAgo);
    const filePath = path.join(snapshotsDir, `${isoDate}.json`);

    if (fs.existsSync(filePath)) {
      skipped++;
      continue;
    }

    const rng = makeRng(SEED + daysAgo * 997);
    const arrivalDate = dateString(daysAgo);

    // Apply cumulative random walk backward from today
    // (daysAgo=1 is yesterday, close to today; daysAgo=30 has more drift)
    const records = baseRecords.map((r) => {
      const drift = 1 + (rng() - 0.5) * 2 * DAILY_VOL * daysAgo;
      const applyDrift = (price) => {
        if (price == null) return null;
        return Number(Math.max(1, price * drift).toFixed(2));
      };
      return {
        ...r,
        arrival_date: arrivalDate,
        modal_price: applyDrift(r.modal_price),
        min_price:   applyDrift(r.min_price),
        max_price:   applyDrift(r.max_price),
      };
    });

    const snapshot = {
      snapshotDate: isoDate,
      fetchedAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      resourceId: today.resourceId,
      recordCount: records.length,
      synthetic: true, // mark so we know these aren't real API fetches
      records,
    };

    await fsp.writeFile(filePath, JSON.stringify(snapshot), 'utf8');
    created++;

    if (created % 5 === 0) process.stdout.write(`  Created ${created} snapshots...\r`);
  }

  console.log(`\nDone. Created: ${created}, Skipped (already exist): ${skipped}`);
  console.log(`Snapshots dir: ${snapshotsDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
