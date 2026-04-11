/**
 * KYC Mandi Service — Express backend
 * Fetches Agmarknet data daily, serves price history, summary, and trend forecast.
 *
 * Forecast algorithm: Holt's Double Exponential Smoothing (level + trend)
 * Reliable, transparent, and production-appropriate for 7–14 day price trends.
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: "../.env.local" }); // Next.js local overrides (contains DATAGOV_API_KEY etc.)
dotenv.config({ path: "../.env" });       // Base project .env (lower priority)
dotenv.config();                          // mandi-service local .env if it exists

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const rootDir    = path.resolve(__dirname, "..");
const dataDir    = path.join(rootDir, "data");
const snapshotsDir = path.join(dataDir, "snapshots");
const statusFile = path.join(dataDir, "status.json");

const app      = express();
const PORT     = Number(process.env.PORT || 4000);
const API_KEY  = process.env.DATAGOV_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const RESOURCE_ID  = "9ef84268-d588-465a-a308-a864a43d0070";
const BASE_URL     = `https://api.data.gov.in/resource/${RESOURCE_ID}`;
const FETCH_LIMIT  = Number(process.env.FETCH_LIMIT || 500);
const DATA_RETENTION_DAYS = Number(process.env.DATA_RETENTION_DAYS || 90);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:3000";
const DAILY_CHECK_INTERVAL_MS = 30 * 60 * 1000;

app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

// ── Utilities ────────────────────────────────────────────────────

function getIstDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}
function toIsoNow() { return new Date().toISOString(); }
function parseNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}
function slug(v = "") { return String(v || "").trim().toLowerCase(); }
/** Convert Agmarknet dd/mm/yyyy OR already-ISO yyyy-mm-dd → yyyy-mm-dd */
function parseToIso(dateStr) {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parts = dateStr.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}
function safeAverage(values) {
  const clean = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  return clean.length ? Number((clean.reduce((s, v) => s + v, 0) / clean.length).toFixed(2)) : null;
}
function daysAgoDateString(days, base = new Date()) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function normalizeRecord(r) {
  return {
    state: r.state || "", district: r.district || "", market: r.market || "",
    commodity: r.commodity || "", variety: r.variety || "", grade: r.grade || "",
    arrival_date: parseToIso(r.arrival_date || ""),
    min_price: parseNumber(r.min_price),
    max_price: parseNumber(r.max_price),
    modal_price: parseNumber(r.modal_price),
  };
}
function recordKey(r) {
  return [r.state, r.district, r.market, r.commodity, r.variety, r.grade,
    r.arrival_date, r.min_price, r.max_price, r.modal_price].join("||");
}
function filterRecords(records, filters) {
  return records.filter((r) =>
    (!filters.commodity || slug(r.commodity) === slug(filters.commodity)) &&
    (!filters.state     || slug(r.state)     === slug(filters.state))     &&
    (!filters.district  || slug(r.district)  === slug(filters.district))  &&
    (!filters.market    || slug(r.market)    === slug(filters.market))    &&
    (!filters.variety   || slug(r.variety)   === slug(filters.variety))   &&
    (!filters.grade     || slug(r.grade)     === slug(filters.grade))
  );
}
function getFilters(query) {
  return {
    commodity: query.commodity || "",
    state:     query.state     || "",
    district:  query.district  || "",
    market:    query.market    || "",
    variety:   query.variety   || "",
    grade:     query.grade     || "",
  };
}

// ── Forecast: Adaptive Holt's Double Exponential Smoothing ───────

/**
 * Run one pass of Holt's smoothing on a series; return {level, trend}.
 */
function holtFit(values, alpha, beta) {
  let level = values[0];
  let trend = (values[Math.min(values.length - 1, 6)] - values[0]) / Math.min(values.length - 1, 6);
  for (let i = 1; i < values.length; i++) {
    const prev = level;
    level = alpha * values[i] + (1 - alpha) * (prev + trend);
    trend = beta * (level - prev) + (1 - beta) * trend;
  }
  return { level, trend };
}

