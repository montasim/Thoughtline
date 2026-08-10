import { AppError } from '../application/errors';
import {
  postContextSchema,
  type DiscussionItem,
  type PostContext,
  type PostTargetType,
} from '../domain/schemas';
import { createId } from '../shared/id';
import { countWords, normalizeUntrustedText } from '../shared/text';
import type { CalibratedLayoutRecipe } from '../domain/calibration';
import {
  findCalibratedAncestor,
  findCalibratedText,
  inferVisibleLayout,
  matchesCalibrationPattern,
  type EphemeralLayoutBinding,
  type InferredVisibleLayout,
} from './layout-calibration';

const EXTRACTION_VERSION = '2026.07.7';
const MIN_REPLY_INDENT_PX = 12;
const POST_SELECTORS = [
  '[data-urn^="urn:li:activity:"]',
  '[data-id^="urn:li:activity:"]',
  '.feed-shared-update-v2',
  '[data-view-name="feed-full-update"]',
  '[data-testid="main-feed-activity-card"]',
  '[data-test-id="main-feed-activity-card"]',
  '.main-feed-activity-card',
  'article[data-id]',
  '[data-finite-scroll-hotkey-item]',
  '.occludable-update',
  '[id^="expanded"][id*="FeedType_"]',
  '[role="listitem"][componentkey^="expanded"]',
  '[componentkey^="expanded"][componentkey*="FeedType_"]',
] as const;
const POST_TEXT_SELECTORS = [
  '[data-testid="expandable-text-box"]',
  '.update-components-text',
  '.feed-shared-text',
  '.attributed-text-segment-list__content',
  '.feed-shared-update-v2__description',
  '.feed-shared-update-v2__commentary',
  '[data-test-id="main-feed-activity-card__commentary"]',
  '[data-view-name="feed-commentary"]',
] as const;
const POST_AUTHOR_SELECTORS = [
  '.update-components-actor__name',
  '.feed-shared-actor__name',
  '[data-view-name="feed-actor-name"]',
  '.update-components-actor__meta-link',
  '.feed-shared-actor__meta-link',
  '[data-test-id="main-feed-activity-card__entity-lockup"] a[data-tracking-control-name*="feed-actor-name"]',
  '[data-testid="main-feed-activity-card__entity-lockup"] a[data-tracking-control-name*="feed-actor-name"]',
  'a[href*="/in/"] span[aria-hidden="true"]',
] as const;
const POST_ACTOR_CONTAINER_SELECTORS = [
  '.update-components-actor',
  '.feed-shared-actor',
  '[data-view-name="feed-actor"]',
  '[data-test-id="main-feed-activity-card__entity-lockup"]',
  '[data-testid="main-feed-activity-card__entity-lockup"]',
  '.base-main-feed-card__entity-lockup',
] as const;
const ACTOR_PROFILE_LINK_SELECTOR = [
  'a[href*="/in/"]',
  'a[href*="/company/"]',
  'a[href*="/school/"]',
  'a[href*="/showcase/"]',
].join(',');
const COMMENT_SELECTORS = [
  '[id^="replaceableComment_urn:li:comment:"]',
  '[componentkey^="replaceableComment_urn:li:comment:"]',
  '.comments-comment-item',
  'article.comments-comment-entity',
  '[data-id^="urn:li:comment"]',
  '[data-view-name="comment-container"]',
] as const;
const COMMENT_TEXT_SELECTORS = [
  '[data-testid="expandable-text-box"]',
  '.comments-comment-item__main-content',
  '.comments-comment-item-content-body',
  '.comments-comment-item__inline-show-more-text',
  '.comments-comment-entity__content',
  '.comments-comment-entity__main-content',
  '[data-view-name="comment-text"]',
] as const;
const COMMENT_AUTHOR_SELECTORS = [
  '.comments-post-meta__name-text',
  '.comments-comment-meta__description-title',
  '[data-view-name="comment-author"]',
  'a[href*="/in/"] span[aria-hidden="true"]',
] as const;
const REACTION_SELECTORS = [
  '.social-details-social-counts__reactions-count',
  '[data-test-id="social-actions__reaction-count"]',
  '[data-view-name="reaction-count"]',
] as const;
const LINK_PREVIEW_SELECTORS = [
  '.feed-shared-article__title',
  '.feed-shared-article__description',
  '.feed-shared-external-video__meta',
] as const;
const PERMALINK_SELECTORS = ['a[href*="/feed/update/"]', 'a[href*="/posts/"]'] as const;
const EXPANDABLE_TEXT_CONTROL_SELECTOR =
  'button[aria-hidden="true"][data-testid="expandable-text-button"],button[aria-hidden="true"][data-test-id="expandable-text-button"]';

