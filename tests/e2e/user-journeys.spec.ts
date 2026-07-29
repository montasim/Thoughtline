import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppData, SessionState } from '../../src/domain/schemas';
import { visualAppData, visualSession } from '../fixtures/app-data';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output/chrome-mv3');
let context: BrowserContext | undefined;
let page: Page;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
    ],
  });
  let worker = context.serviceWorkers()[0];
  worker ??= await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  await installProviderRoutes(context);
  page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 820 });
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
});

test.afterAll(async () => context?.close());

test('a writer can refine pasted content, choose a custom goal, and resume after reopening', async () => {
  const session = visualSession('generate');
  session.activeRecordId = undefined;
  session.generateCompose = { original: '', goal: 'clearer', customGoal: '' };
  await seedState(visualAppData(), session);

  await page.getByRole('button', { name: 'Refine content' }).click();
  await expect(page.getByRole('alert')).toContainText('Paste between 1 and 12,000 characters');

  await page
    .getByLabel('Content to refine')
    .fill('The migration worked, but our review did not explain which boundary carried the risk.');
  await page.getByLabel('Refinement goal').click();
  await page.getByRole('option', { name: 'Custom goal' }).click();
  await page.getByLabel('Custom goal').fill('Make the trade-off explicit and keep it concise.');

  await expect
    .poll(async () => (await readSession()).generateCompose)
    .toEqual({
      original:
        'The migration worked, but our review did not explain which boundary carried the risk.',
      goal: 'custom',
      customGoal: 'Make the trade-off explicit and keep it concise.',
    });

  await reload();
  await expect(page.getByLabel('Content to refine')).toHaveValue(
    'The migration worked, but our review did not explain which boundary carried the risk.',
  );
  await expect(page.getByLabel('Refinement goal')).toContainText('Custom goal');
  await expect(page.getByLabel('Custom goal')).toHaveValue(
    'Make the trade-off explicit and keep it concise.',
  );
});

test('a writer with validated credentials can complete a refinement', async () => {
  const session = visualSession('generate');
  session.activeRecordId = undefined;
  await seedState(visualAppData(), session);
  await seedCredentials();
  await page
    .getByLabel('Content to refine')
    .fill('The review worked, but the trade-off remained implicit.');
  await page.getByRole('button', { name: 'Refine content' }).click();

  await expect(page.getByRole('heading', { name: 'Your refined version' })).toBeVisible();
  const editableRefinement = page.getByLabel('Editable refinement');
  const refinedText = await editableRefinement.inputValue();
  expect(refinedText).toContain('The review succeeded, but its trade-off remained implicit.');
  const manualHashtagCount = refinedText.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  expect(manualHashtagCount).toBeGreaterThanOrEqual(5);
  expect(manualHashtagCount).toBeLessThanOrEqual(10);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (value: string) => {
          sessionStorage.setItem('thoughtline.test-clipboard', value);
          return Promise.resolve();
        },
      },
    });
  });
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('thoughtline.test-clipboard'))).toBe(
    refinedText,
  );
  await expect
    .poll(
      async () => (await readApp()).history.filter((record) => record.type === 'rewrite').length,
    )
    .toBe(2);
});