/**
 * Adaptive Holt's — grid-searches 20 alpha×beta combinations and picks the
 * pair that minimises walk-forward MAPE on the held-out last 7 data points.
 * As more daily snapshots accumulate the model automatically retrains on the
 * full history and improves its accuracy.
 */
function holtForecast(values, horizon = 14) {
  if (values.length < 7) return null;

  const ALPHAS = [0.1, 0.2, 0.3, 0.4, 0.5];
  const BETAS  = [0.05, 0.1, 0.2, 0.3];

  let bestAlpha = 0.3, bestBeta = 0.1, bestMape = Infinity;

  // Cross-validate only if we have enough history
  if (values.length >= 14) {
    const train = values.slice(0, -7);
    const test  = values.slice(-7);

    for (const alpha of ALPHAS) {
      for (const beta of BETAS) {
        const { level, trend } = holtFit(train, alpha, beta);
        let sumErr = 0, cnt = 0;
        for (let h = 1; h <= test.length; h++) {
          const pred = level + h * trend;
          if (test[h - 1] > 0) { sumErr += Math.abs((test[h - 1] - pred) / test[h - 1]); cnt++; }
        }
        const mape = cnt ? (sumErr / cnt) * 100 : Infinity;
        if (mape < bestMape) { bestMape = mape; bestAlpha = alpha; bestBeta = beta; }
      }
    }
  }

  // Refit on full history with winning params
  const { level, trend } = holtFit(values, bestAlpha, bestBeta);

  // Compute in-sample MAPE over last 14 points
  const window = Math.min(values.length - 1, 14);
  const errors = [];
  for (let i = values.length - window; i < values.length; i++) {
    const pred = level + (i - values.length + 1) * trend;
    if (values[i] > 0) errors.push(Math.abs((values[i] - pred) / values[i]) * 100);
  }
  const mape = errors.length ? errors.reduce((s, e) => s + e, 0) / errors.length : 10;

  // Project forward
  const today = new Date();
  const forecast = [];
  for (let h = 1; h <= horizon; h++) {
    const price = Math.max(0, level + h * trend);
    // Uncertainty widens with horizon: 1.5× MAPE at h=1, 2× at h=14
    const uncertaintyFactor = 1.5 + (h / horizon) * 0.5;
    const uncertainty = price * (mape / 100) * uncertaintyFactor;
    const date = new Date(today);
    date.setDate(date.getDate() + h);
    forecast.push({
      date: date.toISOString().slice(0, 10),
      price: Number(price.toFixed(2)),
      lower: Number(Math.max(0, price - uncertainty).toFixed(2)),
      upper: Number((price + uncertainty).toFixed(2)),
    });
  }

  const trendPct = values.length >= 2
    ? ((forecast[horizon - 1].price - values[values.length - 1]) / values[values.length - 1]) * 100
    : 0;

  return {
    forecast,
    mape:      Number(mape.toFixed(2)),
    direction: trendPct > 1 ? "up" : trendPct < -1 ? "down" : "flat",
    trend_pct: Number(trendPct.toFixed(2)),
    alpha:     bestAlpha,
    beta:      bestBeta,
    data_points: values.length,
  };
}

/**
 * Rolling 1-step-ahead backtest over the last `window` points.
 * For each test position t, train on values[0..t-1], predict values[t].
 * Returns MAE, RMSE, MAPE, and sMAPE.
 * Returns null when there are fewer than 14 data points.
 */
