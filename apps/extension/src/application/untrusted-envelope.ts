import { z } from 'zod';
import { AppError } from './errors';
import {
  postContextSchema,
  sourceEvidenceSchema,
  writingProfileSchema,
  type LearnedPreferences,
  type PostContext,
  type SourceEvidence,
  type WritingProfile,
} from '../domain/schemas';
import { calibrationEvidenceSchema, type CalibrationEvidence } from '../domain/calibration';
import { assertContextBudget, normalizeUntrustedText } from '../shared/text';

const envelopeSchema = z.object({
  boundary: z.literal('untrusted-content'),
  workflow: z.enum([
    'reply',
    'rewrite',
    'refinement',
    'ideas',
    'post',
    'profile',
    'style',
    'preferences',
    'calibration',
  ]),
  source: z.unknown(),
  profile: writingProfileSchema.optional(),
  learnedPreferences: z.string().max(2_000).optional(),
  instruction: z.string().max(1_000).optional(),
});

export function replyEnvelope(
  context: PostContext,
  profile: WritingProfile,
  learned: LearnedPreferences,
): z.infer<typeof envelopeSchema> {
  const safeContext = postContextSchema.parse(normalizeDeep(context));
  assertContextBudget([
    safeContext.postText,
    safeContext.responseTarget.text,
    ...safeContext.discussion.map((item) => item.text),
  ]);
  return envelopeSchema.parse({
    boundary: 'untrusted-content',
    workflow: 'reply',
    source: safeContext,
    profile,
    ...(learned.acceptedSummary ? { learnedPreferences: learned.acceptedSummary } : {}),
  });
}

export function rewriteEnvelope(
  original: string,
  instruction: string,
  profile: WritingProfile,
  learned: LearnedPreferences,
): z.infer<typeof envelopeSchema> {
  const normalized = normalizeUntrustedText(original);
  if (!normalized || normalized.length > 12_000) {
    throw new AppError('invalid-input', 'Paste between 1 and 12,000 characters to rewrite.');
  }
  assertContextBudget([normalized, instruction, profile.styleGuide]);
  return envelopeSchema.parse({
    boundary: 'untrusted-content',
    workflow: 'rewrite',
    source: { original: normalized },
    profile,
    ...(learned.acceptedSummary ? { learnedPreferences: learned.acceptedSummary } : {}),
    instruction: normalizeUntrustedText(instruction),
  });
}

export function refinementEnvelope(
  context: PostContext,
  experiencePerspective: string,
  retainSourceLink: boolean,
  profile: WritingProfile,
  learned: LearnedPreferences,
): z.infer<typeof envelopeSchema> {
  const safeContext = postContextSchema.parse(normalizeDeep(context));
  const experience = normalizeUntrustedText(experiencePerspective);
  if (experience.length > 2_000) {
    throw new AppError('invalid-input', 'Keep the experience perspective under 2,000 characters.');
  }
  assertContextBudget([
    safeContext.postText,
    experience,
    profile.styleGuide,
    ...profile.writingSamples,
  ]);
  return envelopeSchema.parse({
    boundary: 'untrusted-content',
    workflow: 'refinement',
    source: {
      post: {
        surface: safeContext.surface,
        author: safeContext.author,
        postText: safeContext.postText,
        ...(safeContext.postPermalink ? { postPermalink: safeContext.postPermalink } : {}),
        ...(safeContext.reactionSummary ? { reactionSummary: safeContext.reactionSummary } : {}),
        ...(safeContext.linkPreview ? { linkPreview: safeContext.linkPreview } : {}),
        excerpt: safeContext.excerpt,
        wordCount: safeContext.wordCount,
        extractedAt: safeContext.extractedAt,
      },
      experiencePerspective: experience,
      retainSourceLink: retainSourceLink && Boolean(safeContext.postPermalink),
    },
    profile,
    ...(learned.acceptedSummary ? { learnedPreferences: learned.acceptedSummary } : {}),
  });
}

export function refinementRepairEnvelope(
  context: PostContext,
  candidate: string,
  experiencePerspective: string,
  retainSourceLink: boolean,
  profile: WritingProfile,
  learned: LearnedPreferences,
): z.infer<typeof envelopeSchema> {
  const base = refinementEnvelope(
    context,
    experiencePerspective,
    retainSourceLink,
    profile,
    learned,
  );
  const normalizedCandidate = normalizeUntrustedText(candidate);
  assertContextBudget([JSON.stringify(base.source), normalizedCandidate]);
  return envelopeSchema.parse({
    ...base,
    source: {
      ...(base.source as Record<string, unknown>),
      candidateDraft: normalizedCandidate,
    },
  });
}

export function ideasEnvelope(
  evidence: SourceEvidence[],
  profile: WritingProfile,
): z.infer<typeof envelopeSchema> {
  const safeEvidence = z.array(sourceEvidenceSchema).max(30).parse(normalizeDeep(evidence));
  assertContextBudget(safeEvidence.flatMap((item) => [item.title, item.excerpt]));
  return envelopeSchema.parse({
    boundary: 'untrusted-content',
    workflow: 'ideas',
    source: safeEvidence,
    profile,
  });
}

export function postEnvelope(
  source: SourceEvidence | { lesson: string },
  profile: WritingProfile,
  learned: LearnedPreferences,
): z.infer<typeof envelopeSchema> {
  const normalized = normalizeDeep(source);
  assertContextBudget([JSON.stringify(normalized), profile.styleGuide]);
  return envelopeSchema.parse({
    boundary: 'untrusted-content',
    workflow: 'post',
    source: normalized,
    profile,
    ...(learned.acceptedSummary ? { learnedPreferences: learned.acceptedSummary } : {}),
  });
}

export function simpleEnvelope(
  workflow: 'profile' | 'style' | 'preferences',
  source: unknown,
  instruction?: string,
): z.infer<typeof envelopeSchema> {
  const normalized = normalizeDeep(source);
  assertContextBudget([JSON.stringify(normalized)]);
  return envelopeSchema.parse({
    boundary: 'untrusted-content',
    workflow,
    source: normalized,
    ...(instruction ? { instruction: normalizeUntrustedText(instruction) } : {}),
  });
}

export function calibrationEnvelope(evidence: CalibrationEvidence): z.infer<typeof envelopeSchema> {
  const normalized = calibrationEvidenceSchema.parse(normalizeDeep(evidence));
  assertContextBudget([JSON.stringify(normalized)]);
  return envelopeSchema.parse({
    boundary: 'untrusted-content',
    workflow: 'calibration',
    source: normalized,
  });
}

function normalizeDeep(value: unknown): unknown {
  if (typeof value === 'string') return normalizeUntrustedText(value);
  if (Array.isArray(value)) return value.map(normalizeDeep);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, normalizeDeep(child)]),
  );
}