test('a writer can confirm a captured LinkedIn post and create a profile-grounded version', async () => {
  const session = visualSession('generate');
  session.activeRecordId = undefined;
  session.refinement = {
    status: 'review',
    requestId: '20000000-0000-4000-8000-000000000001',
    tabId: 1,
    frameId: 0,
    context: {
      schemaVersion: 1,
      extractionVersion: 'test-v1',
      surface: 'feed',
      author: 'Maya Chen',
      postText:
        'Architecture decisions become expensive when their assumptions outlive the context that created them.',
      discussion: [],
      responseTarget: {
        type: 'post',
        author: 'Maya Chen',
        text: 'Architecture decisions become expensive when their assumptions outlive the context that created them.',
      },
      excerpt:
        'Architecture decisions become expensive when their assumptions outlive the context that created them.',
      wordCount: 13,
      extractedAt: '2026-07-26T10:00:00.000Z',
    },
    experiencePerspective: '',
    experienceConfirmed: false,
    retainSourceLink: false,
    capturedAt: '2026-07-26T10:00:00.000Z',
  };
  await seedState(visualAppData(), session);
  await seedCredentials();

  await expect(
    page.getByRole('heading', { name: 'Review the source and your lens' }),
  ).toBeVisible();
  await page
    .getByLabel('Experience perspective')
    .fill('I used reversible decision records during a TypeScript migration.');
  const experienceConfirmation = page.getByLabel(
    /I confirm Thoughtline may use only the experience/u,
  );
  await experienceConfirmation.check();
  await expect(experienceConfirmation).toHaveCSS('accent-color', 'rgb(54, 95, 145)');
  const sourceLinkSwitch = page.getByRole('switch', { name: 'Keep original source link' });
  await expect(sourceLinkSwitch).not.toBeChecked();
  await sourceLinkSwitch.click();
  await expect(sourceLinkSwitch).toBeChecked();
  const createVersion = page.getByRole('button', { name: 'Create my version' });
  await expect(createVersion).toBeEnabled();
  await createVersion.click();
  const sourceLinkInput = page.getByLabel(/Original LinkedIn post link/u);
  await expect(sourceLinkInput).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('Paste a complete LinkedIn post');
  await sourceLinkInput.fill('https://www.linkedin.com/feed/update/urn:li:activity:123/?trk=feed');
  await createVersion.click();

  await expect(page.getByRole('heading', { name: 'Your version is ready' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate image' })).toBeVisible();
  const groundingItem = page.getByRole('button', { name: 'Grounding report' }).locator('../..');
  const sourceItem = page
    .getByRole('button', { name: 'Original source and provenance' })
    .locator('../..');
  const [groundingBox, sourceBox] = await Promise.all([
    groundingItem.boundingBox(),
    sourceItem.boundingBox(),
  ]);
  expect(groundingBox).not.toBeNull();
  expect(sourceBox).not.toBeNull();
  expect(sourceBox!.y - (groundingBox!.y + groundingBox!.height)).toBeGreaterThanOrEqual(11);
  const editableContextRefinement = page.getByLabel('Editable refined post');
  await expect(editableContextRefinement).toHaveValue(
    /The review succeeded, but its trade-off remained implicit\.[\s\S]*https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:activity:123\//u,
  );
  const contextHashtagCount =
    (await editableContextRefinement.inputValue()).match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  expect(contextHashtagCount).toBeGreaterThanOrEqual(5);
  expect(contextHashtagCount).toBeLessThanOrEqual(10);
  await expect
    .poll(() =>
      editableContextRefinement.evaluate(
        (textarea) => textarea.scrollHeight <= textarea.clientHeight + 1,
      ),
    )
    .toBe(true);
  const smoothEdit = '\n\nThe final decision still belongs to the team.';
  await editableContextRefinement.press('ControlOrMeta+End');
  await editableContextRefinement.pressSequentially(smoothEdit, { delay: 5 });
  await expect(editableContextRefinement).toHaveValue(new RegExp(`${smoothEdit.trim()}$`, 'u'));
  await expect
    .poll(async () => {
      const result = (await readApp()).history.find(
        (record) => record.type === 'rewrite' && record.mode === 'context',
      );
      return result?.type === 'rewrite'
        ? {
            author: result.source?.author,
            experience: result.experiencePerspective,
            retained: result.retainSourceLink,
            hasAttribution: result.currentText.includes(
              'https://www.linkedin.com/feed/update/urn:li:activity:123/',
            ),
            hasSmoothEdit: result.currentText.endsWith(smoothEdit.trim()),
            hashtagCount: result.currentText.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0,
          }
        : null;
    })
    .toEqual({
      author: 'Maya Chen',
      experience: 'I used reversible decision records during a TypeScript migration.',
      retained: true,
      hasAttribution: true,
      hasSmoothEdit: true,
      hashtagCount: contextHashtagCount,
    });
});

test('a writer can turn a real lesson into an AI-assisted evergreen post', async () => {
  const session = visualSession('idea');
  session.ideaView = 'experience';
  session.activeRecordId = undefined;
  session.experienceLesson = '';
  await seedState(visualAppData(), session);
  await seedCredentials();

  await page
    .getByLabel('Your lesson')
    .fill('We reduced review churn when every migration named the riskiest boundary first.');
  await page.getByRole('button', { name: 'Create evergreen post' }).click();

  await expect(page.getByRole('heading', { name: 'Your post' })).toBeVisible();
  await expect(page.getByLabel('Editable post')).toHaveValue(/risk boundary/u);
  await expect
    .poll(async () => (await readApp()).history.filter((record) => record.type === 'idea').length)
    .toBe(2);
});

test('a writer can choose, edit, rate, and reopen a reply direction', async () => {
  await seed('reply');
  const editedReply = 'Which constraint would make this architecture decision worth revisiting?';

  await page.getByRole('tab', { name: 'Question' }).click();
  await page.getByLabel('Editable reply').fill(editedReply);
  await page.getByRole('button', { name: 'Like this writing', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Like this writing', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');

  await expect
    .poll(async () => {
      const app = await readApp();
      const reply = app.history.find((record) => record.type === 'reply');
      return reply?.type === 'reply'
        ? reply.directions.find((direction) => direction.id === 'question')?.currentText
        : undefined;
    })
    .toBe(editedReply);

  await reload();
  await expect(page.getByRole('tab', { name: 'Question' })).toHaveAttribute('data-state', 'active');
  await expect(page.getByLabel('Editable reply')).toHaveValue(editedReply);
  await expect(
    page.getByRole('button', { name: 'Like this writing', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('regenerating one reply keeps the surrounding analysis in place', async () => {
  await seed('reply');
  await seedCredentials();

  await page.getByRole('button', { name: 'Regenerate' }).click();

  await expect(page.getByRole('status')).toContainText('Rewriting Insight');
  await expect(page.getByText('LinkedIn post summary')).toBeVisible();
  await expect(page.getByText('Source and reasoning')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Analyzing the selected discussion' }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Editable reply')).toHaveValue(
    'A fresh grounded reply for the selected direction.',
  );
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('a writer can edit a sourced idea post and reopen the saved draft', async () => {
  await seed('idea');
  const editedPost =
    'Validate the boundaries where data changes trust levels. Keep the rest lightweight and reviewable.';

  await page.getByRole('button', { name: 'Create a post from this idea' }).first().click();
  await expect(page.getByRole('heading', { name: 'Your post' })).toBeVisible();
  await page.getByLabel('Editable post').fill(editedPost);
  await page.getByRole('button', { name: 'Like this writing', exact: true }).click();

  await expect
    .poll(async () => {
      const app = await readApp();
      const idea = app.history.find((record) => record.type === 'idea');
      return idea?.type === 'idea' ? idea.currentText : undefined;
    })
    .toBe(editedPost);

  await page.getByRole('button', { name: 'Back to ideas' }).click();
  await page.getByRole('button', { name: 'Create a post from this idea' }).first().click();
  await expect(page.getByLabel('Editable post')).toHaveValue(editedPost);
  await expect(
    page.getByRole('button', { name: 'Like this writing', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('a writer can search, filter, cancel deletion, and delete one History item', async () => {
  await seed('history');
  await page.getByLabel('Filter History').click();
  await page.getByRole('option', { name: 'Refinements' }).click();
  const deleteRewrite = page.getByRole('button', {
    name: 'Delete Typescript makes boundary validation important.',
  });
  await expect(deleteRewrite).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Delete Architecture decisions/ })).toHaveCount(0);

  await page.getByLabel('Search History').fill('no result should match');
  await expect(page.getByRole('heading', { name: 'No matching history' })).toBeVisible();
  await page.getByLabel('Search History').fill('TypeScript');
  await expect(deleteRewrite).toHaveCount(1);

  await deleteRewrite.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(deleteRewrite).toHaveCount(1);

  await deleteRewrite.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { name: 'No matching history' })).toBeVisible();
  await expect.poll(async () => (await readApp()).history.length).toBe(2);
});

test('settings changes persist after navigating away and reopening the extension', async () => {
  await seed('settings');
  await page.getByRole('button', { name: /Writing preferences/ }).click();

  const language = page.getByRole('combobox').nth(1);
  await language.click();
  await page.getByRole('option', { name: 'Bangla' }).click();
  const length = page.getByRole('combobox').nth(2);
  await length.click();
  await page.getByRole('option', { name: 'Concise' }).click();

  await page.getByRole('button', { name: 'Idea', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Writing preferences/ }).click();
  await expect(page.getByRole('combobox').nth(1)).toContainText('Bangla');
  await expect(page.getByRole('combobox').nth(2)).toContainText('Concise');

  await reload();
  await page.getByRole('button', { name: /Writing preferences/ }).click();
  await expect(page.getByRole('combobox').nth(1)).toContainText('Bangla');
  await expect(page.getByRole('combobox').nth(2)).toContainText('Concise');
});

async function seed(activeTab: SessionState['activeTab']) {
  await seedState(visualAppData(), visualSession(activeTab));
}

async function seedState(app: AppData, session: SessionState) {
  await page.evaluate(
    async ({ appData, sessionData }) => {
      await chrome.storage.local.set({ 'thoughtline.app-data': appData });
      await chrome.storage.session.set({ 'thoughtline.session': sessionData });
    },
    { appData: app, sessionData: session },
  );
  await reload();
}

async function reload() {
  await page.reload();
  await expect(page.getByText('Opening view…')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

async function readApp(): Promise<AppData> {
  return page.evaluate(async () => {
    const values = await chrome.storage.local.get('thoughtline.app-data');
    return values['thoughtline.app-data'] as AppData;
  });
}

async function readSession(): Promise<SessionState> {
  return page.evaluate(async () => {
    const values = await chrome.storage.session.get('thoughtline.session');
    return values['thoughtline.session'] as SessionState;
  });
}

async function seedCredentials() {
  await page.evaluate(async () => {
    await chrome.storage.session.set({
      'thoughtline.session-credentials': {
        gemini: 'test-gemini-key',
        groq: 'test-groq-key',
      },
    });
  });
}

async function installProviderRoutes(browserContext: BrowserContext) {
  await browserContext.route('https://generativelanguage.googleapis.com/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    const body = route.request().postDataJSON() as {
      systemInstruction?: { parts?: Array<{ text?: string }> };
      generationConfig?: { responseFormat?: { text?: { schema?: { properties?: object } } } };
    };
    const properties = body.generationConfig?.responseFormat?.text?.schema?.properties ?? {};
    const systemInstruction = body.systemInstruction?.parts?.map(({ text }) => text).join('') ?? '';
    const refineHashtags =
      '#Architecture #SoftwareEngineering #DecisionMaking #TechLeadership #EngineeringCulture';
    const output =
      'rewrite' in properties
        ? {
            rewrite: systemInstruction.includes('Use the source post only as raw material')
              ? 'Your post offers a useful analysis of architecture decisions.'
              : `**The review succeeded**, but its trade-off remained implicit.\n\n${refineHashtags}`,
          }
        : 'text' in properties
          ? { text: 'A fresh grounded reply for the selected direction.' }
          : {
              summary: {
                english: 'Naming the riskiest boundary first reduced migration review churn.',
                bangla: 'সবচেয়ে ঝুঁকিপূর্ণ সীমা আগে চিহ্নিত করায় মাইগ্রেশন রিভিউ সহজ হয়েছে।',
              },
              post: 'Migration reviews became calmer when we named the risk boundary first.\n\nThat one decision made trade-offs explicit before the team debated tools.',
              direction: 'Share a concrete lesson about boundary-first migration reviews.',
            };
    if ('text' in properties) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }],
      }),
    });
  });

  await browserContext.route('https://api.groq.com/openai/v1/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ id: 'openai/gpt-oss-120b' }] }),
    });
  });
}
