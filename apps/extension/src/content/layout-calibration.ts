import { AppError } from '../application/errors';
import {
  calibrationCandidateSchema,
  calibrationCaptureSchema,
  calibrationProposalSchema,
  type CalibratedLayoutRecipe,
  type CalibrationAttribute,
  type CalibrationCandidate,
  type CalibrationCapability,
  type CalibrationCapture,
  type CalibrationEvidenceNode,
  type CalibrationKind,
  type CalibrationNodePattern,
  type CalibrationProposal,
  type CalibrationRect,
} from '../domain/calibration';
import { createId } from '../shared/id';
import { normalizeUntrustedText } from '../shared/text';

const MAX_EVIDENCE_NODES = 180;
const MAX_EVIDENCE_CHARACTERS = 30_000;
const CALIBRATION_TIMEOUT_MS = 5 * 60_000;
const TEXT_SELECTOR = [
  '[data-testid="expandable-text-box"]',
  '[data-view-name="comment-text"]',
  '[data-view-name="feed-commentary"]',
  '.update-components-text',
  '.comments-comment-item__main-content',
  '.comments-comment-entity__content',
].join(',');
const PROFILE_SELECTOR = 'a[href*="/in/"],a[href*="/company/"],a[href*="/school/"]';
const COMMENTISH_SELECTOR = [
  '[id^="replaceableComment_urn:li:comment:"]',
  '[componentkey^="replaceableComment_urn:li:comment:"]',
  '.comments-comment-item',
  'article.comments-comment-entity',
  '[data-id^="urn:li:comment"]',
  '[data-view-name="comment-container"]',
].join(',');

interface LiveCapture {
  requestId: string;
  target: Element;
  nodes: Map<string, Element>;
  reverseNodes: Map<Element, string>;
  inferredBoundary: Element;
  expiresAt: number;
}

let liveCapture: LiveCapture | null = null;
interface StoredEphemeralLayoutBinding {
  recipe: CalibratedLayoutRecipe;
  boundary: Element;
  primaryText: Element;
  author: Element | null;
}

const ephemeralCalibrations = new Map<CalibrationKind, StoredEphemeralLayoutBinding>();
let outline: HTMLDivElement | null = null;
let outlineTimer: number | null = null;

export interface InferredVisibleLayout {
  boundary: Element;
  primaryText: Element;
  author: Element | null;
  authorName: string;
  text: string;
}

export interface EphemeralLayoutBinding {
  recipe: CalibratedLayoutRecipe;
  boundary: Element;
  primaryText: Element;
  author: Element | null;
}

export function inferVisibleLayout(target: Element, kind: CalibrationKind): InferredVisibleLayout {
  const boundary = inferBoundary(target, kind);
  const primaryText = inferPrimaryText(boundary, kind);
  const author = inferAuthorNode(boundary, kind);
  return {
    boundary,
    primaryText,
    author,
    authorName: author ? extractProfileName(author) : '',
    text: normalizeUntrustedText(visibleText(primaryText)),
  };
}

export function captureLayoutCalibration(
  target: Element,
  requestId: string,
  kind: CalibrationKind,
): CalibrationCapture {
  if (!target.isConnected) {
    throw new AppError('no-post-found', 'Right-click the LinkedIn item again.');
  }
  clearCalibrationCapture();
  const inferred = inferVisibleLayout(target, kind);
  const inferredBoundary = inferred.boundary;
  const primaryText = inferred.primaryText;
  const author = inferred.author;
  const regionRoot = chooseEvidenceRegion(inferredBoundary);
  const serialized = serializeEvidence(regionRoot, target, [
    inferredBoundary,
    primaryText,
    ...(author ? [author] : []),
  ]);
  const capture: LiveCapture = {
    requestId,
    target,
    nodes: serialized.nodes,
    reverseNodes: serialized.reverseNodes,
    inferredBoundary,
    expiresAt: Date.now() + CALIBRATION_TIMEOUT_MS,
  };
  liveCapture = capture;
  showCalibrationOutline(inferredBoundary);

  const localCandidate = compileCandidate(
    capture,
    {
      schemaVersion: 1,
      boundaryNodeId: requireNodeId(capture, inferredBoundary),
      primaryTextNodeId: requireNodeId(capture, primaryText),
      authorNodeId: author ? requireNodeId(capture, author) : null,
      explanation: 'Thoughtline inferred the visible boundary and required fields locally.',
    },
    kind,
  );

  const evidence = {
    schemaVersion: 1 as const,
    requestId,
    kind,
    surface: detectSurface(),
    targetNodeId: requireNodeId(capture, target),
    region: rectOf(regionRoot),
    nodes: serialized.evidenceNodes,
    nodeCount: serialized.evidenceNodes.length,
    characterCount: serialized.characterCount,
  };
  return calibrationCaptureSchema.parse({ evidence, localCandidate });
}

