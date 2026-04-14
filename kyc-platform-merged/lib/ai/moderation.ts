import { moderateText } from './openai';

export async function assertSafeUserText(input: string, label = 'input') {
  const result = await moderateText(input);
  if (result.flagged) {
    const categories = Object.entries(result.categories)
      .filter(([, flagged]) => flagged)
      .map(([name]) => name)
      .join(', ');
    throw new Error(`The ${label} was blocked by moderation${categories ? ` (${categories})` : ''}.`);
  }
}