interface ClassifiedComment {
  root: Element;
  depth: 0 | 1;
}

type ExtractionIntent = 'reply' | 'refine';

export function extractLinkedInPost(
  target: Element,
  locationHref = window.location.href,
  recipes: CalibratedLayoutRecipe[] = [],
  ephemeralBindings: readonly EphemeralLayoutBinding[] = [],
  intent: ExtractionIntent = 'reply',
): PostContext {
  const activeRecipes = recipes.filter(
    (recipe) => recipe.status === 'active' && recipe.surface === detectSurface(locationHref),
  );
  const activeBindings = ephemeralBindings.filter(
    (binding) =>
      binding.recipe.status === 'active' &&
      binding.recipe.surface === detectSurface(locationHref) &&
      binding.boundary.isConnected &&
      binding.primaryText.isConnected &&
      (binding.author === null || binding.author.isConnected) &&
      (binding.boundary === target || binding.boundary.contains(target)),
  );
  const postBinding = activeBindings.find((binding) => binding.recipe.kind === 'post') ?? null;
  const postRoot = findUniquePostRoot(target, activeRecipes, postBinding);
  const postText =
    (postBinding?.boundary === postRoot
      ? normalizeUntrustedText(visibleText(postBinding.primaryText))
      : '') ||
    collectText(postRoot, POST_TEXT_SELECTORS, COMMENT_SELECTORS) ||
    collectCalibratedPostText(postRoot, activeRecipes);
  if (!postText) throw unsupported('The selected post has no visible text to analyze.', 'post');
  const postAuthor =
    (postBinding ? extractEphemeralAuthor(postBinding) : '') ||
    extractPostAuthor(postRoot) ||
    'Post author';

  const inferredComments = inferVisibleCommentLayouts(postRoot, target);
  const commentBindings = activeBindings.filter(
    (binding) =>
      binding.recipe.kind === 'comment' &&
      binding.boundary !== postRoot &&
      postRoot.contains(binding.boundary),
  );
  if (
    intent === 'refine' &&
    isCommentTarget(target, postRoot, activeRecipes, commentBindings, inferredComments)
  ) {
    throw unsupported(
      'Right-click inside the main post. Comments and replies can only be used in Reply.',
      'post',
    );
  }
  if (intent === 'refine') {
    return parsePostContext({
      postRoot,
      postAuthor,
      postText,
      locationHref,
      discussion: [],
      responseTarget: { type: 'post', author: postAuthor, text: postText },
    });
  }
  const reusableCommentRecipes = activeRecipes.filter(
    (recipe) => !commentBindings.some((binding) => binding.recipe.id === recipe.id),
  );
  const commentRoots = collapseRepeatedCommentWrappers(
    mergeElementMatches(
      findTopLevelMatches(postRoot, COMMENT_SELECTORS),
      mergeElementMatches(
        collectCalibratedCommentRoots(
          postRoot,
          reusableCommentRecipes,
          commentBindings.map((binding) => binding.boundary),
        ),
        mergeElementMatches(
          inferredComments.map((comment) => comment.boundary),
          commentBindings.map((binding) => binding.boundary),
        ),
      ),
    ),
  );
  const targetComment = findTargetComment(target, commentRoots);
  const classifiedComments = classifyComments(commentRoots);
  const targetClassification = classifiedComments.find(({ root }) => root === targetComment);
  const selected = selectDiscussionComments(classifiedComments, targetComment);
  const discussion = selected.map(({ root, depth }) =>
    extractComment(
      root,
      depth,
      targetComment,
      activeRecipes,
      inferredComments,
      commentBindings.find((binding) => binding.boundary === root) ?? null,
    ),
  );
  const targetItem = discussion.find((item) => item.isTarget);
  const targetType: PostTargetType = targetItem
    ? targetClassification?.depth === 1
      ? 'reply'
      : 'comment'
    : 'post';
  const responseTarget = targetItem
    ? { type: targetType, author: targetItem.author, text: targetItem.text }
    : { type: 'post' as const, author: postAuthor, text: postText };

  return parsePostContext({
    postRoot,
    postAuthor,
    postText,
    locationHref,
    discussion,
    responseTarget,
  });
}

