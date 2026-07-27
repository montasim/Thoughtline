import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { visualAppData } from '../fixtures/app-data';
import { HistoryView } from '../../src/ui/features/history/history-view';

const mocks = vi.hoisted(() => ({
  useAppStore: vi.fn(),
  addHistory: vi.fn(),
  deleteHistory: vi.fn(),
  clearHistory: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../../src/ui/state/app-store', () => ({
  useAppStore: mocks.useAppStore,
}));

vi.mock('../../src/infrastructure/storage/chrome-storage', () => ({
  storageRepository: {
    addHistory: mocks.addHistory,
    deleteHistory: mocks.deleteHistory,
    clearHistory: mocks.clearHistory,
  },
}));

describe('History copy controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAppStore.mockReturnValue({
      app: visualAppData(),
      refresh: mocks.refresh,
    });
  });

  afterEach(cleanup);

  it('copies the current saved writing from every History record type', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    const app = visualAppData();
    const reply = app.history.find((record) => record.type === 'reply');
    const rewrite = app.history.find((record) => record.type === 'rewrite');
    const idea = app.history.find((record) => record.type === 'idea');

    if (!reply || reply.type !== 'reply' || !rewrite || !idea) {
      throw new Error('Expected Reply, Rewrite, and Idea fixtures.');
    }

    render(<HistoryView />);

    const copyReply = await screen.findByRole('button', { name: 'Copy saved reply' });
    await user.click(copyReply);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied saved reply' })).toBeVisible(),
    );
    expect(writeText).toHaveBeenLastCalledWith(
      reply.directions.find((direction) => direction.id === reply.selectedDirection)?.currentText,
    );

    await user.click(screen.getByRole('button', { name: rewrite.original }));
    await user.click(await screen.findByRole('button', { name: 'Copy saved refinement' }));
    expect(writeText).toHaveBeenLastCalledWith(rewrite.currentText);

    await user.click(screen.getByRole('button', { name: idea.title }));
    await user.click(await screen.findByRole('button', { name: 'Copy saved post' }));
    expect(writeText).toHaveBeenLastCalledWith(idea.currentText);
    expect(writeText).toHaveBeenCalledTimes(3);
  });
});
