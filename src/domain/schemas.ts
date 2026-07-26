import { z } from 'zod';
import { detectReplyLanguage, stripReplyDirectionPrefix } from '../shared/reply-text';
import { calibrationRequestStateSchema } from './calibration';

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const optionalBoundedText = (max: number) => z.string().trim().max(max).optional();
const httpsUrlSchema = z.url().refine((value) => new URL(value).protocol === 'https:', {
  message: 'Only HTTPS links are allowed.',
});
const linkedInUrlSchema = httpsUrlSchema.refine(
  (value) => new URL(value).hostname === 'www.linkedin.com',
  { message: 'Only LinkedIn post links are allowed.' },
);

export const isoDateSchema = z.iso.datetime();
export const uuidSchema = z.uuid();

export const providerNameSchema = z.enum(['gemini', 'groq']);
export type ProviderName = z.infer<typeof providerNameSchema>;

export const providerValidationSchema = z.object({
  state: z.enum(['missing', 'unvalidated', 'valid', 'invalid']),
  checkedAt: isoDateSchema.optional(),
  credentialVersion: z.number().int().nonnegative(),
});
export type ProviderValidation = z.infer<typeof providerValidationSchema>;

export const writingLanguageSchema = z.enum(['match-source', 'english', 'bangla']);
export const lengthModeSchema = z.enum(['concise', 'standard', 'detailed']);
export const toneSchema = z.enum([
  'conversational',
  'concise',
  'analytical',
  'supportive',
  'challenging',
  'custom',
]);
export const retentionPolicySchema = z.enum(['latest-20', 'latest-50', '30-days', 'forever']);
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;
export const sourceNameSchema = z.enum([
  'hacker-news',
  'dev',
  'medium',
  'lobsters',
  'stack-overflow',
]);
export type SourceName = z.infer<typeof sourceNameSchema>;

export const writingProfileSchema = z.object({
  role: z.string().trim().max(160),
  topics: z.array(boundedText(100)).max(20),
  audience: z.string().trim().max(400),
  tone: toneSchema,
  customTone: z.string().trim().max(600),
  writingLanguage: writingLanguageSchema,
  length: lengthModeSchema,
  allowEmoji: z.boolean(),
  allowHashtags: z.boolean(),
  styleGuide: z.string().trim().max(4_000),
  writingSamples: z.array(boundedText(5_000)).max(8),
});
export type WritingProfile = z.infer<typeof writingProfileSchema>;

export const learnedPreferencesSchema = z.object({
  acceptedSummary: z.string().trim().max(2_000),
  feedbackCount: z.number().int().nonnegative(),
  analyzedFeedbackIds: z.array(uuidSchema).max(100),
  directionScores: z.record(z.string(), z.number().int().min(-20).max(20)),
  featureScores: z.record(z.string(), z.number().int().min(-20).max(20)).default({}),
  scoredFeedbackIds: z.array(uuidSchema).max(100).default([]),
});
export type LearnedPreferences = z.infer<typeof learnedPreferencesSchema>;

export const consentSchema = z.object({
  accepted: z.boolean(),
  version: z.literal(1),
  acceptedAt: isoDateSchema.optional(),
});

