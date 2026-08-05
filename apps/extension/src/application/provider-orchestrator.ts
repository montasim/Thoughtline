import { AppError, toAppError } from './errors';
import type { DraftingProvider, StructuredGenerationRequest } from './ports/drafting-provider';
import type { ProviderName } from '../domain/schemas';
import { credentialVault } from '../infrastructure/storage/credential-vault';
import { GeminiProvider } from '../infrastructure/providers/gemini-provider';
import { GroqProvider } from '../infrastructure/providers/groq-provider';

const FALLBACK_CODES = new Set([
  'credential-invalid',
  'provider-rate-limit',
  'provider-response-invalid',
  'provider-unavailable',
]);

export interface ProviderResult<T> {
  value: T;
  provider: ProviderName;
  usedFallback: boolean;
}

export interface CredentialReader {
  get: (provider: ProviderName) => Promise<string | null>;
}

export class ProviderOrchestrator {
  constructor(
    private readonly primary: DraftingProvider = new GeminiProvider(),
    private readonly fallback: DraftingProvider = new GroqProvider(),
    private readonly credentials: CredentialReader = credentialVault,
  ) {}

  async run<T>(request: StructuredGenerationRequest<T>): Promise<ProviderResult<T>> {
    const primaryKey = await this.credentials.get(this.primary.name);
    const fallbackKey = await this.credentials.get(this.fallback.name);
    if (!primaryKey || !fallbackKey) {
      throw new AppError('credential-missing', 'Valid Gemini and Groq API keys are both required.');
    }
    try {
      return {
        value: await this.primary.generateStructured(primaryKey, request),
        provider: this.primary.name,
        usedFallback: false,
      };
    } catch (error) {
      const primaryError = toAppError(error);
      if (!FALLBACK_CODES.has(primaryError.code) || request.signal?.aborted) throw primaryError;
      try {
        return {
          value: await this.fallback.generateStructured(fallbackKey, request),
          provider: this.fallback.name,
          usedFallback: true,
        };
      } catch (fallbackError) {
        const resolved = toAppError(fallbackError);
        throw new AppError(
          resolved.code,
          combinedProviderFailureMessage(primaryError.code, resolved.code),
          { primary: primaryError.code, fallback: resolved.code },
        );
      }
    }
  }

  async validate(provider: ProviderName, apiKey: string, signal?: AbortSignal): Promise<boolean> {
    const adapter = provider === 'gemini' ? this.primary : this.fallback;
    await adapter.validateConnection(apiKey, signal);
    return true;
  }
}

export const providerOrchestrator = new ProviderOrchestrator();

function combinedProviderFailureMessage(
  primary: AppError['code'],
  fallback: AppError['code'],
): string {
  if (primary === 'credential-invalid' || fallback === 'credential-invalid') {
    return 'A provider rejected its API key or model access. Revalidate Connections and try again.';
  }
  if (primary === 'provider-response-invalid' && fallback === 'provider-response-invalid') {
    return 'Both providers returned results Thoughtline could not safely validate.';
  }
  if (
    ['provider-rate-limit', 'provider-unavailable'].includes(primary) &&
    ['provider-rate-limit', 'provider-unavailable'].includes(fallback)
  ) {
    return 'Gemini and Groq are busy or unavailable right now. Try again shortly.';
  }
  return `${providerFailureDetail('Gemini', primary)} ${providerFailureDetail('Groq', fallback)} Try again.`;
}

function providerFailureDetail(provider: 'Gemini' | 'Groq', code: AppError['code']): string {
  if (code === 'provider-response-invalid') {
    return `${provider} returned output that failed validation.`;
  }
  if (code === 'provider-rate-limit') return `${provider} reached its rate limit.`;
  if (code === 'provider-unavailable') return `${provider} was unavailable.`;
  return `${provider} could not complete the request.`;
}
