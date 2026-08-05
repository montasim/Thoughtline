import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '../../src/domain/schemas';
import { visualAppData, visualSession } from '../fixtures/app-data';
import { IdeasView } from '../../src/ui/features/ideas/ideas-view';

const mocks = vi.hoisted(() => ({
  collectSourceEvidence: vi.fn(),
  requestSourcePermissions: vi.fn(),
  synthesizeIdeas: vi.fn(),
  updateSession: vi.fn(),
  useAppStore: vi.fn(),
  saveApp: vi.fn(),
  refresh: vi.fn(),
  setError: vi.fn(),
  cancel: vi.fn(),
  jobState: { running: false, error: null as string | null },
}));

vi.mock('../../src/application/idea-research', () => ({
  collectSourceEvidence: mocks.collectSourceEvidence,
}));

vi.mock('../../src/application/workflows', () => ({
  addRevision: vi.fn(),
  createIdeaHistory: vi.fn(),
  draftPost: vi.fn(),
  synthesizeIdeas: mocks.synthesizeIdeas,
}));

vi.mock('../../src/infrastructure/permissions', () => ({
  requestSourcePermissions: mocks.requestSourcePermissions,
}));

vi.mock('../../src/infrastructure/storage/chrome-storage', () => ({
  storageRepository: {
    updateSession: mocks.updateSession,
  },
}));

vi.mock('../../src/ui/hooks/use-foreground-job', () => ({
  useForegroundJob: () => ({
    running: mocks.jobState.running,
    error: mocks.jobState.error,
    setError: mocks.setError,
    cancel: mocks.cancel,
    run: async <T,>(task: (signal: AbortSignal) => Promise<T>) =>
      task(new AbortController().signal),
  }),
}));

vi.mock('../../src/ui/state/app-store', () => ({
  useAppStore: mocks.useAppStore,
}));

describe('Idea source search', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobState.running = false;
    mocks.jobState.error = null;
    const app = visualAppData();
    app.settings.publicResearchEnabled = false;
    const session = visualSession('idea');
    session.ideaView = 'experience';
    const ideaSession = visualSession('idea').ideaSession;
    const candidate = ideaSession?.candidates[0];
    const source = candidate?.source;
    if (!candidate || !source) throw new Error('Expected a sourced Idea fixture.');

    mocks.useAppStore.mockReturnValue({
      app,
      session,
      refresh: mocks.refresh,
      saveApp: mocks.saveApp,
    });
    mocks.requestSourcePermissions.mockResolvedValue(true);
    mocks.collectSourceEvidence.mockResolvedValue({
      evidence: [source],
      unavailableSources: [],
    });
    mocks.synthesizeIdeas.mockResolvedValue({ candidates: [candidate] });
    mocks.updateSession.mockResolvedValue(session);
  });

  it('enables public research and searches when Try sources is pressed', async () => {
    render(<IdeasView />);

    fireEvent.click(screen.getByRole('button', { name: 'Try sources' }));

    await waitFor(() => expect(mocks.saveApp).toHaveBeenCalledOnce());
    const savedApp = mocks.saveApp.mock.calls[0]?.[0] as AppData;
    expect(savedApp.settings.publicResearchEnabled).toBe(true);
    expect(mocks.requestSourcePermissions).toHaveBeenCalledOnce();
    expect(mocks.collectSourceEvidence).toHaveBeenCalledOnce();
    expect(mocks.synthesizeIdeas).toHaveBeenCalledOnce();
    expect(mocks.updateSession).toHaveBeenCalledOnce();
  });

  it('returns from the experience fallback to the main Idea search', () => {
    const session = visualSession('idea');
    session.ideaView = 'experience';
    render(<IdeasView />);

    fireEvent.click(screen.getByRole('button', { name: 'Back to ideas' }));

    const update = mocks.updateSession.mock.calls[0]?.[0] as (
      current: typeof session,
    ) => typeof session;
    expect(update(session)).toMatchObject({
      ideaView: 'search',
      activeRecordId: undefined,
    });
  });

  it('shows animated progress and allows an active search to be cancelled', () => {
    const app = visualAppData();
    const session = visualSession('idea');
    session.ideaView = 'search';
    session.ideaSession = undefined;
    mocks.jobState.running = true;
    mocks.useAppStore.mockReturnValue({
      app,
      session,
      refresh: mocks.refresh,
      saveApp: mocks.saveApp,
    });

    render(<IdeasView />);

    expect(screen.getByRole('heading', { name: 'Searching selected sources' })).toBeVisible();
    expect(screen.getByText('Collecting source evidence')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.cancel).toHaveBeenCalledOnce();
  });
});
