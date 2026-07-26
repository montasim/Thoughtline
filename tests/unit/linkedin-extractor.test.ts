import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractLinkedInPost } from '../../src/content/linkedin-extractor';
import type { CalibratedLayoutRecipe } from '../../src/domain/calibration';
import { createId } from '../../src/shared/id';

const visibleRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 320,
  bottom: 40,
  width: 320,
  height: 40,
  toJSON: () => ({}),
};

describe('passive LinkedIn post extraction', () => {
  beforeEach(() => {
    document.body.innerHTML = fixture();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => visibleRect);
  });

  it('extracts the exact visible thread when the user right-clicks a nested reply', () => {
    const target = document.querySelector('[data-target="reply"]');
    if (!target) throw new Error('Fixture target missing');

    const context = extractLinkedInPost(target, 'https://www.linkedin.com/feed/');

    expect(context.author).toBe('Maya Chen');
    expect(context.postText).toContain('architecture patterns');
    expect(context.responseTarget).toMatchObject({ type: 'reply', author: 'Rafi Ahmed' });
    expect(context.discussion.map((item) => item.author)).toEqual(['Leena Das', 'Rafi Ahmed']);
    expect(context.discussion).toHaveLength(2);
    expect(context.postPermalink).toContain('urn:li:activity:123');
  });

  it('extracts all rendered visible threads for a post target and excludes hidden discussion', () => {
    const target = document.querySelector('.update-components-text');
    if (!target) throw new Error('Fixture target missing');

    const context = extractLinkedInPost(target, 'https://www.linkedin.com/feed/');

    expect(context.responseTarget.type).toBe('post');
    expect(context.discussion.map((item) => item.author)).toEqual([
      'Leena Das',
      'Rafi Ahmed',
      'Noor Khan',
    ]);
    expect(JSON.stringify(context)).not.toContain('Hidden Person');
  });

  it('fails closed outside a rendered LinkedIn post', () => {
    const detached = document.createElement('span');
    expect(() => extractLinkedInPost(detached, 'https://www.linkedin.com/feed/')).toThrow(
      /Right-click inside/,
    );
  });

  it('extracts a company author from the current activity-card entity lockup', () => {
    document.body.innerHTML = `
      <article class="main-feed-activity-card" data-id="main-feed-card">
        <div data-activity-urn="urn:li:activity:456" data-test-id="main-feed-activity-card__entity-lockup">
          <a href="https://www.linkedin.com/company/acme/">
            <img alt="View organization page for Acme Labs" />
          </a>
          <a href="https://www.linkedin.com/company/acme/" data-tracking-control-name="main-feed-card_feed-actor-name">Acme Labs</a>
        </div>
        <div data-test-id="main-feed-activity-card__commentary">A visible update from our research team.</div>
      </article>`;
    const target = document.querySelector('[data-test-id="main-feed-activity-card__commentary"]');
    if (!target) throw new Error('Fixture target missing');

    const context = extractLinkedInPost(target, 'https://www.linkedin.com/feed/');

    expect(context.author).toBe('Acme Labs');
    expect(context.responseTarget).toMatchObject({ type: 'post', author: 'Acme Labs' });
    expect(context.postPermalink).toBe('https://www.linkedin.com/feed/update/urn:li:activity:456/');
  });

  it('recovers an encoded activity URN from a modern nested tracking attribute', () => {
    document.body.innerHTML = `
      <div data-finite-scroll-hotkey-item>
        <article
          data-view-tracking-scope="%7B%22entityUrn%22%3A%22urn%3Ali%3Afsd_update%3A%28urn%3Ali%3Aactivity%3A987654321%2CUNKNOWN%29%22%7D"
        >
          <span class="update-components-actor__name">Samira Noor</span>
          <div class="update-components-text">A modern LinkedIn card with encoded tracking data.</div>
        </article>
      </div>`;
    const target = document.querySelector('.update-components-text');
    if (!target) throw new Error('Fixture target missing');

    const context = extractLinkedInPost(target, 'https://www.linkedin.com/feed/');

    expect(context.postPermalink).toBe(
      'https://www.linkedin.com/feed/update/urn:li:activity:987654321/',
    );
  });

  it('extracts a person author when the profile link owns the visible name directly', () => {
    document.body.innerHTML = `
      <article class="feed-shared-update-v2" data-urn="urn:li:activity:789">
        <div class="update-components-actor">
          <a class="update-components-actor__meta-link" href="https://www.linkedin.com/in/samira/">Samira Noor</a>
        </div>
        <div class="update-components-text">A post using LinkedIn's compact actor markup.</div>
      </article>`;
    const target = document.querySelector('.update-components-text');
    if (!target) throw new Error('Fixture target missing');

    expect(extractLinkedInPost(target, 'https://www.linkedin.com/feed/').author).toBe(
      'Samira Noor',
    );
  });

  it('uses a neutral author label when LinkedIn does not expose author markup', () => {
    document.body.innerHTML = `
      <article data-id="main-feed-card" data-activity-urn="urn:li:activity:999">
        <div data-test-id="main-feed-activity-card__commentary">The post remains safe to analyze without an exposed author name.</div>
      </article>`;
    const target = document.querySelector('[data-test-id="main-feed-activity-card__commentary"]');
    if (!target) throw new Error('Fixture target missing');

    const context = extractLinkedInPost(target, 'https://www.linkedin.com/feed/');

    expect(context.author).toBe('Post author');
    expect(context.responseTarget).toMatchObject({ type: 'post', author: 'Post author' });
  });

  it('extracts the current semantic feed layout without relying on obfuscated classes', () => {
    document.body.innerHTML = currentSemanticFeedFixture();
    const target = document.querySelector('[data-target="current-comment"]');
    if (!target) throw new Error('Current LinkedIn fixture target missing');

    const context = extractLinkedInPost(target, 'https://www.linkedin.com/feed/');

    expect(context.author).toBe('Md. Hafizur Rahman Arfin');
    expect(context.postText).toContain(
      'Conference \u098f \u0997\u09c7\u09b2\u09be\u09ae speaker \u09b9\u09bf\u09b8\u09c7\u09ac\u09c7',
    );
    expect(context.responseTarget).toMatchObject({
      type: 'comment',
      author: 'Taminul Islam',
    });
    expect(context.responseTarget.text).toContain('growth begins');
    expect(context.discussion).toHaveLength(1);
  });

  it('uses a validated structural recipe when LinkedIn introduces an unknown post wrapper', () => {
    document.body.innerHTML = `
      <section data-testid="novel-post-shell">
        <a href="https://www.linkedin.com/in/maya-chen/">
          <img alt="View Maya Chen’s profile" />
        </a>
        <div data-testid="novel-post-copy">A calibrated recipe recovers this changed layout.</div>
      </section>`;
    const target = document.querySelector('[data-testid="novel-post-copy"]');
    if (!target) throw new Error('Calibrated fixture target missing');

    const context = extractLinkedInPost(target, 'https://www.linkedin.com/feed/', [postRecipe()]);

    expect(context.author).toBe('Maya Chen');
    expect(context.postText).toBe('A calibrated recipe recovers this changed layout.');
  });

  it('ignores broad calibrated comment wrappers and extracts the nearest owned discussion item', () => {
    document.body.innerHTML = `
      <article class="feed-shared-update-v2" data-urn="urn:li:activity:987">
        <span class="update-components-actor__name">Maya Chen</span>
        <div class="update-components-text" data-target="post">
          A post remains analyzable when a calibrated comment pattern also matches its wrapper.
        </div>
        <div>
          <a href="https://www.linkedin.com/in/leena-das/">
            <img alt="View Leena Das’s profile" />
          </a>
          <span data-testid="expandable-text-box">
            The nearest calibrated boundary owns this comment text.
          </span>
          <button aria-label="Reply">Reply</button>
        </div>
      </article>`;
    const target = document.querySelector('[data-target="post"]');
    if (!target) throw new Error('Post target missing');

    const context = extractLinkedInPost(target, 'https://www.linkedin.com/feed/', [
      broadCommentRecipe(),
    ]);

    expect(context.responseTarget.type).toBe('post');
    expect(context.discussion).toHaveLength(1);
    expect(context.discussion[0]).toMatchObject({
      author: 'Leena Das',
      text: 'The nearest calibrated boundary owns this comment text.',
    });
  });
});

