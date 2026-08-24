import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModelProvenance } from '../../src/ui/components/common';

describe('ModelProvenance', () => {
  it('shows a friendly model name and its provider', () => {
    const view = render(
      <ModelProvenance provider="openrouter" model="google/gemma-4-31b-it:free" />,
    );

    expect(view.container).toHaveTextContent('Made with Gemma 4 31B via OpenRouter');
  });

  it('falls back to the provider for older records without model metadata', () => {
    const view = render(<ModelProvenance provider="gemini" model={undefined} />);

    expect(view.container).toHaveTextContent('Made with Gemini');
  });
});
