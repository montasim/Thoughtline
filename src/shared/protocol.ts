import { z } from 'zod';
import { analysisStateSchema, uuidSchema } from '../domain/schemas';
import {
  calibratedLayoutRecipeSchema,
  calibrationCandidateSchema,
  calibrationCaptureSchema,
  calibrationKindSchema,
  calibrationProposalSchema,
} from '../domain/calibration';

export const runtimeRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('integration:sync') }),
  z.object({ type: z.literal('analysis:get-state') }),
  z.object({ type: z.literal('analysis:clear-state') }),
  z.object({
    type: z.literal('content:extract-selected-post'),
    requestId: uuidSchema,
    recipes: z.array(calibratedLayoutRecipeSchema).max(32).default([]),
  }),
  z.object({
    type: z.literal('content:capture-calibration'),
    requestId: uuidSchema,
    kind: calibrationKindSchema,
  }),
  z.object({
    type: z.literal('content:validate-calibration'),
    requestId: uuidSchema,
    kind: calibrationKindSchema,
    proposal: calibrationProposalSchema,
  }),
  z.object({ type: z.literal('content:clear-calibration') }),
]);
export type RuntimeRequest = z.infer<typeof runtimeRequestSchema>;

export const runtimeResponseSchema = z.union([
  z.object({ ok: z.literal(true), context: z.unknown() }),
  z.object({ ok: z.literal(true), capture: calibrationCaptureSchema }),
  z.object({ ok: z.literal(true), candidate: calibrationCandidateSchema }),
  z.object({ ok: z.literal(true), state: analysisStateSchema }),
  z.object({ ok: z.literal(true) }).strict(),
  z.object({
    ok: z.literal(false),
    code: z.string(),
    message: z.string(),
    recipeId: uuidSchema.optional(),
    recoveryKind: calibrationKindSchema.optional(),
  }),
]);
export type RuntimeResponse = z.infer<typeof runtimeResponseSchema>;

export async function sendRuntimeMessage(request: RuntimeRequest): Promise<RuntimeResponse> {
  return runtimeResponseSchema.parse(await chrome.runtime.sendMessage(request));
}
