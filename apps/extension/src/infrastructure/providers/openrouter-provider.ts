import { z } from 'zod';
import { AppError } from '../../application/errors';
import { getModelConfiguration } from '../../application/model-registry';
import type {
  DraftingProvider,
  StructuredGenerationRequest,
} from '../../application/ports/drafting-provider';
import type { AiRouting } from '../../domain/schemas';
import {
  fetchWithTimeout,
  jsonSchemaForProvider,
  parseJsonText,
  readJsonResponse,
} from './provider-utils';

const keyResponseSchema = z.object({
  data: z.object({ is_free_tier: z.boolean() }),
});

const modelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      pricing: z.object({ prompt: z.string(), completion: z.string() }),
      supported_parameters: z.array(z.string()).nullable().optional(),
    }),
  ),
});

const completionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

export class OpenRouterProvider implements DraftingProvider {
  readonly name = 'openrouter' as const;
  readonly model: AiRouting['models']['openrouter'];

  constructor(model: AiRouting['models']['openrouter'] = 'google/gemma-4-31b-it:free') {
    this.model = model;
  }

  async validateConnection(apiKey: string, signal?: AbortSignal): Promise<void> {
    const headers = { Authorization: `Bearer ${apiKey}` };
    const [keyResponse, modelsResponse] = await Promise.all([
      fetchWithTimeout('https://openrouter.ai/api/v1/key', {
        method: 'GET',
        headers,
        ...(signal ? { signal } : {}),
      }),
      fetchWithTimeout('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers,
        ...(signal ? { signal } : {}),
      }),
    ]);
    const key = keyResponseSchema.safeParse(await readJsonResponse(keyResponse));
    const models = modelsResponseSchema.safeParse(await readJsonResponse(modelsResponse));
    if (!key.success || !models.success) {
      throw new AppError('provider-response-invalid', 'OpenRouter returned invalid account data.');
    }
    const selected = models.data.data.find((candidate) => candidate.id === this.model);
    if (!selected) {
      throw new AppError(
        'provider-unavailable',
        'The selected OpenRouter free model is not currently available.',
      );
    }
    if (
      !this.model.endsWith(':free') ||
      Number(selected.pricing.prompt) !== 0 ||
      Number(selected.pricing.completion) !== 0
    ) {
      throw new AppError(
        'provider-unavailable',
        'Thoughtline blocked this OpenRouter model because it is not currently free.',
      );
    }
    if (!selected.supported_parameters?.includes('response_format')) {
      throw new AppError(
        'provider-unavailable',
        'The selected OpenRouter model cannot produce the required structured response.',
      );
    }
  }

  async generateStructured<T>(apiKey: string, request: StructuredGenerationRequest<T>): Promise<T> {
    const first = await this.generateCandidate(apiKey, request.systemInstruction, request);
    const parsed = validateText(first, request);
    if (parsed.success) return parsed.data;

    if (getModelConfiguration('openrouter', this.model).structuredOutput !== 'json') {
      throw new AppError(
        'provider-response-invalid',
        'OpenRouter output failed local validation.',
        {
          issues: parsed.issues,
        },
      );
    }

    const repaired = await this.generateCandidate(
      apiKey,
      `${request.systemInstruction}\n\nThe previous candidate failed local validation. Return one corrected JSON object only. Resolve these issues: ${parsed.issues.join('; ')}`,
      request,
      { invalidCandidate: first.slice(0, 20_000) },
    );
    const repairedResult = validateText(repaired, request);
    if (!repairedResult.success) {
      throw new AppError(
        'provider-response-invalid',
        'OpenRouter output failed local validation after one repair attempt.',
        { issues: repairedResult.issues },
      );
    }
    return repairedResult.data;
  }

  private async generateCandidate<T>(
    apiKey: string,
    systemInstruction: string,
    request: StructuredGenerationRequest<T>,
    repair?: { invalidCandidate: string },
  ): Promise<string> {
    const configuration = getModelConfiguration('openrouter', this.model);
    const jsonSchema = jsonSchemaForProvider(z.toJSONSchema(request.schema));
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/montasimalam/thoughtline',
        'X-Title': 'Thoughtline',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              configuration.structuredOutput === 'json'
                ? `${systemInstruction}\n\nReturn only JSON matching this schema: ${JSON.stringify(jsonSchema)}`
                : systemInstruction,
          },
          {
            role: 'user',
            content: `UNTRUSTED_CONTENT_JSON\n${JSON.stringify(
              repair
                ? { originalTask: request.untrustedEnvelope, ...repair }
                : request.untrustedEnvelope,
            )}`,
          },
        ],
        max_tokens: request.maxOutputTokens,
        response_format:
          configuration.structuredOutput === 'json-schema'
            ? {
                type: 'json_schema',
                json_schema: { name: request.schemaName, strict: true, schema: jsonSchema },
              }
            : { type: 'json_object' },
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    const payload = completionResponseSchema.safeParse(await readJsonResponse(response));
    if (!payload.success) {
      throw new AppError(
        'provider-response-invalid',
        'OpenRouter returned an incomplete response.',
      );
    }
    const text = payload.data.choices[0]?.message.content?.trim();
    if (!text) throw new AppError('provider-response-invalid', 'OpenRouter returned no output.');
    return text;
  }
}

type TextValidation<T> = { success: true; data: T } | { success: false; issues: string[] };

function validateText<T>(text: string, request: StructuredGenerationRequest<T>): TextValidation<T> {
  let value: unknown;
  try {
    value = parseJsonText(text);
  } catch {
    return { success: false, issues: ['The candidate was not valid JSON.'] };
  }
  const parsed = request.schema.safeParse(value);
  if (parsed.success) return { success: true, data: parsed.data };
  return {
    success: false,
    issues: parsed.error.issues.slice(0, 12).map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : 'root';
      return `${path}: ${issue.message}`;
    }),
  };
}