export function validateLayoutCalibrationProposal(
  requestId: string,
  rawProposal: unknown,
  kind: CalibrationKind,
): CalibrationCandidate {
  const capture = requireLiveCapture(requestId);
  const proposal = calibrationProposalSchema.parse(rawProposal);
  const candidate = compileCandidate(capture, proposal, kind);
  const boundary = capture.nodes.get(proposal.boundaryNodeId)!;
  const primaryText = capture.nodes.get(proposal.primaryTextNodeId)!;
  const author = proposal.authorNodeId ? capture.nodes.get(proposal.authorNodeId)! : null;
  ephemeralCalibrations.set(kind, { recipe: candidate.recipe, boundary, primaryText, author });
  showCalibrationOutline(boundary);
  return calibrationCandidateSchema.parse(candidate);
}

export function getEphemeralLayoutRecipe(target: Element): CalibratedLayoutRecipe | null {
  return getEphemeralLayoutBinding(target)?.recipe ?? null;
}

export function getEphemeralLayoutBinding(target: Element): EphemeralLayoutBinding | null {
  const bindings = getEphemeralLayoutBindings(target);
  return bindings.find((binding) => binding.recipe.kind === 'comment') ?? bindings[0] ?? null;
}

export function getEphemeralLayoutBindings(target: Element): EphemeralLayoutBinding[] {
  const bindings: EphemeralLayoutBinding[] = [];
  for (const [kind, calibration] of ephemeralCalibrations) {
    if (
      !calibration.boundary.isConnected ||
      !calibration.primaryText.isConnected ||
      (calibration.author !== null && !calibration.author.isConnected)
    ) {
      ephemeralCalibrations.delete(kind);
      continue;
    }
    if (calibration.boundary !== target && !calibration.boundary.contains(target)) continue;
    bindings.push({
      recipe: structuredClone(calibration.recipe),
      boundary: calibration.boundary,
      primaryText: calibration.primaryText,
      author: calibration.author,
    });
  }
  return bindings.sort((left, right) => {
    if (left.boundary === right.boundary) return left.recipe.kind === 'comment' ? -1 : 1;
    return left.boundary.contains(right.boundary) ? 1 : -1;
  });
}

export function clearCalibrationCapture(): void {
  liveCapture = null;
  if (outlineTimer !== null) window.clearTimeout(outlineTimer);
  outlineTimer = null;
  outline?.remove();
  outline = null;
}

export function matchesCalibrationPattern(
  element: Element,
  pattern: CalibrationNodePattern,
): boolean {
  if (element.tagName.toLowerCase() !== pattern.tag) return false;
  if (!pattern.attributes.every((attribute) => matchesAttribute(element, attribute))) return false;
  return pattern.capabilities.every((capability) => hasCapability(element, capability));
}

export function findCalibratedAncestor(
  target: Element,
  recipe: CalibratedLayoutRecipe,
): Element | null {
  let current: Element | null = target;
  while (current) {
    // A capability-based recipe can legitimately match both a LinkedIn item and
    // one of its broader wrappers. The closest match is the calibrated item that
    // contains the exact right-click target; choosing it also avoids widening
    // extraction into unrelated sibling posts or comments.
    if (matchesCalibrationPattern(current, recipe.boundary)) return current;
    current = current.parentElement;
  }
  return null;
}

