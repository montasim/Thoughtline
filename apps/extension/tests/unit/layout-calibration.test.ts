import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureLayoutCalibration,
  clearCalibrationCapture,
  findCalibratedAncestor,
  getEphemeralLayoutBindings,
  getEphemeralLayoutRecipe,
  validateLayoutCalibrationProposal,
} from '../../src/content/layout-calibration';
import type { CalibratedLayoutRecipe } from '../../src/domain/calibration';
import { createId } from '../../src/shared/id';

const visibleRect = {
  x: 12,
  y: 20,
  top: 20,
  left: 12,
  right: 412,
  bottom: 100,
  width: 400,
  height: 80,
  toJSON: () => ({}),
};

describe('guarded LinkedIn layout calibration', () => {
  beforeEach(() => {
    document.body.innerHTML = fixture();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => visibleRect);
  });

  afterEach(() => {
    clearCalibrationCapture();
    vi.restoreAllMocks();
  });

  it('creates a persistent local post recipe only after two visible examples validate', () => {
    const target = requireElement('[data-target="first-post"]');
    const capture = captureLayoutCalibration(target, createId(), 'post');

    expect(capture.localCandidate.preview).toMatchObject({
      kind: 'post',
      author: 'Maya Chen',
      persistent: true,
      validationCount: 2,
    });
    expect(capture.localCandidate.preview.text).toContain('architecture boundaries');
    expect(capture.localCandidate.recipe.boundary.attributes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'class' })]),
    );
    expect(capture.localCandidate.recipe.primaryText.attributes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'class' })]),
    );
  });

  it('sends bounded visible evidence and excludes editable or executable DOM', () => {
    const target = requireElement('[data-target="first-comment"]');
    const capture = captureLayoutCalibration(target, createId(), 'comment');
    const serialized = JSON.stringify(capture.evidence);

    expect(capture.evidence.nodeCount).toBeLessThanOrEqual(180);
    expect(capture.evidence.characterCount).toBeLessThanOrEqual(30_000);
    expect(capture.evidence.nodes.some((node) => node.target)).toBe(true);
    expect(serialized).toContain('A useful comment about reversibility');
    expect(serialized).not.toContain('Private unsent draft');
    expect(serialized).not.toContain('do-not-send-this-script');
  });

  it('keeps inferred text inside evidence even through deep LinkedIn wrapper markup', () => {
    document.body.innerHTML = deeplyNestedFixture();
    const capture = captureLayoutCalibration(
      requireElement('[data-target="deep-control"]'),
      createId(),
      'post',
    );

    expect(capture.localCandidate.preview.text).toContain('deeply nested primary text');
    expect(
      capture.evidence.nodes.some(
        (node) => node.id === capture.localCandidate.proposal.primaryTextNodeId,
      ),
    ).toBe(true);
    expect(Math.max(...capture.evidence.nodes.map((node) => node.depth))).toBeLessThanOrEqual(12);
  });

  it('rejects an AI proposal whose boundary does not contain the right-click target', () => {
    const requestId = createId();
    const capture = captureLayoutCalibration(
      requireElement('[data-target="first-post"]'),
      requestId,
      'post',
    );
    const secondBoundary = capture.evidence.nodes.find(
      (node) => node.attributes['data-calibration-card'] === 'second',
    );
    const secondText = capture.evidence.nodes.find(
      (node) => node.attributes['data-target'] === 'second-post',
    );

    expect(secondBoundary).toBeDefined();
    expect(secondText).toBeDefined();
    expect(() =>
      validateLayoutCalibrationProposal(
        requestId,
        {
          schemaVersion: 1,
          boundaryNodeId: secondBoundary!.id,
          primaryTextNodeId: secondText!.id,
          authorNodeId: null,
          explanation: 'Use the unrelated sibling.',
        },
        'post',
      ),
    ).toThrow(/does not contain the target/i);
  });

  it('keeps a one-example calibration ephemeral instead of marking it saveable', () => {
    document.querySelector('[data-calibration-card="second"]')?.remove();
    const capture = captureLayoutCalibration(
      requireElement('[data-target="first-post"]'),
      createId(),
      'post',
    );

    expect(capture.localCandidate.preview.validationCount).toBe(1);
    expect(capture.localCandidate.preview.persistent).toBe(false);
  });

  it('limits an ephemeral repair to the calibrated item', () => {
    const requestId = createId();
    const firstTarget = requireElement('[data-target="first-post"]');
    const capture = captureLayoutCalibration(firstTarget, requestId, 'post');
    validateLayoutCalibrationProposal(requestId, capture.localCandidate.proposal, 'post');

    expect(getEphemeralLayoutRecipe(firstTarget)).not.toBeNull();
    expect(getEphemeralLayoutRecipe(requireElement('[data-target="second-post"]'))).toBeNull();
  });

  it('keeps validated post and comment mappings together for a comment reply workflow', () => {
    const postTarget = requireElement('[data-target="first-post"]');
    const postRequestId = createId();
    const postCapture = captureLayoutCalibration(postTarget, postRequestId, 'post');
    validateLayoutCalibrationProposal(postRequestId, postCapture.localCandidate.proposal, 'post');

    const commentTarget = requireElement('[data-target="first-comment"]');
    const commentRequestId = createId();
    const commentCapture = captureLayoutCalibration(commentTarget, commentRequestId, 'comment');
    validateLayoutCalibrationProposal(
      commentRequestId,
      commentCapture.localCandidate.proposal,
      'comment',
    );

    const bindings = getEphemeralLayoutBindings(commentTarget);

    expect(bindings.map((binding) => binding.recipe.kind).sort()).toEqual(['comment', 'post']);
    expect(bindings.find((binding) => binding.recipe.kind === 'post')?.primaryText).toBe(
      postTarget,
    );
    expect(bindings.find((binding) => binding.recipe.kind === 'comment')?.primaryText).toBe(
      commentTarget,
    );
    expect(bindings.every((binding) => binding.author !== null)).toBe(true);
  });

  it('rejects an AI author mapping that is not profile metadata owned by the item', () => {
    const requestId = createId();
    const capture = captureLayoutCalibration(
      requireElement('[data-target="first-comment"]'),
      requestId,
      'comment',
    );

    expect(() =>
      validateLayoutCalibrationProposal(
        requestId,
        {
          ...capture.localCandidate.proposal,
          authorNodeId: capture.localCandidate.proposal.primaryTextNodeId,
          explanation: 'Incorrectly map the authored text as the author node.',
        },
        'comment',
      ),
    ).toThrow(/not visible profile metadata/i);
  });

  it('rejects an AI mapping that treats the whole item boundary as authored text', () => {
    const requestId = createId();
    const capture = captureLayoutCalibration(
      requireElement('[data-target="first-post"]'),
      requestId,
      'post',
    );

    expect(() =>
      validateLayoutCalibrationProposal(
        requestId,
        {
          ...capture.localCandidate.proposal,
          primaryTextNodeId: capture.localCandidate.proposal.boundaryNodeId,
          explanation: 'Incorrectly map the whole post card as its authored text.',
        },
        'post',
      ),
    ).toThrow(/specific authored-text node/i);
  });

  it('uses the closest calibrated boundary when broader wrappers match the same capabilities', () => {
    document.body.innerHTML = `
      <div data-wrapper="broad">
        <div data-wrapper="post">
          <a href="https://www.linkedin.com/in/maya-chen/">Maya Chen</a>
          <span data-testid="expandable-text-box" data-target="nested-post">
            A calibrated post inside a broader matching wrapper.
          </span>
          <button aria-label="Comment">Comment</button>
        </div>
      </div>`;
    const recipe: CalibratedLayoutRecipe = {
      schemaVersion: 1,
      id: createId(),
      kind: 'post',
      surface: 'feed',
      status: 'active',
      boundary: {
        tag: 'div',
        attributes: [],
        capabilities: ['profile-link', 'primary-text', 'comment-control'],
      },
      primaryText: {
        tag: 'span',
        attributes: [{ name: 'data-testid', operator: 'equals', value: 'expandable-text-box' }],
        capabilities: ['primary-text'],
      },
      authorStrategy: 'profile-metadata',
      validationCount: 2,
      createdAt: '2026-07-23T00:00:00.000Z',
      updatedAt: '2026-07-23T00:00:00.000Z',
    };

    expect(findCalibratedAncestor(requireElement('[data-target="nested-post"]'), recipe)).toBe(
      requireElement('[data-wrapper="post"]'),
    );
  });
});

