import { beforeEach, describe, expect, it, vi } from 'vitest';
import { providerOrchestrator } from '../../src/application/provider-orchestrator';
import { analyzeReply } from '../../src/application/workflows';
import {
  captureLayoutCalibration,
  getEphemeralLayoutBinding,
  getEphemeralLayoutBindings,
  validateLayoutCalibrationProposal,
} from '../../src/content/layout-calibration';
import { extractLinkedInPost } from '../../src/content/linkedin-extractor';
import type { CalibratedLayoutRecipe } from '../../src/domain/calibration';
import { createId } from '../../src/shared/id';
import { visualAppData } from '../fixtures/app-data';

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

    const context = extractLinkedInPost(
      target,
      'https://www.linkedin.com/feed/update/urn:li:activity:123/',
    );

    expect(context.author).toBe('Maya Chen');
    expect(context.surface).toBe('post-detail');
    expect(context.postText).toContain('architecture patterns');
    expect(context.responseTarget).toMatchObject({ type: 'reply', author: 'Rafi Ahmed' });
    expect(context.discussion.map((item) => item.author)).toEqual(['Leena Das', 'Rafi Ahmed']);
    expect(context.discussion).toHaveLength(2);
    expect(context.postPermalink).toContain('urn:li:activity:123');
  });

  it('targets a top-level comment inside the current notifications activity card', () => {
    document.body.innerHTML = notificationActivityCardFixture();
    const target = document.querySelector('[data-target="notification-comment"]');
    if (!target) throw new Error('Notification comment target missing');

    const context = extractLinkedInPost(
      target,
      'https://www.linkedin.com/notifications/?filter=all',
    );

    expect(context.surface).toBe('notifications');
    expect(context.author).toBe('Mohammad Montasim Al Mamun Shuvo');
    expect(context.responseTarget).toEqual({
      type: 'comment',
      author: 'Abdur Rahim Sheikh',
      text: 'You missed pgvector. They literally let you query vector like we do in db.',
    });
    expect(context.discussion).toHaveLength(1);
    expect(JSON.stringify(context)).not.toContain('Unrelated top-level comment');
  });

  it('collapses LinkedIn repeated wrappers for the same modern comment identity', () => {
    document.body.innerHTML = repeatedModernCommentWrapperFixture();
    const target = document.querySelector('[data-target="modern-repeated-comment"]');
    if (!target) throw new Error('Modern repeated-wrapper comment target missing');

    const context = extractLinkedInPost(
      target,
      'https://www.linkedin.com/feed/update/urn:li:activity:7488065789913133056/',
    );

    expect(context.responseTarget).toEqual({
      type: 'comment',
      author: 'Abdur Rahim Sheikh',
      text: 'You missed pgvector. They literally let you query vector like we do in db.',
    });
    expect(context.discussion).toHaveLength(1);
    expect(context.discussion[0]).toMatchObject({
      author: 'Abdur Rahim Sheikh',
      depth: 0,
      isTarget: true,
    });
  });

  it('keeps the exact modern comment target through four-direction reply generation', async () => {
    document.body.innerHTML = repeatedModernCommentWrapperFixture();
    const target = document.querySelector('[data-target="modern-repeated-comment"]');
    if (!target) throw new Error('Modern repeated-wrapper comment target missing');
    const context = extractLinkedInPost(
      target,
      'https://www.linkedin.com/feed/update/urn:li:activity:7488065789913133056/',
    );
    const app = visualAppData();
    const run = vi.spyOn(providerOrchestrator, 'run').mockResolvedValue({
      value: commentReplyOutput(),
      provider: 'gemini',
      usedFallback: false,
    });

    try {
      const completed = await analyzeReply(context, app.profile, app.learnedPreferences);
      const request = run.mock.calls[0]?.[0];

      expect(request?.untrustedEnvelope).toMatchObject({
        workflow: 'reply',
        source: {
          responseTarget: {
            type: 'comment',
            author: 'Abdur Rahim Sheikh',
            text: 'You missed pgvector. They literally let you query vector like we do in db.',
          },
        },
      });
      expect(completed.record.source).toMatchObject({
        targetType: 'comment',
        targetAuthor: 'Abdur Rahim Sheikh',
        targetExcerpt: 'You missed pgvector. They literally let you query vector like we do in db.',
      });
      expect(completed.record.directions).toHaveLength(4);
      expect(completed.record.directions.map((direction) => direction.id)).toEqual([
        'insight',
        'question',
        'extend',
        'challenge',
      ]);
      expect(run).toHaveBeenCalledTimes(1);
      expect(request?.systemInstruction).toContain('silently perform a semantic audit');
    } finally {
      run.mockRestore();
    }
  });

  it('uses one provider operation to self-review every direction against the selected comment', async () => {
    document.body.innerHTML = repeatedModernCommentWrapperFixture();
    const target = document.querySelector('[data-target="modern-repeated-comment"]');
    if (!target) throw new Error('Modern repeated-wrapper comment target missing');
    const context = extractLinkedInPost(
      target,
      'https://www.linkedin.com/feed/update/urn:li:activity:7488065789913133056/',
    );
    const app = visualAppData();
    const run = vi.spyOn(providerOrchestrator, 'run').mockResolvedValue({
      value: commentReplyOutput(),
      provider: 'gemini',
      usedFallback: false,
    });

    try {
      const completed = await analyzeReply(context, app.profile, app.learnedPreferences);
      const request = run.mock.calls[0]?.[0];

      expect(run).toHaveBeenCalledTimes(1);
      expect(request?.systemInstruction).toContain('silently perform a semantic audit');
      expect(request?.schema.safeParse(commentReplyOutput()).success).toBe(true);
      expect(completed.record.directions[0]?.currentText).toContain('pgvector');
      expect(completed.record.directions[1]?.currentText).toContain('pgvector');
      expect(completed.record.source.targetType).toBe('comment');
    } finally {
      run.mockRestore();
    }
  });

  it('preserves a genuinely nested reply inside repeated modern wrappers', () => {
    document.body.innerHTML = repeatedModernCommentWrapperFixture(true);
    const target = document.querySelector('[data-target="modern-repeated-reply"]');
    if (!target) throw new Error('Modern repeated-wrapper reply target missing');

    const context = extractLinkedInPost(
      target,
      'https://www.linkedin.com/feed/update/urn:li:activity:7488065789913133056/',
    );

    expect(context.responseTarget).toEqual({
      type: 'reply',
      author: 'Noor Khan',
      text: 'It is especially useful when vector search belongs beside relational filters.',
    });
    expect(context.discussion.map((item) => [item.author, item.depth])).toEqual([
      ['Abdur Rahim Sheikh', 0],
      ['Noor Khan', 1],
    ]);
  });

  it('recovers a notification post from bounded structural signals when its wrapper is unknown', () => {
    document.body.innerHTML = notificationActivityCardFixture().replace(
      'data-testid="main-feed-activity-card"',
      'data-layout="new-notification-shell"',
    );
    const target = document.querySelector('[data-target="notification-comment"]');
    if (!target) throw new Error('Notification comment target missing');

    const context = extractLinkedInPost(target, 'https://www.linkedin.com/notifications/');

    expect(context.responseTarget).toMatchObject({
      type: 'comment',
      author: 'Abdur Rahim Sheikh',
    });
    expect(context.discussion).toHaveLength(1);
  });

  it('infers the exact top-level comment from visible structure without a known wrapper selector', () => {
    document.body.innerHTML = selectorlessDiscussionFixture();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const left = this.closest('[data-layout="reply"]') ? 48 : 20;
      return { ...visibleRect, x: left, left, right: left + visibleRect.width };
    });
    const target = document.querySelector('[data-target="selectorless-comment"]');
    if (!target) throw new Error('Selectorless comment target missing');

    const context = extractLinkedInPost(target, 'https://www.linkedin.com/notifications/');

    expect(context.responseTarget).toEqual({
      type: 'comment',
      author: 'Leena Das',
      text: 'The selected structural comment.',
    });
    expect(context.discussion.map((item) => item.author)).toEqual(['Leena Das', 'Rafi Ahmed']);
    expect(JSON.stringify(context)).not.toContain('Unrelated Person');
  });

  it('infers a selectorless nested reply and retains only its visible parent thread', () => {
    document.body.innerHTML = selectorlessDiscussionFixture();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const left = this.closest('[data-layout="reply"]') ? 48 : 20;
      return { ...visibleRect, x: left, left, right: left + visibleRect.width };
    });
    const target = document.querySelector('[data-target="selectorless-reply"]');
    if (!target) throw new Error('Selectorless reply target missing');

    const context = extractLinkedInPost(
      target,
      'https://www.linkedin.com/feed/update/urn:li:activity:structural/',
    );

    expect(context.responseTarget).toEqual({
      type: 'reply',
      author: 'Rafi Ahmed',
      text: 'The nested structural reply.',
    });
    expect(context.discussion.map((item) => [item.author, item.depth])).toEqual([
      ['Leena Das', 0],
      ['Rafi Ahmed', 1],
    ]);
    expect(JSON.stringify(context)).not.toContain('Unrelated Person');
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

  it('uses the exact temporary boundary and text nodes after calibrating one visible post', () => {
    document.body.innerHTML = `
      <article role="listitem">
        <a href="https://www.linkedin.com/in/maya-chen/">
          <img alt="View Maya Chen’s profile" />
          <span aria-hidden="true">Maya Chen</span>
        </a>
        <div>
          <span data-target="temporary-post">
            The exact calibrated text must survive LinkedIn's generic nested wrappers.
          </span>
        </div>
        <button aria-label="Comment"><span>Comment</span></button>
      </article>`;
    const target = document.querySelector('[data-target="temporary-post"]');
    if (!target) throw new Error('Temporary calibration target missing');
    const requestId = createId();
    const capture = captureLayoutCalibration(target, requestId, 'post');
    const candidate = validateLayoutCalibrationProposal(
      requestId,
      capture.localCandidate.proposal,
      'post',
    );
    const binding = getEphemeralLayoutBinding(target);

    expect(binding).not.toBeNull();
    expect(() =>
      extractLinkedInPost(target, 'https://www.linkedin.com/feed/', [candidate.recipe]),
    ).toThrow(/competing text regions/i);

    const context = extractLinkedInPost(
      target,
      'https://www.linkedin.com/feed/',
      [candidate.recipe],
      binding ? [binding] : [],
    );

    expect(context.author).toBe('Maya Chen');
    expect(context.postText).toBe(
      "The exact calibrated text must survive LinkedIn's generic nested wrappers.",
    );
  });

  it('composes exact post and comment calibration for the Reply workflow', () => {
    document.body.innerHTML = `
      <article role="listitem">
        <a href="https://www.linkedin.com/in/maya-chen/">
          <img alt="View Maya Chen’s profile" />
          <span aria-hidden="true">Maya Chen</span>
        </a>
        <div>
          <span data-target="composed-post">
            A sufficiently detailed original post anchors the calibrated reply context safely.
          </span>
        </div>
        <button aria-label="Comment"><span>Comment</span></button>
        <div data-layout="unknown-comment">
          <a href="https://www.linkedin.com/in/leena-das/">
            <img alt="View Leena Das’s profile" />
            <span aria-hidden="true">Leena Das</span>
          </a>
          <span data-target="composed-comment">
            This exact calibrated comment should become the response target.
          </span>
          <button aria-label="Reply"><span>Reply</span></button>
        </div>
      </article>`;
    const postTarget = document.querySelector('[data-target="composed-post"]');
    const commentTarget = document.querySelector('[data-target="composed-comment"]');
    if (!postTarget || !commentTarget) throw new Error('Composed calibration fixture missing');

    const postRequestId = createId();
    const postCapture = captureLayoutCalibration(postTarget, postRequestId, 'post');
    const postCandidate = validateLayoutCalibrationProposal(
      postRequestId,
      postCapture.localCandidate.proposal,
      'post',
    );
    const commentRequestId = createId();
    const commentCapture = captureLayoutCalibration(commentTarget, commentRequestId, 'comment');
    const commentCandidate = validateLayoutCalibrationProposal(
      commentRequestId,
      commentCapture.localCandidate.proposal,
      'comment',
    );
    const bindings = getEphemeralLayoutBindings(commentTarget);

    const context = extractLinkedInPost(
      commentTarget,
      'https://www.linkedin.com/feed/',
      [postCandidate.recipe, commentCandidate.recipe],
      bindings,
    );

    expect(bindings.map((binding) => binding.recipe.kind).sort()).toEqual(['comment', 'post']);
    expect(context.author).toBe('Maya Chen');
    expect(context.postText).toContain('anchors the calibrated reply context');
    expect(context.responseTarget).toEqual({
      type: 'comment',
      author: 'Leena Das',
      text: 'This exact calibrated comment should become the response target.',
    });
    expect(context.discussion).toHaveLength(1);

    const refinementContext = extractLinkedInPost(
      postTarget,
      'https://www.linkedin.com/feed/',
      [postCandidate.recipe, commentCandidate.recipe],
      getEphemeralLayoutBindings(postTarget),
      'refine',
    );

    expect(refinementContext.responseTarget.type).toBe('post');
    expect(refinementContext.discussion).toEqual([]);
    expect(() =>
      extractLinkedInPost(
        commentTarget,
        'https://www.linkedin.com/feed/',
        [postCandidate.recipe, commentCandidate.recipe],
        bindings,
        'refine',
      ),
    ).toThrow(/comments and replies can only be used in Reply/i);
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

function notificationActivityCardFixture(): string {
  return `
    <section data-testid="main-feed-activity-card">
      <div data-activity-urn="urn:li:activity:999">
        <div data-testid="main-feed-activity-card__entity-lockup">
          <a href="https://www.linkedin.com/in/montasim/">
            <img alt="View Mohammad Montasim Al Mamun Shuvo’s profile" />
          </a>
        </div>
        <p>
          <span data-testid="expandable-text-box">
            PostgreSQL কেন এখন ডেভেলপারদের প্রথম পছন্দ?
          </span>
        </p>
        <a href="https://www.linkedin.com/feed/update/urn:li:activity:999/">1d</a>
        <div componentkey="replaceableComment_urn:li:comment:(urn:li:activity:999,1)">
          <a href="https://www.linkedin.com/in/abdur-rahim/">
            <img alt="View Abdur Rahim Sheikh’s profile" />
          </a>
          <p>
            <span data-target="notification-comment" data-testid="expandable-text-box">
              You missed pgvector. They literally let you query vector like we do in db.
            </span>
          </p>
          <button aria-label="Reply">Reply</button>
        </div>
        <div componentkey="replaceableComment_urn:li:comment:(urn:li:activity:999,2)">
          <a href="https://www.linkedin.com/in/unrelated/">
            <img alt="View Unrelated Person’s profile" />
          </a>
          <p><span data-testid="expandable-text-box">Unrelated top-level comment</span></p>
          <button aria-label="Reply">Reply</button>
        </div>
      </div>
    </section>`;
}

function repeatedModernCommentWrapperFixture(includeReply = false): string {
  const commentKey =
    'replaceableComment_urn:li:comment:(urn:li:activity:7488065789913133056,7488282867484262400)';
  const replyKey =
    'replaceableComment_urn:li:comment:(urn:li:activity:7488065789913133056,7488283000000000000)';
  return `
    <div id="expanded-modern-FeedType_FEED_DETAIL">
      <div role="listitem" componentkey="expanded-modern-FeedType_FEED_DETAIL">
        <h2><span>Feed post</span></h2>
        <a href="https://www.linkedin.com/in/montasim/">
          <img alt="View Mohammad Montasim Al Mamun Shuvo’s profile" />
        </a>
        <p>
          <span data-testid="expandable-text-box">
            PostgreSQL কেন এখন ডেভেলপারদের প্রথম পছন্দ?
          </span>
        </p>
        <a href="https://www.linkedin.com/feed/update/urn:li:activity:7488065789913133056/">
          Open post
        </a>
        <div componentkey="${commentKey}">
          <div id="${commentKey}" componentkey="${commentKey}">
            <div componentkey="${commentKey}">
              <a href="https://www.linkedin.com/in/abdur-rahim-sheikh/">
                <img alt="View Abdur Rahim Sheikh’s profile, open to work" />
                <span aria-hidden="true">Abdur Rahim Sheikh • 1st</span>
              </a>
              <p>
                <span
                  data-target="modern-repeated-comment"
                  data-testid="expandable-text-box"
                >
                  You missed pgvector. They literally let you query vector like we do in db.
                </span>
              </p>
              <button aria-label="Reply">Reply</button>
              ${
                includeReply
                  ? `
                    <div componentkey="${replyKey}">
                      <div id="${replyKey}" componentkey="${replyKey}">
                        <div componentkey="${replyKey}">
                          <a href="https://www.linkedin.com/in/noor-khan/">
                            <img alt="View Noor Khan’s profile" />
                            <span aria-hidden="true">Noor Khan • 1st</span>
                          </a>
                          <p>
                            <span
                              data-target="modern-repeated-reply"
                              data-testid="expandable-text-box"
                            >
                              It is especially useful when vector search belongs beside relational filters.
                            </span>
                          </p>
                          <button aria-label="Reply">Reply</button>
                        </div>
                      </div>
                    </div>`
                  : ''
              }
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function commentReplyOutput() {
  return {
    title: 'Pgvector belongs in the comparison',
    summary: {
      english: 'The post compares PostgreSQL capabilities.',
      bangla: 'পোস্টটি PostgreSQL-এর সক্ষমতা তুলনা করে।',
    },
    reviewNote: '',
    directions: [
      {
        id: 'insight' as const,
        generatedText:
          'That is a useful addition—the vector query support makes pgvector directly relevant to this comparison.',
        currentText:
          'That is a useful addition—the vector query support makes pgvector directly relevant to this comparison.',
        approach: 'Acknowledge the concrete omission.',
      },
      {
        id: 'question' as const,
        generatedText:
          'Have you found pgvector’s database-native query model useful beyond this PostgreSQL comparison?',
        currentText:
          'Have you found pgvector’s database-native query model useful beyond this PostgreSQL comparison?',
        approach: 'Ask about the stated query model.',
      },
      {
        id: 'extend' as const,
        generatedText:
          'Including pgvector would extend the ecosystem point with the exact database-native vector querying you mentioned.',
        currentText:
          'Including pgvector would extend the ecosystem point with the exact database-native vector querying you mentioned.',
        approach: 'Connect the comment to the post.',
      },
      {
        id: 'challenge' as const,
        generatedText:
          'Pgvector strengthens the list, though the comment’s database-native query point may deserve its own qualification.',
        currentText:
          'Pgvector strengthens the list, though the comment’s database-native query point may deserve its own qualification.',
        approach: 'Qualify the claim respectfully.',
      },
    ],
  };
}

function selectorlessDiscussionFixture(): string {
  return `
    <article class="main-feed-activity-card" data-id="structural-post">
      <a href="https://www.linkedin.com/in/maya-chen/">
        <img alt="View Maya Chen’s profile" />
      </a>
      <p><span data-testid="expandable-text-box">A post with a changed comment layout.</span></p>
      <a href="https://www.linkedin.com/feed/update/urn:li:activity:structural/">1d</a>
      <div data-layout="comment">
        <a href="https://www.linkedin.com/in/leena-das/">
          <img alt="View Leena Das’s profile" />
        </a>
        <p>
          <span data-target="selectorless-comment" data-testid="expandable-text-box">
            The selected structural comment.
          </span>
        </p>
        <button aria-label="Reply">Reply</button>
      </div>
      <div data-layout="reply">
        <a href="https://www.linkedin.com/in/rafi-ahmed/">
          <img alt="View Rafi Ahmed’s profile" />
        </a>
        <p>
          <span data-target="selectorless-reply" data-testid="expandable-text-box">
            The nested structural reply.
          </span>
        </p>
        <button aria-label="Reply">Reply</button>
      </div>
      <div data-layout="unrelated">
        <a href="https://www.linkedin.com/in/unrelated/">
          <img alt="View Unrelated Person’s profile" />
        </a>
        <p><span data-testid="expandable-text-box">Unrelated structural comment.</span></p>
        <button aria-label="Reply">Reply</button>
      </div>
    </article>`;
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
