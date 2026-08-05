import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GeminiProvider } from '../../src/infrastructure/providers/gemini-provider';
import { GroqProvider } from '../../src/infrastructure/providers/groq-provider';

const schema = z.object({ answer: z.string() });
const request = {
  schemaName: 'test_answer',
  schema,
  systemInstruction: 'Return a grounded answer.',
  untrustedEnvelope: { boundary: 'untrusted-content', source: 'data' },
  maxOutputTokens: 100,
};

describe('AI provider adapters', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('validates Gemini access through model metadata without generating content', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ name: 'models/gemini-3.5-flash' }), { status: 200 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new GeminiProvider().validateConnection('gemini-key-123'),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash',
      expect.objectContaining({
        method: 'GET',
        headers: { 'x-goog-api-key': 'gemini-key-123' },
      }),
    );
  });

  it('validates Groq access through model metadata without generating content', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: [{ id: 'openai/gpt-oss-120b' }] }), { status: 200 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(new GroqProvider().validateConnection('groq-key-12345')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer groq-key-12345' },
      }),
    );
  });

  it('rejects Groq validation when the configured model is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ data: [{ id: 'llama-3.1-8b-instant' }] }), {
            status: 200,
          }),
        ),
      ),
    );

    await expect(new GroqProvider().validateConnection('groq-key-12345')).rejects.toMatchObject({
      code: 'provider-unavailable',
      message: 'The configured Groq model is not available for this API key.',
    });
  });

  it('sends separated structured content to Gemini and validates its response locally', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
        string,
        unknown
      >;
      expect(body).toHaveProperty('systemInstruction');
      expect(JSON.stringify(body)).toContain('UNTRUSTED_CONTENT_JSON');
      expect(body).toMatchObject({
        generationConfig: {
          responseFormat: {
            text: {
              mimeType: 'application/json',
              schema: {
                type: 'object',
                properties: { answer: { type: 'string' } },
                required: ['answer'],
                additionalProperties: false,
              },
            },
          },
          thinkingConfig: { thinkingLevel: 'minimal' },
        },
      });
      expect(JSON.stringify(body)).not.toContain('responseJsonSchema');
      return Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"answer":"ready"}' }] } }],
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new GeminiProvider().generateStructured('gemini-key-123', request),
    ).resolves.toEqual({ answer: 'ready' });
  });

  it('repairs a readable Gemini response locally before falling back to another provider', async () => {
    let attempt = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      attempt += 1;
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
        contents?: Array<{ parts?: Array<{ text?: string }> }>;
      };
      if (attempt === 2) {
        expect(body.contents?.[0]?.parts?.[0]?.text).toContain('validationIssues');
        expect(body.contents?.[0]?.parts?.[0]?.text).toContain('answer');
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts:
                    attempt === 1
                      ? [{ thought: true, text: 'internal reasoning' }, { text: '{"answer":42}' }]
                      : [{ text: '{"answer":"repaired"}' }],
                },
                finishReason: 'STOP',
              },
            ],
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new GeminiProvider().generateStructured('gemini-key-123', request),
    ).resolves.toEqual({ answer: 'repaired' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses Groq JSON schema mode and rejects structurally invalid output', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
        string,
        unknown
      >;
      expect(body).toMatchObject({
        reasoning_effort: 'low',
        response_format: {
          type: 'json_schema',
          json_schema: { strict: true },
        },
      });
      expect(JSON.stringify(body)).toContain('UNTRUSTED_CONTENT_JSON');
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: '{"wrong":true}' } }] }), {
          status: 200,
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new GroqProvider().generateStructured('groq-key-12345', request),
    ).rejects.toMatchObject({ code: 'provider-response-invalid' });
  });
});
