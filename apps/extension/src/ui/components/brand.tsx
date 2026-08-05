import { Coffee } from 'lucide-react';
import { Button } from '../primitives/button';

export function ThoughtlineMark({ className = 'size-[26px]' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5a9 9 0 0 1 7.2 14.4A9 9 0 0 1 7 18.5L3.8 21l.9-4.2A9 9 0 0 1 12 2.5Z"
        fill="#294b72"
      />
      <path d="m12 5.2 4.1 5.8-4.1 7.2L7.9 11 12 5.2Z" fill="white" />
      <circle cx="12" cy="11.8" r="1.1" fill="#294b72" />
      <path d="M12 12.9v3.2" stroke="#294b72" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function AppHeader({
  savedLabel,
  statusLabel,
  setup = false,
}: {
  savedLabel?: string | undefined;
  statusLabel?: string | undefined;
  setup?: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-rule bg-canvas/95 px-4 py-3 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] border border-rule bg-surface">
          <ThoughtlineMark />
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[18px] font-[680] leading-[1.15] tracking-[-0.015em] text-ink">
            Thoughtline
          </h1>
          <p className="mt-1 truncate font-body text-[11px] leading-[1.2] text-muted">
            {savedLabel ?? (setup ? 'Private setup' : 'Find the thought. Shape the words.')}
          </p>
        </div>
      </div>
      {setup ? (
        <span className="whitespace-nowrap font-utility text-[11px] font-[650] text-proof">
          {statusLabel}
        </span>
      ) : statusLabel ? (
        <span className="inline-flex items-center gap-2 whitespace-nowrap text-[11px] font-[650] text-proof before:size-[7px] before:rounded-full before:bg-proof">
          {statusLabel}
        </span>
      ) : (
        <Button asChild size="compact" className="shrink-0">
          <a href="https://www.supportkori.com/montasim" target="_blank" rel="noreferrer">
            <Coffee className="size-[15px]" /> Support
          </a>
        </Button>
      )}
    </header>
  );
}