export const appSettingsSchema = z.object({
  consent: consentSchema,
  onboardingComplete: z.boolean(),
  retention: retentionPolicySchema,
  publicResearchEnabled: z.boolean(),
  selectedSources: z.array(sourceNameSchema).min(1).max(5),
  contextRefinementEnabled: z.boolean().default(true),
  retainRefinementSourceLink: z.boolean().default(true),
  requireExperienceConfirmation: z.boolean().default(true),
  providerValidation: z.object({
    gemini: providerValidationSchema,
    groq: providerValidationSchema,
  }),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const postTargetTypeSchema = z.enum(['post', 'comment', 'reply']);
export type PostTargetType = z.infer<typeof postTargetTypeSchema>;

export const discussionItemSchema = z.object({
  id: boundedText(160),
  author: boundedText(160),
  text: boundedText(4_000),
  depth: z.union([z.literal(0), z.literal(1)]),
  isTarget: z.boolean(),
});
export type DiscussionItem = z.infer<typeof discussionItemSchema>;

export const postContextSchema = z.object({
  schemaVersion: z.literal(1),
  extractionVersion: boundedText(40),
  surface: z.enum(['feed', 'post-detail']),
  author: boundedText(160),
  postText: boundedText(12_000),
  postPermalink: linkedInUrlSchema.optional(),
  reactionSummary: optionalBoundedText(400),
  linkPreview: optionalBoundedText(1_200),
  discussion: z.array(discussionItemSchema).max(120),
  responseTarget: z.object({
    type: postTargetTypeSchema,
    author: boundedText(160),
    text: boundedText(4_000),
  }),
  excerpt: boundedText(320),
  wordCount: z.number().int().positive().max(20_000),
  extractedAt: isoDateSchema,
});
export type PostContext = z.infer<typeof postContextSchema>;

export const bilingualSummarySchema = z.object({
  english: boundedText(1_000),
  bangla: boundedText(1_000),
});
export type BilingualSummary = z.infer<typeof bilingualSummarySchema>;

export const revisionSchema = z.object({
  id: uuidSchema,
  text: boundedText(12_000),
  createdAt: isoDateSchema,
  provider: providerNameSchema,
  pinned: z.boolean(),
});
export type Revision = z.infer<typeof revisionSchema>;

export const feedbackSchema = z.object({
  id: uuidSchema,
  rating: z.enum(['liked', 'disliked']).nullable(),
  generatedText: boundedText(12_000),
  editedText: boundedText(12_000),
  createdAt: isoDateSchema,
});
export type Feedback = z.infer<typeof feedbackSchema>;

export const replyDirectionIdSchema = z.enum(['insight', 'question', 'extend', 'challenge']);
export type ReplyDirectionId = z.infer<typeof replyDirectionIdSchema>;

export const replyDirectionSchema = z.object({
  id: replyDirectionIdSchema,
  generatedText: boundedText(4_000),
  currentText: boundedText(4_000),
  approach: boundedText(800),
  revisions: z.array(revisionSchema).max(30),
  feedback: feedbackSchema.optional(),
});
export type ReplyDirection = z.infer<typeof replyDirectionSchema>;

export const replyOutputSchema = z.object({
  title: boundedText(120),
  summary: bilingualSummarySchema,
  reviewNote: z.string().trim().max(800),
  directions: z
    .array(replyDirectionSchema.omit({ revisions: true, feedback: true }))
    .length(4)
    .superRefine((value, context) => {
      const actual = new Set(value.map((item) => item.id));
      for (const id of replyDirectionIdSchema.options) {
        if (!actual.has(id))
          context.addIssue({ code: 'custom', message: `Missing ${id} direction` });
      }

      const drafts = new Map<string, number>();
      value.forEach((item, index) => {
        if (item.currentText !== item.generatedText) {
          context.addIssue({
            code: 'custom',
            message: 'The initial current text must match the generated text',
            path: [index, 'currentText'],
          });
        }

        const normalizedDraft = stripReplyDirectionPrefix(item.generatedText)
          .normalize('NFKC')
          .replace(/\s+/gu, ' ')
          .toLowerCase();
        if (!normalizedDraft) {
          context.addIssue({
            code: 'custom',
            message: 'A reply direction must contain text after its label',
            path: [index, 'generatedText'],
          });
        }
        const duplicateOf = drafts.get(normalizedDraft);
        if (duplicateOf !== undefined) {
          context.addIssue({
            code: 'custom',
            message: 'Each reply direction must contain a distinct draft',
            path: [index, 'generatedText'],
          });
        } else {
          drafts.set(normalizedDraft, index);
        }
      });
    }),
});
export type ReplyOutput = z.infer<typeof replyOutputSchema>;

export type ReplyDraftLanguage = 'english' | 'bangla' | 'mixed';

export function replyOutputSchemaForLanguage(language: ReplyDraftLanguage) {
  return replyOutputSchema.superRefine((value, context) => {
    if (language === 'mixed') return;
    value.directions.forEach((direction, index) => {
      if (detectReplyLanguage(direction.generatedText) !== language) {
        context.addIssue({
          code: 'custom',
          message: `Reply draft must be written in ${language}`,
          path: ['directions', index, 'generatedText'],
        });
      }
    });
  });
}

export const rewriteGoalSchema = z.enum([
  'clearer',
  'shorter',
  'more-professional',
  'more-conversational',
  'custom',
]);
export type RewriteGoal = z.infer<typeof rewriteGoalSchema>;

export const rewriteOutputSchema = z.object({
  rewrite: boundedText(12_000),
});

export const sourceEvidenceSchema = z.object({
  id: boundedText(240),
  source: sourceNameSchema,
  title: boundedText(320),
  excerpt: boundedText(1_500),
  url: httpsUrlSchema,
  tags: z.array(boundedText(80)).max(12),
  publishedAt: isoDateSchema.optional(),
  aggregateSignal: z.string().trim().max(240),
});
export type SourceEvidence = z.infer<typeof sourceEvidenceSchema>;

export const ideaCandidateSchema = z.object({
  id: uuidSchema,
  title: boundedText(320),
  fit: z.enum(['strong', 'good']),
  rationale: boundedText(800),
  improvement: z.string().trim().max(600),
  source: sourceEvidenceSchema,
});
export type IdeaCandidate = z.infer<typeof ideaCandidateSchema>;

export const ideaOutputSchema = z.object({
  ideas: z
    .array(
      z.object({
        sourceEvidenceId: boundedText(240),
        title: boundedText(320),
        fit: z.enum(['strong', 'good']),
        rationale: boundedText(800),
        improvement: z.string().trim().max(600),
      }),
    )
    .max(5),
});

export const postOutputSchema = z.object({
  summary: bilingualSummarySchema,
  post: boundedText(12_000),
  direction: boundedText(800),
});

const historyBaseSchema = z.object({
  id: uuidSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  provider: providerNameSchema,
});

export const replyHistorySchema = historyBaseSchema.extend({
  type: z.literal('reply'),
  title: boundedText(120).optional(),
  source: z.object({
    author: boundedText(160),
    permalink: linkedInUrlSchema.optional(),
    postExcerpt: boundedText(320),
    targetExcerpt: boundedText(800),
    wordCount: z.number().int().positive().max(20_000).optional(),
  }),
  summary: bilingualSummarySchema,
  reviewNote: z.string().trim().max(800),
  selectedDirection: replyDirectionIdSchema,
  directions: z.array(replyDirectionSchema).length(4),
});
export type ReplyHistoryRecord = z.infer<typeof replyHistorySchema>;

export const rewriteHistorySchema = historyBaseSchema.extend({
  type: z.literal('rewrite'),
  mode: z.enum(['manual', 'context']).optional(),
  original: boundedText(12_000),
  goal: rewriteGoalSchema,
  customGoal: z.string().trim().max(600),
  source: z
    .object({
      author: boundedText(160),
      permalink: linkedInUrlSchema.optional(),
      postExcerpt: boundedText(320),
      wordCount: z.number().int().positive().max(20_000).optional(),
      capturedAt: isoDateSchema,
    })
    .optional(),
  experiencePerspective: z.string().trim().max(2_000).optional(),
  retainSourceLink: z.boolean().optional(),
  grounding: z
    .object({
      profile: boundedText(600),
      tone: boundedText(600),
      preferences: boundedText(2_000),
      safeguards: z.array(boundedText(240)).max(8),
    })
    .optional(),
  generatedText: boundedText(12_000),
  currentText: boundedText(12_000),
  revisions: z.array(revisionSchema).max(30),
  feedback: feedbackSchema.optional(),
});
export type RewriteHistoryRecord = z.infer<typeof rewriteHistorySchema>;

export const ideaHistorySchema = historyBaseSchema.extend({
  type: z.literal('idea'),
  title: boundedText(320),
  origin: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('source'), evidence: sourceEvidenceSchema }),
    z.object({ kind: z.literal('experience'), lesson: boundedText(5_000) }),
  ]),
  summary: bilingualSummarySchema.optional(),
  direction: boundedText(800),
  generatedText: boundedText(12_000),
  currentText: boundedText(12_000),
  revisions: z.array(revisionSchema).max(30),
  feedback: feedbackSchema.optional(),
});
export type IdeaHistoryRecord = z.infer<typeof ideaHistorySchema>;