function parsePostContext({
  postRoot,
  postAuthor,
  postText,
  locationHref,
  discussion,
  responseTarget,
}: {
  postRoot: Element;
  postAuthor: string;
  postText: string;
  locationHref: string;
  discussion: DiscussionItem[];
  responseTarget: { type: PostTargetType; author: string; text: string };
}): PostContext {
  const reactionSummary = collectText(postRoot, REACTION_SELECTORS);
  const linkPreview = collectText(postRoot, LINK_PREVIEW_SELECTORS, COMMENT_SELECTORS);
  const permalink = findPermalink(postRoot, locationHref);
  const candidate = {
    schemaVersion: 1 as const,
    extractionVersion: EXTRACTION_VERSION,
    surface: detectSurface(locationHref),
    author: postAuthor.slice(0, 160),
    postText,
    ...(permalink ? { postPermalink: permalink } : {}),
    ...(reactionSummary ? { reactionSummary } : {}),
    ...(linkPreview ? { linkPreview } : {}),
    discussion,
    responseTarget,
    excerpt: postText.slice(0, 320),
    wordCount: Math.max(1, countWords(postText)),
    extractedAt: new Date().toISOString(),
  };
  const parsed = postContextSchema.safeParse(candidate);
  if (!parsed.success)
    throw unsupported('The visible post did not pass safety validation.', 'post');
  return parsed.data;
}

function isCommentTarget(
  target: Element,
  postRoot: Element,
  recipes: CalibratedLayoutRecipe[],
  bindings: EphemeralLayoutBinding[],
  inferred: InferredVisibleLayout[],
): boolean {
  if (
    bindings.some((binding) => binding.boundary === target || binding.boundary.contains(target))
  ) {
    return true;
  }
  const knownComment = target.closest(COMMENT_SELECTORS.join(','));
  if (knownComment && knownComment !== postRoot && postRoot.contains(knownComment)) return true;
  const ownedPostText = topLevelCandidates(postRoot, POST_TEXT_SELECTORS, COMMENT_SELECTORS);
  if (
    ownedPostText.some((candidate) =>
      candidate === target || candidate.contains(target)
        ? isExplicitPostCommentary(candidate) || ownedPostText.length === 1
        : false,
    )
  ) {
    return false;
  }
  if (
    recipes
      .filter((recipe) => recipe.kind === 'comment')
      .some((recipe) => {
        const root = findCalibratedAncestor(target, recipe);
        return root !== null && root !== postRoot && postRoot.contains(root);
      })
  ) {
    return true;
  }
  return inferred.some(
    (candidate) =>
      candidate.boundary !== postRoot &&
      postRoot.contains(candidate.boundary) &&
      (candidate.boundary === target || candidate.boundary.contains(target)),
  );
}

