import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { visualAppData, visualSession } from '../fixtures/app-data';
import { CalibrationView } from '../../src/ui/features/calibration/calibration-view';

const requestId = '30000000-0000-4000-8000-000000000001';
const recipeId = '30000000-0000-4000-8000-000000000002';
const timestamp = '2026-07-30T04:00:00.000Z';

const proposal = {
  schemaVersion: 1 as const,
  boundaryNodeId: 'n1',
  primaryTextNodeId: 'n2',
  authorNodeId: 'n3',
  explanation: 'The selected comment owns one visible text node and reply control.',
};

const candidate = {
  proposal,
  preview: {
    kind: 'comment' as const,
    author: 'Abdur Rahim Sheikh',
    text: 'You missed pgvector.',
    surface: 'notifications' as const,
    validationCount: 1,
    persistent: false,
    boundaryRect: { x: 20, y: 300, width: 340, height: 90 },
  },
  recipe: {
    schemaVersion: 1 as const,
    id: recipeId,
    kind: 'comment' as const,
    surface: 'notifications' as const,
    status: 'active' as const,
    boundary: {
      tag: 'div',
      attributes: [
        {
          name: 'componentkey' as const,
          operator: 'prefix' as const,
          value: 'replaceableComment_urn:li:comment:',
        },
      ],
      capabilities: ['reply-control' as const],
    },
    primaryText: {
      tag: 'span',
      attributes: [
        {
          name: 'data-testid' as const,
          operator: 'equals' as const,
          value: 'expandable-text-box',
        },
      ],
      capabilities: ['primary-text' as const],
    },
    authorStrategy: 'profile-metadata' as const,
    validationCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
};

const capture = {
  evidence: {
    schemaVersion: 1 as const,
    requestId,
    kind: 'comment' as const,
    surface: 'notifications' as const,
    targetNodeId: 'n2',
    region: { x: 20, y: 300, width: 340, height: 90 },
    nodes: [
      {
        id: 'n1',
        tag: 'div',
        attributes: { componentkey: 'replaceableComment_urn:li:comment:' },
        text: 'Abdur Rahim Sheikh You missed pgvector. Reply',
        depth: 0,
        rect: { x: 20, y: 300, width: 340, height: 90 },
        target: false,
      },
      {
        id: 'n2',
        parentId: 'n1',
        tag: 'span',
        attributes: { 'data-testid': 'expandable-text-box' },
        text: 'You missed pgvector.',
        depth: 1,
        rect: { x: 60, y: 330, width: 260, height: 20 },
        target: true,
      },
      {
        id: 'n3',
        parentId: 'n1',
        tag: 'a',
        attributes: { href: 'https://www.linkedin.com/in/abdur-rahim/' },
        text: 'Abdur Rahim Sheikh',
        depth: 1,
        rect: { x: 60, y: 305, width: 150, height: 20 },
        target: false,
      },
    ],
    nodeCount: 3,
    characterCount: 88,
  },
  localCandidate: candidate,
};

const mocks = vi.hoisted(() => ({
  useAppStore: vi.fn(),
  sendMessage: vi.fn(),
  proposeLayoutCalibration: vi.fn(),
  hasProviderPermissions: vi.fn(),
  saveLayoutRecipe: vi.fn(),
  updateSession: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../../src/ui/state/app-store', () => ({
  useAppStore: mocks.useAppStore,
}));

vi.mock('../../src/application/workflows', () => ({
  proposeLayoutCalibration: mocks.proposeLayoutCalibration,
}));

vi.mock('../../src/infrastructure/permissions', () => ({
  hasProviderPermissions: mocks.hasProviderPermissions,
}));

vi.mock('../../src/infrastructure/storage/chrome-storage', () => ({
  storageRepository: {
    saveLayoutRecipe: mocks.saveLayoutRecipe,
    updateSession: mocks.updateSession,
  },
}));

vi.mock('../../src/ui/hooks/use-foreground-job', () => ({
  useForegroundJob: () => ({
    running: false,
    error: null,
    setError: vi.fn(),
    cancel: vi.fn(),
    run: async <T,>(task: (signal: AbortSignal) => Promise<T>) =>
      task(new AbortController().signal),
  }),
}));

describe('layout calibration modes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('chrome', {
      tabs: { sendMessage: mocks.sendMessage },
      extension: { inIncognitoContext: false },
    });
    mocks.hasProviderPermissions.mockResolvedValue(true);
    mocks.proposeLayoutCalibration.mockResolvedValue({
      value: proposal,
      provider: 'gemini',
      usedFallback: false,
    });
    mocks.sendMessage.mockImplementation((_tabId: number, message: { type: string }) => {
      if (message.type === 'content:capture-calibration') {
        return Promise.resolve({ ok: true, capture });
      }
      if (message.type === 'content:validate-calibration') {
        return Promise.resolve({ ok: true, candidate });
      }
      return Promise.resolve({ ok: true });
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('confirms an on-device mapping through the same local DOM validator', async () => {
    const app = visualAppData();
    const session = visualSession('reply');
    session.calibration = {
      status: 'pending',
      requestId,
      tabId: 7,
      frameId: 0,
      kind: 'comment',
      mode: 'local',
      requestedAt: timestamp,
    };
    mocks.useAppStore.mockReturnValue({ app, session, refresh: mocks.refresh });

    render(<CalibrationView onOpenSettings={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm layout' }));
    await screen.findByText('Layout ready for this item');

    expect(mocks.proposeLayoutCalibration).not.toHaveBeenCalled();
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: 'content:validate-calibration',
        requestId,
        kind: 'comment',
        proposal,
      }),
      { frameId: 0 },
    );
  });

  it('retains the selected DOM capture when app state refreshes during AI calibration', async () => {
    const app = visualAppData();
    const session = visualSession('reply');
    session.calibration = {
      status: 'pending',
      requestId,
      tabId: 7,
      frameId: 0,
      kind: 'comment',
      mode: 'ai',
      requestedAt: timestamp,
    };
    mocks.useAppStore.mockReturnValue({ app, session, refresh: mocks.refresh });

    const view = render(<CalibrationView onOpenSettings={vi.fn()} />);
    await screen.findByRole('button', { name: 'Send and calibrate' });

    mocks.useAppStore.mockReturnValue({
      app: structuredClone(app),
      session: structuredClone(session),
      refresh: mocks.refresh,
    });
    view.rerender(<CalibrationView onOpenSettings={vi.fn()} />);

    expect(
      mocks.sendMessage.mock.calls.filter(
        ([, message]) => (message as { type: string }).type === 'content:clear-calibration',
      ),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Send and calibrate' }));

    await screen.findByRole('button', { name: 'Confirm layout' });
    await waitFor(() =>
      expect(mocks.sendMessage).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          type: 'content:validate-calibration',
          requestId,
          kind: 'comment',
        }),
        { frameId: 0 },
      ),
    );
    expect(screen.queryByText('The calibration target expired. Right-click it again.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm layout' }));
    await screen.findByText('Layout ready for this item');

    expect(mocks.proposeLayoutCalibration).toHaveBeenCalledTimes(1);
    expect(
      mocks.sendMessage.mock.calls.filter(
        ([, message]) => (message as { type: string }).type === 'content:validate-calibration',
      ),
    ).toHaveLength(2);
  });

  it('falls back to the validated on-device mapping when the AI selects an unsafe text node', async () => {
    const app = visualAppData();
    const session = visualSession('reply');
    session.calibration = {
      status: 'pending',
      requestId,
      tabId: 7,
      frameId: 0,
      kind: 'comment',
      mode: 'ai',
      requestedAt: timestamp,
    };
    mocks.useAppStore.mockReturnValue({ app, session, refresh: mocks.refresh });
    mocks.proposeLayoutCalibration.mockResolvedValue({
      value: { ...proposal, primaryTextNodeId: 'n1' },
      provider: 'gemini',
      usedFallback: false,
    });
    mocks.sendMessage.mockImplementation(
      (_tabId: number, message: { type: string; proposal?: typeof proposal }) => {
        if (message.type === 'content:capture-calibration') {
          return Promise.resolve({ ok: true, capture });
        }
        if (
          message.type === 'content:validate-calibration' &&
          message.proposal?.primaryTextNodeId === 'n1'
        ) {
          return Promise.resolve({
            ok: false,
            code: 'unsupported-layout',
            message: 'The proposed primary text includes profile or action controls.',
          });
        }
        if (message.type === 'content:validate-calibration') {
          return Promise.resolve({ ok: true, candidate });
        }
        return Promise.resolve({ ok: true });
      },
    );

    render(<CalibrationView onOpenSettings={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send and calibrate' }));

    await screen.findByRole('button', { name: 'Confirm layout' });
    expect(screen.getByText(/validated on-device mapping/i)).toBeVisible();
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: 'content:validate-calibration',
        proposal,
      }),
      { frameId: 0 },
    );
  });
});
