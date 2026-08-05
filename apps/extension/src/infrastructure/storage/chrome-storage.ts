import { AppError } from '../../application/errors';
import { applyLocalFeedbackSignals, countFeedbackExamples } from '../../application/feedback';
import {
  activeJobLeaseSchema,
  appDataSchema,
  defaultAppData,
  defaultSessionState,
  sessionStateSchema,
  type ActiveJobLease,
  type AppData,
  type Feedback,
  type ReplyDirectionId,
  type SessionState,
  type WorkHistoryRecord,
} from '../../domain/schemas';
import {
  calibratedLayoutRecipeListSchema,
  calibratedLayoutRecipeSchema,
  type CalibratedLayoutRecipe,
} from '../../domain/calibration';

const APP_DATA_KEY = 'thoughtline.app-data';
const SESSION_KEY = 'thoughtline.session';
const ACTIVE_JOB_KEY = 'thoughtline.active-job';
const RECOVERY_KEY = 'thoughtline.migration-recovery';
const CALIBRATION_KEY = 'thoughtline.layout-recipes';

export interface StorageSnapshot {
  app: AppData;
  session: SessionState;
}

export class ChromeStorageRepository {
  async initialize(): Promise<StorageSnapshot> {
    await this.restrictPersistentStorage();
    const [app, session] = await Promise.all([this.loadAppData(), this.loadSession()]);
    return { app, session };
  }

  async loadAppData(): Promise<AppData> {
    const result = await chrome.storage.local.get([APP_DATA_KEY, RECOVERY_KEY]);
    const candidate = result[APP_DATA_KEY];
    if (candidate === undefined) {
      await this.saveAppData(defaultAppData);
      return structuredClone(defaultAppData);
    }
    const parsed = appDataSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;

    await chrome.storage.local.set({ [RECOVERY_KEY]: candidate });
    throw new AppError(
      'storage-failed',
      'Local data needs recovery before Thoughtline can continue. Export the recovery snapshot from Settings.',
    );
  }

  async saveAppData(value: AppData): Promise<AppData> {
    const parsed = appDataSchema.safeParse(value);
    if (!parsed.success)
      throw new AppError('storage-failed', 'Local data did not pass validation.');
    const retained = applyRetention(structuredClone(parsed.data));
    retained.learnedPreferences.feedbackCount = countFeedbackExamples(retained.history);
    try {
      await chrome.storage.local.set({ [APP_DATA_KEY]: retained });
      return retained;
    } catch (error) {
      throw new AppError(
        'storage-failed',
        'Chrome could not save this work. Keep the current text open and free local storage.',
        error,
      );
    }
  }

  async updateAppData(update: (current: AppData) => AppData): Promise<AppData> {
    const current = await this.loadAppData();
    const next = appDataSchema.parse(update(structuredClone(current)));
    return this.saveAppData(next);
  }

  async loadSession(): Promise<SessionState> {
    const result = await chrome.storage.session.get(SESSION_KEY);
    const parsed = sessionStateSchema.safeParse(result[SESSION_KEY]);
    if (parsed.success) return parsed.data;
    await this.saveSession(defaultSessionState);
    return structuredClone(defaultSessionState);
  }

  async saveSession(value: SessionState): Promise<void> {
    const parsed = sessionStateSchema.safeParse(value);
    if (!parsed.success)
      throw new AppError('storage-failed', 'Session data did not pass validation.');
    await chrome.storage.session.set({ [SESSION_KEY]: parsed.data });
  }

  async updateSession(update: (current: SessionState) => SessionState): Promise<SessionState> {
    const current = await this.loadSession();
    const next = sessionStateSchema.parse(update(structuredClone(current)));
    await this.saveSession(next);
    return next;
  }

  async addHistory(
    record: WorkHistoryRecord,
    signal?: { feedback: Feedback; direction?: ReplyDirectionId },
  ): Promise<AppData> {
    return this.updateAppData((data) => {
      data.history = [record, ...data.history.filter((item) => item.id !== record.id)];
      if (signal) {
        data.learnedPreferences = applyLocalFeedbackSignals(
          data.learnedPreferences,
          signal.feedback,
          signal.direction,
        );
      }
      return applyRetention(data);
    });
  }

  async updateHistory(
    id: string,
    update: (record: WorkHistoryRecord) => WorkHistoryRecord,
  ): Promise<AppData> {
    return this.updateAppData((data) => {
      data.history = data.history.map((record) => (record.id === id ? update(record) : record));
      return applyRetention(data);
    });
  }

  async deleteHistory(id: string): Promise<AppData> {
    return this.updateAppData((data) => {
      data.history = data.history.filter((record) => record.id !== id);
      return data;
    });
  }

  async clearHistory(): Promise<AppData> {
    return this.updateAppData((data) => ({ ...data, history: [] }));
  }

  async loadLayoutRecipes(): Promise<CalibratedLayoutRecipe[]> {
    const result = await chrome.storage.local.get(CALIBRATION_KEY);
    const parsed = calibratedLayoutRecipeListSchema.safeParse(result[CALIBRATION_KEY] ?? []);
    if (!parsed.success) {
      throw new AppError('storage-failed', 'Calibrated layouts did not pass safety validation.');
    }
    return parsed.data;
  }