export const workHistoryRecordSchema = z.discriminatedUnion('type', [
  replyHistorySchema,
  rewriteHistorySchema,
  ideaHistorySchema,
]);
export type WorkHistoryRecord = z.infer<typeof workHistoryRecordSchema>;

export const appDataSchema = z.object({
  schemaVersion: z.literal(1),
  settings: appSettingsSchema,
  profile: writingProfileSchema,
  learnedPreferences: learnedPreferencesSchema,
  history: z.array(workHistoryRecordSchema).max(5_000),
});
export type AppData = z.infer<typeof appDataSchema>;

export const activeTabSchema = z.enum(['reply', 'generate', 'idea', 'history', 'settings']);
export type ActiveTab = z.infer<typeof activeTabSchema>;

export const analysisStageSchema = z.enum([
  'opening',
  'checking-setup',
  'extracting',
  'validating',
  'analyzing',
  'saving',
]);

export const analysisStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('idle') }),
  z.object({
    status: z.literal('pending'),
    requestId: uuidSchema,
    tabId: z.number().int().positive(),
    frameId: z.number().int().nonnegative().default(0),
    requestedAt: isoDateSchema,
  }),
  z.object({
    status: z.literal('running'),
    requestId: uuidSchema,
    tabId: z.number().int().positive(),
    frameId: z.number().int().nonnegative().default(0),
    stage: analysisStageSchema,
    startedAt: isoDateSchema,
  }),
  z.object({ status: z.literal('success'), requestId: uuidSchema, recordId: uuidSchema }),
  z.object({
    status: z.literal('error'),
    requestId: uuidSchema.optional(),
    code: boundedText(80),
    message: boundedText(800),
  }),
]);
export type AnalysisState = z.infer<typeof analysisStateSchema>;