export function findCalibratedText(
  boundary: Element,
  recipe: CalibratedLayoutRecipe,
): Element | null {
  const candidates = [boundary, ...boundary.querySelectorAll('*')].filter((element) =>
    matchesCalibrationPattern(element, recipe.primaryText),
  );
  const owned =
    recipe.kind === 'comment'
      ? candidates.filter(
          (element) => closestCalibratedBoundary(element, recipe.boundary) === boundary,
        )
      : candidates.filter((element) => !closestCommentish(element));
  if (owned.length !== 1) {
    if (owned.length > 1) {
      throw new AppError(
        'unsupported-layout',
        'A calibrated layout matched competing text regions.',
        { recipeId: recipe.id },
      );
    }
    return null;
  }
  return owned[0] ?? null;
}

function closestCalibratedBoundary(
  element: Element,
  pattern: CalibrationNodePattern,
): Element | null {
  let current: Element | null = element;
  while (current) {
    if (matchesCalibrationPattern(current, pattern)) return current;
    current = current.parentElement;
  }
  return null;
}

function compileCandidate(
  capture: LiveCapture,
  proposal: CalibrationProposal,
  kind: CalibrationKind,
): CalibrationCandidate {
  const boundary = requireMappedElement(capture, proposal.boundaryNodeId);
  const primaryText = requireMappedElement(capture, proposal.primaryTextNodeId);
  const author = proposal.authorNodeId
    ? requireMappedElement(capture, proposal.authorNodeId)
    : null;
  if (!boundary.contains(capture.target) && boundary !== capture.target) {
    throw new AppError('unsupported-layout', 'The proposed boundary does not contain the target.');
  }
  if (!boundary.contains(primaryText) && boundary !== primaryText) {
    throw new AppError('unsupported-layout', 'The proposed text is outside the boundary.');
  }
  if (primaryText === boundary) {
    throw new AppError(
      'unsupported-layout',
      'The proposed primary text must be a specific authored-text node inside the boundary.',
    );
  }
  if (
    primaryText.matches('button,[role="button"],a[href*="/in/"]') ||
    primaryText.querySelector('button,[role="button"],a[href*="/in/"]')
  ) {
    throw new AppError(
      'unsupported-layout',
      'The proposed primary text includes profile or action controls.',
    );
  }
  if (kind === 'post' && closestCommentish(primaryText)) {
    throw new AppError('unsupported-layout', 'The proposed post text belongs to a comment.');
  }
  if (author && !boundary.contains(author) && boundary !== author) {
    throw new AppError('unsupported-layout', 'The proposed author is outside the boundary.');
  }
  const text = normalizeUntrustedText(visibleText(primaryText)).slice(0, 4_000);
  if (!text) throw new AppError('unsupported-layout', 'The proposed primary text is empty.');
  const authorName = author ? extractProfileName(author) : '';
  if (author && !authorName) {
    throw new AppError(
      'unsupported-layout',
      'The proposed author node is not visible profile metadata for this item.',
    );
  }
  if (!author && ownedProfileLinks(boundary, kind).length > 0) {
    throw new AppError(
      'unsupported-layout',
      'A visible profile belongs to this item, but the proposal did not map its author.',
    );
  }
  const boundaryPattern = patternFromElement(boundary);
  const primaryTextPattern = patternFromElement(primaryText);
  const validationCount = countValidExamples(boundaryPattern, primaryTextPattern, kind);
  const now = new Date().toISOString();
  const recipe: CalibratedLayoutRecipe = {
    schemaVersion: 1,
    id: createId(),
    kind,
    surface: detectSurface(),
    status: 'active',
    boundary: boundaryPattern,
    primaryText: primaryTextPattern,
    authorStrategy: authorName ? 'profile-metadata' : 'neutral',
    validationCount,
    createdAt: now,
    updatedAt: now,
  };
  return {
    proposal,
    recipe,
    preview: {
      kind,
      author: authorName || (kind === 'post' ? 'Post author' : 'Comment author'),
      text,
      surface: detectSurface(),
      validationCount,
      persistent: validationCount >= 2,
      boundaryRect: rectOf(boundary),
    },
  };
}

