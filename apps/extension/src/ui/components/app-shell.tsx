import { useEffect, useRef, type ReactNode } from 'react';
import type { ActiveTab } from '../../domain/schemas';
import { cn } from '../lib/cn';
import { AppHeader } from './brand';

const NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'reply', label: 'Reply' },
  { id: 'generate', label: 'Refine' },
  { id: 'idea', label: 'Idea' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
];

interface AppShellProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  children: ReactNode;
  savedLabel?: string | undefined;
  savedStatusLabel?: string | undefined;
  showNavigation?: boolean | undefined;
  contentKey?: string | undefined;
}

export function AppShell({
  activeTab,
  onTabChange,
  children,
  savedLabel,
  savedStatusLabel,
  showNavigation = true,
  contentKey,
}: AppShellProps) {
  const scrollRegion = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRegion.current?.scrollTo({ top: 0 });
  }, [contentKey]);

  return (
    <div className="mx-auto grid h-dvh min-h-0 w-full min-w-80 max-w-[400px] grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-[14px] border border-rule bg-canvas font-body text-ink shadow-panel">
      <div
        key={activeTab}
        ref={scrollRegion}
        data-sidepanel-scroll
        className="motion-view min-w-0 overscroll-y-contain overflow-y-auto [scrollbar-color:#b8c5d4_transparent] [scrollbar-width:thin]"
      >
        <AppHeader savedLabel={savedLabel} statusLabel={savedStatusLabel} />
        <main className="min-w-0 px-4 pb-4">{children}</main>
      </div>
      {showNavigation ? (
        <nav
          aria-label="Main navigation"
          className="z-30 mb-3 ml-4 mr-[26px] grid grid-cols-5 gap-1 rounded-[10px] border border-rule bg-tint/95 p-1 shadow-[0_8px_24px_rgb(32_50_71_/_0.13)] backdrop-blur"
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={activeTab === item.id ? 'page' : undefined}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'motion-nav-action min-h-[42px] min-w-0 justify-self-center rounded-[7px] px-1 font-body text-[11px] font-[650] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                'w-[calc(100%_-_4px)]',
                activeTab === item.id
                  ? 'bg-primary text-white'
                  : 'text-muted hover:bg-surface hover:text-primary',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
