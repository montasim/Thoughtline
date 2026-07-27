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

const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z
            .array(
              z
                .object({
                  text: z.string().optional(),
                  thought: z.boolean().optional(),
                })
                .passthrough(),
            )
            .min(1),
        }),
        finishReason: z.string().optional(),
      }),
    )
    .min(1),
});

export class GeminiProvider implements DraftingProvider {
  readonly name = 'gemini' as const;
  readonly model = modelRegistry.gemini.model;

  async validateConnection(apiKey: string, signal?: AbortSignal): Promise<void> {
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}`,
      {
        method: 'GET',
        headers: { 'x-goog-api-key': apiKey },
        ...(signal ? { signal } : {}),
      },
    );
    await readJsonResponse(response);
  }

  async generateStructured<T>(apiKey: string, request: StructuredGenerationRequest<T>): Promise<T> {
    const initial = await this.generateCandidate(
      apiKey,
      request.systemInstruction,
      request.untrustedEnvelope,
      request,
    );
    const initialResult = validateCandidate(initial, request.schema);
    if (initialResult.success) return initialResult.data;

    const repaired = await this.generateCandidate(
      apiKey,
      `${request.systemInstruction}

The previous candidate did not pass the required output schema. Return a corrected replacement,
not an explanation. Preserve the original task and source facts. Resolve every listed validation
issue and return only one complete JSON value matching the supplied response schema.`,
      {
        originalTask: request.untrustedEnvelope,
        invalidCandidate: initialResult.text.slice(0, 20_000),
        validationIssues: initialResult.issues,
      },
      request,
    );
    const repairedResult = validateCandidate(repaired, request.schema);
    if (!repairedResult.success) {
      throw new AppError(
        'provider-response-invalid',
        'Gemini output failed local validation after one repair attempt.',
        {
          initialFinishReason: initial.finishReason,
          repairFinishReason: repaired.finishReason,
          issues: repairedResult.issues,
        },
      );
    }
    return repairedResult.data;
  }

  private async generateCandidate<T>(
    apiKey: string,
    systemInstruction: string,
    untrustedEnvelope: unknown,
    request: StructuredGenerationRequest<T>,
  ): Promise<z.infer<typeof geminiResponseSchema>['candidates'][number]> {
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `UNTRUSTED_CONTENT_JSON\n${JSON.stringify(untrustedEnvelope)}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseFormat: {
              text: {
                mimeType: 'application/json',
                schema: jsonSchemaForProvider(z.toJSONSchema(request.schema)),
              },
            },
            thinkingConfig: { thinkingLevel: 'minimal' },
            maxOutputTokens: request.maxOutputTokens,
          },
        }),
        ...(request.signal ? { signal: request.signal } : {}),
      },
    );
    const payload = geminiResponseSchema.safeParse(await readJsonResponse(response));
    if (!payload.success) {
      throw new AppError('provider-response-invalid', 'Gemini returned an incomplete response.');
    }
    return payload.data.candidates[0]!;
  }
}

type CandidateValidation<T> =
  { success: true; data: T } | { success: false; text: string; issues: string[] };

function validateCandidate<T>(
  candidate: z.infer<typeof geminiResponseSchema>['candidates'][number],
  schema: StructuredGenerationRequest<T>['schema'],
): CandidateValidation<T> {
  const text = candidate.content.parts
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  if (!text) return { success: false, text: '', issues: ['Gemini returned no output text.'] };

  let value: unknown;
  try {
    value = parseJsonText(text);
  } catch {
    return {
      success: false,
      text,
      issues: [
        candidate.finishReason === 'MAX_TOKENS'
          ? 'The JSON was truncated because Gemini reached the output-token limit.'
          : 'The candidate was not valid JSON.',
      ],
    };
  }
  const parsed = schema.safeParse(value);
  if (parsed.success) return { success: true, data: parsed.data };
  return {
    success: false,
    text,
    issues: parsed.error.issues.slice(0, 12).map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : 'root';
      return `${path}: ${issue.message}`;
    }),
  };
}