function inferBoundary(target: Element, kind: CalibrationKind): Element {
  const ancestors: Element[] = [];
  let current: Element | null = target;
  while (current && ancestors.length < 12) {
    ancestors.push(current);
    current = current.parentElement;
  }
  const scored = ancestors
    .map((element, index) => ({ element, index, score: boundaryScore(element, kind) }))
    .filter(({ score }) => score >= (kind === 'post' ? 6 : 7))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const winner = scored[0]?.element;
  if (!winner) {
    throw new AppError(
      'unsupported-layout',
      `Thoughtline could not infer a ${kind} boundary from this target.`,
    );
  }
  return winner;
}

function boundaryScore(element: Element, kind: CalibrationKind): number {
  const textCandidates = ownedTextCandidates(element, kind);
  const profiles = ownedProfileLinks(element, kind);
  const hasReply = Boolean(
    element.querySelector('[aria-label="Reply"],button[aria-label*="Reply"]'),
  );
  const hasComment = Boolean(
    element.querySelector('[aria-label="Comment"],button[aria-label*="Comment"]'),
  );
  const role = element.getAttribute('role');
  let score = 0;
  if (textCandidates.length === 1) score += 4;
  if (profiles.length >= 1) score += 3;
  if (kind === 'comment' && hasReply) score += 3;
  if (kind === 'post' && hasComment) score += 2;
  if (kind === 'post' && (role === 'listitem' || element.tagName === 'ARTICLE')) score += 2;
  if (
    kind === 'post' &&
    [...element.querySelectorAll('h1,h2')].some((heading) =>
      normalizeUntrustedText(heading.textContent ?? '').includes('Feed post'),
    )
  )
    score += 2;
  if (kind === 'comment' && closestCommentish(element) === element) score += 3;
  if (kind === 'post' && closestCommentish(element)) score -= 8;
  if (textCandidates.length > 3) score -= 2;
  return score;
}

function inferPrimaryText(boundary: Element, kind: CalibrationKind): Element {
  const candidates = ownedTextCandidates(boundary, kind)
    .filter((element) => visibleText(element).trim().length > 0)
    .sort((left, right) => visibleText(right).length - visibleText(left).length);
  const winner = candidates[0];
  if (!winner) {
    throw new AppError('unsupported-layout', 'No primary text was found inside the boundary.');
  }
  return winner;
}

function inferAuthorNode(boundary: Element, kind: CalibrationKind): Element | null {
  return ownedProfileLinks(boundary, kind)[0] ?? null;
}

function ownedTextCandidates(boundary: Element, kind: CalibrationKind): Element[] {
  const explicit = [...boundary.querySelectorAll(TEXT_SELECTOR)].filter((element) =>
    isVisible(element),
  );
  const candidates =
    explicit.length > 0
      ? explicit
      : [...boundary.querySelectorAll('p,span')].filter(
          (element) => isVisible(element) && visibleText(element).trim().length >= 20,
        );
  return candidates.filter((element) =>
    kind === 'comment'
      ? closestCommentish(element) === closestCommentish(boundary)
      : !closestCommentish(element),
  );
}

function ownedProfileLinks(boundary: Element, kind: CalibrationKind): Element[] {
  return [...boundary.querySelectorAll(PROFILE_SELECTOR)].filter((element) => {
    if (!isVisible(element)) return false;
    return kind === 'comment'
      ? closestCommentish(element) === closestCommentish(boundary)
      : !closestCommentish(element);
  });
}

function chooseEvidenceRegion(boundary: Element): Element {
  const parent = boundary.parentElement;
  if (!parent) return boundary;
  const visibleChildren = [...parent.children].filter((child) => isVisible(child));
  return visibleChildren.length <= 8 ? parent : boundary;
}

