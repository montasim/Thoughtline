import type { AiRouting, ProviderName } from '../domain/schemas';
import { GeminiProvider } from '../infrastructure/providers/gemini-provider';
import { GroqProvider } from '../infrastructure/providers/groq-provider';
import { OpenRouterProvider } from '../infrastructure/providers/openrouter-provider';
import { storageRepository } from '../infrastructure/storage/chrome-storage';
import { credentialVault } from '../infrastructure/storage/credential-vault';
import { AppError, toAppError } from './errors';
import type { DraftingProvider, StructuredGenerationRequest } from './ports/drafting-provider';

const PROVIDER_ORDER = ['openrouter', 'gemini', 'groq'] as const;
const PROVIDER_STAGE_TIMEOUT_MS = {
  openrouter: 20_000,
  gemini: 30_000,
  groq: 20_000,
} as const satisfies Record<ProviderName, number>;
const FALLBACK_CODES = new Set([
  'credential-invalid',
  'provider-rate-limit',
  'provider-response-invalid',
  'provider-unavailable',
]);

export interface ProviderResult<T> {
  value: T;
  provider: ProviderName;
  model: string;
  usedFallback: boolean;
}

export interface CredentialReader {
  get: (provider: ProviderName) => Promise<string | null>;
}

export interface RoutingReader {
  get: () => Promise<AiRouting>;
}

export interface DraftingProviderFactory {
  create: (provider: ProviderName, model: string) => DraftingProvider;
}

const defaultFactory: DraftingProviderFactory = {
  create(provider, model) {
    if (provider === 'openrouter') {
      return new OpenRouterProvider(model as AiRouting['models']['openrouter']);
    }
    if (provider === 'gemini') {
      return new GeminiProvider(model as AiRouting['models']['gemini']);
    }
    return new GroqProvider(model as AiRouting['models']['groq']);
  },
};

const defaultRouting: RoutingReader = {
  get: async () => (await storageRepository.loadAppData()).settings.aiRouting,
};

export class ProviderOrchestrator {
  constructor(
    private readonly factory: DraftingProviderFactory = defaultFactory,
    private readonly credentials: CredentialReader = credentialVault,
    private readonly routing: RoutingReader = defaultRouting,
  ) {}

  async run<T>(request: StructuredGenerationRequest<T>): Promise<ProviderResult<T>> {
    const routing = await this.routing.get();
    if (!routing.zeroCostConfirmed) {
      throw new AppError(
        'setup-incomplete',
        'Confirm the zero-cost OpenRouter, Gemini, and Groq route before using AI.',
      );
    }

    const stages = await Promise.all(
      PROVIDER_ORDER.map(async (name) => ({
        adapter: this.factory.create(name, routing.models[name]),
        key: await this.credentials.get(name),
      })),
    );
    if (stages.some(({ key }) => !key)) {
      throw new AppError(
        'credential-missing',
        'Valid OpenRouter, Gemini, and Groq API keys are all required.',
      );
    }

    const failures: Array<{ provider: ProviderName; code: AppError['code'] }> = [];
    for (const [index, stage] of stages.entries()) {
      try {
        return {
          value: await runProviderStage(
            stage.adapter,
            stage.key!,
            request,
            PROVIDER_STAGE_TIMEOUT_MS[stage.adapter.name],
          ),
          provider: stage.adapter.name,
          model: stage.adapter.model,
          usedFallback: index > 0,
        };
      } catch (error) {
        const resolved = toAppError(error);
        failures.push({ provider: stage.adapter.name, code: resolved.code });
        if (
          !FALLBACK_CODES.has(resolved.code) ||
          request.signal?.aborted ||
          index === stages.length - 1
        ) {
          if (failures.length === 1) throw resolved;
          throw new AppError(resolved.code, combinedProviderFailureMessage(failures), failures);
        }
      }
    }
    throw new AppError('unknown', 'Thoughtline could not complete this activity.');
  }

  async validate(
    provider: ProviderName,
    model: string,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    await this.factory.create(provider, model).validateConnection(apiKey, signal);
    return true;
  }
}

export const providerOrchestrator = new ProviderOrchestrator();

async function runProviderStage<T>(
  adapter: DraftingProvider,
  apiKey: string,
  request: StructuredGenerationRequest<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancelForUser = () => controller.abort(request.signal?.reason);
  request.signal?.addEventListener('abort', cancelForUser, { once: true });
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort('provider-stage-timeout');
  }, timeoutMs);

  try {
    return await adapter.generateStructured(apiKey, { ...request, signal: controller.signal });
  } catch (error) {
    if (request.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (timedOut) {
      throw new AppError(
        'provider-unavailable',
        `${providerLabel(adapter.name)} did not respond in time.`,
        error,
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    request.signal?.removeEventListener('abort', cancelForUser);
  }
}

function combinedProviderFailureMessage(
  failures: Array<{ provider: ProviderName; code: AppError['code'] }>,
): string {
  if (failures.some(({ code }) => code === 'credential-invalid')) {
    return 'A provider rejected its API key or model access. Revalidate Connections and try again.';
  }
  if (failures.every(({ code }) => code === 'provider-response-invalid')) {
    return 'All three providers returned results Thoughtline could not safely validate.';
  }
  if (
    failures.every(({ code }) => ['provider-rate-limit', 'provider-unavailable'].includes(code))
  ) {
    return 'OpenRouter, Gemini, and Groq are busy or unavailable right now. Try again shortly.';
  }
  return `${failures
    .map(({ provider, code }) => providerFailureDetail(providerLabel(provider), code))
    .join(' ')} Try again.`;
}

function providerLabel(provider: ProviderName): 'OpenRouter' | 'Gemini' | 'Groq' {
  if (provider === 'openrouter') return 'OpenRouter';
  return provider === 'gemini' ? 'Gemini' : 'Groq';
}

function providerFailureDetail(
  provider: 'OpenRouter' | 'Gemini' | 'Groq',
  code: AppError['code'],
): string {
  if (code === 'provider-response-invalid') {
    return `${provider} returned output that failed validation.`;
  }
  if (code === 'provider-rate-limit') return `${provider} reached its rate limit.`;
  if (code === 'provider-unavailable') return `${provider} was unavailable.`;
  return `${provider} could not complete the request.`;
}
