import { sourceEvidenceSchema, type SourceEvidence, type SourceName } from '../../domain/schemas';
import { normalizeUntrustedText } from '../../shared/text';

export interface SourceCandidate {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  tags?: string[] | undefined;
  publishedAt?: string | undefined;
  signal?: string | undefined;
}

export function selectBestCandidate(
  source: SourceName,
  candidates: SourceCandidate[],
  topics: string[],
): SourceEvidence | null {
  const normalizedTopics = topics
    .map((topic) => normalizeUntrustedText(topic).toLocaleLowerCase())
    .filter(Boolean);
  const ranked = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, normalizedTopics) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);
  const selected = ranked[0]?.candidate;
  if (!selected) return null;
  const parsed = sourceEvidenceSchema.safeParse({
    id: `${source}:${selected.id}`.slice(0, 240),
    source,
    title: normalizeUntrustedText(selected.title).slice(0, 320),
    excerpt: normalizeUntrustedText(selected.excerpt || selected.title).slice(0, 1_500),
    url: selected.url,
    tags: (selected.tags ?? []).map(normalizeUntrustedText).filter(Boolean).slice(0, 12),
    ...(selected.publishedAt ? { publishedAt: new Date(selected.publishedAt).toISOString() } : {}),
    aggregateSignal: normalizeUntrustedText(selected.signal ?? '').slice(0, 240),
  });
  return parsed.success ? parsed.data : null;
}

export function plainTextFromHtml(value: string): string {
  const documentValue = new DOMParser().parseFromString(value, 'text/html');
  return normalizeUntrustedText(documentValue.body.textContent ?? '');
}

function scoreCandidate(candidate: SourceCandidate, topics: string[]): number {
  const haystack = normalizeUntrustedText(
    [candidate.title, candidate.excerpt, ...(candidate.tags ?? [])].join(' '),
  ).toLocaleLowerCase();
  const haystackTokens = new Set(haystack.match(/[\p{L}\p{N}]+/gu) ?? []);
  return topics.reduce((score, topic) => {
    const phraseScore = haystack.includes(topic) ? 8 : 0;
    const tokenScore = topicTokens(topic).reduce(
      (total, token) => total + (haystackTokens.has(token) ? (token.length <= 2 ? 1 : 2) : 0),
      0,
    );
    return score + phraseScore + tokenScore;
  }, 0);
}

const TOPIC_STOP_WORDS = new Set(['and', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with']);

function topicTokens(topic: string): string[] {
  return (topic.match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (token) => token.length >= 2 && !TOPIC_STOP_WORDS.has(token),
  );
}