function findUniquePostRoot(
  target: Element,
  recipes: CalibratedLayoutRecipe[],
  ephemeralBinding: EphemeralLayoutBinding | null,
): Element {
  const matchingAncestors: Element[] = [];
  let current: Element | null = target;
  while (current) {
    if (POST_SELECTORS.some((selector) => current?.matches(selector)))
      matchingAncestors.push(current);
    current = current.parentElement;
  }
  const builtIn =
    matchingAncestors.find((candidate) =>
      candidate.matches('[role="listitem"][componentkey^="expanded"]'),
    ) ??
    matchingAncestors.at(-1) ??
    findStructuredPostRoot(target);
  if (ephemeralBinding) {
    const ephemeralRoot = ephemeralBinding.boundary;
    if (builtIn && !builtIn.contains(ephemeralRoot) && !ephemeralRoot.contains(builtIn)) {
      throw new AppError('unsupported-layout', 'Built-in and temporary post extraction disagree.', {
        recipeId: ephemeralBinding.recipe.id,
        recoveryKind: 'post',
      });
    }
    return ephemeralRoot;
  }
  const calibrated = recipes
    .filter((recipe) => recipe.kind === 'post')
    .map((recipe) => ({ recipe, root: findCalibratedAncestor(target, recipe) }))
    .filter(
      (item): item is { recipe: CalibratedLayoutRecipe; root: Element } => item.root !== null,
    );
  const distinct = calibrated.filter(
    ({ root }, index) =>
      calibrated.findIndex(
        (candidate) =>
          candidate.root === root || candidate.root.contains(root) || root.contains(candidate.root),
      ) === index,
  );
  if (distinct.length > 1) {
    throw new AppError(
      'unsupported-layout',
      'Calibrated post layouts disagree about the selected boundary.',
      { recipeId: distinct[0]?.recipe.id, recoveryKind: 'post' },
    );
  }
  const calibratedRoot = distinct[0]?.root ?? null;
  if (
    builtIn &&
    calibratedRoot &&
    !builtIn.contains(calibratedRoot) &&
    !calibratedRoot.contains(builtIn)
  ) {
    throw new AppError('unsupported-layout', 'Built-in and calibrated post extraction disagree.', {
      recipeId: distinct[0]?.recipe.id,
      recoveryKind: 'post',
    });
  }
  const resolved = builtIn ?? calibratedRoot;
  if (!resolved)
    throw unsupported('Right-click inside a visible LinkedIn post or discussion.', 'post');
  return resolved;
}

