import type { z } from 'zod';
import type { ProviderName } from '../../domain/schemas';

export interface StructuredGenerationRequest<T> {
  schemaName: string;
  schema: z.ZodType<T>;
  systemInstruction: string;
  untrustedEnvelope: unknown;
  maxOutputTokens: number;
  signal?: AbortSignal | undefined;
}

export interface DraftingProvider {
  readonly name: ProviderName;
  readonly model: string;
  validateConnection(apiKey: string, signal?: AbortSignal): Promise<void>;
  generateStructured<T>(apiKey: string, request: StructuredGenerationRequest<T>): Promise<T>;
}
