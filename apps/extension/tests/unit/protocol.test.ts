import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { calibrationProposalSchema } from '../../src/domain/calibration';
import { jsonSchemaForProvider } from '../../src/infrastructure/providers/provider-utils';
import { runtimeResponseSchema } from '../../src/shared/protocol';
import { createId } from '../../src/shared/id';

describe('runtime calibration protocol', () => {
  it('preserves calibration payloads instead of accepting them as an empty success', () => {
    const response = runtimeResponseSchema.parse({
      ok: true,
      candidate: {
        proposal: {
          schemaVersion: 1,
          boundaryNodeId: 'n1',
          primaryTextNodeId: 'n2',
          authorNodeId: null,
          explanation: 'The semantic post boundary owns the primary text.',
        },
        preview: {
          kind: 'post',
          author: 'Maya Chen',
          text: 'A visible post.',
          surface: 'feed',
          validationCount: 2,
          persistent: true,
          boundaryRect: { x: 0, y: 0, width: 400, height: 240 },
        },
        recipe: {
          schemaVersion: 1,
          id: createId(),
          kind: 'post',
          surface: 'feed',
          status: 'active',
          boundary: {
            tag: 'article',
            attributes: [],
            capabilities: ['primary-text'],
          },
          primaryText: {
            tag: 'span',
            attributes: [
              {
                name: 'data-testid',
                operator: 'equals',
                value: 'expandable-text-box',
              },
            ],
            capabilities: ['primary-text'],
          },
          authorStrategy: 'profile-metadata',
          validationCount: 2,
          createdAt: '2026-07-23T00:00:00.000Z',
          updatedAt: '2026-07-23T00:00:00.000Z',
        },
      },
    });

    expect(response).toHaveProperty('candidate');
  });

  it('rejects unexpected fields on an otherwise empty success response', () => {
    expect(() =>
      runtimeResponseSchema.parse({ ok: true, executableSelector: 'script()' }),
    ).toThrow();
  });

  it('keeps every calibration proposal field required for strict provider schemas', () => {
    const schema = jsonSchemaForProvider(z.toJSONSchema(calibrationProposalSchema)) as {
      required?: string[];
    };

    expect(schema.required).toEqual([
      'schemaVersion',
      'boundaryNodeId',
      'primaryTextNodeId',
      'authorNodeId',
      'explanation',
    ]);
  });
});
