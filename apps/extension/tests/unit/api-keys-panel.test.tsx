import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '../../src/domain/schemas';
import { ApiKeysPanel } from '../../src/ui/features/settings/api-keys-panel';
import { visualAppData } from '../fixtures/app-data';
import { installChromeMock } from '../helpers/chrome';

const memory = installChromeMock();

describe('AI route confirmation', () => {
  beforeEach(() => memory.reset());
  afterEach(cleanup);

  it('uses one zero-cost confirmation for the complete provider route', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn((next: AppData) => {
      void next;
      return Promise.resolve();
    });
    const app = visualAppData();
    app.settings.aiRouting.zeroCostConfirmed = false;
    render(<ApiKeysPanel app={app} onSave={onSave} defaultOpen />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    const confirmation = screen.getByRole('checkbox', { name: /route must use only/i });
    await user.click(confirmation);

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]?.[0].settings.aiRouting.zeroCostConfirmed).toBe(true);
  });
});