function postRecipe(): CalibratedLayoutRecipe {
  const timestamp = '2026-07-23T00:00:00.000Z';
  return {
    schemaVersion: 1,
    id: createId(),
    kind: 'post',
    surface: 'feed',
    status: 'active',
    boundary: {
      tag: 'section',
      attributes: [
        {
          name: 'data-testid',
          operator: 'equals',
          value: 'novel-post-shell',
        },
      ],
      capabilities: ['profile-link'],
    },
    primaryText: {
      tag: 'div',
      attributes: [
        {
          name: 'data-testid',
          operator: 'equals',
          value: 'novel-post-copy',
        },
      ],
      capabilities: [],
    },
    authorStrategy: 'profile-metadata',
    validationCount: 2,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function broadCommentRecipe(): CalibratedLayoutRecipe {
  const timestamp = '2026-07-23T00:00:00.000Z';
  return {
    schemaVersion: 1,
    id: createId(),
    kind: 'comment',
    surface: 'feed',
    status: 'active',
    boundary: {
      tag: 'div',
      attributes: [],
      capabilities: ['profile-link', 'primary-text', 'reply-control'],
    },
    primaryText: {
      tag: 'span',
      attributes: [
        {
          name: 'data-testid',
          operator: 'equals',
          value: 'expandable-text-box',
        },
      ],
      capabilities: ['primary-text'],
    },
    authorStrategy: 'profile-metadata',
    validationCount: 2,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function currentSemanticFeedFixture(): string {
  return `
    <div id="expanded-current-FeedType_MAIN_FEED_RELEVANCE">
      <div role="listitem" componentkey="expanded-current-FeedType_MAIN_FEED_RELEVANCE">
        <h2><span>Feed post</span></h2>
        <a href="https://www.linkedin.com/in/hrarfin/">
          <figure><img alt="View Md. Hafizur Rahman Arfin\u2019s profile" /></figure>
          <div aria-label="Md. Hafizur Rahman Arfin Verified Profile 1st">
            <span aria-hidden="true">Md. Hafizur Rahman Arfin \u2022 1st</span>
          </div>
        </a>
        <p><span tabindex="-1" data-testid="expandable-text-box">Conference \u098f \u0997\u09c7\u09b2\u09be\u09ae speaker \u09b9\u09bf\u09b8\u09c7\u09ac\u09c7।</span></p>
        <div data-testid="current-commentList">
          <div id="replaceableComment_urn:li:comment:(urn:li:activity:1,2)">
            <a href="https://www.linkedin.com/in/md-taminul-islam-bu/">
              <figure><img alt="View Taminul Islam\u2019s profile" /></figure>
              <p>
                <span class="screen-reader-name">Taminul Islam 2nd</span>
                <span aria-hidden="true">Taminul Islam <span>\u2022 2nd</span></span>
              </p>
            </a>
            <p><span data-target="current-comment" tabindex="-1" data-testid="expandable-text-box">Every new challenge comes with uncertainty, but growth begins when we act.</span></p>
            <button aria-label="Reply">Reply</button>
          </div>
        </div>
      </div>
    </div>`;
}

function fixture(): string {
  return `
    <article class="feed-shared-update-v2" data-urn="urn:li:activity:123">
      <span class="update-components-actor__name">Maya Chen</span>
      <div class="update-components-text">Teams adopt architecture patterns before constraints are clear.</div>
      <a href="https://www.linkedin.com/feed/update/urn:li:activity:123/">Open post</a>
      <div class="comments-comment-item" data-id="comment-1" data-depth="0">
        <span class="comments-post-meta__name-text">Leena Das</span>
        <div class="comments-comment-item__main-content">The assumptions should remain visible.</div>
        <div class="comments-comment-item" data-id="reply-1" data-depth="1">
          <span class="comments-post-meta__name-text">Rafi Ahmed</span>
          <div class="comments-comment-item__main-content"><span data-target="reply">Especially the expected lifetime.</span></div>
        </div>
      </div>
      <div class="comments-comment-item" data-id="comment-2" data-depth="0">
        <span class="comments-post-meta__name-text">Noor Khan</span>
        <div class="comments-comment-item__main-content">Reversibility is another constraint.</div>
      </div>
      <div class="comments-comment-item" data-id="comment-hidden" data-depth="0" hidden>
        <span class="comments-post-meta__name-text">Hidden Person</span>
        <div class="comments-comment-item__main-content">This must never leave the page.</div>
      </div>
    </article>`;
}
