import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppData, SessionState } from '../../src/domain/schemas';
import { visualAppData, visualSession } from '../fixtures/app-data';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output/chrome-mv3');
let context: BrowserContext | undefined;
let page: Page;
let testExtensionPath: string | undefined;

test.beforeAll(async () => {
  testExtensionPath = await mkdtemp(path.join(os.tmpdir(), 'thoughtline-idea-e2e-'));
  await cp(extensionPath, testExtensionPath, { recursive: true });
  const manifestPath = path.join(testExtensionPath, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    host_permissions?: string[];
  };
  manifest.host_permissions = [...(manifest.host_permissions ?? []), 'https://dev.to/*'];
  await writeFile(manifestPath, JSON.stringify(manifest));

  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${testExtensionPath}`,
      `--load-extension=${testExtensionPath}`,
      '--no-first-run',
    ],
  });
  let worker = context.serviceWorkers()[0];
  worker ??= await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;

  await context.route('https://dev.to/api/articles**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 101,
          title: 'What AI agents reveal about production workflows',
          description: 'A field guide to reviewing autonomous development systems.',
          url: 'https://dev.to/example/ai-agents-production',
          tag_list: ['ai', 'agents', 'software-development'],
          published_at: '2026-07-27T08:00:00.000Z',
          public_reactions_count: 84,
          comments_count: 12,
        },
      ]),
    });
  });
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    ideas: [
                      {
                        sourceEvidenceId: 'dev:101',
                        title: 'AI agents need review boundaries, not just autonomy',
                        fit: 'strong',
                        rationale:
                          'This connects AI tooling with practical production review workflows.',
                        improvement: '',
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
  });

  page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 820 });
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
});

test.afterAll(async () => {
  await context?.close();
  if (testExtensionPath) await rm(testExtensionPath, { recursive: true, force: true });
});

test('collects source evidence, synthesizes it, and renders an Idea result', async () => {
  const app = visualAppData();
  app.settings.publicResearchEnabled = true;
  app.settings.selectedSources = ['dev'];
  app.profile.topics = ['AI tooling'];
  const session = visualSession('idea');
  session.ideaView = 'search';
  session.ideaSession = undefined;
  session.activeRecordId = undefined;
  await seedState(app, session);
  await page.evaluate(async () => {
    await chrome.storage.session.set({
      'thoughtline.session-credentials': {
        gemini: 'test-gemini-key',
        groq: 'test-groq-key',
      },
    });
  });

  await page.getByRole('button', { name: 'New search' }).first().click();

  await expect(page.getByText('Collecting source evidence')).toBeVisible();
  await expect(page.getByRole('heading', { name: '1 idea found' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'AI agents need review boundaries, not just autonomy' }),
  ).toBeVisible();
  await expect(page.getByText('Experience fallback')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /What AI agents reveal/u })).toHaveAttribute(
    'href',
    'https://dev.to/example/ai-agents-production',
  );
});

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
}
