import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCalibrationCapture } from '../../src/content/layout-calibration';
import { extractLinkedInPostSelfHealing } from '../../src/content/self-healing-extractor';

const visibleRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 420,
  bottom: 120,
  width: 420,
  height: 120,
  toJSON: () => ({}),
};

describe('self-healing LinkedIn extraction', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => visibleRect);
  });

  afterEach(() => {
    clearCalibrationCapture();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('locally repairs an unsupported post and returns its context immediately', () => {
    document.body.innerHTML = novelPostsFixture();
    const target = document.querySelector('[data-target="novel-first"]');
    if (!target) throw new Error('Novel post target missing');

    const result = extractLinkedInPostSelfHealing(
      target,
      'https://www.linkedin.com/feed/',
      [],
      'refine',
    );

    expect(result.context.author).toBe('Maya Chen');
    expect(result.context.postText).toBe('A newly changed LinkedIn wrapper still works locally.');
    expect(result.context.responseTarget.type).toBe('post');
    expect(result.learnedRecipes).toHaveLength(1);
    expect(result.learnedRecipes[0]).toMatchObject({
      kind: 'post',
      surface: 'feed',
      validationCount: 2,
    });
  });

  it('keeps a one-off repair ephemeral instead of proposing it for storage', () => {
    document.body.innerHTML = novelPostsFixture();
    document.querySelector('[data-example="second"]')?.remove();
    const target = document.querySelector('[data-target="novel-first"]');
    if (!target) throw new Error('Novel post target missing');

    const result = extractLinkedInPostSelfHealing(
      target,
      'https://www.linkedin.com/feed/',
      [],
      'refine',
    );

    expect(result.context.postText).toContain('newly changed LinkedIn wrapper');
    expect(result.learnedRecipes).toEqual([]);
  });

  it('does not bypass validation when the target has no safe post structure', () => {
    document.body.innerHTML = '<div data-target="unsafe">Unrelated page content</div>';
    const target = document.querySelector('[data-target="unsafe"]');
    if (!target) throw new Error('Unsafe target missing');

    expect(() =>
      extractLinkedInPostSelfHealing(target, 'https://www.linkedin.com/feed/', [], 'refine'),
    ).toThrow(/visible LinkedIn post|discussion/i);
  });
});

function novelPostsFixture(): string {
  return `
    <article data-example="first">
      <a href="https://www.linkedin.com/in/maya-chen/">
        <img alt="View Maya Chen’s profile">
      </a>
      <div data-testid="expandable-text-box" data-target="novel-first">
        A newly changed LinkedIn wrapper still works locally.
      </div>
      <button aria-label="Comment">Comment</button>
    </article>
    <article data-example="second">
      <a href="https://www.linkedin.com/in/rafi-ahmed/">
        <img alt="View Rafi Ahmed’s profile">
      </a>
      <div data-testid="expandable-text-box">
        A second visible example validates the reusable structure.
      </div>
      <button aria-label="Comment">Comment</button>
    </article>`;
}
