import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorActions } from '../../src/ui/components/common';

describe('editor action feedback', () => {
  afterEach(cleanup);

  it('marks rating, regeneration, and successful copy interactions for animation', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    const onRegenerate = vi.fn();
    const onCopy = vi.fn(() => Promise.resolve());

    render(
      <EditorActions rating={null} onRate={onRate} onRegenerate={onRegenerate} onCopy={onCopy} />,
    );

    const like = screen.getByRole('button', { name: 'Like this writing' });
    await user.click(like);
    expect(onRate).toHaveBeenCalledWith('liked');
    expect(like).toHaveAttribute('data-animating', 'true');

    const regenerate = screen.getByRole('button', { name: 'Regenerate' });
    await user.click(regenerate);
    expect(onRegenerate).toHaveBeenCalledOnce();
    expect(regenerate).toHaveAttribute('data-regenerating', 'true');

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible());
    expect(onCopy).toHaveBeenCalledOnce();
    expect(screen.getByText('Copied to clipboard')).toBeInTheDocument();
  });
});