function findStructuredPostRoot(target: Element): Element | null {
  let current = target.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    const postTextCandidates = topLevelCandidates(current, POST_TEXT_SELECTORS, COMMENT_SELECTORS);
    if (
      postTextCandidates.length === 1 &&
      hasPostBoundarySignal(current) &&
      !current.matches(COMMENT_SELECTORS.join(','))
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function hasPostBoundarySignal(root: Element): boolean {
  if (
    root.matches('[data-activity-urn],[data-urn^="urn:li:activity:"],[data-id^="urn:li:activity:"]')
  ) {
    return true;
  }
  if (
    root.querySelector(
      '[data-activity-urn],a[href*="/feed/update/"],a[href*="/posts/"],[data-view-name="feed-actor"],[data-testid="main-feed-activity-card__entity-lockup"],[data-test-id="main-feed-activity-card__entity-lockup"]',
    )
  ) {
    return true;
  }
  return [...root.querySelectorAll('h1,h2')].some((heading) =>
    normalizeUntrustedText(heading.textContent ?? '').includes('Feed post'),
  );
}

function findTargetComment(target: Element, roots: Element[]): Element | null {
  const matches = roots.filter((root) => root === target || root.contains(target));
  if (matches.length === 0) return null;
  return (
    matches.find(
      (candidate) => !matches.some((other) => other !== candidate && candidate.contains(other)),
    ) ?? null
  );
}

function inferVisibleCommentLayouts(postRoot: Element, target: Element): InferredVisibleLayout[] {
  let selected: InferredVisibleLayout;
  try {
    selected = inferVisibleLayout(target, 'comment');
  } catch {
    return [];
  }
  if (
    selected.boundary === postRoot ||
    !postRoot.contains(selected.boundary) ||
    !selected.text ||
    !selected.authorName
  ) {
    return [];
  }

  const controls = [...postRoot.querySelectorAll<HTMLElement>('button,[role="button"]')].filter(
    (element) => {
      if (!isElementVisible(element)) return false;
      const label = normalizeUntrustedText(
        element.getAttribute('aria-label') ?? element.textContent ?? '',
      );
      return /^reply(?:\s|$)/iu.test(label);
    },
  );
  const inferred = [selected];
  for (const control of controls) {
    try {
      const candidate = inferVisibleLayout(control, 'comment');
      if (
        candidate.boundary !== postRoot &&
        postRoot.contains(candidate.boundary) &&
        candidate.text &&
        candidate.authorName
      ) {
        inferred.push(candidate);
      }
    } catch {
      // One unsupported control must not discard other safely inferred discussion items.
    }
  }
  return inferred.filter(
    (candidate, index) =>
      inferred.findIndex((other) => other.boundary === candidate.boundary) === index,
  );
}

function classifyComments(roots: Element[]): ClassifiedComment[] {
  const visualDepths = inferVisualDepths(roots);
  return roots.map((root, index) => ({
    root,
    depth: semanticDepth(root) ?? visualDepths?.[index] ?? 0,
  }));
}

function selectDiscussionComments(
  comments: ClassifiedComment[],
  target: Element | null,
): ClassifiedComment[] {
  if (!target) return comments;
  const targetIndex = comments.findIndex(({ root }) => root === target);
  if (targetIndex < 0)
    throw unsupported('The selected discussion could not be matched safely.', 'comment');
  let start = targetIndex;
  if (comments[targetIndex]?.depth === 1) {
    while (start >= 0 && comments[start]?.depth !== 0) start -= 1;
    if (start < 0) {
      throw unsupported(
        'The selected reply has no visible parent comment, so nothing was sent.',
        'comment',
      );
    }
  }
  let end = start + 1;
  while (end < comments.length && comments[end]?.depth === 1) end += 1;
  return comments.slice(start, end);
}

function extractComment(
  root: Element,
  depth: 0 | 1,
  target: Element | null,
  recipes: CalibratedLayoutRecipe[],
  inferred: InferredVisibleLayout[],
  ephemeralBinding: EphemeralLayoutBinding | null,
): DiscussionItem {
  const recipe = recipes.find(
    (candidate) =>
      candidate.kind === 'comment' && matchesCalibrationPattern(root, candidate.boundary),
  );
  const text =
    (ephemeralBinding ? normalizeUntrustedText(visibleText(ephemeralBinding.primaryText)) : '') ||
    collectCommentText(root, COMMENT_TEXT_SELECTORS) ||
    (recipe ? normalizeUntrustedText(visibleText(findCalibratedText(root, recipe) ?? root)) : '') ||
    inferred.find((candidate) => candidate.boundary === root)?.text ||
    '';
  const author =
    (ephemeralBinding ? extractEphemeralAuthor(ephemeralBinding) : '') ||
    collectCommentText(root, COMMENT_AUTHOR_SELECTORS) ||
    (recipe ? extractCalibratedProfileName(root, recipe) : extractProfileName(root, true)) ||
    inferred.find((candidate) => candidate.boundary === root)?.authorName ||
    '';
  if (!text || !author) {
    throw unsupported(
      'A visible discussion item used an unsupported layout, so nothing was sent.',
      'comment',
    );
  }
  return {
    id: root.getAttribute('data-id')?.slice(0, 160) || createId(),
    author: author.slice(0, 160),
    text,
    depth,
    isTarget: root === target,
  };
}

function extractEphemeralAuthor(binding: EphemeralLayoutBinding): string {
  if (!binding.author) return '';
  const link = binding.author.matches(ACTOR_PROFILE_LINK_SELECTOR)
    ? binding.author
    : (binding.author.closest(ACTOR_PROFILE_LINK_SELECTOR) ??
      binding.author.querySelector(ACTOR_PROFILE_LINK_SELECTOR));
  return link instanceof HTMLAnchorElement ? extractProfileNameFromLink(link) : '';
}

function collectCalibratedPostText(root: Element, recipes: CalibratedLayoutRecipe[]): string {
  for (const recipe of recipes.filter(
    (candidate) => candidate.kind === 'post' && matchesCalibrationPattern(root, candidate.boundary),
  )) {
    const text = findCalibratedText(root, recipe);
    if (text) return normalizeUntrustedText(visibleText(text));
  }
  return '';
}

function collectCalibratedCommentRoots(
  root: Element,
  recipes: CalibratedLayoutRecipe[],
  exactBoundaries: readonly Element[] = [],
): Element[] {
  const matches: Element[] = [];
  for (const recipe of recipes.filter((candidate) => candidate.kind === 'comment')) {
    for (const candidate of root.querySelectorAll(recipe.boundary.tag)) {
      if (
        !exactBoundaries.includes(candidate) &&
        isElementVisible(candidate as HTMLElement) &&
        matchesCalibrationPattern(candidate, recipe.boundary) &&
        findCalibratedText(candidate, recipe) &&
        extractCalibratedProfileName(candidate, recipe)
      ) {
        matches.push(candidate);
      }
    }
  }
  return matches;
}

function extractCalibratedProfileName(root: Element, recipe: CalibratedLayoutRecipe): string {
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]')) {
    if (findCalibratedAncestor(link, recipe) !== root || !isElementVisible(link)) continue;
    const name = extractProfileNameFromLink(link);
    if (name) return name;
  }
  return '';
}

