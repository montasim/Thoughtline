import { toAppError } from '../application/errors';
import type { CalibrationKind, CalibratedLayoutRecipe } from '../domain/calibration';
import type { PostContext } from '../domain/schemas';
import { createId } from '../shared/id';
import { extractLinkedInPost } from './linkedin-extractor';
import { captureLayoutCalibration, getEphemeralLayoutBindings } from './layout-calibration';

type ExtractionIntent = 'reply' | 'refine';

export interface SelfHealingExtraction {
  context: PostContext;
  learnedRecipes: CalibratedLayoutRecipe[];
}

/**
 * Retries an unsupported LinkedIn layout with the same guarded, on-device
 * inference used by manual calibration. At most one post and one comment
 * structure can be learned for a single click.
 */
export function extractLinkedInPostSelfHealing(
  target: Element,
  locationHref = window.location.href,
  recipes: CalibratedLayoutRecipe[] = [],
  intent: ExtractionIntent = 'reply',
): SelfHealingExtraction {
  const attempted = new Set<CalibrationKind>();
  const learnedRecipes: CalibratedLayoutRecipe[] = [];

  while (attempted.size < 2) {
    const bindings = getEphemeralLayoutBindings(target);
    try {
      return {
        context: extractLinkedInPost(target, locationHref, recipes, bindings, intent),
        learnedRecipes,
      };
    } catch (reason) {
      const error = toAppError(reason);
      const kind = recoveryKind(error.causeValue);
      if (error.code !== 'unsupported-layout' || !kind || attempted.has(kind)) throw reason;

      attempted.add(kind);
      try {
        const capture = captureLayoutCalibration(target, createId(), kind, false);
        if (capture.localCandidate.preview.persistent) {
          learnedRecipes.push(capture.localCandidate.recipe);
        }
      } catch {
        throw reason;
      }
    }
  }

  return {
    context: extractLinkedInPost(
      target,
      locationHref,
      recipes,
      getEphemeralLayoutBindings(target),
      intent,
    ),
    learnedRecipes,
  };
}

function recoveryKind(cause: unknown): CalibrationKind | null {
  if (!cause || typeof cause !== 'object' || !('recoveryKind' in cause)) return null;
  const value = cause.recoveryKind;
  return value === 'post' || value === 'comment' ? value : null;
}
