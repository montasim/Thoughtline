import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { extractLinkedInPost } from '../src/content/linkedin-extractor';
import { AppError, toAppError } from '../src/application/errors';
import { runtimeRequestSchema, type RuntimeResponse } from '../src/shared/protocol';
import {
  captureLayoutCalibration,
  clearCalibrationCapture,
  getEphemeralLayoutBindings,
  validateLayoutCalibrationProposal,
} from '../src/content/layout-calibration';

export default defineUnlistedScript(() => {
  const scope = globalThis as typeof globalThis & { __thoughtlineLinkedInLoaded?: boolean };
  if (scope.__thoughtlineLinkedInLoaded) return;
  scope.__thoughtlineLinkedInLoaded = true;

  let lastContextTarget: Element | null = null;
  document.addEventListener(
    'contextmenu',
    (event) => {
      lastContextTarget = event.target instanceof Element ? event.target : null;
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
        if (parsed.data.type !== 'content:extract-selected-post') return false;
        const ephemeral = getEphemeralLayoutBindings(lastContextTarget);
        sendResponse({
          ok: true,
          context: extractLinkedInPost(
            lastContextTarget,
            window.location.href,
            [...parsed.data.recipes, ...ephemeral.map((binding) => binding.recipe)],
            ephemeral,
            parsed.data.intent,
          ),
        });
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
