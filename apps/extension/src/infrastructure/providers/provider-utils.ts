import { AppError } from '../../application/errors';

export async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) throw mapProviderHttpError(response.status);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new AppError(
      'provider-response-invalid',
      'The AI provider returned an unreadable response.',
      error,
    );
  }
}

export function parseJsonText(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new AppError(
      'provider-response-invalid',
      'The AI provider returned invalid structured output.',
      error,
    );
  }
}

export function mapProviderHttpError(status: number): AppError {
  if (status === 401 || status === 403) {
    return new AppError(
      'credential-invalid',
      'The provider rejected this API key or model permission.',
    );
  }
  if (status === 429) {
    return new AppError(
      'provider-rate-limit',
      'The provider rate limit was reached. Thoughtline will try its fallback when allowed.',
    );
  }
  if (status >= 500) {
    return new AppError('provider-unavailable', 'The AI provider is temporarily unavailable.');
  }
  return new AppError('provider-response-invalid', 'The AI provider rejected the request.');
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 90_000,
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener('abort', abort, { once: true });
  const timer = globalThis.setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (init.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    throw new AppError('provider-unavailable', 'The AI provider could not be reached.', error);
  } finally {
    globalThis.clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}

export function jsonSchemaForProvider(schema: unknown): Record<string, unknown> {
  const unsupported = new Set([
    '$schema',
    'default',
    'examples',
    'maxLength',
    'minLength',
    'pattern',
  ]);
  return stripUnsupported(schema, unsupported) as Record<string, unknown>;
}

function stripUnsupported(value: unknown, unsupported: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => stripUnsupported(item, unsupported));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !unsupported.has(key))
      .map(([key, child]) => [key, stripUnsupported(child, unsupported)]),
  );
}
