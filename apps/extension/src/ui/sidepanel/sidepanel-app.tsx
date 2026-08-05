import { lazy, Suspense } from 'react';
import type { ActiveTab } from '../../domain/schemas';
import { storageRepository } from '../../infrastructure/storage/chrome-storage';
import { AppShell } from '../components/app-shell';
import { useAppStore } from '../state/app-store';

const ReplyView = lazy(() =>
  import('../features/reply/reply-view').then((module) => ({ default: module.ReplyView })),
);
const GenerateView = lazy(() =>
  import('../features/generate/generate-view').then((module) => ({ default: module.GenerateView })),
);
const IdeasView = lazy(() =>
  import('../features/ideas/ideas-view').then((module) => ({ default: module.IdeasView })),
);
const HistoryView = lazy(() =>
  import('../features/history/history-view').then((module) => ({ default: module.HistoryView })),
);
const SettingsView = lazy(() =>
  import('../features/settings/settings-view').then((module) => ({ default: module.SettingsView })),
);
const CalibrationView = lazy(() =>
  import('../features/calibration/calibration-view').then((module) => ({
    default: module.CalibrationView,
  })),
);

export function SidePanelApp() {
  const { app, session, loading, refresh } = useAppStore();
  if (loading || !app || !session) {
    return (
      <div className="grid h-dvh min-w-80 place-items-center bg-canvas font-body text-xs text-muted">
        Opening Thoughtline…
      </div>
    );
  }

  const changeTab = async (tab: ActiveTab) => {
    await storageRepository.updateSession((current) => {
      if (tab !== 'generate' || current.activeTab === 'generate') {
        return { ...current, activeTab: tab };
      }
      const next = {
        ...current,
        activeTab: tab,
        refinement: { status: 'idle' as const },
      };
      delete next.activeRecordId;
      return next;
    });
    await refresh();
  };

  const activeTab = session.activeTab;
  const calibrationActive = session.calibration.status !== 'idle';
  const continueSetup = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('/onboarding.html') });
  };
  return (
    <AppShell
      activeTab={activeTab}
      contentKey={[
        activeTab,
        session.activeRecordId ?? 'compose',
        activeTab === 'generate' ? session.refinement.status : '',
      ].join(':')}
      onTabChange={(tab) => void changeTab(tab)}
      savedLabel={activeTab === 'history' ? 'Saved on this device' : undefined}
      savedStatusLabel={
        activeTab === 'history'
          ? `${String(app.history.length)} item${app.history.length === 1 ? '' : 's'}`
          : undefined
      }
      showNavigation={!calibrationActive}
    >
      <Suspense
        fallback={
          <div className="grid min-h-72 place-items-center text-xs text-muted">Opening view…</div>
        }
      >
        {calibrationActive ? (
          <CalibrationView onOpenSettings={() => void changeTab('settings')} />
        ) : activeTab === 'reply' ? (
          <ReplyView
            onOpenSettings={() => void changeTab('settings')}
            onContinueSetup={continueSetup}
          />
        ) : null}
        {activeTab === 'generate' ? <GenerateView /> : null}
        {activeTab === 'idea' ? <IdeasView /> : null}
        {activeTab === 'history' ? <HistoryView /> : null}
        {activeTab === 'settings' ? <SettingsView /> : null}
      </Suspense>
    </AppShell>
  );
}
