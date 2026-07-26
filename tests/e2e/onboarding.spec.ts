import AxeBuilder from '@axe-core/playwright';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defaultAppData } from '../../src/domain/schemas';
import { approvedPrototype } from '../helpers/prototype-reference';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output/chrome-mv3');
let context: BrowserContext | undefined;
let page: Page;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1000, height: 850 },
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
  page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await page.getByText('Preparing Thoughtline…').waitFor({ state: 'detached' });
  await page.evaluate(() => document.fonts.ready);
});

test.afterAll(async () => context?.close());

test.beforeEach(async () => {
  await page.setViewportSize({ width: 1000, height: 850 });
  await page.evaluate(async (app) => {
    await chrome.storage.local.set({ 'thoughtline.app-data': app });
  }, structuredClone(defaultAppData));
  await page.reload();
  await page.getByText('Preparing Thoughtline…').waitFor({ state: 'detached' });
  await page.evaluate(() => document.fonts.ready);
});

test('keeps the production setup geometry aligned with the approved prototype', async () => {
  if (!context) throw new Error('Browser context unavailable');
  const reference = await approvedPrototype(root);
  const prototype = await context.newPage();
  await prototype.setViewportSize({ width: 1000, height: 850 });
  await prototype.goto(pathToFileURL(reference.absolutePath).href);
  await prototype.locator('#scene-setup').evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) throw new Error('Setup control is unavailable.');
    element.checked = true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await prototype.evaluate(() => document.fonts.ready);

  const prototypeFrame = prototype.locator('.setup-frame:visible');
  const productionFrame = page.locator('#root > div > div').first();
  const [prototypeBox, productionBox] = await Promise.all([
    prototypeFrame.boundingBox(),
    productionFrame.boundingBox(),
  ]);
  expect(prototypeBox?.width).toBe(900);
  expect(productionBox?.width).toBe(900);
  expect(productionBox?.height).toBeGreaterThanOrEqual(690);

  const prototypeCard = prototype.locator('.setup-panel-1 .card');
  const productionCard = page.getByRole('heading', { name: 'You stay in control' }).locator('..');
  const [prototypeCardBox, productionCardBox] = await Promise.all([
    prototypeCard.boundingBox(),
    productionCard.boundingBox(),
  ]);
  expect(productionCardBox?.width).toBeCloseTo(prototypeCardBox?.width ?? 0, 0);
  expect(productionCardBox?.x).toBeCloseTo(prototypeCardBox?.x ?? 0, 0);

  await prototype.close();
});

test('opens readable and accessible Terms of Service', async () => {
  if (!context) throw new Error('Browser context unavailable');
  const href = await page.getByRole('link', { name: 'Terms of Service' }).getAttribute('href');
  expect(href).toMatch(/terms\.html$/);

  const terms = await context.newPage();
  await terms.goto(href ?? '');
  await terms.evaluate(() => document.fonts.ready);
  await expect(terms.getByRole('heading', { name: 'Terms of Service', level: 1 })).toBeVisible();
  const report = await new AxeBuilder({ page: terms }).analyze();
  expect(
    report.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);
  await terms.close();
});

test('verifies every onboarding state, required field, and accessibility boundary', async () => {
  await expect(page.getByText('Step 1 of 4')).toBeVisible();
  await expect(page.getByText('Extension-local')).toHaveCount(0);
  await expect(page.getByText('Thoughtline never posts, clicks, scrolls')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
    'href',
    /terms\.html$/,
  );
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(continueButton).toBeDisabled();
  await assertAccessible();
  await expect(page.locator('#root > div > div').first()).toHaveScreenshot(
    'onboarding-boundaries.png',
  );

  const consent = page.getByRole('checkbox');
  await consent.click();
  await expect(consent).toBeChecked();
  await continueButton.click();
  await expect(page.getByText('Step 2 of 4')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Allow LinkedIn and add your AI keys' }),
  ).toBeVisible();
  await expect(page.getByLabel('Gemini API key')).toBeVisible();
  await expect(page.getByLabel('Groq API key')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await assertAccessible();
  await expect(page.locator('#root > div > div').first()).toHaveScreenshot(
    'onboarding-connections.png',
  );

  await page.getByRole('button', { name: /^About you/ }).click();
  await expect(page.getByLabel('Your role')).toBeVisible();
  await expect(page.getByLabel('Topics you know well')).toBeVisible();
  await expect(page.getByLabel('People you want to reach')).toBeVisible();
  await expect(page.getByLabel('Default tone')).toBeVisible();
  await page.getByLabel('Your role').fill('Senior software engineer');
  await page.getByLabel('Topics you know well').fill('TypeScript, system design');
  await page.getByLabel('People you want to reach').fill('Engineering leaders');
  const saveAndContinue = page.getByRole('button', { name: 'Save and continue' });
  await expect(saveAndContinue).toBeEnabled();
  await saveAndContinue.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  await assertAccessible();
  await expect(page.locator('#root > div > div').first()).toHaveScreenshot(
    'onboarding-about-you.png',
  );
  await saveAndContinue.click();

  await expect(page.getByRole('heading', { name: 'Finish setup to continue' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start writing' })).toBeDisabled();
  await assertAccessible();
  await expect(page.locator('#root > div > div').first()).toHaveScreenshot('onboarding-ready.png');
});

test('keeps onboarding usable at the Chrome 320px minimum', async () => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole('button', { name: /^Boundaries/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(page.getByRole('navigation', { name: 'Setup steps' })).toBeVisible();
  await expect(page).toHaveScreenshot('onboarding-mobile.png');
  await assertAccessible();
});

async function assertAccessible() {
  const report = await new AxeBuilder({ page }).analyze();
  expect(
    report.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);
}
