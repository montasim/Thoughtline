import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { approvedPrototype } from '../helpers/prototype-reference';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('approved prototype reference', () => {
  it('points to the newest immutable prototype snapshot', async () => {
    await expect(approvedPrototype(root)).resolves.toMatchObject({
      approvedVersion: 7,
      file: 'simplified-ui-v7.html',
    });
  });
});
