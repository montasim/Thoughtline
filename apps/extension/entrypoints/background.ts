import { defineBackground } from 'wxt/utils/define-background';
import { toAppError } from '../src/application/errors';
import { LINKEDIN_ORIGIN } from '../src/infrastructure/permissions';
import { storageRepository } from '../src/infrastructure/storage/chrome-storage';
import {
  runtimeRequestSchema,
  type RuntimeRequest,
  type RuntimeResponse,
} from '../src/shared/protocol';
import { createId } from '../src/shared/id';

const CONTENT_SCRIPT_ID = 'thoughtline-linkedin';
const ROOT_MENU_ID = 'thoughtline-root';
const CONTEXT_MENU_ID = 'thoughtline-draft-reply';
const REFINE_MENU_ID = 'thoughtline-refine-post';
const CALIBRATION_ROOT_MENU_ID = 'thoughtline-calibrate';
const CALIBRATION_MENU_IDS = {
  'thoughtline-calibrate-local-post': { mode: 'local', kind: 'post' },
  'thoughtline-calibrate-local-comment': { mode: 'local', kind: 'comment' },
  'thoughtline-calibrate-ai-post': { mode: 'ai', kind: 'post' },
  'thoughtline-calibrate-ai-comment': { mode: 'ai', kind: 'comment' },
} as const;
let integrationSync = Promise.resolve();

export default defineBackground(() => {
  const ready = initialize();

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install')
      void chrome.tabs.create({ url: chrome.runtime.getURL('/onboarding.html') });
    void scheduleIntegration();
  });

  chrome.permissions.onAdded.addListener(() => void scheduleIntegration());
  chrome.permissions.onRemoved.addListener(() => void scheduleIntegration());

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (typeof tab?.id !== 'number') return;
    const tabId = tab.id;
    const frameId = info.frameId ?? 0;
    const calibration =
      typeof info.menuItemId === 'string' && info.menuItemId in CALIBRATION_MENU_IDS
        ? CALIBRATION_MENU_IDS[info.menuItemId as keyof typeof CALIBRATION_MENU_IDS]
        : null;
    const isReply = info.menuItemId === CONTEXT_MENU_ID;
    const isRefinement = info.menuItemId === REFINE_MENU_ID;
    if (!isReply && !isRefinement && !calibration) return;
    void chrome.sidePanel.open({ tabId });
    void ready.then(async () => {
      if (calibration) {
        await storageRepository.updateSession((session) => ({
          ...session,
          activeTab: 'reply',
          calibration: {
            status: 'pending',
            requestId: createId(),
            tabId,
            frameId,
            kind: calibration.kind,
            mode: calibration.mode,
            requestedAt: new Date().toISOString(),
          },
        }));
        return;
      }
      const [lease, session] = await Promise.all([
        storageRepository.getJobLease(),
        storageRepository.loadSession(),
      ]);
      if (
        lease ||
        session.analysis.status === 'pending' ||
        session.analysis.status === 'running' ||
        session.refinement.status === 'pending' ||
        session.refinement.status === 'running'
      ) {
        return;
      }
      const requestId = createId();
      if (isRefinement) {
        await storageRepository.updateSession((session) => {
          const next = {
            ...session,
            activeTab: 'generate' as const,
            refinement: {
              status: 'pending',
              requestId,
              tabId,
              frameId,
              requestedAt: new Date().toISOString(),
            } as const,
          };
          delete next.activeRecordId;
          return next;
        });
        return;
      }
      await storageRepository.updateSession((session) => ({
        ...session,
        activeTab: 'reply',
        analysis: {
          status: 'pending',
          requestId,
          tabId,
          frameId,
          requestedAt: new Date().toISOString(),
        },
      }));
    });
  });

  chrome.runtime.onMessage.addListener(
    (raw: unknown, _sender, sendResponse: (response: RuntimeResponse) => void) => {
      const parsed = runtimeRequestSchema.safeParse(raw);
      if (!parsed.success || parsed.data.type.startsWith('content:')) return false;
      void ready
        .then(() => handleRequest(parsed.data))
        .then(sendResponse)
        .catch((error: unknown) => {
          const appError = toAppError(error);
          sendResponse({ ok: false, code: appError.code, message: appError.message });
        });
      return true;
    },
  );
});

async function initialize(): Promise<void> {
  await storageRepository.initialize();
  await chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await scheduleIntegration();
}

function scheduleIntegration(): Promise<void> {
  const next = integrationSync.then(syncLinkedInIntegration);
  integrationSync = next.catch(() => undefined);
  return next;
}

