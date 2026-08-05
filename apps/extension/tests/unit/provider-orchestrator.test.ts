import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../../src/application/errors';
import { ProviderOrchestrator } from '../../src/application/provider-orchestrator';
import type { DraftingProvider } from '../../src/application/ports/drafting-provider';

const output = z.object({ text: z.string() });
const request = {
  schemaName: 'fallback_test',
  schema: output,
  systemInstruction: 'Test',
  untrustedEnvelope: { source: 'data' },
  maxOutputTokens: 50,
};

describe('cross-provider fallback', () => {
  it('validates access without running a generation request', async () => {
    const validateConnection = vi.fn().mockResolvedValue(undefined);
    const generateStructured = vi.fn();
    const primary = provider('gemini', generateStructured, validateConnection);
    const fallback = provider('groq', vi.fn());
    const orchestrator = new ProviderOrchestrator(primary, fallback);

    await expect(orchestrator.validate('gemini', 'gemini-key')).resolves.toBe(true);
    expect(validateConnection).toHaveBeenCalledWith('gemini-key', undefined);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it('tries Gemini once and then Groq once for an allowed provider failure', async () => {
    const primaryGenerate = vi.fn().mockRejectedValue(new AppError('provider-rate-limit', 'busy'));
    const fallbackGenerate = vi.fn().mockResolvedValue({ text: 'from Groq' });
    const primary = provider('gemini', primaryGenerate);
    const fallback = provider('groq', fallbackGenerate);
    const orchestrator = new ProviderOrchestrator(primary, fallback, {
      get: (name) => Promise.resolve(`${name}-key`),
    });

    await expect(orchestrator.run(request)).resolves.toEqual({
      value: { text: 'from Groq' },
      provider: 'groq',
      usedFallback: true,
    });
    expect(primaryGenerate).toHaveBeenCalledTimes(1);
    expect(fallbackGenerate).toHaveBeenCalledTimes(1);
  });

  it('does not send invalid local input or cancellation to the fallback', async () => {
    const primaryGenerate = vi.fn().mockRejectedValue(new AppError('invalid-input', 'bad'));
    const fallbackGenerate = vi.fn();
    const primary = provider('gemini', primaryGenerate);
    const fallback = provider('groq', fallbackGenerate);
    const orchestrator = new ProviderOrchestrator(primary, fallback, {
      get: (name) => Promise.resolve(`${name}-key`),
    });

    await expect(orchestrator.run(request)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(fallbackGenerate).not.toHaveBeenCalled();
  });

  it('requires both configured keys before any provider receives content', async () => {
    const primaryGenerate = vi.fn();
    const fallbackGenerate = vi.fn();
    const primary = provider('gemini', primaryGenerate);
    const fallback = provider('groq', fallbackGenerate);
    const orchestrator = new ProviderOrchestrator(primary, fallback, {
      get: (name) => Promise.resolve(name === 'gemini' ? 'gemini-key' : null),
    });

    await expect(orchestrator.run(request)).rejects.toMatchObject({ code: 'credential-missing' });
    expect(primaryGenerate).not.toHaveBeenCalled();
    expect(fallbackGenerate).not.toHaveBeenCalled();
  });

  it('reports each provider failure without suggesting an unavailable on-device action', async () => {
    const primary = provider(
      'gemini',
      vi
        .fn()
        .mockRejectedValue(
          new AppError('provider-response-invalid', 'Gemini output failed validation.'),
        ),
    );
    const fallback = provider(
      'groq',
      vi.fn().mockRejectedValue(new AppError('provider-rate-limit', 'Groq rate limit reached.')),
    );
    const orchestrator = new ProviderOrchestrator(primary, fallback, {
      get: (name) => Promise.resolve(`${name}-key`),
    });

    await expect(orchestrator.run(request)).rejects.toMatchObject({
      message:
        'Gemini returned output that failed validation. Groq reached its rate limit. Try again.',
    });
  });
});

function provider(
  name: 'gemini' | 'groq',
  generateStructured: DraftingProvider['generateStructured'],
  validateConnection: DraftingProvider['validateConnection'] = vi.fn().mockResolvedValue(undefined),
): DraftingProvider {
  return { name, model: `${name}-model`, validateConnection, generateStructured };
}