function serializeEvidence(
  region: Element,
  target: Element,
  requiredElements: readonly Element[],
): {
  evidenceNodes: CalibrationEvidenceNode[];
  nodes: Map<string, Element>;
  reverseNodes: Map<Element, string>;
  characterCount: number;
} {
  const evidenceNodes: CalibrationEvidenceNode[] = [];
  const nodes = new Map<string, Element>();
  const reverseNodes = new Map<Element, string>();
  const required = [...new Set([target, ...requiredElements])];
  const requiredSet = new Set(required);
  let characterCount = 0;
  const appendEvidenceNode = (
    element: Element,
    parentId: string | undefined,
    treeDepth: number,
  ) => {
    const remainingCharacters = Math.max(0, MAX_EVIDENCE_CHARACTERS - characterCount);
    const text = directText(element).slice(0, Math.min(1_200, remainingCharacters));
    characterCount += text.length;
    const id = `n${String(evidenceNodes.length + 1)}`;
    nodes.set(id, element);
    reverseNodes.set(element, id);
    evidenceNodes.push({
      id,
      ...(parentId ? { parentId } : {}),
      tag: element.tagName.toLowerCase(),
      ...(element.getAttribute('role') ? { role: element.getAttribute('role')! } : {}),
      attributes: evidenceAttributes(element),
      text,
      depth: Math.min(12, treeDepth),
      rect: rectOf(element),
      target: element === target,
    });
    return id;
  };
  const visit = (element: Element, parentId: string | undefined, treeDepth: number) => {
    const missingRequired = required.filter((candidate) => !reverseNodes.has(candidate)).length;
    if (
      evidenceNodes.length >= MAX_EVIDENCE_NODES ||
      (!requiredSet.has(element) && evidenceNodes.length >= MAX_EVIDENCE_NODES - missingRequired) ||
      shouldExcludeEvidenceElement(element)
    )
      return;
    const id = appendEvidenceNode(element, parentId, treeDepth);
    const children = [...element.children].sort(
      (left, right) =>
        Number(containsRequired(right, required)) - Number(containsRequired(left, required)),
    );
    for (const child of children) visit(child, id, treeDepth + 1);
  };
  visit(region, undefined, 0);
  for (const element of required) {
    if (reverseNodes.has(element)) continue;
    const parent = closestMappedParent(element, reverseNodes);
    const parentId = parent ? reverseNodes.get(parent) : undefined;
    const parentDepth = parentId
      ? (evidenceNodes.find((node) => node.id === parentId)?.depth ?? 11)
      : -1;
    appendEvidenceNode(element, parentId, parentDepth + 1);
  }
  return { evidenceNodes, nodes, reverseNodes, characterCount };
}

function containsRequired(element: Element, required: readonly Element[]): boolean {
  return required.some((candidate) => element === candidate || element.contains(candidate));
}

function closestMappedParent(element: Element, reverseNodes: Map<Element, string>): Element | null {
  let current = element.parentElement;
  while (current && !reverseNodes.has(current)) current = current.parentElement;
  return current;
}

function shouldExcludeEvidenceElement(element: Element): boolean {
  if (!isVisible(element)) return true;
  if (
    ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'INPUT', 'TEXTAREA', 'SELECT'].includes(
      element.tagName,
    )
  )
    return true;
  if (element.getAttribute('contenteditable') === 'true') return true;
  return Boolean(element.closest('input,textarea,select,[contenteditable="true"]'));
}

function evidenceAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const attribute of element.attributes) {
    const name = attribute.name.toLowerCase();
    if (
      name === 'class' ||
      name === 'id' ||
      name === 'role' ||
      name === 'href' ||
      name.startsWith('data-') ||
      name.startsWith('aria-')
    ) {
      attributes[name] = attribute.value.slice(0, 500);
    }
  }
  return attributes;
}

