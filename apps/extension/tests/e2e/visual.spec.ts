import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  defaultAppData,
  defaultSessionState,
  type AppData,
  type SessionState,
} from '../../src/domain/schemas';
import { visualAppData, visualSession } from '../fixtures/app-data';
import { approvedPrototype } from '../helpers/prototype-reference';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output');
let context: BrowserContext | undefined;
let page: Page;
let sidePanelUrl: string;

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
  sidePanelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
  page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 820 });
  await page.goto(sidePanelUrl);
});

test.afterAll(async () => context?.close());

test('keeps the five-tab shell aligned and usable at side-panel widths', async () => {
  await seed('settings');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('button')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Settings' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);

  const box = await nav.boundingBox();
  expect(box?.x).toBe(17);
  expect(box?.width).toBeGreaterThan(350);

  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 400, height: 820 });
});

test('keeps prototype typography, disclosure marks, and History storage copy aligned', async () => {
  await seed('idea');
  const ideaTitle = page.getByRole('heading', { name: '2 ideas found' });
  await expect(ideaTitle).toHaveCSS('font-size', '19px');
  await expect(page.getByText('This fits your systems perspective', { exact: false })).toHaveCSS(
    'font-size',
    '11.5px',
  );

  await seed('settings');
  const connections = page.getByRole('button', { name: /Connections/ });
  await expect(connections).toHaveAttribute('data-state', 'closed');
  await expect(connections.locator('[aria-hidden="true"]')).toBeVisible();

  const settingsSummary = page.getByText(/Senior software engineer · Engineering leaders/);
  const summaryBox = await settingsSummary.boundingBox();
  expect(summaryBox?.height).toBeLessThanOrEqual(17);

  await seed('history');
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(
    page.getByText('Stored with Chrome extension storage', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Stored with Chrome extension storage on this device. A saved draft does not mean it was posted.',
    }),
  ).toHaveCount(0);
});

test('uses a cohesive motion language and respects reduced-motion preferences', async () => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seed('idea');

  const likeIdea = page.getByRole('button', { name: 'Like idea' }).first();
  await likeIdea.click();
  await expect(likeIdea).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() => likeIdea.evaluate((element) => getComputedStyle(element).animationName))
    .toContain('action-confirm');

  const whyThisIdea = page.getByRole('button', { name: /Why this idea/ }).first();
  await whyThisIdea.click();
  const evidence = page.locator('.motion-reveal').first();
  await expect(evidence).toBeVisible();
  expect(await evidence.evaluate((element) => getComputedStyle(element).animationName)).toContain(
    'popover-arrive',
  );

  await seed('settings');
  const connections = page.getByRole('button', { name: /Connections/ });
  await connections.click();
  const connectionContent = page
    .getByText('Chrome site access—no LinkedIn account connection')
    .locator('xpath=ancestor::*[@data-state="open"][1]');
  await expect(connectionContent).toBeVisible();
  expect(
    await connectionContent.evaluate((element) => getComputedStyle(element).animationName),
  ).toContain('accordion-open');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await connectionContent.evaluate((element) => {
    const value = getComputedStyle(element).animationDuration;
    return value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1_000;
  });
  expect(duration).toBeLessThanOrEqual(0.01);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});