function requireElement(selector: string): Element {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Fixture element missing: ${selector}`);
  return element;
}

function fixture(): string {
  return `
    <main>
      <article role="listitem" data-calibration-card="first">
        <h2><span>Feed post</span></h2>
        <a href="https://www.linkedin.com/in/maya-chen/">
          <img alt="View Maya Chen’s profile" />
        </a>
        <p><span data-testid="expandable-text-box" data-target="first-post">Teams need explicit architecture boundaries before scaling.</span></p>
        <button aria-label="Comment">Comment</button>
        <div id="replaceableComment_urn:li:comment:(urn:li:activity:1,101)">
          <a href="https://www.linkedin.com/in/rafi-ahmed/">
            <img alt="View Rafi Ahmed’s profile" />
          </a>
          <p><span data-testid="expandable-text-box" data-target="first-comment">A useful comment about reversibility and constraints.</span></p>
          <button aria-label="Reply">Reply</button>
          <textarea>Private unsent draft</textarea>
          <script>do-not-send-this-script</script>
        </div>
      </article>
      <article role="listitem" data-calibration-card="second">
        <h2><span>Feed post</span></h2>
        <a href="https://www.linkedin.com/in/leena-das/">
          <img alt="View Leena Das’s profile" />
        </a>
        <p><span data-testid="expandable-text-box" data-target="second-post">A second visible post validates the same semantic structure.</span></p>
        <button aria-label="Comment">Comment</button>
        <div id="replaceableComment_urn:li:comment:(urn:li:activity:2,202)">
          <a href="https://www.linkedin.com/in/noor-khan/">
            <img alt="View Noor Khan’s profile" />
          </a>
          <p><span data-testid="expandable-text-box">A second visible comment validates the layout.</span></p>
          <button aria-label="Reply">Reply</button>
        </div>
      </article>
    </main>`;
}

function deeplyNestedFixture(): string {
  const wrappers = Array.from({ length: 18 }, () => '<div>').join('');
  const closingWrappers = Array.from({ length: 18 }, () => '</div>').join('');
  return `
    <main>
      <article role="listitem">
        <h2><span>Feed post</span></h2>
        <a href="https://www.linkedin.com/in/maya-chen/">
          <img alt="View Maya Chen’s profile" />
        </a>
        ${wrappers}
          <span data-testid="expandable-text-box">The deeply nested primary text must remain available for calibration.</span>
        ${closingWrappers}
        <button aria-label="Comment" data-target="deep-control">Comment</button>
      </article>
    </main>`;
}
