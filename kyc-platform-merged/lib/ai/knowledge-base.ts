import type { AIKnowledgeDocument } from './types';

export const STATIC_KNOWLEDGE_DOCUMENTS: AIKnowledgeDocument[] = [
  {
    id: 'explainer-onion-price-drivers',
    kind: 'commodity_explainer',
    title: 'Onion Price Drivers',
    excerpt: 'Core drivers that usually move onion prices in India and nearby export-linked markets.',
    body: `Onion prices are typically driven by arrivals, weather shocks, storage losses, transport bottlenecks, policy actions on exports or stock limits, and sudden changes in festival or institutional demand.
Fresh arrival surges are usually bearish in the near term. Weather-driven crop damage or storage spoilage tends to be bullish.
When citing onion market context, prefer actual mandi, policy, or forecast driver records over this explainer.`,
    tags: ['onion', 'price drivers', 'storage', 'arrivals', 'policy'],
    commodity: 'Onion',
    category: 'Explainers',
    href: '/search?q=onion',
    updatedAt: '2026-04-14T00:00:00.000Z',
  },
  {
    id: 'explainer-soybean-market-strength',
    kind: 'commodity_explainer',
    title: 'How to Read Soybean Market Strength',
    excerpt: 'Signals that indicate stronger or weaker soybean mandis.',
    body: `Relative soybean strength usually shows up in higher modal prices, better recent momentum, broader market participation, and tighter downside bands in forecast quality checks.
Compare nearby mandis using the same arrival window wherever possible. Do not compare a stale market against a fresh market snapshot without noting the date difference.`,
    tags: ['soybean', 'mandi comparison', 'strength', 'pricing'],
    commodity: 'Soybean',
    category: 'Explainers',
    href: '/premium/predictor',
    updatedAt: '2026-04-14T00:00:00.000Z',
  },
  {
    id: 'faq-forecast-method',
    kind: 'faq',
    title: 'How KYC Forecasts Are Produced',
    excerpt: 'KYC forecasting uses trusted numeric models and AI only for narration.',
    body: `KYC numeric forecasts come from the forecasting engine and mandi datasets, not from large language models.
AI is used for narrative explanation, search, summarization, and structured extraction on top of retrieved internal records.
If the model lacks sufficient internal evidence, the assistant should say so rather than inventing a number.`,
    tags: ['forecast', 'methodology', 'ai guardrails'],
    category: 'FAQ',
    href: '/premium/predictor',
    updatedAt: '2026-04-14T00:00:00.000Z',
  },
  {
    id: 'methodology-search-grounding',
    kind: 'methodology',
    title: 'Search and Copilot Grounding Rules',
    excerpt: 'Grounding and citation rules for AI answers inside KYC.',
    body: `Every AI answer must cite the internal source records it used. The model may summarize and synthesize but must not fabricate data.
When discussing policy or market changes, the assistant should rely on retrieved internal articles, policy notes, FAQs, and structured forecast or mandi tools.
If retrieval is weak, the assistant must lower confidence and say the evidence is insufficient.`,
    tags: ['search', 'copilot', 'citations', 'grounding'],
    category: 'Methodology',
    href: '/search',
    updatedAt: '2026-04-14T00:00:00.000Z',
  },
  {
    id: 'policy-note-msp-impact',
    kind: 'policy_note',
    title: 'MSP Policy Change Impact Note',
    excerpt: 'MSP updates often reshape farmer sentiment, procurement behavior, and spot market negotiations.',
    body: `After an MSP update, watch for changes in arrival behavior, procurement expectations, and private trade spreads.
The real market effect depends on commodity coverage, procurement intensity, state-level execution, and private stockist response.
Use actual policy articles and mandi comparisons to confirm whether price action has changed after the update.`,
    tags: ['msp', 'policy', 'procurement'],
    category: 'Policy',
    href: '/search?q=MSP',
    updatedAt: '2026-04-14T00:00:00.000Z',
  },
];

