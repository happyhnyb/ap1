import { promises as fs } from 'fs';
import path from 'path';
import { postsAdapter } from '@/lib/adapters';
import { summarizeArticle } from '@/lib/ai/service';
import { createEmbeddings, createStructuredResponse, isOpenAIConfigured } from '@/lib/ai/openai';
import { eventExtractionSchema, taggingSchema } from '@/lib/ai/schemas';
import { systemPrompt } from '@/lib/ai/prompts';
import { getCorpusChunks } from '@/lib/ai/retrieval';
import type { AIExtractedEvent, AINightlyArtifacts } from '@/lib/ai/types';

const OUTPUT_DIR = path.join(process.cwd(), 'generated');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'ai-nightly.json');

export async function runNightlyAIPipeline() {
  const posts = await postsAdapter.listPublished();
  const artifacts: AINightlyArtifacts = {
    generatedAt: new Date().toISOString(),
    summaries: {},
    events: {},
    tags: {},
    vectors: [],
  };

  for (const post of posts.slice(0, 50)) {
    artifacts.summaries[post.slug] = await summarizeArticle(post.slug, 'general');

    if (isOpenAIConfigured()) {
      const tagging = await createStructuredResponse<{ tags: string[] }>({
        model: process.env.OPENAI_MODEL_EXTRACTION ?? 'gpt-5-nano',
        schema: taggingSchema,
        cacheKey: `nightly:tags:${post.slug}`,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract high-signal tags from this article only.\n\nTitle: ${post.title}\n\nBody:\n${post.body}` },
        ],
      });
      artifacts.tags[post.slug] = tagging.tags;

      const events = await createStructuredResponse<{ events: AIExtractedEvent[] }>({
        model: process.env.OPENAI_MODEL_EXTRACTION ?? 'gpt-5-nano',
        schema: eventExtractionSchema,
        cacheKey: `nightly:events:${post.slug}`,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract policy, supply, logistics, demand, and market events from this article only.\n\nTitle: ${post.title}\n\nBody:\n${post.body}` },
        ],
      });
      artifacts.events[post.slug] = events.events;
    } else {
      artifacts.tags[post.slug] = post.tags;
      artifacts.events[post.slug] = [];
    }
  }

  if (isOpenAIConfigured()) {
    const chunks = await getCorpusChunks();
    const vectors = await createEmbeddings(chunks.map((chunk) => chunk.text.slice(0, 2000)));
    artifacts.vectors = chunks.map((chunk, index) => ({ chunkId: chunk.chunkId, vector: vectors[index] ?? [] }));
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(artifacts, null, 2), 'utf8');

  return {
    ok: true,
    generatedAt: artifacts.generatedAt,
    outputFile: OUTPUT_FILE,
    postsProcessed: posts.slice(0, 50).length,
    vectorsGenerated: artifacts.vectors.length,
  };
}