function mergeElementMatches(first: Element[], second: Element[]): Element[] {
  const set = new Set([...first, ...second]);
  return [...set].sort((left, right) => {
    if (left === right) return 0;
    const position = left.compareDocumentPosition(right);
    return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
}

function collectCommentText(root: Element, selectors: readonly string[]): string {
  const commentSelector = COMMENT_SELECTORS.join(',');
  const candidates = selectors
    .flatMap((selector) => [...root.querySelectorAll(selector)])
    .filter((candidate) => candidate.closest(commentSelector) === root);
  const topLevel = candidates.filter(
    (candidate) => !candidates.some((other) => other !== candidate && other.contains(candidate)),
  );
  return normalizeUntrustedText(
    topLevel
      .map((element) => visibleText(element))
      .filter(Boolean)
      .join('\n'),
  );
}

function extractPostAuthor(root: Element): string {
  for (const control of root.querySelectorAll('[aria-label]')) {
    const label = normalizeUntrustedText(control.getAttribute('aria-label') ?? '');
    const match = label.match(/^(?:Open control menu|Hide post) for post by (.+)$/iu);
    if (match?.[1]) return cleanProfileName(match[1]);
  }
  const namedAuthor = collectFirstText(root, POST_AUTHOR_SELECTORS, COMMENT_SELECTORS);
  if (namedAuthor) return namedAuthor;

  const profileName = extractProfileName(root, false);
  if (profileName) return profileName;

  for (const containerSelector of POST_ACTOR_CONTAINER_SELECTORS) {
    for (const container of root.querySelectorAll(containerSelector)) {
      if (!isElementVisible(container as HTMLElement)) continue;
      for (const link of container.querySelectorAll<HTMLAnchorElement>(
        ACTOR_PROFILE_LINK_SELECTOR,
      )) {
        const linkText = normalizeUntrustedText(visibleText(link));
        if (linkText) return linkText;
      }
    }
  }
  return '';
}

function isExplicitPostCommentary(element: Element): boolean {
  const commentary = element.closest('[id^="translatable-commentary-"]');
  return commentary?.id.includes('contentUrnCommentUrn=null') ?? false;
}

function extractProfileName(root: Element, commentOnly: boolean): string {
  const commentSelector = COMMENT_SELECTORS.join(',');
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]')) {
    const owningComment = link.closest(commentSelector);
    if (commentOnly ? owningComment !== root : Boolean(owningComment)) continue;
    if (!isElementVisible(link)) continue;

    const name = extractProfileNameFromLink(link);
    if (name) return name;
  }
  return '';
}

function extractProfileNameFromLink(link: HTMLAnchorElement): string {
  for (const candidate of link.querySelectorAll<HTMLElement>('img[alt], svg[aria-label]')) {
    const label = candidate.getAttribute('alt') ?? candidate.getAttribute('aria-label') ?? '';
    const name = profileNameFromLabel(label);
    if (name) return name;
  }

  for (const candidate of link.querySelectorAll<HTMLElement>('[aria-label]')) {
    const name = profileNameFromLabel(candidate.getAttribute('aria-label') ?? '');
    if (name) return name;
  }

  const visualName = link.querySelector('[aria-hidden="true"]');
  return cleanProfileName(visualName?.textContent ?? '');
}

