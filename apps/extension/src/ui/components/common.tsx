import { Check, Copy, Info, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';
import { Card } from '../primitives/card';
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from '../primitives/tabs';
import { TooltipRoot } from '../primitives/tooltip';

export function PageHeading({
  title,
  description,
  action,
  infoLabel,
  compact = false,
  actionAlign,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  infoLabel?: string;
  compact?: boolean;
  actionAlign?: 'start' | 'center';
}) {
  const resolvedAlignment = actionAlign ?? (compact ? 'start' : 'center');
  return (
    <div
      className={cn(
        'flex justify-between gap-3',
        compact ? 'mb-[10px] mt-3' : 'my-4',
        resolvedAlignment === 'center' ? 'items-center' : 'items-start',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h2
            className={cn(
              'font-display font-[680] tracking-[-0.015em] text-ink',
              compact ? 'text-[16px] leading-[1.3]' : 'text-[19px] leading-[1.28]',
            )}
          >
            {title}
          </h2>
          {infoLabel ? <InfoButton label={infoLabel} /> : null}
        </div>
        {description ? (
          <p
            className={cn(
              'max-w-[270px] font-body text-[13px] text-muted',
              compact ? 'mt-0.5 leading-[1.35]' : 'mt-1 leading-[1.58]',
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function InfoButton({ label }: { label: string }) {
  return (
    <TooltipRoot content={label}>
      <button
        type="button"
        aria-label={label}
        className="grid size-[18px] shrink-0 cursor-help place-items-center text-muted hover:text-primary focus-visible:text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        <Info className="size-[11px] translate-y-px" strokeWidth={2} />
      </button>
    </TooltipRoot>
  );
}

export function StatusBadge({
  children,
  variant = 'proof',
}: {
  children: ReactNode;
  variant?: 'proof' | 'warning';
}) {
  return (
    <span
      className={cn(
        'inline-flex min-h-[25px] items-center rounded-full border px-2 py-1 font-body text-[11px] font-[650]',
        variant === 'proof'
          ? 'border-[#a8c6c3] bg-proof-soft text-proof'
          : 'border-[#dccb9d] bg-[#fff9e8] text-[#765b16]',
      )}
    >
      {children}
    </span>
  );
}

export function SummaryCard({
  summary,
  language,
  onLanguageChange,
}: {
  summary: { english: string; bangla: string };
  language: 'english' | 'bangla';
  onLanguageChange: (language: 'english' | 'bangla') => void;
}) {
  return (
    <Card className="bg-soft p-3">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-xs font-semibold">LinkedIn post summary</strong>
        <TabsRoot
          value={language}
          onValueChange={(value) => onLanguageChange(value as 'english' | 'bangla')}
        >
          <TabsList className="flex gap-0.5 p-0.5">
            <TabsTrigger value="english" className="min-h-[27px] px-2 py-1">
              English
            </TabsTrigger>
            <TabsTrigger value="bangla" className="min-h-[27px] px-2 py-1">
              বাংলা
            </TabsTrigger>
          </TabsList>
          <TabsContent forceMount hidden value="english" />
          <TabsContent forceMount hidden value="bangla" />
        </TabsRoot>
      </div>
      <p className="mt-2 text-[11.5px] leading-[1.5] text-ink">
        {language === 'english' ? summary.english : summary.bangla}
      </p>
    </Card>
  );
}

export function ReviewNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-lg border border-[#e9c985] bg-warning-bg px-3 py-3 text-[10.5px] leading-relaxed text-warning">
      <strong>Review before posting:</strong> {children}
    </div>
  );
}

export function EditorActions({
  rating,
  onRate,
  onRegenerate,
  onCopy,
  canRegenerate = true,
}: {
  rating: 'liked' | 'disliked' | null;
  onRate: (rating: 'liked' | 'disliked') => void;
  onRegenerate?: () => void;
  onCopy: () => void | Promise<void>;
  canRegenerate?: boolean;
}) {
  const [ratingPulse, setRatingPulse] = useState<'liked' | 'disliked' | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => clearTimeout(timer));
    },
    [],
  );

  const resetAfter = (callback: () => void, delay: number) => {
    timers.current.push(setTimeout(callback, delay));
  };

  const rate = (nextRating: 'liked' | 'disliked') => {
    onRate(nextRating);
    setRatingPulse(nextRating);
    resetAfter(() => setRatingPulse(null), 280);
  };

  const regenerate = () => {
    if (!onRegenerate) return;
    setRegenerating(true);
    onRegenerate();
    resetAfter(() => setRegenerating(false), 650);
  };

  const copy = async () => {
    try {
      await onCopy();
      setCopied(true);
      resetAfter(() => setCopied(false), 1_400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        className="editor-action-button"
        size="icon"
        variant={rating === 'liked' ? 'primary' : 'secondary'}
        aria-label="Like this writing"
        aria-pressed={rating === 'liked'}
        data-animating={ratingPulse === 'liked' || undefined}
        onClick={() => rate('liked')}
      >
        <ThumbsUp className="size-[17px]" />
      </Button>
      <Button
        className="editor-action-button"
        size="icon"
        variant={rating === 'disliked' ? 'primary' : 'secondary'}
        aria-label="Dislike this writing"
        aria-pressed={rating === 'disliked'}
        data-animating={ratingPulse === 'disliked' || undefined}
        onClick={() => rate('disliked')}
      >
        <ThumbsDown className="size-[17px]" />
      </Button>
      {onRegenerate ? (
        <Button
          className="editor-action-button"
          size="icon"
          aria-label="Regenerate"
          data-regenerating={regenerating || undefined}
          onClick={regenerate}
          disabled={!canRegenerate}
        >
          <RefreshCw className="size-[17px]" />
        </Button>
      ) : null}
      <Button
        className="editor-action-button"
        size="icon"
        aria-label={copied ? 'Copied' : 'Copy'}
        title={copied ? 'Copied' : 'Copy'}
        data-copied={copied || undefined}
        onClick={() => void copy()}
      >
        {copied ? <Check className="size-[17px]" /> : <Copy className="size-[17px]" />}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="grid min-h-[330px] content-center justify-items-start gap-3 rounded-[10px] p-6">
      <h3 className="font-display text-[19px] font-[680] leading-[1.28] tracking-[-0.015em] text-ink">
        {title}
      </h3>
      <p className="text-[13px] leading-[1.58] text-muted">{description}</p>
      {action}
    </Card>
  );
}

export function ProgressState({
  stage,
  onCancel,
  title = 'Analyzing the selected discussion',
  description = 'Thoughtline reads only the visible post and discussion already rendered in LinkedIn.',
}: {
  stage: string;
  onCancel: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <Card className="grid min-h-[330px] content-center justify-items-start gap-3 rounded-[10px] p-6">
      <span
        className="size-7 animate-spin rounded-full border-2 border-proof/25 border-t-proof"
        aria-hidden="true"
      />
      <h3 className="font-display text-[19px] font-[680] leading-[1.28] tracking-[-0.015em] text-ink">
        {title}
      </h3>
      <p className="font-utility text-[10.5px] text-proof">{stage}</p>
      <p className="text-[13px] leading-[1.58] text-muted">{description}</p>
      <Button onClick={onCancel}>Cancel</Button>
    </Card>
  );
}

export async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}
