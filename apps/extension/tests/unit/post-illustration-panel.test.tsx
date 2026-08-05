import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAppData } from '../../src/domain/schemas';
import type { GeneratedImage } from '../../src/application/ports/image-generation-provider';
import { PostIllustrationPanel } from '../../src/ui/features/generate/generate-view';

const generatePostIllustration =
  vi.fn<
    (postText: string, signal?: AbortSignal, promptOverride?: string) => Promise<GeneratedImage>
  >();
const requestImageProviderPermission = vi.fn<() => Promise<boolean>>();

vi.mock('../../src/application/post-illustration', () => ({
  buildPostIllustrationPrompt: (postText: string) => `Suggested visual prompt for: ${postText}`,
  generatePostIllustration: (postText: string, signal?: AbortSignal, promptOverride?: string) =>
    generatePostIllustration(postText, signal, promptOverride),
}));

vi.mock('../../src/infrastructure/permissions', () => ({
  hasLinkedInPermission: vi.fn(),
  hasProviderPermissions: vi.fn(),
  requestImageProviderPermission: () => requestImageProviderPermission(),
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

describe('post illustration panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestImageProviderPermission.mockResolvedValue(true);
    generatePostIllustration.mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,generated-image',
      mimeType: 'image/jpeg',
      width: 1_200,
      height: 627,
      provider: 'cloudflare',
      model: '@cf/black-forest-labs/flux-2-klein-4b',
    });
  });

  it('generates inline, previews, and downloads the illustration', async () => {
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(
      <PostIllustrationPanel
        postText="AI agents turn a clear goal into reviewed, shippable work."
        profile={defaultAppData.profile}
        onOpenSettings={() => Promise.resolve()}
      />,
    );

    fireEvent.click(screen.getByText('Fine-tune visual direction'));
    const prompt = screen.getByRole('textbox', { name: 'Image generation prompt' });
    expect(prompt).toHaveValue(
      'Suggested visual prompt for: AI agents turn a clear goal into reviewed, shippable work.',
    );
    fireEvent.change(prompt, {
      target: { value: 'Show an expert guiding an autonomous system through a precise review.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Generate image' }));
    const illustration = await screen.findByRole('img', {
      name: 'AI-generated editorial illustration for the refined post',
    });
    expect(illustration).toHaveAttribute('src', 'data:image/jpeg;base64,generated-image');
    expect(generatePostIllustration).toHaveBeenCalledWith(
      'AI agents turn a clear goal into reviewed, shippable work.',
      expect.any(AbortSignal),
      'Show an expert guiding an autonomous system through a precise review.',
    );

    fireEvent.click(screen.getByText('Prompt used for this image'));
    expect(
      screen.getByText('Show an expert guiding an autonomous system through a precise review.', {
        selector: 'pre',
      }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Preview generated image' }));
    expect(await screen.findByRole('dialog', { name: 'Post illustration' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /^Download$/u }));
    await waitFor(() => expect(anchorClick).toHaveBeenCalledOnce());
  });
});
