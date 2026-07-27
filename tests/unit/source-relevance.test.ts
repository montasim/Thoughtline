import { afterEach, describe, expect, it, vi } from 'vitest';
import { sourceAdapters } from '../../src/infrastructure/sources/adapters';
import { selectBestCandidate } from '../../src/infrastructure/sources/source-utils';

describe('public-source relevance', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('matches meaningful words inside multi-word profile topics', () => {
    const selected = selectBestCandidate(
      'dev',
      [
        {
          id: 'unrelated',
          title: 'A guide to community conference planning',
          excerpt: 'Organizing schedules and venues.',
          url: 'https://dev.to/example/community-planning',
        },
        {
          id: 'ai-agents',
          title: 'The hidden trade-offs behind AI agents',
          excerpt: 'A practical review of autonomous development workflows.',
          url: 'https://dev.to/example/ai-agents',
          tags: ['ai', 'agents'],
        },
      ],
      ['AI tooling', 'Performance tuning in React and Next.js'],
    );

    expect(selected?.id).toBe('dev:ai-agents');
  });

  it('still rejects a source when no saved-topic terms match', () => {
    const selected = selectBestCandidate(
      'dev',
      [
        {
          id: 'gardening',
          title: 'Growing tomatoes in a small garden',
          excerpt: 'A seasonal planting guide.',
          url: 'https://dev.to/example/gardening',
        },
      ],
      ['TypeScript architecture'],
    );

    expect(selected).toBeNull();
  });

  it('searches Stack Overflow topics independently instead of requiring every tag', async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      void input;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              {
                question_id: 42,
                title: 'How should TypeScript services validate runtime boundaries?',
                link: 'https://stackoverflow.com/questions/42/runtime-boundaries',
                body: '<p>Validate data where trust levels change.</p>',
                tags: ['typescript', 'validation'],
                creation_date: 1_700_000_000,
                score: 18,
                answer_count: 3,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const selected = await sourceAdapters['stack-overflow'].findBest([
      'TypeScript architecture',
      'AI tooling',
    ]);

    expect(selected?.id).toBe('stack-overflow:42');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(([url]) =>
      typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url,
    );
    expect(urls).toEqual([
      expect.stringContaining('/search/advanced?'),
      expect.stringContaining('/search/advanced?'),
    ]);
    expect(urls[0]).toContain('q=TypeScript+architecture');
    expect(urls[1]).toContain('q=AI+tooling');
    expect(urls.join(' ')).not.toContain('tagged=');
  });
});
