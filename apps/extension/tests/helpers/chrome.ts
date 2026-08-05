import { vi } from 'vitest';

type ChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void;
type PermissionRequest = { origins?: string[]; permissions?: string[] };

export interface ChromeMemory {
  local: Map<string, unknown>;
  session: Map<string, unknown>;
  permissions: Set<string>;
  reset: () => void;
}

export function installChromeMock(): ChromeMemory {
  const local = new Map<string, unknown>();
  const session = new Map<string, unknown>();
  const permissions = new Set<string>();
  const listeners = new Set<ChangeListener>();

  const area = (name: 'local' | 'session', values: Map<string, unknown>) => ({
    get: vi.fn((keys?: string | string[] | Record<string, unknown> | null) => {
      if (keys === undefined || keys === null) return Object.fromEntries(values);
      const names =
        typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      return Promise.resolve(
        Object.fromEntries(
          names
            .filter((key) => values.has(key))
            .map((key) => [key, structuredClone(values.get(key))]),
        ),
      );
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = {
          oldValue: values.get(key),
          newValue: structuredClone(value),
        };
        values.set(key, structuredClone(value));
      }
      for (const listener of listeners) listener(changes, name);
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) values.delete(key);
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      values.clear();
      return Promise.resolve();
    }),
    setAccessLevel: vi.fn(() => Promise.resolve()),
  });

  const chromeMock = {
    storage: {
      local: area('local', local),
      session: area('session', session),
      onChanged: {
        addListener: (listener: ChangeListener) => listeners.add(listener),
        removeListener: (listener: ChangeListener) => listeners.delete(listener),
      },
    },
    permissions: {
      contains: vi.fn(({ origins = [], permissions: requested = [] }: PermissionRequest) =>
        Promise.resolve(
          [...origins, ...requested].every((permission) => permissions.has(permission)),
        ),
      ),
      request: vi.fn(({ origins = [], permissions: requested = [] }: PermissionRequest) => {
        for (const permission of [...origins, ...requested]) permissions.add(permission);
        return Promise.resolve(true);
      }),
      remove: vi.fn(({ origins = [], permissions: requested = [] }: PermissionRequest) => {
        for (const permission of [...origins, ...requested]) permissions.delete(permission);
        return Promise.resolve(true);
      }),
    },
    extension: { inIncognitoContext: false },
    runtime: {
      getManifest: () => ({ version: '0.1.0' }),
      sendMessage: vi.fn(),
    },
  };

  vi.stubGlobal('chrome', chromeMock);
  return {
    local,
    session,
    permissions,
    reset: () => {
      local.clear();
      session.clear();
      permissions.clear();
      listeners.clear();
      vi.clearAllMocks();
    },
  };
}
