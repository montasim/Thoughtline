import type {
  Feedback,
  LearnedPreferences,
  ReplyDirectionId,
  WorkHistoryRecord,
} from '../domain/schemas';
import { createId } from '../shared/id';
import { countWords, hasSubstantialEdit } from '../shared/text';

export interface FeedbackExample {
  id: string;
  workflow: WorkHistoryRecord['type'];
  rating: Feedback['rating'];
  generatedText: string;
  editedText: string;
  direction?: ReplyDirectionId;
}

export function feedbackAfterEdit(
  existing: Feedback | undefined,
  generatedText: string,
  editedText: string,
): Feedback | undefined {
  if (!existing && !hasSubstantialEdit(generatedText, editedText)) return undefined;
  return {
    id: existing?.id ?? createId(),
    rating: existing?.rating ?? null,
    generatedText,
    editedText,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

export function feedbackAfterRating(
  existing: Feedback | undefined,
  generatedText: string,
  editedText: string,
  rating: Exclude<Feedback['rating'], null>,
): Feedback {
  return {
    id: existing?.id ?? createId(),
    rating: existing?.rating === rating ? null : rating,
    generatedText,
    editedText,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

export function feedbackAfterDirectionSelection(
  existing: Feedback | undefined,
  generatedText: string,
  editedText: string,
): Feedback {
  return {
    id: existing?.id ?? createId(),
    rating: existing?.rating ?? null,
    generatedText,
    editedText,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

export function collectFeedbackExamples(
  history: WorkHistoryRecord[],
  excludedIds: readonly string[] = [],
  limit = 12,
): FeedbackExample[] {
  const excluded = new Set(excludedIds);
  const examples = [...history]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .flatMap((record): FeedbackExample[] => {
      if (record.type === 'reply') {
        return record.directions.flatMap((direction) =>
          direction.feedback && !excluded.has(direction.feedback.id)
            ? [
                {
                  id: direction.feedback.id,
                  workflow: record.type,
                  rating: direction.feedback.rating,
                  generatedText: direction.feedback.generatedText,
                  editedText: direction.feedback.editedText,
                  direction: direction.id,
                },
              ]
            : [],
        );
      }
      return record.feedback && !excluded.has(record.feedback.id)
        ? [
            {
              id: record.feedback.id,
              workflow: record.type,
              rating: record.feedback.rating,
              generatedText: record.feedback.generatedText,
              editedText: record.feedback.editedText,
            },
          ]
        : [];
    });
  return uniqueById(examples).slice(0, limit);
}

export function countFeedbackExamples(history: WorkHistoryRecord[]): number {
  return collectFeedbackExamples(history, [], Number.POSITIVE_INFINITY).length;
}

export function applyLocalFeedbackSignals(
  current: LearnedPreferences,
  feedback: Feedback,
  direction?: ReplyDirectionId,
): LearnedPreferences {
  const next = structuredClone(current);
  if (direction) {
    const ratingWeight = feedback.rating === 'liked' ? 2 : feedback.rating === 'disliked' ? -2 : 1;
    next.directionScores[direction] = bounded(
      (next.directionScores[direction] ?? 0) + ratingWeight,
    );
  }
  if (next.scoredFeedbackIds.includes(feedback.id)) return next;
  next.scoredFeedbackIds = [feedback.id, ...next.scoredFeedbackIds].slice(0, 100);
  const generatedWords = countWords(feedback.generatedText);
  const editedWords = countWords(feedback.editedText);
  score(next.featureScores, 'concise', editedWords < generatedWords * 0.9 ? 1 : 0);
  score(
    next.featureScores,
    'paragraph-breaks',
    paragraphCount(feedback.editedText) > paragraphCount(feedback.generatedText) ? 1 : 0,
  );
  score(
    next.featureScores,
    'questions',
    featureDelta(feedback.generatedText, feedback.editedText, /\?/gu),
  );
  score(
    next.featureScores,
    'hashtags',
    featureDelta(feedback.generatedText, feedback.editedText, /#[\p{L}\p{N}_]+/gu),
  );
  score(
    next.featureScores,
    'emojis',
    featureDelta(feedback.generatedText, feedback.editedText, /\p{Extended_Pictographic}/gu),
  );
  return next;
}

function score(target: Record<string, number>, key: string, amount: number): void {
  if (amount !== 0) target[key] = bounded((target[key] ?? 0) + amount);
}

function featureDelta(generated: string, edited: string, expression: RegExp): number {
  return Math.sign(
    (edited.match(expression)?.length ?? 0) - (generated.match(expression)?.length ?? 0),
  );
}

function paragraphCount(value: string): number {
  return value.split(/\n\s*\n/gu).filter(Boolean).length;
}

function bounded(value: number): number {
  return Math.max(-20, Math.min(20, value));
}

function uniqueById(examples: FeedbackExample[]): FeedbackExample[] {
  const seen = new Set<string>();
  return examples.filter((example) => {
    if (seen.has(example.id)) return false;
    seen.add(example.id);
    return true;
  });
}
