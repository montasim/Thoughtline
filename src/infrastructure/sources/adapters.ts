import { z } from 'zod';
import { AppError } from '../../application/errors';
import type { SourceAdapter } from '../../application/ports/source-adapter';
import type { SourceEvidence, SourceName } from '../../domain/schemas';
import { plainTextFromHtml, selectBestCandidate, type SourceCandidate } from './source-utils';

const hackerNewsItemSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().optional(),
  url: z.string().optional(),
  text: z.string().optional(),
  score: z.number().int().optional(),
  descendants: z.number().int().optional(),
  time: z.number().int().optional(),
});

class HackerNewsAdapter implements SourceAdapter {
  readonly source = 'hacker-news' as const;

  async findBest(topics: string[], signal?: AbortSignal): Promise<SourceEvidence | null> {
    const ids = z
      .array(z.number().int().positive())
      .parse(await getJson('https://hacker-news.firebaseio.com/v0/topstories.json', signal));
    const items = await Promise.all(
      ids
        .slice(0, 30)
        .map(async (id) =>
          hackerNewsItemSchema.safeParse(
            await getJson(`https://hacker-news.firebaseio.com/v0/item/${String(id)}.json`, signal),
          ),
        ),
    );
    const candidates: SourceCandidate[] = items.flatMap((result) => {
      if (!result.success || !result.data.title) return [];
      const item = result.data;
      const title = item.title;
      if (!title) return [];
      return [
        {
          id: String(item.id),
          title,
          excerpt: item.text ? plainTextFromHtml(item.text) : title,
          url: item.url ?? `https://news.ycombinator.com/item?id=${String(item.id)}`,
          ...(item.time ? { publishedAt: new Date(item.time * 1_000).toISOString() } : {}),
          signal: `${String(item.score ?? 0)} points · ${String(item.descendants ?? 0)} comments`,
        },
      ];
    });
    return selectBestCandidate(this.source, candidates, topics);
  }
}

const devArticleSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  url: z.url(),
  tag_list: z.array(z.string()),
  published_at: z.string(),
  public_reactions_count: z.number().int(),
  comments_count: z.number().int(),
});

class DevAdapter implements SourceAdapter {
  readonly source = 'dev' as const;

  async findBest(topics: string[], signal?: AbortSignal): Promise<SourceEvidence | null> {
    const items = z
      .array(devArticleSchema)
      .parse(await getJson('https://dev.to/api/articles?per_page=30&top=7', signal));
    return selectBestCandidate(
      this.source,
      items.map((item) => ({
        id: String(item.id),
        title: item.title,
        excerpt: item.description,
        url: item.url,
        tags: item.tag_list,
        publishedAt: item.published_at,
        signal: `${String(item.public_reactions_count)} reactions · ${String(item.comments_count)} comments`,
      })),
      topics,
    );
  }
}

class MediumAdapter implements SourceAdapter {
  readonly source = 'medium' as const;

  async findBest(topics: string[], signal?: AbortSignal): Promise<SourceEvidence | null> {
    const firstTopic =
      topics[0]
        ?.trim()
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, '-') || 'technology';
    const response = await fetch(
      `https://medium.com/feed/tag/${encodeURIComponent(firstTopic)}`,
      signal ? { signal } : undefined,
    );
    if (!response.ok) throw sourceUnavailable(this.source);
    const xml = new DOMParser().parseFromString(await response.text(), 'text/xml');
    const candidates = [...xml.querySelectorAll('item')].slice(0, 30).flatMap((item) => {
      const title = item.querySelector('title')?.textContent ?? '';
      const link = item.querySelector('link')?.textContent ?? '';
      if (!title || !link) return [];
      const encoded =
        item.querySelector('encoded')?.textContent ??
        item.querySelector('description')?.textContent ??
        '';
      return [
        {
          id: item.querySelector('guid')?.textContent ?? link,
          title,
          excerpt: plainTextFromHtml(encoded),
          url: link,
          tags: [...item.querySelectorAll('category')].map(
            (category) => category.textContent ?? '',
          ),
          publishedAt: item.querySelector('pubDate')?.textContent ?? undefined,
        },
      ];
    });
    return selectBestCandidate(this.source, candidates, topics);
  }
}

const lobstersItemSchema = z.object({
  short_id: z.string(),
  title: z.string(),
  url: z.url(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()),
  created_at: z.string(),
  score: z.number().int(),
  comment_count: z.number().int(),
});

class LobstersAdapter implements SourceAdapter {
  readonly source = 'lobsters' as const;

  async findBest(topics: string[], signal?: AbortSignal): Promise<SourceEvidence | null> {
    const items = z
      .array(lobstersItemSchema)
      .parse(await getJson('https://lobste.rs/newest.json', signal));
    return selectBestCandidate(
      this.source,
      items.map((item) => ({
        id: item.short_id,
        title: item.title,
        excerpt: item.description ?? item.title,
        url: item.url,
        tags: item.tags,
        publishedAt: item.created_at,
        signal: `${String(item.score)} points · ${String(item.comment_count)} comments`,
      })),
      topics,
    );
  }
}

const stackQuestionSchema = z.object({
  question_id: z.number().int().positive(),
  title: z.string(),
  link: z.url(),
  body: z.string().optional(),
  tags: z.array(z.string()),
  creation_date: z.number().int(),
  score: z.number().int(),
  answer_count: z.number().int(),
});

class StackOverflowAdapter implements SourceAdapter {
  readonly source = 'stack-overflow' as const;

  async findBest(topics: string[], signal?: AbortSignal): Promise<SourceEvidence | null> {
    const queries = topics
      .map((topic) => topic.trim())
      .filter(Boolean)
      .slice(0, 3);
    const payloads = await Promise.all(
      (queries.length > 0 ? queries : ['software development']).map(async (topic) => {
        const query = new URLSearchParams({
          site: 'stackoverflow',
          order: 'desc',
          sort: 'relevance',
          pagesize: '15',
          filter: 'withbody',
          q: topic,
        });
        return z
          .object({ items: z.array(stackQuestionSchema) })
          .parse(
            await getJson(
              `https://api.stackexchange.com/2.3/search/advanced?${query.toString()}`,
              signal,
            ),
          );
      }),
    );
    return selectBestCandidate(
      this.source,
      payloads
        .flatMap((payload) => payload.items)
        .map((item) => ({
          id: String(item.question_id),
          title: plainTextFromHtml(item.title),
          excerpt: item.body ? plainTextFromHtml(item.body) : plainTextFromHtml(item.title),
          url: item.link,
          tags: item.tags,
          publishedAt: new Date(item.creation_date * 1_000).toISOString(),
          signal: `${String(item.score)} votes · ${String(item.answer_count)} answers`,
        })),
      topics,
    );
  }
}

export const sourceAdapters: Record<SourceName, SourceAdapter> = {
  'hacker-news': new HackerNewsAdapter(),
  dev: new DevAdapter(),
  medium: new MediumAdapter(),
  lobsters: new LobstersAdapter(),
  'stack-overflow': new StackOverflowAdapter(),
};

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) throw new AppError('provider-unavailable', 'A public source is unavailable.');
  return response.json() as Promise<unknown>;
}

function sourceUnavailable(source: SourceName): AppError {
  return new AppError('provider-unavailable', `${source} is temporarily unavailable.`);
}
