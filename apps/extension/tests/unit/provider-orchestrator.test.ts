import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../../src/application/errors';
import {
  ProviderOrchestrator,
  type DraftingProviderFactory,
} from '../../src/application/provider-orchestrator';
import type { DraftingProvider } from '../../src/application/ports/drafting-provider';
import type { AiRouting, ProviderName } from '../../src/domain/schemas';
import { OpenRouterProvider } from '../../src/infrastructure/providers/openrouter-provider';

const output = z.object({ text: z.string() });
const request = {
  schemaName: 'fallback_test',
  schema: output,
  systemInstruction: 'Test',
  untrustedEnvelope: { source: 'data' },
  maxOutputTokens: 50,
};
const routing: AiRouting = {
  models: {
    openrouter: 'google/gemma-4-31b-it:free',
    gemini: 'gemini-3.5-flash',
    groq: 'openai/gpt-oss-120b',
  },
  zeroCostConfirmed: true,
};

describe('cross-provider fallback', () => {
  it('validates the selected provider and model without running generation', async () => {
    const validateConnection = vi.fn().mockResolvedValue(undefined);
    const generateStructured = vi.fn();
    const openrouter = provider('openrouter', generateStructured, validateConnection);
    const orchestrator = createOrchestrator([openrouter]);

    await expect(
      orchestrator.validate('openrouter', 'google/gemma-4-31b-it:free', 'openrouter-key'),
    ).resolves.toBe(true);
    expect(validateConnection).toHaveBeenCalledWith('openrouter-key', undefined);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it('tries OpenRouter, Gemini, and Groq in that exact order', async () => {
    const calls: ProviderName[] = [];
    const openrouter = provider(
      'openrouter',
      vi.fn(() => {
        calls.push('openrouter');
        return Promise.reject(new AppError('provider-rate-limit', 'busy'));
      }),
    );
    const gemini = provider(
      'gemini',
      vi.fn(() => {
        calls.push('gemini');
        return Promise.reject(new AppError('provider-unavailable', 'down'));
      }),
    );
    const groq = provider(
      'groq',
      vi.fn(() => {
        calls.push('groq');
        return Promise.resolve({ text: 'from Groq' });
      }) as unknown as DraftingProvider['generateStructured'],
    );

    await expect(createOrchestrator([openrouter, gemini, groq]).run(request)).resolves.toEqual({
      value: { text: 'from Groq' },
      provider: 'groq',
      model: 'groq-model',
      usedFallback: true,
    });
    expect(calls).toEqual(['openrouter', 'gemini', 'groq']);
  });

  it('abandons a hanging OpenRouter stage and reaches Gemini within 21 seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const gemini = provider('gemini', vi.fn().mockResolvedValue({ text: 'from Gemini' }));
    const factory: DraftingProviderFactory = {
      create: (name) => {
        if (name === 'openrouter') return new OpenRouterProvider();
        return name === 'gemini' ? gemini : provider('groq', vi.fn());
      },
    };
    const orchestrator = new ProviderOrchestrator(
      factory,
      { get: (name) => Promise.resolve(`${name}-key`) },
      { get: () => Promise.resolve(routing) },
    );
    let settled = false;
    const run = orchestrator.run(request).then((result) => {
      settled = true;
      return result;
    });

    try {
      await vi.advanceTimersByTimeAsync(20_001);
      const settledWithinLimit = settled;
      await vi.advanceTimersByTimeAsync(70_000);
      await expect(run).resolves.toMatchObject({ provider: 'gemini', usedFallback: true });
      expect(settledWithinLimit).toBe(true);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('does not send invalid local input or cancellation to fallback providers', async () => {
    const geminiGenerate = vi.fn();
    const groqGenerate = vi.fn();
    const orchestrator = createOrchestrator([
      provider('openrouter', vi.fn().mockRejectedValue(new AppError('invalid-input', 'bad'))),
      provider('gemini', geminiGenerate),
      provider('groq', groqGenerate),
    ]);

    await expect(orchestrator.run(request)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(geminiGenerate).not.toHaveBeenCalled();
    expect(groqGenerate).not.toHaveBeenCalled();
  });

  it('requires all keys and both free-tier confirmations before sending content', async () => {
    const generate = vi.fn();
    const orchestrator = createOrchestrator([provider('openrouter', generate)], {
      ...routing,
      zeroCostConfirmed: false,
    });
    await expect(orchestrator.run(request)).rejects.toMatchObject({ code: 'setup-incomplete' });
    expect(generate).not.toHaveBeenCalled();

    const missingKey = createOrchestrator([provider('openrouter', generate)], routing, 'groq');
    await expect(missingKey.run(request)).rejects.toMatchObject({ code: 'credential-missing' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('reports a combined failure after all three providers fail', async () => {
    const orchestrator = createOrchestrator([
      provider(
        'openrouter',
        vi.fn().mockRejectedValue(new AppError('provider-response-invalid', 'invalid')),
      ),
      provider(
        'gemini',
        vi.fn().mockRejectedValue(new AppError('provider-response-invalid', 'invalid')),
      ),
      provider(
        'groq',
        vi.fn().mockRejectedValue(new AppError('provider-response-invalid', 'invalid')),
      ),
    ]);
    await expect(orchestrator.run(request)).rejects.toMatchObject({
      message: 'All three providers returned results Thoughtline could not safely validate.',
    });
  });
});

function createOrchestrator(
  providers: DraftingProvider[],
  selected: AiRouting = routing,
  missing?: ProviderName,
): ProviderOrchestrator {
  const byName = new Map(providers.map((item) => [item.name, item]));
  const factory: DraftingProviderFactory = {
    create: (name) => byName.get(name) ?? provider(name, vi.fn()),
  };
  return new ProviderOrchestrator(
    factory,
    { get: (name) => Promise.resolve(name === missing ? null : `${name}-key`) },
    { get: () => Promise.resolve(selected) },
  );
}

function provider(
  name: ProviderName,
  generateStructured: DraftingProvider['generateStructured'],
  validateConnection: DraftingProvider['validateConnection'] = vi.fn().mockResolvedValue(undefined),
): DraftingProvider {
  return { name, model: `${name}-model`, validateConnection, generateStructured };
}
