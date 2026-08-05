import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppData, SessionState } from '../../domain/schemas';
import { storageRepository } from '../../infrastructure/storage/chrome-storage';

interface AppStoreValue {
  app: AppData | null;
  session: SessionState | null;
  loading: boolean;
  refresh: () => Promise<void>;
  saveApp: (app: AppData) => Promise<void>;
  saveSession: (session: SessionState) => Promise<void>;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [app, setApp] = useState<AppData | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const snapshot = await storageRepository.initialize();
    setApp(snapshot.app);
    setSession(snapshot.session);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    return storageRepository.subscribe(() => void refresh());
  }, [refresh]);

  const saveApp = useCallback(async (next: AppData) => {
    setApp(await storageRepository.saveAppData(next));
  }, []);

  const saveSession = useCallback(async (next: SessionState) => {
    await storageRepository.saveSession(next);
    setSession(next);
  }, []);

  const value = useMemo(
    () => ({ app, session, loading, refresh, saveApp, saveSession }),
    [app, session, loading, refresh, saveApp, saveSession],
  );
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('AppStoreProvider is missing.');
  return value;
}