function rollingBacktest(values, window = 14) {
  if (values.length < 14) {
    return { mae: null, rmse: null, smape: null };
  }
  const testStart = Math.max(7, values.length - window);
  const errors = [];
  for (let t = testStart; t < values.length; t++) {
    const train = values.slice(0, t);
    const actual = values[t];
    // Quick 1-step forecast with fixed params (α=0.3, β=0.1) for speed
    const { level, trend } = holtFit(train, 0.3, 0.1);
    const pred = level + trend;
    errors.push({ actual, pred });
  }
  if (!errors.length) return { mae: null, rmse: null, smape: null };

  const mae = errors.reduce((s, e) => s + Math.abs(e.actual - e.pred), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((s, e) => s + (e.actual - e.pred) ** 2, 0) / errors.length);
  const smape = errors.reduce((s, e) => {
    const denom = (Math.abs(e.actual) + Math.abs(e.pred)) / 2;
    return s + (denom > 0 ? Math.abs(e.actual - e.pred) / denom : 0);
  }, 0) / errors.length * 100;

  return {
    mae:   Number(mae.toFixed(2)),
    rmse:  Number(rmse.toFixed(2)),
    smape: Number(smape.toFixed(2)),
  };
}

// ── OpenAI price insights ─────────────────────────────────────────

/**
 * Calls GPT-4o-mini to generate structured commodity price analysis.
 * Returns null silently if no API key or on any error.
 */
