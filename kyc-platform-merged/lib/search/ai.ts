/**
 * AI Search — retrieval-first via MongoDB text search, then OpenAI synthesis.
 * Never hallucinates: if evidence is insufficient, returns a clear fallback message.
 */
import { standardSearch } from './standard';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

export interface AISearchResult {
  answer: string;
  sources: { slug: string; title: string; excerpt: string; is_premium: boolean }[];
  snippets: string[];
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  query: string;
}

function truncate(str: string, max: number) {
  return str.length <= max ? str : str.slice(0, max) + '…';
}

export async function aiSearch(query: string): Promise<AISearchResult> {
  if (!OPENAI_API_KEY) {
    return {
      answer: 'AI search is not configured (missing OPENAI_API_KEY).',
      sources: [],
      snippets: [],
      confidence: 'insufficient',
      query,
    };
  }

  // Step 1: Retrieve top posts via standard search
  const results = await standardSearch(query, {});
  const top = results.slice(0, 6);

  if (top.length === 0) {
    return {
      answer: 'No relevant content found for your query in our knowledge base.',
      sources: [],
      snippets: [],
      confidence: 'insufficient',
      query,
    };
  }

  // Step 2: Build context from retrieved documents
  const context = top.map((r, i) => {
    const { post } = r;
    return `[Source ${i + 1}] "${post.title}" (${post.category}, ${new Date(post.published_at || post.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })})\n${truncate(post.body, 800)}`;
  }).join('\n\n---\n\n');

  // Step 3: Call OpenAI for synthesis
  const systemPrompt = `You are a factual commodity intelligence analyst for the KYC (Know Your Commodity) platform.
Answer questions ONLY using the provided source documents. Do not invent facts.
Be concise (2-4 sentences). Cite sources by their number [Source N].
If the documents don't have enough evidence to answer confidently, say: "The available evidence is insufficient to answer this question confidently." followed by what you did find.
Do not speculate beyond the provided text.`;

  const userPrompt = `Question: ${query}\n\nSource documents:\n${context}\n\nAnswer based only on the above sources:`;

  let answer = '';
  let confidence: AISearchResult['confidence'] = 'medium';

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 400,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json() as {
      choices: { message: { content: string } }[];
    };
    answer = data.choices?.[0]?.message?.content?.trim() || '';

    // Estimate confidence from answer content
    const insufficientSignals = ['insufficient', 'not enough', 'cannot answer', 'don\'t have'];
    if (insufficientSignals.some((s) => answer.toLowerCase().includes(s))) {
      confidence = top.length >= 3 ? 'low' : 'insufficient';
    } else if (top.length >= 4 && top[0].score > 1) {
      confidence = 'high';
    } else {
      confidence = 'medium';
    }
  } catch (err) {
    answer = `Error generating AI summary: ${err instanceof Error ? err.message : 'unknown error'}. Here are the most relevant articles:`;
    confidence = 'insufficient';
  }

  return {
    answer,
    sources: top.map((r) => ({
      slug:       r.post.slug,
      title:      r.post.title,
      excerpt:    r.post.excerpt,
      is_premium: r.post.is_premium,
    })),
    snippets: top.map((r) => r.snippet),
    confidence,
    query,
  };
}
