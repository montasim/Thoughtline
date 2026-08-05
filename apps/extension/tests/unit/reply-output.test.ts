import { describe, expect, it } from 'vitest';
import { replyOutputSchema, replyOutputSchemaForLanguage } from '../../src/domain/schemas';

const validOutput = {
  title: 'Visible assumptions improve architecture decisions',
  summary: {
    english: 'Teams should revisit patterns when their constraints change.',
    bangla: 'সীমাবদ্ধতা বদলালে দলগুলোর প্যাটার্ন পুনর্বিবেচনা করা উচিত।',
  },
  reviewNote: '',
  directions: [
    {
      id: 'insight',
      generatedText: 'Making assumptions visible gives a team a practical review trigger.',
      currentText: 'Making assumptions visible gives a team a practical review trigger.',
      approach: 'Add a practical lens.',
    },
    {
      id: 'question',
      generatedText: 'Which changed constraint would prompt you to revisit the pattern first?',
      currentText: 'Which changed constraint would prompt you to revisit the pattern first?',
      approach: 'Ask a grounded question.',
    },
    {
      id: 'extend',
      generatedText: 'A written decision record can make that reassessment easier for the team.',
      currentText: 'A written decision record can make that reassessment easier for the team.',
      approach: 'Develop the idea.',
    },
    {
      id: 'challenge',
      generatedText: 'A pattern can still be useful early if the team treats it as reversible.',
      currentText: 'A pattern can still be useful early if the team treats it as reversible.',
      approach: 'Offer respectful disagreement.',
    },
  ],
};

describe('reply output validation', () => {
  it('accepts four distinct reply drafts', () => {
    expect(replyOutputSchema.safeParse(validOutput).success).toBe(true);
  });

  it('rejects duplicate drafts even when casing and whitespace differ', () => {
    const duplicateOutput = structuredClone(validOutput);
    duplicateOutput.directions[1]!.generatedText =
      '  MAKING assumptions visible gives a team a practical review trigger.  ';
    duplicateOutput.directions[1]!.currentText =
      '  MAKING assumptions visible gives a team a practical review trigger.  ';

    const result = replyOutputSchema.safeParse(duplicateOutput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'Each reply direction must contain a distinct draft',
            path: ['directions', 1, 'generatedText'],
          }),
        ]),
      );
    }
  });

  it('rejects an initial current draft that differs from its generated draft', () => {
    const mismatchedOutput = structuredClone(validOutput);
    mismatchedOutput.directions[2]!.currentText = 'A different draft.';

    const result = replyOutputSchema.safeParse(mismatchedOutput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'The initial current text must match the generated text',
            path: ['directions', 2, 'currentText'],
          }),
        ]),
      );
    }
  });

  it('rejects English drafts when the response target requires Bangla', () => {
    const result = replyOutputSchemaForLanguage('bangla').safeParse(validOutput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'Reply draft must be written in bangla',
            path: ['directions', 0, 'generatedText'],
          }),
        ]),
      );
    }
  });
});