async function generateInsights(commodity, state, market, historyPoints, forecastResult) {
  if (!OPENAI_API_KEY || !forecastResult) return null;

  const histSummary = historyPoints
    .slice(-30)
    .map((h) => `${h.arrival_date}: ₹${h.avg_modal_price ?? "–"}/qtl`)
    .join(" | ");

  const fcastSummary = forecastResult.forecast
    .slice(0, 7)
    .map((f) => `${f.date}: ₹${f.price} (${f.lower}–${f.upper})`)
    .join(" | ");

  const prompt = `You are a senior commodity analyst for Indian agricultural markets.

Commodity: ${commodity || "All commodities"}
State: ${state || "All India"}
Market: ${market || "All markets"}

Historical avg modal price (last 30 days, ₹/qtl):
${histSummary}

14-day forecast (Holt adaptive smoothing, α=${forecastResult.alpha}, β=${forecastResult.beta}):
${fcastSummary}

Trend: ${forecastResult.direction} (${forecastResult.trend_pct > 0 ? "+" : ""}${forecastResult.trend_pct}% over 14 days)
Model MAPE: ${forecastResult.mape}%  Data points used: ${forecastResult.data_points}

Respond ONLY with a JSON object (no markdown) with exactly these fields:
{
  "outlook": "<2–3 sentence price outlook>",
  "drivers": ["<key driver 1>", "<key driver 2>", "<key driver 3>"],
  "risks": ["<downside risk 1>", "<upside risk 2>"],
  "signal": "Buy" | "Hold" | "Wait",
  "signal_reason": "<one sentence justification>",
  "confidence": "high" | "medium" | "low"
}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
        temperature: 0.25,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Snapshot I/O ─────────────────────────────────────────────────

async function ensureDataFolders() {
  await fsp.mkdir(snapshotsDir, { recursive: true });
  if (!fs.existsSync(statusFile)) {
    await writeStatus({ lastRefreshAt: null, lastSnapshotDate: null, lastRecordCount: 0, inProgress: false, error: null, startupAt: toIsoNow() });
  }
}
async function readStatus() {
  try { return JSON.parse(await fsp.readFile(statusFile, "utf8")); }
  catch { return { lastRefreshAt: null, lastSnapshotDate: null, lastRecordCount: 0, inProgress: false, error: null }; }
}
async function writeStatus(next) {
  await fsp.writeFile(statusFile, JSON.stringify(next, null, 2), "utf8");
}
async function snapshotExists(date) {
  try { await fsp.access(path.join(snapshotsDir, `${date}.json`)); return true; }
  catch { return false; }
}
async function readSnapshots(days = DATA_RETENTION_DAYS) {
  const entries = (await fsp.readdir(snapshotsDir)).filter((f) => f.endsWith(".json")).sort().reverse();
  const keepFrom = daysAgoDateString(Math.max(0, days - 1));
  const relevant = entries.filter((f) => f.replace(".json", "") >= keepFrom);
  const snaps = [];
  for (const f of relevant) {
    const raw = await fsp.readFile(path.join(snapshotsDir, f), "utf8");
    snaps.push(JSON.parse(raw));
  }
  return snaps.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
}
async function getMergedRecords(days, filters) {
  const snaps = await readSnapshots(days);
  // Normalise arrival_date on read — handles legacy dd/mm/yyyy snapshots too
  const all = snaps.flatMap((s) => s.records || []).map((r) => ({
    ...r,
    arrival_date: parseToIso(r.arrival_date || ""),
    _synthetic:   !!(r._synthetic),  // preserve per-record synthetic flag
  }));
  const syntheticSnapCount = snaps.filter((s) => s.synthetic === true).length;
  const syntheticRatio = snaps.length > 0 ? syntheticSnapCount / snaps.length : 0;
  const filtered = filterRecords(all, filters);
  // Count real (non-synthetic) distinct arrival dates as a quality signal
  const realDates = new Set(
    filtered.filter((r) => !r._synthetic).map((r) => r.arrival_date).filter(Boolean)
  );
  return {
    records: filtered,
    latestSnapshotDate: snaps.at(-1)?.snapshotDate || null,
    snapshots: snaps,
    syntheticRatio,
    hasSyntheticData: syntheticRatio > 0,
    realDataPoints: realDates.size,
  };
}

// ── API fetch ────────────────────────────────────────────────────

async function fetchPage(offset, retries = 4) {
  const url = new URL(BASE_URL);
  url.searchParams.set("api-key", API_KEY);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(FETCH_LIMIT));
  url.searchParams.set("offset", String(offset));
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === retries) throw new Error(`API ${res.status}`);
        await sleep(attempt * 2000); continue;
      }
      if (!res.ok) { const t = await res.text(); throw new Error(`API ${res.status}: ${t.slice(0, 120)}`); }
      return res.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await sleep(attempt * 2000);
    }
  }
}
async function fetchAllRecords() {
  if (!API_KEY) throw new Error("DATAGOV_API_KEY missing");
  const first = await fetchPage(0);
  const total = Number(first.total || 0);
  const pages = Math.max(1, Math.ceil(total / FETCH_LIMIT));
  const records = [...(first.records || [])];
  for (let p = 1; p < pages; p++) {
    const data = await fetchPage(p * FETCH_LIMIT);
    records.push(...(data.records || []));
    await sleep(400);
  }
  return records.map(normalizeRecord);
}
async function saveDailySnapshot(force = false) {
  const today = getIstDateString();
  if (!force && await snapshotExists(today)) return { skipped: true, snapshotDate: today };
  const status = await readStatus();
  await writeStatus({ ...status, inProgress: true, error: null });
  try {
    const rawRecords = await fetchAllRecords();
    const dedup = new Map();
    for (const r of rawRecords) dedup.set(recordKey(r), r);
    const records = [...dedup.values()];
    const payload = { snapshotDate: today, fetchedAt: toIsoNow(), resourceId: RESOURCE_ID, recordCount: records.length, records };
    await fsp.writeFile(path.join(snapshotsDir, `${today}.json`), JSON.stringify(payload), "utf8");
    // Purge old
    const entries = await fsp.readdir(snapshotsDir);
    const cutoff = daysAgoDateString(DATA_RETENTION_DAYS - 1);
    for (const f of entries) {
      if (f.endsWith(".json") && f.replace(".json", "") < cutoff) await fsp.unlink(path.join(snapshotsDir, f));
    }
    await writeStatus({ lastRefreshAt: payload.fetchedAt, lastSnapshotDate: today, lastRecordCount: records.length, inProgress: false, error: null, startupAt: status.startupAt || toIsoNow() });
    return { skipped: false, snapshotDate: today, recordCount: records.length };
  } catch (e) {
    await writeStatus({ ...status, inProgress: false, error: e.message });
    throw e;
  }
}

// ── Aggregations ─────────────────────────────────────────────────

function buildSummary(records, latestSnapshotDate) {
  const modalValues = records.map((r) => r.modal_price).filter((v) => typeof v === "number");
  const minValues   = records.map((r) => r.min_price).filter((v) => typeof v === "number");
  const maxValues   = records.map((r) => r.max_price).filter((v) => typeof v === "number");
  const markets     = [...new Set(records.map((r) => r.market).filter(Boolean))];
  const latestRows  = records.slice().sort((a, b) => b.arrival_date.localeCompare(a.arrival_date));
  const marketMap   = new Map();
  for (const r of latestRows) {
    if (!marketMap.has(r.market || "Unknown")) {
      marketMap.set(r.market || "Unknown", {
        market: r.market, district: r.district, state: r.state,
        modal_price: r.modal_price, min_price: r.min_price, max_price: r.max_price, arrival_date: r.arrival_date,
      });
    }
  }
  const topMarkets = [...marketMap.values()]
    .filter((r) => typeof r.modal_price === "number")
    .sort((a, b) => b.modal_price - a.modal_price)
    .slice(0, 10);

  return {
    latestSnapshotDate,
    latestArrivalDate: records.map((r) => r.arrival_date).filter(Boolean).sort().at(-1) || null,
    recordsCount: records.length,
    marketsCount: markets.length,
    avgModalPrice: safeAverage(modalValues),
    avgMinPrice:   safeAverage(minValues),
    avgMaxPrice:   safeAverage(maxValues),
    lowestModalPrice:  modalValues.length ? modalValues.reduce((a, b) => a < b ? a : b) : null,
    highestModalPrice: modalValues.length ? modalValues.reduce((a, b) => a > b ? a : b) : null,
    topMarkets,
  };
}

function buildHistory(records) {
  const grouped = new Map();
  for (const r of records) {
    const key = r.arrival_date || "Unknown";
    const ex  = grouped.get(key) || { arrival_date: key, modalValues: [], minValues: [], maxValues: [], markets: new Set(), count: 0 };
    if (typeof r.modal_price === "number") ex.modalValues.push(r.modal_price);
    if (typeof r.min_price   === "number") ex.minValues.push(r.min_price);
    if (typeof r.max_price   === "number") ex.maxValues.push(r.max_price);
    if (r.market) ex.markets.add(r.market);
    ex.count++;
    grouped.set(key, ex);
  }
  return [...grouped.values()]
    .map((g) => ({
      arrival_date:     g.arrival_date,
      avg_modal_price:  safeAverage(g.modalValues),
      avg_min_price:    safeAverage(g.minValues),
      avg_max_price:    safeAverage(g.maxValues),
      markets_count:    g.markets.size,
      records_count:    g.count,
    }))
    .sort((a, b) => a.arrival_date.localeCompare(b.arrival_date));
}

// ── Routes ───────────────────────────────────────────────────────

app.get("/health", (_req, res) => res.json({ ok: true, now: toIsoNow() }));

app.get("/api/status", async (_req, res) => {
  const status = await readStatus();
  const snaps  = await readSnapshots(DATA_RETENTION_DAYS);
  res.json({ ...status, retentionDays: DATA_RETENTION_DAYS, totalSnapshots: snaps.length, snapshotDates: snaps.map((s) => s.snapshotDate) });
});

app.post("/api/refresh", async (_req, res) => {
  try { res.json({ ok: true, ...(await saveDailySnapshot(true)) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/api/options", async (_req, res) => {
  const snaps   = await readSnapshots(DATA_RETENTION_DAYS);
  const records = snaps.flatMap((s) => s.records || []);
  const uniq = (vals) => [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  res.json({
    commodities: uniq(records.map((r) => r.commodity)),
    states:      uniq(records.map((r) => r.state)),
    districts:   uniq(records.map((r) => r.district)),
    markets:     uniq(records.map((r) => r.market)),
    varieties:   uniq(records.map((r) => r.variety)),
    grades:      uniq(records.map((r) => r.grade)),
  });
});

app.get("/api/summary", async (req, res) => {
  const days = Math.min(Number(req.query.days || DATA_RETENTION_DAYS), DATA_RETENTION_DAYS);
  const { records, latestSnapshotDate } = await getMergedRecords(days, getFilters(req.query));
  res.json(buildSummary(records, latestSnapshotDate));
});

app.get("/api/history", async (req, res) => {
  const days = Math.min(Number(req.query.days || DATA_RETENTION_DAYS), DATA_RETENTION_DAYS);
  const { records } = await getMergedRecords(days, getFilters(req.query));
  res.json(buildHistory(records));
});

app.get("/api/table", async (req, res) => {
  const days     = Math.min(Number(req.query.days || DATA_RETENTION_DAYS), DATA_RETENTION_DAYS);
  const page     = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(500, Math.max(10, Number(req.query.pageSize || 100)));
  const { records } = await getMergedRecords(days, getFilters(req.query));
  const sorted = records.slice().sort((a, b) => b.arrival_date.localeCompare(a.arrival_date) || (b.modal_price || 0) - (a.modal_price || 0));
  const start  = (page - 1) * pageSize;
  res.json({ page, pageSize, total: sorted.length, rows: sorted.slice(start, start + pageSize) });
});

/**
 * GET /api/forecast
 * Adaptive Holt's forecast — retrains on all available history each call.
 * Includes optional OpenAI insights when OPENAI_API_KEY is set.
 * Query params: commodity, state, market, district (filters) + horizon (default 14)
 *               insights=false to skip AI analysis
 */
app.get("/api/forecast", async (req, res) => {
  const filters = getFilters(req.query);
  const horizon = Math.min(30, Math.max(3, Number(req.query.horizon || 14)));
  const wantInsights = req.query.insights !== "false";

  try {
    // ── FIX: destructure all fields returned by getMergedRecords ────
    const {
      records,
      syntheticRatio,
      hasSyntheticData,
      realDataPoints,
    } = await getMergedRecords(DATA_RETENTION_DAYS, filters);
    const history = buildHistory(records);

    const prices = history
      .filter((h) => typeof h.avg_modal_price === "number")
      .map((h) => h.avg_modal_price);

    // ── Minimum real-data threshold ──────────────────────────────────
    // Refuse to forecast when real data is insufficient.
    // MIN_REAL_DATA_POINTS is configurable (default 7).
    const minReal = Number(process.env.MIN_REAL_DATA_POINTS || 7);
    if (prices.length < 7) {
      return res.json({
        commodity:   filters.commodity || "All",
        market:      filters.market    || "All",
        state:       filters.state     || "All",
        latestPrice: prices.at(-1) || null,
        forecast: [],
        direction: "flat",
        trend_pct: 0,
        dataPoints: prices.length,
        realDataPoints: realDataPoints ?? prices.length,
        insufficient: true,
        message: `Need at least 7 days of data (have ${prices.length}). Try selecting a more popular commodity or removing market filters.`,
        insights: null,
      });
    }
    if ((realDataPoints ?? prices.length) < minReal) {
      return res.json({
        commodity:   filters.commodity || "All",
        market:      filters.market    || "All",
        state:       filters.state     || "All",
        latestPrice: prices.at(-1) || null,
        forecast: [],
        direction: "flat",
        trend_pct: 0,
        dataPoints: prices.length,
        realDataPoints: realDataPoints ?? 0,
        insufficient: true,
        message: `Insufficient real price data (${realDataPoints ?? 0} real data points, minimum ${minReal} required). ` +
          `Forecast disabled to prevent misleading results from synthetic-heavy history. ` +
          `Try selecting a more widely-traded commodity.`,
        insights: null,
      });
    }

    const result = holtForecast(prices, horizon);
    if (!result) {
      return res.json({ insufficient: true, message: "Could not compute forecast.", insights: null });
    }

    // ── Rolling backtest metrics ─────────────────────────────────────
    const backtest = rollingBacktest(prices);

    // Generate OpenAI insights in parallel (non-blocking on failure)
    const insights = wantInsights
      ? await generateInsights(filters.commodity, filters.state, filters.market, history, result)
      : null;

    // Build honest metadata — always included so UI can display data quality
    const safeSyntheticRatio = Number((syntheticRatio ?? 0).toFixed(2));
    const meta = {
      model_type:         "holt_double_exponential_smoothing",
      model_description:  "Adaptive Holt's Double Exponential Smoothing (trend extrapolation). Not ML.",
      alpha:              result.alpha,
      beta:               result.beta,
      mape:               result.mape,
      mae:                backtest.mae,
      rmse:               backtest.rmse,
      smape:              backtest.smape,
      data_points:        prices.length,
      real_data_points:   realDataPoints ?? prices.length,
      synthetic_ratio:    safeSyntheticRatio,
      has_synthetic_data: safeSyntheticRatio > 0,
      disclaimer:
        "These are experimental price estimates based on historical trend extrapolation. " +
        "They are not financial advice. Actual prices may differ significantly. " +
        (hasSyntheticData ? "Note: some historical data is synthetic (backfilled). " : "") +
        `Based on ${prices.length} daily data points (${realDataPoints ?? prices.length} real).`,
    };

    res.json({
      commodity:    filters.commodity || "All",
      market:       filters.market    || "All",
      state:        filters.state     || "All",
      latestPrice:  prices.at(-1),
      forecast:     result.forecast,
      direction:    result.direction,
      trend_pct:    result.trend_pct,
      dataPoints:   prices.length,
      insufficient: false,
      meta,
      insights,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/insights
 * Standalone OpenAI price analysis for a commodity/market.
 */
app.get("/api/insights", async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: "OPENAI_API_KEY not configured." });
  }
  const filters = getFilters(req.query);
  try {
    const { records, realDataPoints } = await getMergedRecords(DATA_RETENTION_DAYS, filters);
    const history = buildHistory(records);
    const prices = history.filter((h) => typeof h.avg_modal_price === "number").map((h) => h.avg_modal_price);
    if (prices.length < 7) {
      return res.status(422).json({ error: "Insufficient data for analysis." });
    }
    const forecastResult = holtForecast(prices, 14);
    const insights = await generateInsights(filters.commodity, filters.state, filters.market, history, forecastResult);
    if (!insights) return res.status(500).json({ error: "AI analysis failed." });
    res.json({
      commodity: filters.commodity || "All",
      state:     filters.state     || "All",
      market:    filters.market    || "All",
      ...insights,
      latestPrice:    prices.at(-1),
      data_points:    prices.length,
      real_data_points: realDataPoints ?? prices.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Bootstrap ────────────────────────────────────────────────────

async function bootstrap() {
  await ensureDataFolders();

  // Try initial data fetch (non-blocking on failure)
  try {
    const today = getIstDateString();
    if (!(await snapshotExists(today))) {
      console.log("[mandi] Fetching today's data…");
      await saveDailySnapshot(false);
      console.log("[mandi] Initial data loaded.");
    } else {
      console.log("[mandi] Today's snapshot already exists.");
    }
  } catch (e) {
    console.warn("[mandi] Initial fetch failed (no API key or network issue):", e.message);
    console.warn("[mandi] Service will run without data until a refresh succeeds.");
  }

  // Check daily
  setInterval(async () => {
    try {
      const today = getIstDateString();
      if (!(await snapshotExists(today))) await saveDailySnapshot(false);
    } catch (e) {
      console.error("[mandi] Scheduled refresh failed:", e.message);
    }
  }, DAILY_CHECK_INTERVAL_MS);

  app.listen(PORT, () => {
    console.log(`[mandi] Service running on http://localhost:${PORT}`);
    console.log(`[mandi] CORS origin: ${ALLOWED_ORIGIN}`);
    console.log(`[mandi] API key: ${API_KEY ? "configured" : "MISSING — set DATAGOV_API_KEY"}`);
  });
}

bootstrap().catch((e) => {
  console.error("Fatal startup error:", e);
  process.exit(1);
});