function patternFromElement(element: Element): CalibrationNodePattern {
  const attributes: CalibrationAttribute[] = [];
  const role = element.getAttribute('role');
  if (role) attributes.push({ name: 'role', operator: 'equals', value: role.slice(0, 160) });
  for (const name of ['data-testid', 'data-test-id'] as const) {
    const value = element.getAttribute(name);
    if (value && !looksGenerated(value)) {
      attributes.push({ name, operator: 'equals', value: value.slice(0, 160) });
    }
  }
  for (const name of ['componentkey', 'id'] as const) {
    const value = element.getAttribute(name);
    const prefix = value ? stablePrefix(value) : '';
    if (prefix) attributes.push({ name, operator: 'prefix', value: prefix });
  }
  const href = element.getAttribute('href');
  if (href) {
    for (const segment of ['/in/', '/company/', '/school/']) {
      if (href.includes(segment)) {
        attributes.push({ name: 'href', operator: 'contains', value: segment });
        break;
      }
    }
  }
  const capabilities = (
    [
      ['profile-link', hasCapability(element, 'profile-link')],
      ['primary-text', hasCapability(element, 'primary-text')],
      ['reply-control', hasCapability(element, 'reply-control')],
      ['comment-control', hasCapability(element, 'comment-control')],
      ['feed-heading', hasCapability(element, 'feed-heading')],
    ] as Array<[CalibrationCapability, boolean]>
  )
    .filter(([, present]) => present)
    .map(([capability]) => capability);
  return {
    tag: element.tagName.toLowerCase(),
    attributes: attributes.slice(0, 6),
    capabilities,
  };
}

function countValidExamples(
  boundary: CalibrationNodePattern,
  text: CalibrationNodePattern,
  kind: CalibrationKind,
): number {
  let count = 0;
  for (const candidate of document.querySelectorAll(boundary.tag)) {
    if (!isVisible(candidate) || !matchesCalibrationPattern(candidate, boundary)) continue;
    const textMatches = [candidate, ...candidate.querySelectorAll(text.tag)].filter(
      (element) =>
        matchesCalibrationPattern(element, text) &&
        (kind === 'post'
          ? !closestCommentish(element)
          : closestCommentish(element) === closestCommentish(candidate)),
    );
    if (textMatches.length === 1 && visibleText(textMatches[0]!).trim()) count += 1;
  }
  return Math.max(1, Math.min(120, count));
}

function hasCapability(element: Element, capability: CalibrationCapability): boolean {
  switch (capability) {
    case 'profile-link':
      return element.matches(PROFILE_SELECTOR) || Boolean(element.querySelector(PROFILE_SELECTOR));
    case 'primary-text':
      return element.matches(TEXT_SELECTOR) || Boolean(element.querySelector(TEXT_SELECTOR));
    case 'reply-control':
      return Boolean(element.querySelector('[aria-label="Reply"],button[aria-label*="Reply"]'));
    case 'comment-control':
      return Boolean(element.querySelector('[aria-label="Comment"],button[aria-label*="Comment"]'));
    case 'feed-heading':
      return [...element.querySelectorAll('h1,h2')].some((heading) =>
        normalizeUntrustedText(heading.textContent ?? '').includes('Feed post'),
      );
  }
}

function matchesAttribute(element: Element, attribute: CalibrationAttribute): boolean {
  const actual = element.getAttribute(attribute.name);
  if (actual === null) return false;
  if (attribute.operator === 'equals') return actual === attribute.value;
  if (attribute.operator === 'prefix') return actual.startsWith(attribute.value);
  return actual.includes(attribute.value);
}

