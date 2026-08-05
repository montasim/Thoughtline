import { describe, expect, it } from 'vitest';
import {
  applyLocalFeedbackSignals,
  collectFeedbackExamples,
  feedbackAfterDirectionSelection,
  feedbackAfterEdit,
  feedbackAfterRating,
} from '../../src/application/feedback';
import { defaultAppData } from '../../src/domain/schemas';
import { visualAppData } from '../fixtures/app-data';

describe('functional feedback evidence', () => {
  it('creates evidence only after a substantial edit, rating, or explicit direction selection', () => {
    expect(
      feedbackAfterEdit(undefined, 'A useful generated sentence.', 'a useful generated sentence!'),
    ).toBeUndefined();
    const edit = feedbackAfterEdit(
      undefined,
      'A useful generated sentence for an engineering team.',
      'A shorter, practical answer.',
    );
    if (!edit) throw new Error('Substantial edit evidence missing');
    expect(edit.rating).toBeNull();
    expect(feedbackAfterRating(edit, edit.generatedText, edit.editedText, 'liked').rating).toBe(
      'liked',
    );
    expect(feedbackAfterDirectionSelection(undefined, 'Draft', 'Draft')).toMatchObject({
      rating: null,
    });
  });

  it('collects bounded, de-duplicated evidence and excludes analyzed examples', () => {
    const app = visualAppData();
    const reply = app.history.find((record) => record.type === 'reply');
    if (!reply || reply.type !== 'reply') throw new Error('Reply fixture missing');
    const direction = reply.directions[0];
    if (!direction) throw new Error('Reply direction fixture missing');
    const feedback = feedbackAfterDirectionSelection(
      undefined,
      direction.generatedText,
      direction.currentText,
    );
    direction.feedback = feedback;
    expect(collectFeedbackExamples(app.history)).toHaveLength(1);
    expect(collectFeedbackExamples(app.history, [feedback.id])).toHaveLength(0);
  });

  it('updates bounded on-device direction and measurable feature scores', () => {
    const feedback = feedbackAfterRating(
      undefined,
      'A long generated answer with no break and no question for the reader.',
      'A shorter answer.\n\nWould this help?',
      'liked',
    );
    const learned = applyLocalFeedbackSignals(
      defaultAppData.learnedPreferences,
      feedback,
      'question',
    );
    expect(learned.directionScores.question).toBe(2);
    expect(learned.featureScores.concise).toBe(1);
    expect(learned.featureScores['paragraph-breaks']).toBe(1);
    expect(learned.featureScores.questions).toBe(1);
  });
});
