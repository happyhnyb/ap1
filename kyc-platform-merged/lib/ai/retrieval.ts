import { postsAdapter } from '@/lib/adapters';
import { STATIC_KNOWLEDGE_DOCUMENTS } from './knowledge-base';
import type {
  AIChunkRecord,
  AICitation,
  AIKnowledgeDocument,
  AISemanticSearchResult,
} from './types';
import { createEmbeddings, isOpenAIConfigured } from './openai';
import { getCached, setCached } from './cache';
import { env } from '@/lib/env';

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function chunkDocument(doc: AIKnowledgeDocument, chunkSize = 900, overlap = 120): AIChunkRecord[] {
  const text = `${doc.title}\n\n${doc.excerpt}\n\n${doc.body}`.trim();
  const chunks: AIChunkRecord[] = [];
  for (let start = 0; start < text.length; start += Math.max(1, chunkSize - overlap)) {
    const slice = text.slice(start, start + chunkSize);
    if (!slice.trim()) continue;
    chunks.push({
      chunkId: `${doc.id}::${chunks.length}`,
      documentId: doc.id,
      kind: doc.kind,
      title: doc.title,
      text: slice,
      excerpt: doc.excerpt,
      tags: doc.tags,
      commodity: doc.commodity ?? null,
      category: doc.category ?? null,
      slug: doc.slug ?? null,
      href: doc.href ?? null,
      updatedAt: doc.updatedAt,
    });
    if (start + chunkSize >= text.length) break;
  }
  return chunks;
}

async function getCorpusDocuments(): Promise<AIKnowledgeDocument[]> {
  const cached = getCached<AIKnowledgeDocument[]>('ai:corpus:documents');
  if (cached) return cached;

  const posts = await postsAdapter.listPublished();
  const postDocs: AIKnowledgeDocument[] = posts.map((post) => ({
    id: `post:${post.slug}`,
    kind: post.category === 'Policy' ? 'policy_note' : 'article',
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    tags: post.tags,
    commodity: post.tags[0] ?? null,
    category: post.category,
    slug: post.slug,
    href: `/post/${post.slug}`,
    updatedAt: post.updated_at,
    metadata: {
      premium: post.is_premium,
      type: post.type,
    },
  }));

  const docs = [...postDocs, ...STATIC_KNOWLEDGE_DOCUMENTS];
  setCached('ai:corpus:documents', docs, env.AI_CACHE_TTL_MS);
  return docs;
}

export async function getCorpusChunks() {
  const cached = getCached<AIChunkRecord[]>('ai:corpus:chunks');
  if (cached) return cached;

  const documents = await getCorpusDocuments();
  const chunks = documents.flatMap((doc) => chunkDocument(doc));
  setCached('ai:corpus:chunks', chunks, env.AI_CACHE_TTL_MS);
  return chunks;
}

function lexicalScore(chunk: AIChunkRecord, query: string) {
  const haystack = normalize(`${chunk.title} ${chunk.excerpt} ${chunk.text} ${chunk.tags.join(' ')}`);
  const terms = normalize(query).split(' ').filter(Boolean);
  if (!terms.length) return 0;

  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += 1;
    if (normalize(chunk.title).includes(term)) score += 1.5;
    if ((chunk.commodity && normalize(chunk.commodity).includes(term)) || normalize(chunk.tags.join(' ')).includes(term)) score += 0.8;
  }
  return score / terms.length;
}

function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function getEmbeddedChunkIndex() {
  const chunks = await getCorpusChunks();
  if (!isOpenAIConfigured()) return null;

  const cacheKey = `ai:chunk-embeddings:${chunks.length}`;
  const cached = getCached<Array<{ chunk: AIChunkRecord; vector: number[] }>>(cacheKey);
  if (cached) return cached;

  const vectors = await createEmbeddings(chunks.map((chunk) => chunk.text.slice(0, 2000)));
  if (!vectors.length) return null;

  const index = chunks.map((chunk, idx) => ({ chunk, vector: vectors[idx] ?? [] }));
  setCached(cacheKey, index, env.AI_CACHE_TTL_MS);
  return index;
}

function toCitation(chunk: AIChunkRecord, score: number): AICitation {
  return {
    id: chunk.documentId,
    title: chunk.title,
    kind: chunk.kind,
    slug: chunk.slug ?? null,
    href: chunk.href ?? null,
    excerpt: chunk.excerpt,
    snippet: chunk.text.slice(0, 260),
    score: Number(score.toFixed(4)),
  };
}

export async function semanticSearch(query: string, opts: {
  limit?: number;
  kinds?: string[];
  commodity?: string;
  disableEmbeddings?: boolean;
} = {}): Promise<AISemanticSearchResult> {
  const limit = Math.min(12, Math.max(1, opts.limit ?? 6));
  const chunks = await getCorpusChunks();
  const filtered = chunks.filter((chunk) => {
    if (opts.kinds?.length && !opts.kinds.includes(chunk.kind)) return false;
    if (opts.commodity && normalize(chunk.commodity || '').includes(normalize(opts.commodity)) === false) return false;
    return true;
  });

  const lexicalRanked = filtered
    .map((chunk) => ({ chunk, score: lexicalScore(chunk, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!lexicalRanked.length) {
    return { query, results: [], retrievalMode: 'lexical' };
  }

  if (isOpenAIConfigured() && !opts.disableEmbeddings) {
    try {
      const shortlist = lexicalRanked.slice(0, Math.min(limit * 3, 18));
      const vectors = await createEmbeddings([
        query,
        ...shortlist.map((item) => item.chunk.text.slice(0, 1800)),
      ]);
      const [queryVector, ...chunkVectors] = vectors;
      if (queryVector?.length) {
        const reranked = shortlist
          .map((item, index) => {
            const semanticScore = cosineSimilarity(queryVector, chunkVectors[index] ?? []);
            const score = semanticScore * 0.7 + item.score * 0.3;
            return { chunk: item.chunk, score };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(({ chunk, score }) => toCitation(chunk, score));

        return { query, results: reranked, retrievalMode: 'embeddings' };
      }
    } catch (error) {
      console.error('[semanticSearch] shortlist embedding rerank failed, falling back to lexical search', error);
    }
  }

  const scored = lexicalRanked
    .slice(0, limit)
    .map(({ chunk, score }) => toCitation(chunk, score));

  return { query, results: scored, retrievalMode: 'lexical' };
}
