import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { extractLinkedInPostSelfHealing } from '../src/content/self-healing-extractor';
import { AppError, toAppError } from '../src/application/errors';
import { runtimeRequestSchema, type RuntimeResponse } from '../src/shared/protocol';
import type { CalibratedLayoutRecipe } from '../src/domain/calibration';
import type { PostContext } from '../src/domain/schemas';
import {
  captureLayoutCalibration,
  clearCalibrationCapture,
  validateLayoutCalibrationProposal,
} from '../src/content/layout-calibration';

export default defineUnlistedScript(() => {
  const scope = globalThis as typeof globalThis & { __thoughtlineLinkedInLoaded?: boolean };
  if (scope.__thoughtlineLinkedInLoaded) return;
  scope.__thoughtlineLinkedInLoaded = true;

  let lastContextTarget: Element | null = null;
  let detectedContexts: Partial<Record<'reply' | 'refine', PostContext>> = {};
  document.addEventListener(
    'contextmenu',
    (event) => {
      lastContextTarget = event.target instanceof Element ? event.target : null;
      detectedContexts = {};
      if (!lastContextTarget) return;
      for (const intent of ['reply', 'refine'] as const) {
        try {
          const result = extractLinkedInPostSelfHealing(
            lastContextTarget,
            window.location.href,
            [],
            intent,
          );
          detectedContexts[intent] = result.context;
          saveDiscoveredLayouts(result.learnedRecipes);
        } catch {
          // Saved recipes may still recover this target when the workflow starts.
        }
      }
    },
    { capture: true, passive: true },
  );

  chrome.runtime.onMessage.addListener(
    (raw: unknown, _sender, sendResponse: (response: RuntimeResponse) => void) => {
      const parsed = runtimeRequestSchema.safeParse(raw);
      if (!parsed.success || !parsed.data.type.startsWith('content:')) return false;
      try {
        if (parsed.data.type === 'content:clear-calibration') {
          clearCalibrationCapture();
          sendResponse({ ok: true });
          return false;
        }
        if (parsed.data.type === 'content:extract-selected-post') {
          const cached = detectedContexts[parsed.data.intent];
          if (!lastContextTarget?.isConnected) {
            if (cached) {
              sendResponse({ ok: true, context: cached });
              return false;
            }
            throw new AppError(
              'no-post-found',
              'Right-click the LinkedIn post again, then choose Thoughtline.',
            );
          }
          try {
            const result = extractLinkedInPostSelfHealing(
              lastContextTarget,
              window.location.href,
              parsed.data.recipes,
              parsed.data.intent,
            );
            detectedContexts[parsed.data.intent] = result.context;
            saveDiscoveredLayouts(result.learnedRecipes);
            sendResponse({ ok: true, context: result.context });
          } catch (error) {
            if (!cached) throw error;
            sendResponse({ ok: true, context: cached });
          }
          return false;
        }
        if (!lastContextTarget?.isConnected) {
          throw new AppError(
            'no-post-found',
            'Right-click the LinkedIn post again, then choose Thoughtline.',
          );
        }
        if (parsed.data.type === 'content:capture-calibration') {
          sendResponse({
            ok: true,
            capture: captureLayoutCalibration(
              lastContextTarget,
              parsed.data.requestId,
              parsed.data.kind,
            ),
          });
          return false;
        }
        if (parsed.data.type === 'content:validate-calibration') {
          sendResponse({
            ok: true,
            candidate: validateLayoutCalibrationProposal(
              parsed.data.requestId,
              parsed.data.proposal,
              parsed.data.kind,
            ),
          });
          return false;
        }
        return false;
      } catch (error) {
        const appError = toAppError(error);
        const cause =
          appError.causeValue &&
          typeof appError.causeValue === 'object' &&
          'recipeId' in appError.causeValue &&
          typeof appError.causeValue.recipeId === 'string'
            ? appError.causeValue.recipeId
            : undefined;
        const recoveryKind =
          appError.causeValue &&
          typeof appError.causeValue === 'object' &&
          'recoveryKind' in appError.causeValue &&
          (appError.causeValue.recoveryKind === 'post' ||
            appError.causeValue.recoveryKind === 'comment')
            ? appError.causeValue.recoveryKind
            : undefined;
        sendResponse({
          ok: false,
          code: appError.code,
          message: appError.message,
          ...(cause ? { recipeId: cause } : {}),
          ...(recoveryKind ? { recoveryKind } : {}),
        });
      }
      return false;
    },
  );
});

function saveDiscoveredLayouts(recipes: CalibratedLayoutRecipe[]): void {
  for (const recipe of recipes) {
    void chrome.runtime
      .sendMessage({ type: 'calibration:save-discovered-layout', recipe })
      .catch(() => undefined);
  }
}