test('starts every tab at the top of its own scroll region', async () => {
  await seed('settings');
  await page.locator('[data-sidepanel-scroll]').evaluate((region) => region.scrollTo(0, 500));
  await page.getByRole('button', { name: 'Idea', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Thoughtline' })).toBeVisible();
  expect(await page.locator('[data-sidepanel-scroll]').evaluate((region) => region.scrollTop)).toBe(
    0,
  );
});

test('keeps the History navigation fixed while its content scrolls', async () => {
  await page.setViewportSize({ width: 400, height: 560 });
  try {
    await seed('history');
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    const scrollRegion = page.locator('[data-sidepanel-scroll]');
    const before = await navigation.boundingBox();

    expect(before).not.toBeNull();
    expect(await scrollRegion.evaluate((region) => region.scrollHeight > region.clientHeight)).toBe(
      true,
    );

    await scrollRegion.hover();
    await page.mouse.wheel(0, 10_000);
    await page.mouse.wheel(0, 10_000);

    await expect
      .poll(async () => scrollRegion.evaluate((region) => region.scrollTop))
      .toBeGreaterThan(0);
    expect(await navigation.boundingBox()).toEqual(before);
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
  } finally {
    await page.setViewportSize({ width: 400, height: 820 });
  }
});

for (const [tab, screenshot] of [
  ['reply', 'reply.png'],
  ['generate', 'generate.png'],
  ['idea', 'ideas.png'],
  ['history', 'history.png'],
  ['settings', 'settings.png'],
] as const) {
  test(`matches the approved ${tab} visual language`, async () => {
    await seed(tab);
    await expect(page).toHaveScreenshot(screenshot);
  });
}

test('matches the approved Refine compose rhythm', async () => {
  const session = visualSession('generate');
  session.activeRecordId = undefined;
  session.generateCompose = { original: '', goal: 'clearer', customGoal: '' };
  await seedState(visualAppData(), session);

  await expect(page.getByRole('heading', { name: 'Refine your content' })).toBeVisible();
  const source = page.getByLabel('Content to refine');
  const sourceLabel = page.locator('label[for="rewrite-source"]');
  const goal = page.getByLabel('Refinement goal');
  const goalLabel = page.locator('label[for="rewrite-goal"]');
  const note = page.getByText(
    'Uses your tone, writing profile, style guide, and accepted preferences.',
  );
  const submit = page.getByRole('button', { name: 'Refine content' });
  const card = source.locator('..').locator('..');

  await expect(submit).toBeEnabled();

  const [sourceBox, sourceLabelBox, goalBox, goalLabelBox, noteBox, submitBox, cardBox] =
    await Promise.all([
      source.boundingBox(),
      sourceLabel.boundingBox(),
      goal.boundingBox(),
      goalLabel.boundingBox(),
      note.boundingBox(),
      submit.boundingBox(),
      card.boundingBox(),
    ]);

  expect(sourceBox?.height).toBe(180);
  expect(sourceBox!.y - (sourceLabelBox!.y + sourceLabelBox!.height)).toBeCloseTo(8, 0);
  expect(goalBox!.y - (goalLabelBox!.y + goalLabelBox!.height)).toBeCloseTo(8, 0);
  expect(noteBox!.y - (goalBox!.y + goalBox!.height)).toBeCloseTo(8, 0);
  expect(submitBox!.y - (noteBox!.y + noteBox!.height)).toBeCloseTo(12, 0);
  // The outer-edge measurement includes the card's 1px border plus 16px padding.
  expect(cardBox!.x + cardBox!.width - (submitBox!.x + submitBox!.width)).toBeCloseTo(17, 0);
  await expect(page).toHaveScreenshot('generate-compose.png');

  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Paste between 1 and 12,000 characters');
});

test('derives Refine copy and geometry from the approved prototype', async () => {
  if (!context) throw new Error('Browser context unavailable');
  const reference = await approvedPrototype(root);
  const prototype = await context.newPage();
  await prototype.setViewportSize({ width: 400, height: 820 });
  await prototype.goto(`${pathToFileURL(reference.absolutePath).href}#generate`);
  await prototype.locator('#scene-generate').evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) throw new Error('Refine control is unavailable.');
    element.checked = true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await prototype.evaluate(() => document.fonts.ready);

  const session = visualSession('generate');
  session.activeRecordId = undefined;
  session.generateCompose = { original: '', goal: 'clearer', customGoal: '' };
  await seedState(visualAppData(), session);

  const prototypeRoot = prototype.locator('.scene-generate:visible');
  const prototypeCompose = prototypeRoot.locator('.generate-compose');
  const prototypeCopy = await prototypeCompose
    .locator(
      'h2, .page-heading p, label[for="generate-source"], label[for="generate-goal"], .generate-note, [data-generate-rewrite]',
    )
    .allTextContents();
  const productionCopy = await Promise.all([
    page.getByRole('heading', { name: 'Refine your content' }).textContent(),
    page
      .getByText('Paste text and reshape it using your saved writing profile and voice.')
      .textContent(),
    page.locator('label[for="rewrite-source"]').textContent(),
    page.locator('label[for="rewrite-goal"]').textContent(),
    page
      .getByText('Uses your tone, writing profile, style guide, and accepted preferences.')
      .textContent(),
    page.getByRole('button', { name: 'Refine content' }).textContent(),
  ]);
  expect(productionCopy.map((value) => value?.trim())).toEqual(
    prototypeCopy.map((value) => value.trim()),
  );

  const [prototypeGeometry, productionGeometry] = await Promise.all([
    formGeometry({
      card: prototypeRoot.locator('.generate-card'),
      sourceLabel: prototypeRoot.locator('label[for="generate-source"]'),
      source: prototypeRoot.locator('#generate-source'),
      goalLabel: prototypeRoot.locator('label[for="generate-goal"]'),
      goal: prototypeRoot.locator('#generate-goal'),
      note: prototypeRoot.locator('.generate-note'),
      submit: prototypeCompose.locator('[data-generate-rewrite]'),
    }),
    formGeometry({
      card: page.getByLabel('Content to refine').locator('..').locator('..'),
      sourceLabel: page.locator('label[for="rewrite-source"]'),
      source: page.getByLabel('Content to refine'),
      goalLabel: page.locator('label[for="rewrite-goal"]'),
      goal: page.getByLabel('Refinement goal'),
      note: page.getByText(
        'Uses your tone, writing profile, style guide, and accepted preferences.',
      ),
      submit: page.getByRole('button', { name: 'Refine content' }),
    }),
  ]);
  expect(productionGeometry).toEqual(prototypeGeometry);
  await prototype.close();
});

test('matches the approved collapsed Settings overview', async () => {
  await seed('idea');
  await seed('settings');
  await expect(page).toHaveScreenshot('settings-collapsed.png');
});

test('keeps calibrated layouts separate from Help & support', async () => {
  await seed('settings');
  const calibratedLayouts = page.getByRole('button', { name: /Calibrated layouts/ });
  const help = page.getByRole('button', { name: /Help & support/ });

  await expect(calibratedLayouts).toBeVisible();
  await expect(help).toBeVisible();

  await calibratedLayouts.click();
  await expect(page.getByText(/Structural recipes stay in this Chrome profile/)).toBeVisible();
  await calibratedLayouts.click();

  await help.click();
  await expect(page.getByText(/Diagnostics stay on this device/)).toBeVisible();
  await expect(page.getByText(/Structural recipes stay in this Chrome profile/)).not.toBeVisible();
});

test('keeps an added writing sample visible and opens a new textarea', async () => {
  await seed('settings');
  await page.getByRole('button', { name: /Tone & voice/ }).click();

  await page.getByLabel('New writing sample').fill('A saved writing sample.');
  await page.getByRole('button', { name: 'Add sample' }).click();

  await expect(page.getByLabel('Writing sample 1')).toHaveValue('A saved writing sample.');
  await expect(page.getByLabel('New writing sample')).toHaveValue('');
});

test('persists writing preference selections', async () => {
  await seed('settings');
  await page.getByRole('button', { name: /Writing preferences/ }).click();

  const language = page.getByRole('combobox').nth(1);
  await language.click();
  await page.getByRole('option', { name: 'Bangla' }).click();
  await expect(language).toContainText('Bangla');

  const length = page.getByRole('combobox').nth(2);
  await length.click();
  await expect(page.getByRole('option', { name: /Concise.*Up to 35 words/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Standard.*36–70 words/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Detailed.*71–120 words/ })).toBeVisible();
  await page.getByRole('option', { name: 'Concise' }).click();
  await expect(length).toContainText('Concise');

  await page.reload();
  await page.getByRole('button', { name: /Writing preferences/ }).click();
  await expect(page.getByRole('combobox').nth(1)).toContainText('Bangla');
  await expect(page.getByRole('combobox').nth(2)).toContainText('Concise');
});

test('uses compact switches for individual public sources', async () => {
  await seed('settings');
  await page.getByRole('button', { name: /Ideas & research/ }).click();

  const devSource = page.getByRole('switch', { name: 'Use DEV' });
  await expect(devSource).toBeChecked();
  const track = await devSource.locator('.switch-mini-track').boundingBox();
  expect(track?.width).toBe(25);
  expect(track?.height).toBe(14);
  await devSource.click();
  await expect(devSource).not.toBeChecked();
});

test('matches the approved Idea post editor', async () => {
  await seed('idea');
  await page.getByRole('button', { name: 'Create a post from this idea' }).first().click();
  await expect(page.getByRole('heading', { name: 'Your post' })).toBeVisible();
  await resetSidePanelScroll();
  await expect(page).toHaveScreenshot('idea-post.png');
});

test('matches the approved experience-based Idea post editor', async () => {
  const app = visualAppData();
  const experienceRecord = app.history.find((record) => record.type === 'idea');
  if (!experienceRecord || experienceRecord.type !== 'idea')
    throw new Error('Idea fixture missing.');
  experienceRecord.origin = { kind: 'experience', lesson: 'test' };
  delete experienceRecord.summary;
  experienceRecord.direction =
    'A concise, conversational LinkedIn post that shares a brief personal lesson about testing real-time AI SaaS features, highlighting the importance of early validation and continuous feedback loops.';

  const session = visualSession('idea');
  session.ideaView = 'post';
  session.activeRecordId = experienceRecord.id;
  await seedState(app, session);
  await expect(page.getByRole('heading', { name: 'Your post' })).toBeVisible();
  await expect(page).toHaveScreenshot('idea-post-experience.png');
});

test('keeps independent reply edits when switching directions', async () => {
  await seed('reply');
  const editor = page.getByLabel('Editable reply');
  await editor.fill('A deliberately edited insight.');
  await page.getByRole('tab', { name: 'Question' }).click();
  await expect(editor).toHaveValue('Which constraint would make you revisit the pattern first?');
  await page.getByRole('tab', { name: 'Insight' }).click();
  await expect(editor).toHaveValue('A deliberately edited insight.');
});

test('explains every missing setup requirement', async () => {
  const app = structuredClone(defaultAppData);
  const session = structuredClone(defaultSessionState);
  session.analysis = {
    status: 'error',
    requestId: '10000000-0000-4000-8000-000000000099',
    code: 'setup-incomplete',
    message: 'Finish setup before analyzing a LinkedIn discussion.',
  };
  await seedState(app, session);

  await expect(page.getByText('Setup checklist')).toBeVisible();
  await expect(page.getByText('4 steps need attention')).toBeVisible();
  await expect(page.getByText('Accept AI processing consent')).toBeVisible();
  await expect(page.getByText('Validate the Gemini API key')).toBeVisible();
  await expect(page.getByText('Validate the Groq API key')).toBeVisible();
  await expect(page.getByText('Add your role')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue setup' })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).include('main').analyze();
  expect(
    accessibility.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);
});

test('requires confirmation before clearing History', async () => {
  await reopenSidePanel();
  await seed('history');
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('Clear all History?');
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('3 items')).toBeVisible();

  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Clear all', exact: true })
    .click();
  await expect(page.getByText('0 items')).toBeVisible();
  await expect(page.getByText('No matching history')).toBeVisible();
});

test('validates the non-operational schedule preview without persisting it', async () => {
  await seed('idea');
  await page.getByRole('button', { name: 'Schedule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Schedule idea searches' });
  await dialog.getByRole('switch', { name: 'Enable schedule' }).click();
  await dialog.getByRole('switch', { name: 'Email results' }).click();
  await dialog.getByRole('button', { name: 'Save preview' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Enter an email address for notifications.');

  await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill('writer@example.com');
  await dialog.getByRole('button', { name: 'Save preview' }).click();
  await expect(dialog.getByRole('status')).toContainText('Scheduling becomes available');
});

test('shows scheduling beside a new idea search before results exist', async () => {
  const session = visualSession('idea');
  session.ideaView = 'search';
  session.ideaSession = undefined;
  session.activeRecordId = undefined;
  await seedState(visualAppData(), session);

  const heading = page
    .getByRole('heading', { name: 'Ideas' })
    .locator('..')
    .locator('..')
    .locator('..');
  await expect(heading.getByRole('button', { name: 'Schedule' })).toBeVisible();
  await expect(heading.getByRole('button', { name: 'New search' })).toBeVisible();
});

test('keeps every main view free of serious accessibility violations', async () => {
  for (const tab of ['reply', 'generate', 'idea', 'history', 'settings'] as const) {
    await seed(tab);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(
      accessibility.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious',
      ),
    ).toEqual([]);
  }
});

async function reopenSidePanel() {
  await page.close();
  if (!context) throw new Error('Extension browser context is unavailable.');
  page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 820 });
  await page.goto(sidePanelUrl);
}

