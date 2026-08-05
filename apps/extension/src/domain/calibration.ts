import { z } from 'zod';

const calibrationIsoDateSchema = z.iso.datetime();
const calibrationUuidSchema = z.uuid();

export const calibrationKindSchema = z.enum(['post', 'comment']);
export type CalibrationKind = z.infer<typeof calibrationKindSchema>;

export const calibrationModeSchema = z.enum(['local', 'ai']);
export type CalibrationMode = z.infer<typeof calibrationModeSchema>;

export const calibrationSurfaceSchema = z.enum(['feed', 'notifications', 'post-detail']);
export type CalibrationSurface = z.infer<typeof calibrationSurfaceSchema>;

export const calibrationAttributeSchema = z.object({
  name: z.enum(['role', 'data-testid', 'data-test-id', 'componentkey', 'id', 'href']),
  operator: z.enum(['equals', 'prefix', 'contains']),
  value: z.string().trim().min(1).max(160),
});
export type CalibrationAttribute = z.infer<typeof calibrationAttributeSchema>;

export const calibrationCapabilitySchema = z.enum([
  'profile-link',
  'primary-text',
  'reply-control',
  'comment-control',
  'feed-heading',
]);
export type CalibrationCapability = z.infer<typeof calibrationCapabilitySchema>;

export const calibrationNodePatternSchema = z.object({
  tag: z.string().trim().min(1).max(24),
  attributes: z.array(calibrationAttributeSchema).max(6),
  capabilities: z.array(calibrationCapabilitySchema).max(5),
});
export type CalibrationNodePattern = z.infer<typeof calibrationNodePatternSchema>;

export const calibratedLayoutRecipeSchema = z.object({
  schemaVersion: z.literal(1),
  id: calibrationUuidSchema,
  kind: calibrationKindSchema,
  surface: calibrationSurfaceSchema,
  status: z.enum(['active', 'quarantined']),
  boundary: calibrationNodePatternSchema,
  primaryText: calibrationNodePatternSchema,
  authorStrategy: z.enum(['profile-metadata', 'visible-text', 'neutral']),
  validationCount: z.number().int().min(1).max(120),
  createdAt: calibrationIsoDateSchema,
  updatedAt: calibrationIsoDateSchema,
  lastSuccessfulAt: calibrationIsoDateSchema.optional(),
  quarantinedAt: calibrationIsoDateSchema.optional(),
  quarantineReason: z.string().trim().max(300).optional(),
});
export type CalibratedLayoutRecipe = z.infer<typeof calibratedLayoutRecipeSchema>;

export const calibratedLayoutRecipeListSchema = z
  .array(calibratedLayoutRecipeSchema)
  .max(32)
  .superRefine((recipes, context) => {
    recipes.forEach((recipe, index) => {
      if (recipe.validationCount < 2) {
        context.addIssue({
          code: 'custom',
          path: [index, 'validationCount'],
          message: 'Persistent calibrated layouts require two visible examples.',
        });
      }
    });
  });

export const calibrationRectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
});
export type CalibrationRect = z.infer<typeof calibrationRectSchema>;

export const calibrationEvidenceNodeSchema = z.object({
  id: z.string().regex(/^n\d+$/),
  parentId: z
    .string()
    .regex(/^n\d+$/)
    .optional(),
  tag: z.string().trim().min(1).max(24),
  role: z.string().trim().max(80).optional(),
  attributes: z.record(z.string().max(80), z.string().max(500)),
  text: z.string().max(1_200),
  depth: z.number().int().min(0).max(12),
  rect: calibrationRectSchema,
  target: z.boolean(),
});
export type CalibrationEvidenceNode = z.infer<typeof calibrationEvidenceNodeSchema>;

export const calibrationEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  requestId: calibrationUuidSchema,
  kind: calibrationKindSchema,
  surface: calibrationSurfaceSchema,
  targetNodeId: z.string().regex(/^n\d+$/),
  region: calibrationRectSchema,
  nodes: z.array(calibrationEvidenceNodeSchema).min(1).max(180),
  nodeCount: z.number().int().min(1).max(180),
  characterCount: z.number().int().nonnegative().max(30_000),
});
export type CalibrationEvidence = z.infer<typeof calibrationEvidenceSchema>;

export const calibrationProposalSchema = z.object({
  schemaVersion: z.literal(1),
  boundaryNodeId: z.string().regex(/^n\d+$/),
  primaryTextNodeId: z.string().regex(/^n\d+$/),
  authorNodeId: z
    .string()
    .regex(/^n\d+$/)
    .nullable(),
  explanation: z.string().trim().min(1).max(500),
});
export type CalibrationProposal = z.infer<typeof calibrationProposalSchema>;

export const calibrationPreviewSchema = z.object({
  kind: calibrationKindSchema,
  author: z.string().trim().min(1).max(160),
  text: z.string().trim().min(1).max(4_000),
  surface: calibrationSurfaceSchema,
  validationCount: z.number().int().min(1).max(120),
  persistent: z.boolean(),
  boundaryRect: calibrationRectSchema,
});
export type CalibrationPreview = z.infer<typeof calibrationPreviewSchema>;

export const calibrationCandidateSchema = z.object({
  preview: calibrationPreviewSchema,
  recipe: calibratedLayoutRecipeSchema,
  proposal: calibrationProposalSchema,
});
export type CalibrationCandidate = z.infer<typeof calibrationCandidateSchema>;

export const calibrationCaptureSchema = z.object({
  evidence: calibrationEvidenceSchema,
  localCandidate: calibrationCandidateSchema,
});
export type CalibrationCapture = z.infer<typeof calibrationCaptureSchema>;

export const calibrationRequestStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('idle') }),
  z.object({
    status: z.literal('pending'),
    requestId: calibrationUuidSchema,
    tabId: z.number().int().positive(),
    frameId: z.number().int().nonnegative().default(0),
    kind: calibrationKindSchema,
    mode: calibrationModeSchema,
    requestedAt: calibrationIsoDateSchema,
  }),
]);
export type CalibrationRequestState = z.infer<typeof calibrationRequestStateSchema>;