export const ideaSessionSchema = z.object({
  id: uuidSchema,
  createdAt: isoDateSchema,
  candidates: z.array(ideaCandidateSchema).max(5),
  unavailableSources: z.array(sourceNameSchema).max(5),
  createdRecordIds: z.record(uuidSchema, uuidSchema),
});
export type IdeaSession = z.infer<typeof ideaSessionSchema>;

export const generateComposeSchema = z.object({
  original: z.string().max(12_000),
  goal: rewriteGoalSchema,
  customGoal: z.string().max(600),
});

export const refinementStageSchema = z.enum([
  'checking-setup',
  'extracting',
  'validating',
  'refining',
  'saving',
]);

export const refinementStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('idle') }),
  z.object({
    status: z.literal('pending'),
    requestId: uuidSchema,
    tabId: z.number().int().positive(),
    frameId: z.number().int().nonnegative().default(0),
    requestedAt: isoDateSchema,
  }),
  z.object({
    status: z.literal('running'),
    requestId: uuidSchema,
    tabId: z.number().int().positive(),
    frameId: z.number().int().nonnegative().default(0),
    stage: refinementStageSchema,
    startedAt: isoDateSchema,
  }),
  z.object({
    status: z.literal('review'),
    requestId: uuidSchema,
    tabId: z.number().int().positive(),
    frameId: z.number().int().nonnegative().default(0),
    context: postContextSchema,
    experiencePerspective: z.string().max(2_000).default(''),
    experienceConfirmed: z.boolean().default(false),
    retainSourceLink: z.boolean(),
    capturedAt: isoDateSchema,
  }),
  z.object({
    status: z.literal('success'),
    requestId: uuidSchema,
    recordId: uuidSchema,
    context: postContextSchema.optional(),
    tabId: z.number().int().positive().optional(),
    frameId: z.number().int().nonnegative().optional(),
    experiencePerspective: z.string().max(2_000).optional(),
    experienceConfirmed: z.boolean().optional(),
    retainSourceLink: z.boolean().optional(),
  }),
  z.object({
    status: z.literal('error'),
    requestId: uuidSchema.optional(),
    code: boundedText(80),
    message: boundedText(800),
  }),
]);
export type RefinementState = z.infer<typeof refinementStateSchema>;

