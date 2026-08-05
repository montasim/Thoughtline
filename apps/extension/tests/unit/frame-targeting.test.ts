import { describe, expect, it } from 'vitest';
import { calibrationRequestStateSchema } from '../../src/domain/calibration';
import { analysisStateSchema } from '../../src/domain/schemas';
import { createId } from '../../src/shared/id';

describe('LinkedIn frame targeting', () => {
  it('preserves the clicked frame through reply analysis state', () => {
    expect(
      analysisStateSchema.parse({
        status: 'pending',
        requestId: createId(),
        tabId: 42,
        frameId: 7,
        requestedAt: '2026-07-23T00:00:00.000Z',
      }),
    ).toMatchObject({ tabId: 42, frameId: 7 });
  });

  it('preserves the clicked frame through calibration state', () => {
    expect(
      calibrationRequestStateSchema.parse({
        status: 'pending',
        requestId: createId(),
        tabId: 42,
        frameId: 9,
        kind: 'comment',
        mode: 'ai',
        requestedAt: '2026-07-23T00:00:00.000Z',
      }),
    ).toMatchObject({ tabId: 42, frameId: 9 });
  });

  it('migrates older main-frame requests to frame zero', () => {
    expect(
      analysisStateSchema.parse({
        status: 'pending',
        requestId: createId(),
        tabId: 42,
        requestedAt: '2026-07-23T00:00:00.000Z',
      }),
    ).toMatchObject({ frameId: 0 });
  });
});
