import { z } from 'zod';
import type {
  DraftingProvider,
  StructuredGenerationRequest,
} from '../../application/ports/drafting-provider';
import { modelRegistry } from '../../application/model-registry';
import { AppError } from '../../application/errors';
import {
  fetchWithTimeout,
  jsonSchemaForProvider,
  parseJsonText,
  readJsonResponse,
} from './provider-utils';

const groqResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().optional(),
      }),
    )
    .min(1),
});

const groqModelsSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

export class GroqProvider implements DraftingProvider {
  readonly name = 'groq' as const;
  readonly model = modelRegistry.groq.model;

  async validateConnection(apiKey: string, signal?: AbortSignal): Promise<void> {
    const response = await fetchWithTimeout('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      ...(signal ? { signal } : {}),
    });
    const payload = groqModelsSchema.safeParse(await readJsonResponse(response));
    if (!payload.success) {
      throw new AppError('provider-response-invalid', 'Groq returned an invalid model list.');
    }
    if (!payload.data.data.some(({ id }) => id === this.model)) {
      throw new AppError(
        'provider-unavailable',
        'The configured Groq model is not available for this API key.',
      );
    }
  }

  async generateStructured<T>(apiKey: string, request: StructuredGenerationRequest<T>): Promise<T> {
    const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: request.systemInstruction },
          {
            role: 'user',
            content: `UNTRUSTED_CONTENT_JSON\n${JSON.stringify(request.untrustedEnvelope)}`,
          },
        ],
        max_completion_tokens: Math.min(request.maxOutputTokens, 4_000),
        reasoning_effort: 'low',
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: jsonSchemaForProvider(z.toJSONSchema(request.schema)),
          },
        },
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    const payload = groqResponseSchema.safeParse(await readJsonResponse(response));
    if (!payload.success) {
      throw new AppError('provider-response-invalid', 'Groq returned an incomplete response.');
    }
    const text = payload.data.choices[0]?.message.content;
    if (!text) throw new AppError('provider-response-invalid', 'Groq returned no output.');
    const parsed = request.schema.safeParse(parseJsonText(text));
    if (!parsed.success) {
      throw new AppError('provider-response-invalid', 'Groq output failed local validation.');
    }
    return parsed.data;
  }
}
