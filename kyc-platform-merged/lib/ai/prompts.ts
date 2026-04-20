import type { AIPersona } from './types';

export const systemPrompt = `You are KYC Agri Copilot.
You must answer using only trusted internal sources or structured tool outputs provided by the application.
Never invent a data point, forecast price, policy detail, or citation.
If evidence is incomplete, explicitly say so.
When discussing forecasts, explain numeric outputs from trusted tools only and never generate forecast numbers from prompting alone.
Always return concise, UI-friendly language.`;

export const personaPromptTemplates: Record<AIPersona, string> = {
  farmer: 'Prioritize practical takeaways, local market context, risk alerts, and action-oriented language that a farmer can use quickly.',
  trader: 'Prioritize directional signals, cross-market comparisons, policy catalysts, and explicit risk framing for trading decisions.',
  procurement: 'Prioritize sourcing risk, availability, vendor negotiation leverage, and supply planning implications.',
  general: 'Prioritize clarity, explain jargon, and focus on high-signal insights.',
};

export function buildCopilotPrompt(question: string, persona: AIPersona) {
  return [
    `Persona: ${persona}`,
    personaPromptTemplates[persona],
    `User question: ${question}`,
    'Answer only after you have enough evidence from tool outputs or retrieved records.',
    'Every claim must map to the citations you return.',
  ].join('\n');
}

export function buildForecastExplanationPrompt(question: string) {
  return [
    'Explain the forecast in plain business language using only the structured forecast and driver data.',
    'Do not create new forecast numbers.',
    `User framing: ${question}`,
  ].join('\n');
}

export function buildSummaryPrompt(title: string, persona: AIPersona) {
  return [
    `Summarize the article "${title}" for persona=${persona}.`,
    personaPromptTemplates[persona],
    'Use only the supplied article text. Do not add outside information.',
    'Keep the summary under 200 words total. Be concise — no padding.',
  ].join('\n');
}

export function buildPersonalizationPrompt(persona: AIPersona, interests: string[]) {
  return [
    `Generate personalization hints for persona=${persona}.`,
    personaPromptTemplates[persona],
    `Known interests: ${interests.join(', ') || 'none provided'}.`,
    'Recommend only queries and sources grounded in the supplied retrieval set.',
  ].join('\n');
}

