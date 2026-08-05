import type { ProviderName } from '../domain/schemas';

export interface ModelConfiguration {
  provider: ProviderName;
  model: string;
  contextCharacters: number;
  defaultOutputTokens: number;
}

export const modelRegistry = {
  gemini: {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    contextCharacters: 500_000,
    defaultOutputTokens: 5_000,
  },
  groq: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    contextCharacters: 300_000,
    defaultOutputTokens: 4_000,
  },
} as const satisfies Record<ProviderName, ModelConfiguration>;