function profileNameFromLabel(label: string): string {
  const normalized = normalizeUntrustedText(label);
  const profileLabel = normalized.match(/^View (.+?)[\u2019']s profile(?:,\s*open to work)?$/iu);
  if (profileLabel?.[1]) return cleanProfileName(profileLabel[1]);
  const organizationLabel = normalized.match(/^View (?:company|school|showcase):\s*(.+)$/iu);
  if (organizationLabel?.[1]) return cleanProfileName(organizationLabel[1]);
  if (/\bVerified Profile\b|\b(?:1st|2nd|3rd)\s*$/i.test(normalized)) {
    return cleanProfileName(normalized);
  }
  return '';
}

function cleanProfileName(value: string): string {
  return normalizeUntrustedText(value)
    .replace(/,?\s+Open to work(?=\s|$)/giu, '')
    .replace(/\s+Verified Profile(?=\s|$)/gi, '')
    .replace(/\s+Premium Profile(?=\s|$)/gi, '')
    .replace(/\s*[\u2022\u00b7]?\s*(?:1st|2nd|3rd)\s*$/i, '')
    .trim();
}

function collectFirstText(
  root: Element,
  selectors: readonly string[],
  excludedAncestors: readonly string[] = [],
): string {
  for (const selector of selectors) {
    for (const candidate of root.querySelectorAll(selector)) {
      if (excludedAncestors.some((excluded) => candidate.closest(excluded)?.matches(excluded))) {
        continue;
      }
      const text = normalizeUntrustedText(visibleText(candidate));
      if (text) return text;
    }
  }
  return '';
}

function collectText(
  root: Element,
  selectors: readonly string[],
  excludedAncestors: readonly string[] = [],
): string {
  const topLevel = topLevelCandidates(root, selectors, excludedAncestors);
  return normalizeUntrustedText(
    topLevel
      .map((element) => visibleText(element))
      .filter(Boolean)
      .join('\n'),
  );
}

function topLevelCandidates(
  root: Element,
  selectors: readonly string[],
  excludedAncestors: readonly string[] = [],
): Element[] {
  const candidates = selectors
    .flatMap((selector) => [...root.querySelectorAll(selector)])
    .filter(
      (candidate) =>
        !excludedAncestors.some((selector) => candidate.closest(selector)?.matches(selector)),
    );
  return candidates.filter(
    (candidate) => !candidates.some((other) => other !== candidate && other.contains(candidate)),
  );
}

function visibleText(element: Element): string {
  const htmlElement = element as HTMLElement;
  if (!isElementVisible(htmlElement)) return '';
  if (element.querySelector(EXPANDABLE_TEXT_CONTROL_SELECTOR)) {
    const clone = element.cloneNode(true) as Element;
    clone.querySelectorAll(EXPANDABLE_TEXT_CONTROL_SELECTOR).forEach((control) => control.remove());
    clone.querySelectorAll('br').forEach((lineBreak) => lineBreak.replaceWith('\n'));
    return clone.textContent ?? '';
  }
  return htmlElement.innerText || htmlElement.textContent || '';
}

function findTopLevelMatches(root: Element, selectors: readonly string[]): Element[] {
  return [...root.querySelectorAll(selectors.join(','))].filter((element) =>
    isElementVisible(element as HTMLElement),
  );
}

function collapseRepeatedCommentWrappers(roots: Element[]): Element[] {
  return roots.filter((candidate) => {
    const identity = commentIdentity(candidate);
    if (!identity) return true;
    return !roots.some(
      (other) =>
        other !== candidate && candidate.contains(other) && commentIdentity(other) === identity,
    );
  });
}

function commentIdentity(element: Element): string {
  for (const name of ['data-id', 'id', 'componentkey'] as const) {
    const value = element.getAttribute(name) ?? '';
    const start = value.indexOf('urn:li:comment:');
    if (start >= 0) return value.slice(start);
  }
  return '';
}

function isElementVisible(element: HTMLElement): boolean {
  if (!element.isConnected || element.hidden || element.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function semanticDepth(root: Element): 0 | 1 | null {
  const explicit = root.getAttribute('data-depth') ?? root.getAttribute('aria-level');
  const numeric = explicit ? Number(explicit) : Number.NaN;
  if (Number.isInteger(numeric) && numeric >= 0) {
    const depth = root.hasAttribute('aria-level') ? numeric - 1 : numeric;
    return depth > 0 ? 1 : 0;
  }
  if (root.closest('.comments-comment-item__replies-list, [data-view-name="comment-replies"]')) {
    return 1;
  }
  const identity = commentIdentity(root);
  let parentComment = root.parentElement?.closest(COMMENT_SELECTORS.join(',')) ?? null;
  while (parentComment && identity && commentIdentity(parentComment) === identity) {
    parentComment = parentComment.parentElement?.closest(COMMENT_SELECTORS.join(',')) ?? null;
  }
  if (parentComment && parentComment !== root) return 1;
  return null;
}

function inferVisualDepths(roots: Element[]): (0 | 1)[] | null {
  if (roots.length < 2) return null;
  const starts = roots.map(commentInlineStart);
  if (starts.some((value) => value === null)) return null;
  const measured = starts as number[];
  const minimum = Math.min(...measured);
  return measured.map((start) => (start - minimum >= MIN_REPLY_INDENT_PX ? 1 : 0));
}

function commentInlineStart(root: Element): number | null {
  const author = root.querySelector<HTMLAnchorElement>('a[href*="/in/"]');
  if (!author) return null;
  const rect = author.getBoundingClientRect();
  if (!Number.isFinite(rect.left) || (rect.width <= 0 && rect.height <= 0)) return null;
  return window.getComputedStyle(root).direction === 'rtl'
    ? window.innerWidth - rect.right
    : rect.left;
}

function findPermalink(root: Element, locationHref: string): string | undefined {
  const postUrn = findPostUrn(root);
  if (postUrn) {
    return canonicalLinkedInUrl(`https://www.linkedin.com/feed/update/${postUrn}/`);
  }
  for (const selector of PERMALINK_SELECTORS) {
    for (const link of root.querySelectorAll<HTMLAnchorElement>(selector)) {
      const candidate = canonicalLinkedInUrl(link.href);
      if (candidate) return candidate;
    }
  }
  if (detectSurface(locationHref) === 'post-detail') return canonicalLinkedInUrl(locationHref);
  return undefined;
}

function findPostUrn(root: Element): string | undefined {
  for (const candidate of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of candidate.attributes) {
      let value = attribute.value;
      for (let pass = 0; pass < 3; pass += 1) {
        const match = value.match(/urn:li:(?:activity|share|ugcPost):\d+/u);
        if (match?.[0]) return match[0];
        const shareId = value.match(/shareId=(\d+)/u)?.[1];
        if (shareId) return `urn:li:share:${shareId}`;
        try {
          const decoded = decodeURIComponent(value);
          if (decoded === value) break;
          value = decoded;
        } catch {
          break;
        }
      }
    }
  }
  return undefined;
}

function canonicalLinkedInUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase();
    if (
      url.protocol !== 'https:' ||
      (hostname !== 'linkedin.com' && !hostname.endsWith('.linkedin.com'))
    ) {
      return undefined;
    }
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.includes('/feed/update/') && !pathname.includes('/posts/')) return undefined;
    url.hostname = 'www.linkedin.com';
    url.pathname = pathname;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

function detectSurface(href: string): 'feed' | 'notifications' | 'post-detail' {
  if (href.includes('/feed/update/') || href.includes('/posts/')) return 'post-detail';
  return href.includes('/notifications/') ? 'notifications' : 'feed';
}

function unsupported(message: string, recoveryKind: 'post' | 'comment'): AppError {
  return new AppError('unsupported-layout', message, { recoveryKind });
}
