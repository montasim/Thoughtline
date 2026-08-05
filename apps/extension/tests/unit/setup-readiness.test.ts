import { describe, expect, it } from 'vitest';
import { getSetupSteps } from '../../src/application/setup-readiness';
import { defaultAppData } from '../../src/domain/schemas';
import { visualAppData } from '../fixtures/app-data';

describe('setup readiness guidance', () => {
  it('names every missing requirement in a new setup', () => {
    const steps = getSetupSteps(structuredClone(defaultAppData), {
      linkedIn: false,
      providers: false,
    });

    expect(steps).toEqual([
      expect.objectContaining({
        label: 'Permission',
        ready: false,
        detail: 'Accept AI processing consent · Allow LinkedIn page access',
      }),
      expect.objectContaining({
        label: 'AI services',
        ready: false,
        detail:
          'Allow Gemini and Groq connections · Validate the Gemini API key · Validate the Groq API key',
      }),
      expect.objectContaining({
        label: 'Writing profile',
        ready: false,
        detail: 'Add your role · Add topics you know · Add the people you want to reach',
      }),
      expect.objectContaining({
        label: 'Ready',
        ready: false,
        detail: 'Available after the items above are complete.',
      }),
    ]);
  });

  it('marks every setup stage ready when all requirements are complete', () => {
    const steps = getSetupSteps(visualAppData(), { linkedIn: true, providers: true });

    expect(steps.every((step) => step.ready)).toBe(true);
  });
});
