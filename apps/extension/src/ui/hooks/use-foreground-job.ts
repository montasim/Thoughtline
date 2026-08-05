import { useCallback, useEffect, useRef, useState } from 'react';
import { AppError, toAppError } from '../../application/errors';
import { isProviderReady } from '../../domain/schemas';
import { storageRepository } from '../../infrastructure/storage/chrome-storage';
import { createId } from '../../shared/id';

export function useForegroundJob() {
  const ownerId = useRef(createId());
  const controller = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback(() => {
    controller.current?.abort();
  }, []);

  const run = useCallback(
    async <T>(
      task: (signal: AbortSignal) => Promise<T>,
      options: { requiresAiSetup?: boolean } = {},
    ): Promise<T | null> => {
      setError(null);
      let claimed = false;
      try {
        if (options.requiresAiSetup !== false) {
          const app = await storageRepository.loadAppData();
          if (!app.settings.consent.accepted) {
            throw new AppError(
              'consent-required',
              'AI processing consent is required. Review Connections in Settings.',
            );
          }
          if (!isProviderReady(app.settings)) {
            throw new AppError(
              'setup-incomplete',
              'Valid Gemini and Groq API keys are both required. Review Connections in Settings.',
            );
          }
        }
        await storageRepository.claimJob(ownerId.current);
        claimed = true;
        const nextController = new AbortController();
        controller.current = nextController;
        setRunning(true);
        return await task(nextController.signal);
      } catch (value) {
        const appError = toAppError(value);
        if (appError.code !== 'cancelled') setError(appError.message);
        return null;
      } finally {
        controller.current = null;
        setRunning(false);
        if (claimed) await storageRepository.releaseJob(ownerId.current);
      }
    },
    [],
  );

  useEffect(
    () => () => {
      controller.current?.abort();
      void storageRepository.releaseJob(ownerId.current);
    },
    [],
  );

  return { running, error, setError, run, cancel };
}
