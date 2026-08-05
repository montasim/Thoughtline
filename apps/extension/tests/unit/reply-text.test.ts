import { describe, expect, it } from 'vitest';
import { detectReplyLanguage, stripReplyDirectionPrefix } from '../../src/shared/reply-text';

describe('reply text normalization', () => {
  it.each([
    ['Insight: A practical reply.', 'A practical reply.'],
    ['Question: Which constraint changed?', 'Which constraint changed?'],
    ['**Extend:** Build on the original idea.', 'Build on the original idea.'],
    ['Challenge — A respectful disagreement.', 'A respectful disagreement.'],
  ])('removes a generated direction label from %s', (draft, expected) => {
    expect(stripReplyDirectionPrefix(draft)).toBe(expected);
  });

  it('does not remove ordinary opening words', () => {
    expect(stripReplyDirectionPrefix('Insight into the tradeoff comes from the constraints.')).toBe(
      'Insight into the tradeoff comes from the constraints.',
    );
  });

  it('recognizes Bangla source text that contains English technical names', () => {
    expect(
      detectReplyLanguage(
        'Framer Motion এবং Tailwind CSS ব্যবহার করে ফ্রন্টএন্ড ডেভেলপাররা দ্রুত কাজ করতে পারেন।',
      ),
    ).toBe('bangla');
  });

  it('recognizes English source text', () => {
    expect(detectReplyLanguage('This post explains a reusable motion component toolkit.')).toBe(
      'english',
    );
  });
});
