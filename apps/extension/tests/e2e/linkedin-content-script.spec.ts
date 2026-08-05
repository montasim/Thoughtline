import { expect, test } from '@playwright/test';
import path from 'node:path';

test('the compiled content script returns the exact repeated-wrapper comment target', async ({
  page,
}) => {
  await page.setContent(repeatedModernCommentWrapperFixture());
  await page.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __thoughtlineMessageListener?: (
        request: unknown,
        sender: unknown,
        sendResponse: (response: unknown) => void,
      ) => boolean;
    };
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        runtime: {
          onMessage: {
            addListener: (
              listener: (
                request: unknown,
                sender: unknown,
                sendResponse: (response: unknown) => void,
              ) => boolean,
            ) => {
              scope.__thoughtlineMessageListener = listener;
            },
          },
        },
      },
    });
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => '20000000-0000-4000-8000-000000000001',
    });
  });
  await page.addScriptTag({
    path: path.resolve('.output/chrome-mv3/linkedin.js'),
  });

  const response = await page
    .locator('[data-target="modern-repeated-comment"]')
    .evaluate(async (target) => {
      target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true }));
      const scope = globalThis as typeof globalThis & {
        __thoughtlineMessageListener?: (
          request: unknown,
          sender: unknown,
          sendResponse: (response: unknown) => void,
        ) => boolean;
      };
      if (!scope.__thoughtlineMessageListener) {
        throw new Error('Compiled Thoughtline listener was not registered.');
      }
      return new Promise<unknown>((resolve) => {
        scope.__thoughtlineMessageListener!(
          {
            type: 'content:extract-selected-post',
            requestId: '10000000-0000-4000-8000-000000000099',
            recipes: [],
          },
          {},
          resolve,
        );
      });
    });

  expect(response).toMatchObject({
    ok: true,
    context: {
      responseTarget: {
        type: 'comment',
        author: 'Abdur Rahim Sheikh',
        text: 'You missed pgvector. They literally let you query vector like we do in db.',
      },
      discussion: [
        {
          author: 'Abdur Rahim Sheikh',
          depth: 0,
          isTarget: true,
        },
      ],
    },
  });
});

function repeatedModernCommentWrapperFixture(): string {
  const commentKey =
    'replaceableComment_urn:li:comment:(urn:li:activity:7488065789913133056,7488282867484262400)';
  return `
    <style>
      * { min-width: 1px; min-height: 1px; }
    </style>
    <div id="expanded-modern-FeedType_FEED_DETAIL">
      <div role="listitem" componentkey="expanded-modern-FeedType_FEED_DETAIL">
        <h2><span>Feed post</span></h2>
        <a href="https://www.linkedin.com/in/montasim/">
          <img alt="View Mohammad Montasim Al Mamun Shuvo’s profile" />
        </a>
        <p>
          <span data-testid="expandable-text-box">
            PostgreSQL কেন এখন ডেভেলপারদের প্রথম পছন্দ?
          </span>
        </p>
        <a href="https://www.linkedin.com/feed/update/urn:li:activity:7488065789913133056/">
          Open post
        </a>
        <div componentkey="${commentKey}">
          <div id="${commentKey}" componentkey="${commentKey}">
            <div componentkey="${commentKey}">
              <a href="https://www.linkedin.com/in/abdur-rahim-sheikh/">
                <img alt="View Abdur Rahim Sheikh’s profile, open to work" />
                <span aria-hidden="true">Abdur Rahim Sheikh • 1st</span>
              </a>
              <p>
                <span
                  data-target="modern-repeated-comment"
                  data-testid="expandable-text-box"
                >
                  You missed pgvector. They literally let you query vector like we do in db.
                </span>
              </p>
              <button aria-label="Reply">Reply</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}