function stablePrefix(value: string): string {
  if (value.startsWith('replaceableComment_urn:li:comment:'))
    return 'replaceableComment_urn:li:comment:';
  if (value.startsWith('expanded')) return 'expanded';
  if (value.startsWith('urn:li:')) return value.split(/[\d(]/u)[0]!.slice(0, 80);
  const prefix = value.split(/[0-9a-f]{8}-|[0-9]{4,}/iu)[0] ?? '';
  return prefix.length >= 8 && !looksGenerated(prefix) ? prefix.slice(0, 80) : '';
}

function looksGenerated(value: string): boolean {
  return /[0-9a-f]{8}-[0-9a-f-]{20,}|^[a-f0-9_-]{12,}$/iu.test(value);
}

function closestCommentish(element: Element): Element | null {
  return element.closest(COMMENTISH_SELECTOR);
}

function extractProfileName(element: Element): string {
  const link = element.matches(PROFILE_SELECTOR) ? element : element.closest(PROFILE_SELECTOR);
  if (!link) return '';
  for (const candidate of link.querySelectorAll('img[alt],svg[aria-label],[aria-label]')) {
    const label = normalizeUntrustedText(
      candidate.getAttribute('alt') ?? candidate.getAttribute('aria-label') ?? '',
    );
    const match = label.match(/^View (.+?)[\u2019']s profile$/iu);
    if (match?.[1]) return cleanAuthor(match[1]);
    if (/\bVerified Profile\b|\b(?:1st|2nd|3rd)\s*$/iu.test(label)) return cleanAuthor(label);
  }
  return cleanAuthor(visibleText(link));
}

function cleanAuthor(value: string): string {
  return normalizeUntrustedText(value)
    .replace(/\s+Verified Profile(?=\s|$)/giu, '')
    .replace(/\s*[\u2022\u00b7]?\s*(?:1st|2nd|3rd)\s*$/iu, '')
    .trim()
    .slice(0, 160);
}

function directText(element: Element): string {
  const pieces: string[] = [];
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) pieces.push(node.textContent ?? '');
  }
  return normalizeUntrustedText(pieces.join(' '));
}

function visibleText(element: Element): string {
  const html = element as HTMLElement;
  return html.innerText || html.textContent || '';
}

function isVisible(element: Element): boolean {
  const html = element as HTMLElement;
  if (!html.isConnected || html.hidden || html.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(html);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
    return false;
  const rect = html.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function rectOf(element: Element): CalibrationRect {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function detectSurface(): 'feed' | 'notifications' | 'post-detail' {
  if (location.href.includes('/feed/update/') || location.href.includes('/posts/')) {
    return 'post-detail';
  }
  return location.href.includes('/notifications/') ? 'notifications' : 'feed';
}

function requireNodeId(capture: LiveCapture, element: Element): string {
  const id = capture.reverseNodes.get(element);
  if (!id) throw new AppError('unsupported-layout', 'The inferred element is outside evidence.');
  return id;
}

function requireLiveCapture(requestId: string): LiveCapture {
  if (!liveCapture || liveCapture.requestId !== requestId || liveCapture.expiresAt <= Date.now()) {
    clearCalibrationCapture();
    throw new AppError('no-post-found', 'The calibration target expired. Right-click it again.');
  }
  return liveCapture;
}

function requireMappedElement(capture: LiveCapture, nodeId: string): Element {
  const element = capture.nodes.get(nodeId);
  if (!element?.isConnected) {
    throw new AppError('unsupported-layout', 'The proposed element is no longer visible.');
  }
  return element;
}

function showCalibrationOutline(element: Element): void {
  outline?.remove();
  const rect = element.getBoundingClientRect();
  const node = document.createElement('div');
  node.dataset.thoughtlineCalibrationOutline = 'true';
  Object.assign(node.style, {
    position: 'fixed',
    zIndex: '2147483647',
    pointerEvents: 'none',
    left: `${String(Math.max(0, rect.left - 3))}px`,
    top: `${String(Math.max(0, rect.top - 3))}px`,
    width: `${String(rect.width + 6)}px`,
    height: `${String(rect.height + 6)}px`,
    border: '2px solid #287f7a',
    borderRadius: '10px',
    boxShadow: '0 0 0 3px rgba(40,127,122,.18),0 8px 24px rgba(16,50,71,.18)',
  });
  document.documentElement.append(node);
  outline = node;
  outlineTimer = window.setTimeout(clearCalibrationCapture, CALIBRATION_TIMEOUT_MS);
}
