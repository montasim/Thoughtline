import { describe, expect, it } from 'vitest';
import { collectWritingSamples } from '../../src/application/writing-samples';

describe('writing sample collection', () => {
  it('includes every saved sample and the current textarea', () => {
    expect(
      collectWritingSamples(['First saved sample.', 'Second saved sample.'], 'Current sample.'),
    ).toEqual(['First saved sample.', 'Second saved sample.', 'Current sample.']);
  });

  it('trims samples, removes empty entries, and respects the profile limit', () => {
    const samples = Array.from({ length: 9 }, (_, index) => ` Sample ${String(index + 1)} `);

    expect(collectWritingSamples(['', ...samples])).toEqual(
      samples.slice(0, 8).map((sample) => sample.trim()),
    );
  });
});
