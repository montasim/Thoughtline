import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  analyzeReply,
  countHashtags,
  draftPost,
  rewriteContent,
} from '../../src/application/workflows';
import { defaultAppData, type PostContext, type SourceEvidence } from '../../src/domain/schemas';
import { storageRepository } from '../../src/infrastructure/storage/chrome-storage';
import { credentialVault } from '../../src/infrastructure/storage/credential-vault';
import {
  evaluatePostQuality,
  evaluateReplyQuality,
  evaluateRewriteQuality,
  failedChecks,
} from '../helpers/response-quality';

const openrouterKey = process.env.THOUGHTLINE_OPENROUTER_API_KEY;
const geminiKey = process.env.THOUGHTLINE_GEMINI_API_KEY;
const groqKey = process.env.THOUGHTLINE_GROQ_API_KEY;
const enabled =
  process.env.THOUGHTLINE_RUN_LIVE_AI_EVALS === '1' && openrouterKey && geminiKey && groqKey;

describe.skipIf(!enabled)('live AI response quality', () => {
  beforeAll(() => {
    vi.spyOn(credentialVault, 'get').mockImplementation((provider) => {
      if (provider === 'openrouter') return Promise.resolve(openrouterKey ?? null);
      return Promise.resolve(provider === 'gemini' ? (geminiKey ?? null) : (groqKey ?? null));
    });
    const liveApp = structuredClone(defaultAppData);
    liveApp.settings.aiRouting.zeroCostConfirmed = true;
    vi.spyOn(storageRepository, 'loadAppData').mockResolvedValue(liveApp);
  });

  afterAll(() => vi.restoreAllMocks());

  it('preserves every measurable fact in a real rewrite', async () => {
    const source =
      'In Q2, our TypeScript migration reduced build time from 14 minutes to 9 minutes across 3 services.';
    const result = await rewriteContent(
      source,
      'clearer',
      '',
      defaultAppData.profile,
      defaultAppData.learnedPreferences,
      defaultAppData.settings.hashtagPolicy,
    );
    const report = evaluateRewriteQuality({
      source,
      output: result.record.generatedText,
      goal: 'clearer',
      policy: {
        requiredAnchors: ['TypeScript', 'build time', 'services'],
        forbiddenClaims: ['revenue', 'customers', 'zero defects'],
        maxWords: 45,
        allowEmoji: false,
        allowHashtags: true,
      },
    });
    expect(failedChecks(report), result.record.generatedText).toEqual([]);
    expect(countHashtags(result.record.generatedText)).toBeGreaterThanOrEqual(5);
    expect(countHashtags(result.record.generatedText)).toBeLessThanOrEqual(10);
  }, 120_000);

  it('produces four grounded, distinct reply directions from real generation', async () => {
    const context: PostContext = {
      schemaVersion: 1,
      extractionVersion: 'quality-eval-v1',
      surface: 'feed',
      author: 'Maya Chen',
      postText:
        'Runtime validation matters most where data crosses a trust boundary. Validate external inputs and third-party responses first; keep internal code lightweight.',
      postPermalink: 'https://www.linkedin.com/feed/update/urn:li:activity:123/',
      discussion: [],
      responseTarget: {
        type: 'post',
        author: 'Maya Chen',
        text: 'Runtime validation matters most where data crosses a trust boundary.',
      },
      excerpt: 'Runtime validation matters most where data crosses a trust boundary.',
      wordCount: 20,
      extractedAt: '2026-07-23T00:00:00.000Z',
    };
    const result = await analyzeReply(
      context,
      defaultAppData.profile,
      defaultAppData.learnedPreferences,
    );
    const report = evaluateReplyQuality({
      source: context.postText,
      directions: result.record.directions.map(({ id, generatedText }) => ({
        id,
        text: generatedText,
      })),
      policy: {
        requiredAnchors: ['validation', 'boundary', 'external', 'third-party'],
        forbiddenClaims: ['faster', 'revenue', 'customers', 'outage'],
        maxWords: 90,
        allowEmoji: false,
        allowHashtags: true,
      },
    });
    expect(failedChecks(report), JSON.stringify(result.record.directions, null, 2)).toEqual([]);
  }, 120_000);

  it('turns source-native evidence into a grounded, readable post', async () => {
    const source: SourceEvidence = {
      id: 'quality-source-1',
      source: 'dev',
      title: 'Runtime validation at trust boundaries',
      excerpt:
        'A checklist for prioritizing external inputs, third-party responses, and cross-service messages.',
      url: 'https://dev.to/example/runtime-validation',
      tags: ['typescript', 'validation'],
      aggregateSignal: '42 reactions',
    };
    const result = await draftPost(
      source,
      defaultAppData.profile,
      defaultAppData.learnedPreferences,
      defaultAppData.settings.hashtagPolicy,
    );
    const report = evaluatePostQuality({
      source: `${source.title} ${source.excerpt}`,
      output: result.output.post,
      policy: {
        requiredAnchors: ['validation', 'external inputs', 'third-party', 'cross-service'],
        forbiddenClaims: ['benchmark', 'outage', 'customers', 'the full article'],
        maxWords: 220,
        allowEmoji: false,
        allowHashtags: true,
      },
    });
    expect(failedChecks(report), result.output.post).toEqual([]);
  }, 120_000);
});