  async saveLayoutRecipe(value: CalibratedLayoutRecipe): Promise<CalibratedLayoutRecipe[]> {
    const recipe = calibratedLayoutRecipeSchema.parse(value);
    if (recipe.validationCount < 2) {
      throw new AppError(
        'storage-failed',
        'Persistent calibrated layouts require two visible examples.',
      );
    }
    const current = (await this.loadLayoutRecipes()).filter((item) => item.id !== recipe.id);
    if (current.length >= 32) {
      const oldestQuarantined = current
        .filter((item) => item.status === 'quarantined')
        .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))[0];
      if (!oldestQuarantined) {
        throw new AppError(
          'storage-failed',
          'Remove a calibrated layout before adding another one.',
        );
      }
      current.splice(
        current.findIndex((item) => item.id === oldestQuarantined.id),
        1,
      );
    }
    const next = calibratedLayoutRecipeListSchema.parse([recipe, ...current]);
    await chrome.storage.local.set({ [CALIBRATION_KEY]: next });
    return next;
  }

  async quarantineLayoutRecipe(id: string, reason: string): Promise<void> {
    const current = await this.loadLayoutRecipes();
    const now = new Date().toISOString();
    const next = current.map((recipe) =>
      recipe.id === id
        ? {
            ...recipe,
            status: 'quarantined' as const,
            quarantinedAt: now,
            quarantineReason: reason.slice(0, 300),
            updatedAt: now,
          }
        : recipe,
    );
    await chrome.storage.local.set({ [CALIBRATION_KEY]: next });
  }

  async removeLayoutRecipe(id: string): Promise<void> {
    const current = await this.loadLayoutRecipes();
    await chrome.storage.local.set({
      [CALIBRATION_KEY]: current.filter((recipe) => recipe.id !== id),
    });
  }

  async clearLayoutRecipes(): Promise<void> {
    await chrome.storage.local.remove(CALIBRATION_KEY);
  }

  async claimJob(ownerId: string, timeoutMs = 5 * 60_000): Promise<ActiveJobLease> {
    if (navigator.locks) {
      return navigator.locks.request(
        'thoughtline:claim-foreground-job',
        { mode: 'exclusive' },
        () => this.claimJobWithoutWebLock(ownerId, timeoutMs),
      );
    }
    return this.claimJobWithoutWebLock(ownerId, timeoutMs);
  }

  private async claimJobWithoutWebLock(
    ownerId: string,
    timeoutMs: number,
  ): Promise<ActiveJobLease> {
    const now = Date.now();
    const current = await this.getJobLease();
    if (current && current.expiresAt > now && current.ownerId !== ownerId) {
      throw new AppError('busy', 'Another Thoughtline activity is already running.');
    }
    const candidate = activeJobLeaseSchema.parse({ ownerId, expiresAt: now + timeoutMs });
    await chrome.storage.local.set({ [ACTIVE_JOB_KEY]: candidate });
    const confirmed = await this.getJobLease();
    if (!confirmed || confirmed.ownerId !== ownerId) {
      throw new AppError('busy', 'Another Thoughtline activity started first.');
    }
    return confirmed;
  }

  async releaseJob(ownerId: string): Promise<void> {
    const current = await this.getJobLease();
    if (current?.ownerId === ownerId) await chrome.storage.local.remove(ACTIVE_JOB_KEY);
  }

  async getJobLease(): Promise<ActiveJobLease | null> {
    const result = await chrome.storage.local.get(ACTIVE_JOB_KEY);
    const parsed = activeJobLeaseSchema.safeParse(result[ACTIVE_JOB_KEY]);
    if (!parsed.success) return null;
    if (parsed.data.expiresAt <= Date.now()) {
      await chrome.storage.local.remove(ACTIVE_JOB_KEY);
      return null;
    }
    return parsed.data;
  }

  subscribe(listener: () => void): () => void {
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (
        APP_DATA_KEY in changes ||
        SESSION_KEY in changes ||
        ACTIVE_JOB_KEY in changes ||
        CALIBRATION_KEY in changes
      )
        listener();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }

  async exportRecoverySnapshot(): Promise<unknown> {
    const result = await chrome.storage.local.get(RECOVERY_KEY);
    return result[RECOVERY_KEY] ?? null;
  }

  private async restrictPersistentStorage(): Promise<void> {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  }
}

function applyRetention(data: AppData): AppData {
  const sorted = [...data.history].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  switch (data.settings.retention) {
    case 'latest-20':
      data.history = sorted.slice(0, 20);
      break;
    case 'latest-50':
      data.history = sorted.slice(0, 50);
      break;
    case '30-days': {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1_000;
      data.history = sorted.filter((record) => new Date(record.updatedAt).getTime() >= cutoff);
      break;
    }
    case 'forever':
      data.history = sorted;
      break;
  }
  return data;
}

export const storageRepository = new ChromeStorageRepository();
