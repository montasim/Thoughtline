import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../src/domain/schemas';
import { ReplyView } from '../../src/ui/features/reply/reply-view';
import { visualAppData, visualSession } from '../fixtures/app-data';
import { AppError } from '../../src/application/errors';

const mocks = vi.hoisted(() => ({
  useAppStore: vi.fn(),
  updateSession: vi.fn(),
  refresh: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('../../src/application/workflows', () => ({
  analyzeReply: vi.fn(),
  regenerateReplyDirection: vi.fn(),
}));

vi.mock('../../src/infrastructure/storage/chrome-storage', () => ({
  storageRepository: {
    updateSession: mocks.updateSession,
  },
}));

vi.mock('../../src/ui/hooks/use-foreground-job', () => ({
  useForegroundJob: () => ({
    running: false,
    error: 'Another AI activity is already running.',
    setError: vi.fn(),
    cancel: mocks.cancel,
    run: vi
      .fn()
      .mockImplementation(
        async (
          _task: (signal: AbortSignal) => Promise<unknown>,
          options?: { onStartError?: (error: AppError) => void | Promise<void> },
        ) => {
          await options?.onStartError?.(
            new AppError('busy', 'Another Thoughtline activity is already running.'),
          );
          return null;
        },
      ),
  }),
}));

vi.mock('../../src/ui/state/app-store', () => ({
  useAppStore: mocks.useAppStore,
}));

describe('Reply analysis startup', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    const session = visualSession('reply');
    session.activeRecordId = undefined;
    session.analysis = {
      status: 'pending',
      requestId: '20000000-0000-4000-8000-000000000009',
      tabId: 7,
      frameId: 0,
      requestedAt: '2026-08-24T04:00:00.000Z',
    };
    mocks.useAppStore.mockReturnValue({
      app: visualAppData(),
      session,
      refresh: mocks.refresh,
    });
    mocks.updateSession.mockResolvedValue(session);
    mocks.refresh.mockResolvedValue(undefined);
  });

  it('turns a rejected foreground-job startup into a terminal analysis error', async () => {
    render(<ReplyView onOpenSettings={vi.fn()} onContinueSetup={vi.fn()} />);

    expect(screen.getByText('Preparing analysis')).toBeVisible();
    await waitFor(() => expect(mocks.updateSession).toHaveBeenCalledOnce());

    const update = mocks.updateSession.mock.calls[0]?.[0] as (
      session: SessionState,
    ) => SessionState;
    const current = visualSession('reply');
    current.analysis = {
      status: 'pending',
      requestId: '20000000-0000-4000-8000-000000000009',
      tabId: 7,
      frameId: 0,
      requestedAt: '2026-08-24T04:00:00.000Z',
    };
    const next = update(current);
    expect(next.analysis).toMatchObject({
      status: 'error',
      code: 'busy',
      message: 'Another Thoughtline activity is already running.',
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
