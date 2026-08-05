export type AppErrorCode =
  | 'busy'
  | 'cancelled'
  | 'consent-required'
  | 'context-overflow'
  | 'credential-invalid'
  | 'credential-missing'
  | 'invalid-input'
  | 'invalid-message'
  | 'linkedin-not-open'
  | 'no-post-found'
  | 'permission-missing'
  | 'provider-rate-limit'
  | 'provider-response-invalid'
  | 'provider-unavailable'
  | 'setup-incomplete'
  | 'storage-failed'
  | 'unsupported-layout'
  | 'unknown';

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toAppError(value: unknown): AppError {
  if (value instanceof AppError) return value;
  if (value instanceof DOMException && value.name === 'AbortError') {
    return new AppError('cancelled', 'The activity was cancelled.', value);
  }
  return new AppError('unknown', 'Thoughtline could not complete this activity.', value);
}
