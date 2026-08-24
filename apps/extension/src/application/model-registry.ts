import type { AiRouting, ProviderName } from '../domain/schemas';

export interface ModelConfiguration {
  provider: ProviderName;
  model: string;
  contextCharacters: number;
  defaultOutputTokens: number;
  structuredOutput: 'json-schema' | 'json';
  label: string;
  recommended?: boolean;
}

export const modelRegistry = {
  openrouter: [
    {
      provider: 'openrouter',
      model: 'google/gemma-4-31b-it:free',
      label: 'Gemma 4 31B — writing & multilingual',
      recommended: true,
      contextCharacters: 700_000,
      defaultOutputTokens: 5_000,
      structuredOutput: 'json',
    },
    {
      provider: 'openrouter',
      model: 'z-ai/glm-5.2:free',
      label: 'GLM 5.2 — structured reasoning',
      contextCharacters: 700_000,
      defaultOutputTokens: 5_000,
      structuredOutput: 'json-schema',
    },
    {
      provider: 'openrouter',
      model: 'nvidia/nemotron-3-super-120b-a12b:free',
      label: 'Nemotron 3 Super — complex reasoning',
      contextCharacters: 700_000,
      defaultOutputTokens: 5_000,
      structuredOutput: 'json-schema',
    },
  ],
  gemini: [
    {
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      label: 'Gemini 3.5 Flash — best quality',
      recommended: true,
      contextCharacters: 500_000,
      defaultOutputTokens: 5_000,
      structuredOutput: 'json-schema',
    },
    {
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      label: 'Gemini 3.5 Flash-Lite — faster',
      contextCharacters: 500_000,
      defaultOutputTokens: 5_000,
      structuredOutput: 'json-schema',
    },
  ],
  groq: [
    {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      label: 'GPT-OSS 120B — best quality',
      recommended: true,
      contextCharacters: 300_000,
      defaultOutputTokens: 4_000,
      structuredOutput: 'json-schema',
    },
    {
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      label: 'GPT-OSS 20B — fastest',
      contextCharacters: 300_000,
      defaultOutputTokens: 4_000,
      structuredOutput: 'json-schema',
    },
  ],
} as const satisfies Record<ProviderName, readonly ModelConfiguration[]>;

export function getModelConfiguration<P extends ProviderName>(
  provider: P,
  model: AiRouting['models'][P],
): ModelConfiguration {
  const configuration = modelRegistry[provider].find((candidate) => candidate.model === model);
  if (!configuration) throw new Error(`Unsupported ${provider} model: ${model}`);
  return configuration;
}