async function syncLinkedInIntegration(): Promise<void> {
  const [allowed, app] = await Promise.all([
    chrome.permissions.contains({ origins: [LINKEDIN_ORIGIN] }),
    storageRepository.loadAppData(),
  ]);
  const registrations = await chrome.scripting.getRegisteredContentScripts({
    ids: [CONTENT_SCRIPT_ID],
  });
  const registration: chrome.scripting.RegisteredContentScript = {
    id: CONTENT_SCRIPT_ID,
    matches: [LINKEDIN_ORIGIN],
    js: ['linkedin.js'],
    allFrames: true,
    matchOriginAsFallback: true,
    runAt: 'document_idle',
    world: 'ISOLATED',
    persistAcrossSessions: true,
  };
  if (allowed) {
    if (registrations.length === 0) {
      await chrome.scripting.registerContentScripts([registration]);
    } else {
      await chrome.scripting.updateContentScripts([registration]);
    }
  }
  if (!allowed && registrations.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  }
  if (allowed) await injectOpenLinkedInTabs();
  await chrome.contextMenus.removeAll();
  if (allowed) {
    chrome.contextMenus.create({
      id: ROOT_MENU_ID,
      title: 'Thoughtline',
      contexts: ['all'],
      documentUrlPatterns: [LINKEDIN_ORIGIN],
    });
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      parentId: ROOT_MENU_ID,
      title: 'Draft a reply with Thoughtline',
      contexts: ['all'],
      documentUrlPatterns: [LINKEDIN_ORIGIN],
    });
    if (app.settings.contextRefinementEnabled) {
      chrome.contextMenus.create({
        id: REFINE_MENU_ID,
        parentId: ROOT_MENU_ID,
        title: 'Refine the post to make your own',
        contexts: ['all'],
        documentUrlPatterns: [LINKEDIN_ORIGIN],
      });
    }
    chrome.contextMenus.create({
      id: CALIBRATION_ROOT_MENU_ID,
      parentId: ROOT_MENU_ID,
      title: 'Calibrate Thoughtline',
      contexts: ['all'],
      documentUrlPatterns: [LINKEDIN_ORIGIN],
    });
    chrome.contextMenus.create({
      id: 'thoughtline-calibrate-local-post',
      parentId: CALIBRATION_ROOT_MENU_ID,
      title: 'This post — on device',
      contexts: ['all'],
      documentUrlPatterns: [LINKEDIN_ORIGIN],
    });
    chrome.contextMenus.create({
      id: 'thoughtline-calibrate-local-comment',
      parentId: CALIBRATION_ROOT_MENU_ID,
      title: 'This comment — on device',
      contexts: ['all'],
      documentUrlPatterns: [LINKEDIN_ORIGIN],
    });
    chrome.contextMenus.create({
      id: 'thoughtline-calibrate-ai-post',
      parentId: CALIBRATION_ROOT_MENU_ID,
      title: 'This post — with AI',
      contexts: ['all'],
      documentUrlPatterns: [LINKEDIN_ORIGIN],
    });
    chrome.contextMenus.create({
      id: 'thoughtline-calibrate-ai-comment',
      parentId: CALIBRATION_ROOT_MENU_ID,
      title: 'This comment — with AI',
      contexts: ['all'],
      documentUrlPatterns: [LINKEDIN_ORIGIN],
    });
  }
}

async function injectOpenLinkedInTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: [LINKEDIN_ORIGIN] });
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map(async (tab) => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ['linkedin.js'],
          });
        } catch {
          // Restricted LinkedIn pages can reject injection; normal navigation retries it.
        }
      }),
  );
}

async function handleRequest(request: RuntimeRequest): Promise<RuntimeResponse> {
  switch (request.type) {
    case 'integration:sync':
      await scheduleIntegration();
      return { ok: true };
    case 'analysis:get-state':
      return { ok: true, state: (await storageRepository.loadSession()).analysis };
    case 'analysis:clear-state':
      await storageRepository.updateSession((session) => ({
        ...session,
        analysis: { status: 'idle' },
      }));
      return { ok: true };
    case 'calibration:save-discovered-layout':
      if (request.recipe.validationCount >= 2 && !chrome.extension.inIncognitoContext) {
        await storageRepository.saveDiscoveredLayoutRecipe(request.recipe);
      }
      return { ok: true };
    case 'content:extract-selected-post':
    case 'content:capture-calibration':
    case 'content:validate-calibration':
    case 'content:clear-calibration':
      return { ok: false, code: 'wrong-context', message: 'LinkedIn handles this request.' };
  }
}
