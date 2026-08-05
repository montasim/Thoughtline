import { describe, expect, it } from 'vitest';
import { visualAppData } from '../fixtures/app-data';
import {
  evaluatePostQuality,
  evaluateReplyQuality,
  evaluateRewriteQuality,
  failedChecks,
} from '../helpers/response-quality';

describe('AI response quality gate', () => {
  const app = visualAppData();

  it('accepts grounded, distinct reply directions that follow the writing policy', () => {
    const reply = app.history.find((record) => record.type === 'reply');
    if (!reply || reply.type !== 'reply') throw new Error('Reply quality fixture missing.');
    const report = evaluateReplyQuality({
      source: `${reply.source.postExcerpt} ${reply.source.targetExcerpt}`,
      directions: reply.directions.map(({ id, generatedText }) => ({ id, text: generatedText })),
      policy: {
        requiredAnchors: ['architecture', 'pattern', 'constraint', 'assumptions'],
        forbiddenClaims: ['50% faster', 'our migration', 'guaranteed'],
        maxWords: 90,
        allowEmoji: false,
        allowHashtags: false,
      },
    });
    expect(failedChecks(report)).toEqual([]);
    expect(report.score).toBe(100);
  });

  it('accepts a rewrite only when it preserves facts and the requested meaning', () => {
    const report = evaluateRewriteQuality({
      source:
        'Our TypeScript migration reduced build time from 14 minutes to 9 minutes across 3 services.',
      output:
        'Across 3 services, our TypeScript migration cut build time from 14 minutes to 9 minutes.',
      goal: 'clearer',
      policy: {
        requiredAnchors: ['TypeScript', 'build time', 'services'],
        forbiddenClaims: ['revenue', 'zero defects', 'customer growth'],
        maxWords: 30,
        allowEmoji: false,
        allowHashtags: false,
      },
    });
    expect(failedChecks(report)).toEqual([]);
  });

  it('accepts a sourced post that stays inside the supplied evidence', () => {
    const idea = app.history.find((record) => record.type === 'idea');
    if (!idea || idea.type !== 'idea' || idea.origin.kind !== 'source') {
      throw new Error('Sourced idea quality fixture missing.');
    }
    const report = evaluatePostQuality({
      source: `${idea.origin.evidence.title} ${idea.origin.evidence.excerpt}`,
      output: idea.generatedText,
      policy: {
        requiredAnchors: ['TypeScript', 'boundaries', 'validation'],
        forbiddenClaims: ['benchmark', 'production outage', 'customers'],
        maxWords: 180,
        allowEmoji: false,
        allowHashtags: false,
      },
    });
    expect(failedChecks(report)).toEqual([]);
  });

  it('rejects plausible-sounding output that invents facts or ignores the requested direction', () => {
    const report = evaluateRewriteQuality({
      source: 'The review covered 3 services and took 14 minutes.',
      output:
        'Here is the rewritten version: The review covered 8 services, increased revenue, and took 5 minutes. 🚀 #growth',
      goal: 'shorter',
      policy: {
        requiredAnchors: ['review', 'services'],
        forbiddenClaims: ['revenue'],
        maxWords: 20,
        allowEmoji: false,
        allowHashtags: false,
      },
    });
    expect(report.passed).toBe(false);
    expect(failedChecks(report)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('forbidden claims'),
        expect.stringContaining('emoji'),
        expect.stringContaining('hashtags'),
        expect.stringContaining('factual numbers'),
        expect.stringContaining('assistant preamble'),
      ]),
    );
  });
});
