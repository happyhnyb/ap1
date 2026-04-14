/**
 * Commodity alias normalization registry.
 *
 * Agmarknet uses inconsistent commodity names:
 *   "Paddy(Common)", "Paddy(Hybrid)", "Paddy Common", "Paddy Hybrid", "Paddy"
 * These all map to canonical_id "paddy".
 *
 * The registry also defines commodity clusters for correlation features.
 * A cluster groups commodities whose prices tend to move together,
 * enabling cross-commodity features in the GBRT model.
 */

export interface CommodityEntry {
  /** Lowercase slug used internally and in API responses. */
  id: string;
  /** Canonical display name. */
  display: string;
  /** All Agmarknet name fragments that map to this commodity (case-insensitive prefix/substring match). */
  aliases: string[];
  /** Related commodity ids for correlation features. */
  cluster: string[];
  /** Typical unit weight in ₹/quintal (always quintal for Agmarknet). */
  unit: 'quintal';
}

export function normalizeLabel(raw: string, opts: { stripApmc?: boolean } = {}): string {
  let value = raw.toLowerCase().trim();
  if (opts.stripApmc) {
    value = value
      .replace(/\b(a\.?\s*p\.?\s*m\.?\s*c\.?)\b/g, ' ')
      .replace(/\bmarket\s+yard\b/g, ' ');
  }
  return value
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugifyLabel(raw: string, opts: { stripApmc?: boolean } = {}): string {
  return normalizeLabel(raw, opts).replace(/\s+/g, '_');
}

const REGISTRY: CommodityEntry[] = [
  {
    id: 'wheat', display: 'Wheat',
    aliases: ['wheat'],
    cluster: ['barley', 'maize'],
    unit: 'quintal',
  },
  {
    id: 'paddy', display: 'Paddy',
    aliases: ['paddy'],
    cluster: ['rice'],
    unit: 'quintal',
  },
  {
    id: 'rice', display: 'Rice',
    aliases: ['rice'],
    cluster: ['paddy'],
    unit: 'quintal',
  },
  {
    id: 'onion', display: 'Onion',
    aliases: ['onion'],
    cluster: ['garlic', 'potato'],
    unit: 'quintal',
  },
  {
    id: 'tomato', display: 'Tomato',
    aliases: ['tomato'],
    cluster: ['onion', 'potato'],
    unit: 'quintal',
  },
  {
    id: 'potato', display: 'Potato',
    aliases: ['potato'],
    cluster: ['onion', 'tomato'],
    unit: 'quintal',
  },
  {
    id: 'soybean', display: 'Soybean',
    aliases: ['soyabean', 'soybean', 'soya bean'],
    cluster: ['groundnut', 'mustard'],
    unit: 'quintal',
  },
  {
    id: 'cotton', display: 'Cotton',
    aliases: ['cotton'],
    cluster: [],
    unit: 'quintal',
  },
  {
    id: 'maize', display: 'Maize',
    aliases: ['maize', 'corn'],
    cluster: ['wheat', 'barley'],
    unit: 'quintal',
  },
  {
    id: 'barley', display: 'Barley',
    aliases: ['barley'],
    cluster: ['wheat', 'maize'],
    unit: 'quintal',
  },
  {
    id: 'mustard', display: 'Mustard',
    aliases: ['mustard', 'rapeseed'],
    cluster: ['soybean', 'groundnut'],
    unit: 'quintal',
  },
  {
    id: 'groundnut', display: 'Groundnut',
    aliases: ['groundnut', 'peanut'],
    cluster: ['soybean', 'mustard'],
    unit: 'quintal',
  },
  {
    id: 'chilli', display: 'Chilli',
    aliases: ['chilli', 'chili', 'red chilli', 'dry chilli'],
    cluster: [],
    unit: 'quintal',
  },
  {
    id: 'garlic', display: 'Garlic',
    aliases: ['garlic'],
    cluster: ['onion'],
    unit: 'quintal',
  },
  {
    id: 'turmeric', display: 'Turmeric',
    aliases: ['turmeric'],
    cluster: ['chilli'],
    unit: 'quintal',
  },
  {
    id: 'sugarcane', display: 'Sugarcane',
    aliases: ['sugarcane', 'sugar cane'],
    cluster: ['jaggery'],
    unit: 'quintal',
  },
  {
    id: 'jaggery', display: 'Jaggery',
    aliases: ['jaggery', 'gur'],
    cluster: ['sugarcane'],
    unit: 'quintal',
  },
  {
    id: 'arhar', display: 'Arhar/Tur Dal',
    aliases: ['arhar', 'tur', 'toor', 'pigeon pea'],
    cluster: ['moong', 'urad'],
    unit: 'quintal',
  },
  {
    id: 'moong', display: 'Moong Dal',
    aliases: ['moong', 'green gram'],
    cluster: ['arhar', 'urad'],
    unit: 'quintal',
  },
  {
    id: 'urad', display: 'Urad Dal',
    aliases: ['urad', 'black gram'],
    cluster: ['moong', 'arhar'],
    unit: 'quintal',
  },
  {
    id: 'jowar', display: 'Jowar',
    aliases: ['jowar', 'sorghum'],
    cluster: ['bajra', 'maize'],
    unit: 'quintal',
  },
  {
    id: 'bajra', display: 'Bajra',
    aliases: ['bajra', 'pearl millet'],
    cluster: ['jowar', 'maize'],
    unit: 'quintal',
  },
  {
    id: 'gram', display: 'Gram/Chana',
    aliases: ['gram', 'chana', 'chickpea', 'bengal gram'],
    cluster: ['arhar', 'moong'],
    unit: 'quintal',
  },
];

// ── Lookup tables built at module load ────────────────────────────────────────

const BY_ID = new Map<string, CommodityEntry>(
  REGISTRY.map((e) => [e.id, e])
);

// Alias → id map (longest-alias-first to prefer specific matches)
const ALIAS_MAP: Array<{ fragment: string; id: string }> = REGISTRY.flatMap((e) =>
  e.aliases.map((a) => ({ fragment: a.toLowerCase(), id: e.id }))
).sort((a, b) => b.fragment.length - a.fragment.length);

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Normalise a raw Agmarknet commodity string to a canonical id slug.
 * Returns the slug if found, or a lowercased/slugified version of the input.
 *
 * @example normalizeCommodity("Paddy(Common)") → "paddy"
 * @example normalizeCommodity("Soyabean") → "soybean"
 */
export function normalizeCommodity(raw: string): string {
  const lower = normalizeLabel(raw);
  for (const { fragment, id } of ALIAS_MAP) {
    if (lower.includes(fragment)) return id;
  }
  // Fallback: slugify the raw input
  return lower.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/** Look up a commodity entry by canonical id. */
export function getCommodity(id: string): CommodityEntry | undefined {
  return BY_ID.get(id);
}

/** Return the display name for a canonical id, or the id itself as fallback. */
export function displayName(id: string): string {
  return BY_ID.get(id)?.display ?? id;
}

/** Return the cluster of related commodity ids for a given id. */
export function getCluster(id: string): string[] {
  return BY_ID.get(id)?.cluster ?? [];
}

/** All registered commodity ids. */
export function allCommodityIds(): string[] {
  return REGISTRY.map((e) => e.id);
}

/**
 * Build a stable mandi_id slug from market + district + state.
 * Used as the key for grouping records into per-mandi time series.
 */
export function buildMandiId(market: string, district: string, state: string): string {
  return [market, district, state]
    .map((s, index) => slugifyLabel(s, { stripApmc: index === 0 }))
    .join('|');
}
