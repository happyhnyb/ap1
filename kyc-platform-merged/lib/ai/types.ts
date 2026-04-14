export type AIKnowledgeKind =
  | 'article'
  | 'commodity_explainer'
  | 'faq'
  | 'policy_note'
  | 'methodology';

export interface AIKnowledgeDocument {
  id: string;
  kind: AIKnowledgeKind;
  title: string;
  body: string;
  excerpt: string;
  tags: string[];
  commodity?: string | null;
  category?: string | null;
  slug?: string | null;
  href?: string | null;
  updatedAt: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface AIChunkRecord {
  chunkId: string;
  documentId: string;
  kind: AIKnowledgeKind;
  title: string;
  text: string;
  excerpt: string;
  tags: string[];
  commodity?: string | null;
  category?: string | null;
  slug?: string | null;
  href?: string | null;
  updatedAt: string;
}

export interface AICitation {
  id: string;
  title: string;
  kind: AIKnowledgeKind;
  slug?: string | null;
  href?: string | null;
  excerpt: string;
  snippet: string;
  score: number;
}

export interface AISemanticSearchResult {
  query: string;
  results: AICitation[];
  retrievalMode: 'embeddings' | 'lexical';
}

export type AIPersona = 'farmer' | 'trader' | 'procurement' | 'general';

export interface AICopilotResponse {
  mode: 'copilot';
  query: string;
  persona: AIPersona;
  answer: string;
  bullets: string[];
  followUps: string[];
  guardrails: string[];
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  citations: AICitation[];
  sources: AICitation[];
  snippets: string[];
}

export interface AIForecastExplanationResponse {
  mode: 'forecast_explanation';
  commodity: string;
  answer: string;
  drivers: string[];
  risks: string[];
  watchouts: string[];
  citations: AICitation[];
}

export interface AIArticleSummaryResponse {
  mode: 'article_summary';
  persona: AIPersona;
  title: string;
  summary: string;
  bullets: string[];
  citations: AICitation[];
}

export interface AIPersonalizationResponse {
  mode: 'personalization';
  persona: AIPersona;
  summary: string;
  recommendedQueries: string[];
  recommendedSources: AICitation[];
}

export interface AIExtractedEvent {
  title: string;
  event_type: 'policy' | 'trade' | 'weather' | 'supply' | 'demand' | 'logistics' | 'market_signal';
  commodity: string | null;
  geography: string | null;
  impact_direction: 'bullish' | 'bearish' | 'mixed' | 'neutral';
  impact_horizon: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  evidence: string;
}

export interface AINightlyArtifacts {
  generatedAt: string;
  summaries: Record<string, AIArticleSummaryResponse>;
  events: Record<string, AIExtractedEvent[]>;
  tags: Record<string, string[]>;
  vectors: Array<{ chunkId: string; vector: number[] }>;
}

