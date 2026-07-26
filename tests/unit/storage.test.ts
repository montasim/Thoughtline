import { beforeEach, describe, expect, it } from 'vitest';
import type { CalibratedLayoutRecipe } from '../../src/domain/calibration';
import { defaultAppData, type RewriteHistoryRecord } from '../../src/domain/schemas';
import { ChromeStorageRepository } from '../../src/infrastructure/storage/chrome-storage';
import { createId } from '../../src/shared/id';
import { installChromeMock } from '../helpers/chrome';

const memory = installChromeMock();

describe('Chrome storage repository', () => {
  beforeEach(() => memory.reset());

  it('initializes validated local and session state', async () => {
    const repository = new ChromeStorageRepository();
    const snapshot = await repository.initialize();
    expect(snapshot.app).toEqual(defaultAppData);
    expect(snapshot.session.activeTab).toBe('reply');
  });

  it('adds safe context-refinement defaults when loading pre-v6 local data', async () => {
    const legacy = structuredClone(defaultAppData) as unknown as {
      settings: Record<string, unknown>;
    };
    delete legacy.settings.contextRefinementEnabled;
    delete legacy.settings.retainRefinementSourceLink;
    delete legacy.settings.requireExperienceConfirmation;
    memory.local.set('thoughtline.app-data', legacy);

    const repository = new ChromeStorageRepository();
    const loaded = await repository.loadAppData();

    expect(loaded.settings).toMatchObject({
      contextRefinementEnabled: true,
      retainRefinementSourceLink: true,
      requireExperienceConfirmation: true,
    });
  });

  it('enforces the configured history limit when saving from any surface', async () => {
    const repository = new ChromeStorageRepository();
    const app = structuredClone(defaultAppData);
    app.history = Array.from({ length: 25 }, (_, index) => rewrite(index));
    const saved = await repository.saveAppData(app);
    expect(saved.history).toHaveLength(20);
    expect((await repository.loadAppData()).history).toHaveLength(20);
  });

  it('allows only one active foreground job owner', async () => {
    const repository = new ChromeStorageRepository();
    const first = createId();
    const second = createId();
    await repository.claimJob(first);
    await expect(repository.claimJob(second)).rejects.toMatchObject({ code: 'busy' });
    await repository.releaseJob(first);
    await expect(repository.claimJob(second)).resolves.toMatchObject({ ownerId: second });
  });

  it('quarantines malformed local data instead of silently resetting it', async () => {
    memory.local.set('thoughtline.app-data', { schemaVersion: 99, history: 'bad' });
    const repository = new ChromeStorageRepository();
    await expect(repository.loadAppData()).rejects.toMatchObject({
      code: 'storage-failed',
    });
    expect(memory.local.has('thoughtline.migration-recovery')).toBe(true);
  });

  it('keeps calibrated layouts in their own validated local store', async () => {
    const repository = new ChromeStorageRepository();
    const saved = await repository.saveLayoutRecipe(recipe(0));

    expect(saved).toHaveLength(1);
    expect(memory.local.has('thoughtline.layout-recipes')).toBe(true);
    expect(JSON.stringify(memory.local.get('thoughtline.app-data') ?? {})).not.toContain(
      'calibration-boundary',
    );

    await repository.quarantineLayoutRecipe(saved[0]!.id, 'Built-in extraction disagreed.');
    expect(await repository.loadLayoutRecipes()).toMatchObject([
      {
        status: 'quarantined',
        quarantineReason: 'Built-in extraction disagreed.',
      },
    ]);
  });

  it('refuses to persist one-example calibration recipes', async () => {
    const repository = new ChromeStorageRepository();
    await expect(
      repository.saveLayoutRecipe({ ...recipe(0), validationCount: 1 }),
    ).rejects.toMatchObject({ code: 'storage-failed' });
  });

  it('evicts only the oldest quarantined recipe at the 32-recipe limit', async () => {
    const repository = new ChromeStorageRepository();
    const recipes = Array.from({ length: 32 }, (_, index) => ({
      ...recipe(index),
      status: index === 4 ? ('quarantined' as const) : ('active' as const),
      ...(index === 4
        ? {
            quarantinedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
            quarantineReason: 'Old mismatch',
          }
        : {}),
    }));
    memory.local.set('thoughtline.layout-recipes', recipes);

    const next = await repository.saveLayoutRecipe(recipe(40));

    expect(next).toHaveLength(32);
    expect(next.some((item) => item.id === recipes[4]!.id)).toBe(false);
    expect(next.some((item) => item.id === recipes[0]!.id)).toBe(true);
  });
});

function rewrite(index: number): RewriteHistoryRecord {
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
  return {
    id: createId(),
    type: 'rewrite',
    createdAt: timestamp,
    updatedAt: timestamp,
    provider: 'gemini',
    original: `Original ${String(index)}`,
    goal: 'clearer',
    customGoal: '',
    generatedText: `Generated ${String(index)}`,
    currentText: `Current ${String(index)}`,
    revisions: [],
  };
}

function recipe(index: number): CalibratedLayoutRecipe {
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
  return {
    schemaVersion: 1,
    id: createId(),
    kind: 'post',
    surface: 'feed',
    status: 'active',
    boundary: {
      tag: 'article',
      attributes: [{ name: 'role', operator: 'equals', value: 'listitem' }],
      capabilities: ['primary-text', 'comment-control'],
    },
    primaryText: {
      tag: 'span',
      attributes: [
        {
          name: 'data-testid',
          operator: 'equals',
          value: 'calibration-boundary',
        },
      ],
      capabilities: ['primary-text'],
    },
    authorStrategy: 'profile-metadata',
    validationCount: 2,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
