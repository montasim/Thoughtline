import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportConfiguration } from '../../src/application/configuration-backup';
import type { AppData } from '../../src/domain/schemas';
import { ConfigurationBackupDialogs } from '../../src/ui/features/settings/archive-dialogs';
import { visualAppData } from '../fixtures/app-data';
import { installChromeMock } from '../helpers/chrome';

const memory = installChromeMock();

describe('configuration dialogs', () => {
  beforeEach(() => memory.reset());
  afterEach(cleanup);

  it('requires an explicit choice before secrets are included', async () => {
    const user = userEvent.setup();
    render(<ConfigurationBackupDialogs app={visualAppData()} onImport={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Export' }));
    const includeSecrets = screen.getByRole('checkbox', { name: /Include secrets/ });

    expect(includeSecrets).not.toBeChecked();
    expect(screen.queryByText(/Secrets are readable/)).not.toBeInTheDocument();
    await user.click(includeSecrets);
    expect(screen.getByText(/Secrets are readable/)).toBeVisible();
  });

  it('applies a validated configuration and confirms that it is active', async () => {
    const user = userEvent.setup();
    const imported = visualAppData();
    imported.profile.role = 'Restored role';
    const blob = await exportConfiguration(imported, false);
    const onImport = vi.fn((next: AppData) => {
      void next;
      return Promise.resolve();
    });
    render(<ConfigurationBackupDialogs app={visualAppData()} onImport={onImport} />);

    await user.click(screen.getByRole('button', { name: 'Import' }));
    await user.upload(
      screen.getByLabelText('Configuration JSON'),
      new File([blob], 'configuration.json', { type: 'application/json' }),
    );
    await user.click(screen.getByRole('button', { name: 'Review configuration' }));
    await user.click(await screen.findByRole('button', { name: 'Use this configuration' }));

    expect(onImport).toHaveBeenCalledOnce();
    expect(onImport.mock.calls[0]?.[0].profile.role).toBe('Restored role');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Thoughtline will now use the imported configuration',
    );
    expect(screen.queryByLabelText('Configuration JSON')).not.toBeInTheDocument();
    expect(screen.queryByText('Ready to import')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeVisible();
  });
});