async function seed(activeTab: 'reply' | 'generate' | 'idea' | 'history' | 'settings') {
  const app = visualAppData();
  if (activeTab !== 'history') {
    for (const record of app.history) {
      if (record.type !== 'reply') continue;
      for (const direction of record.directions) delete direction.feedback;
    }
  }
  const session = visualSession(activeTab);
  await seedState(app, session);
  await expect(
    page.getByRole('button', {
      name: activeTab === 'idea' ? 'Idea' : title(activeTab),
      exact: true,
    }),
  ).toHaveAttribute('aria-current', 'page');
}

async function seedState(app: AppData, session: SessionState) {
  await page.evaluate(
    async ({ appData, sessionData }) => {
      await chrome.storage.local.set({ 'thoughtline.app-data': appData });
      await chrome.storage.session.set({ 'thoughtline.session': sessionData });
    },
    { appData: app, sessionData: session },
  );
  await page.reload();
  await expect(page.getByText('Opening view…')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    history.scrollRestoration = 'manual';
    document.querySelector('[data-sidepanel-scroll]')?.scrollTo(0, 0);
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function resetSidePanelScroll() {
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    document.querySelector('[data-sidepanel-scroll]')?.scrollTo(0, 0);
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

function title(value: string): string {
  if (value === 'generate') return 'Refine';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function formGeometry(locators: {
  card: ReturnType<Page['locator']>;
  sourceLabel: ReturnType<Page['locator']>;
  source: ReturnType<Page['locator']>;
  goalLabel: ReturnType<Page['locator']>;
  goal: ReturnType<Page['locator']>;
  note: ReturnType<Page['locator']>;
  submit: ReturnType<Page['locator']>;
}) {
  const [card, sourceLabel, source, goalLabel, goal, note, submit] = await Promise.all([
    locators.card.boundingBox(),
    locators.sourceLabel.boundingBox(),
    locators.source.boundingBox(),
    locators.goalLabel.boundingBox(),
    locators.goal.boundingBox(),
    locators.note.boundingBox(),
    locators.submit.boundingBox(),
  ]);
  if (!card || !sourceLabel || !source || !goalLabel || !goal || !note || !submit) {
    throw new Error('The approved prototype or production form is missing required geometry.');
  }
  return {
    cardPaddingLeft: Math.round(source.x - card.x - 1),
    sourceHeight: Math.round(source.height),
    sourceLabelGap: Math.round(source.y - (sourceLabel.y + sourceLabel.height)),
    fieldGap: Math.round(goalLabel.y - (source.y + source.height)),
    goalLabelGap: Math.round(goal.y - (goalLabel.y + goalLabel.height)),
    noteGap: Math.round(note.y - (goal.y + goal.height)),
    submitGap: Math.round(submit.y - (note.y + note.height)),
    submitRightInset: Math.round(card.x + card.width - (submit.x + submit.width) - 1),
  };
}