export const sessionStateSchema = z.object({
  activeTab: activeTabSchema,
  activeRecordId: uuidSchema.optional(),
  analysis: analysisStateSchema,
  calibration: calibrationRequestStateSchema.default({ status: 'idle' }),
  refinement: refinementStateSchema.default({ status: 'idle' }),
  generateCompose: generateComposeSchema,
  ideaView: z.enum(['search', 'results', 'experience', 'post']),
  ideaSession: ideaSessionSchema.optional(),
  experienceLesson: z.string().max(5_000),
});
export type SessionState = z.infer<typeof sessionStateSchema>;

export const activeJobLeaseSchema = z.object({
  ownerId: uuidSchema,
  expiresAt: z.number().int().positive(),
});
export type ActiveJobLease = z.infer<typeof activeJobLeaseSchema>;

export const schedulePreviewSchema = z
  .object({
    enabled: z.boolean(),
    frequency: z.enum(['hourly', 'daily', 'weekly', 'monthly']),
    weekday: z
      .enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
      .optional(),
    day: z.coerce.number().int().min(1).max(28).optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a valid time.'),
    email: z.union([z.literal(''), z.email('Enter a valid email address.')]),
    emailEnabled: z.boolean(),
  })
  .superRefine((value, context) => {
    if (!value.enabled) return;
    if (value.frequency === 'weekly' && !value.weekday) {
      context.addIssue({
        code: 'custom',
        path: ['weekday'],
        message: 'Choose a weekday.',
      });
    }
    if (value.frequency === 'monthly' && value.day === undefined) {
      context.addIssue({ code: 'custom', path: ['day'], message: 'Choose a day.' });
    }
    if (value.emailEnabled && !value.email) {
      context.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Enter an email address for notifications.',
      });
    }
  });
export type SchedulePreview = z.infer<typeof schedulePreviewSchema>;

export const defaultAppData: AppData = {
  schemaVersion: 1,
  settings: {
    consent: { accepted: false, version: 1 },
    onboardingComplete: false,
    retention: 'latest-20',
    publicResearchEnabled: false,
    selectedSources: ['hacker-news', 'dev', 'medium', 'lobsters', 'stack-overflow'],
    contextRefinementEnabled: true,
    retainRefinementSourceLink: true,
    requireExperienceConfirmation: true,
    providerValidation: {
      gemini: { state: 'missing', credentialVersion: 0 },
      groq: { state: 'missing', credentialVersion: 0 },
    },
  },
  profile: {
    role: '',
    topics: [],
    audience: '',
    tone: 'conversational',
    customTone: '',
    writingLanguage: 'match-source',
    length: 'standard',
    allowEmoji: false,
    allowHashtags: false,
    styleGuide: '',
    writingSamples: [],
  },
  learnedPreferences: {
    acceptedSummary: '',
    feedbackCount: 0,
    analyzedFeedbackIds: [],
    directionScores: {},
    featureScores: {},
    scoredFeedbackIds: [],
  },
  history: [],
};

export const defaultSessionState: SessionState = {
  activeTab: 'reply',
  analysis: { status: 'idle' },
  calibration: { status: 'idle' },
  refinement: { status: 'idle' },
  generateCompose: { original: '', goal: 'clearer', customGoal: '' },
  ideaView: 'search',
  experienceLesson: '',
};

export function isProfileComplete(profile: WritingProfile): boolean {
  return (
    profile.role.trim().length > 0 &&
    profile.topics.some((topic) => topic.trim().length > 0) &&
    profile.audience.trim().length > 0
  );
}

export function isProviderReady(settings: AppSettings): boolean {
  return (
    settings.providerValidation.gemini.state === 'valid' &&
    settings.providerValidation.groq.state === 'valid'
  );
}
