import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Trash2 } from 'lucide-react';
import type { ReplyDirectionId, WorkHistoryRecord } from '../../../domain/schemas';
import { storageRepository } from '../../../infrastructure/storage/chrome-storage';
import { useAppStore } from '../../state/app-store';
import {
  AccordionContent,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from '../../primitives/accordion';
import { ConfirmDialog } from '../../primitives/alert-dialog';
import { Button } from '../../primitives/button';
import { Card } from '../../primitives/card';
import { Input } from '../../primitives/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '../../primitives/select';
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from '../../primitives/tabs';
import { Textarea } from '../../primitives/textarea';
import {
  copyText,
  PageHeading,
  ReviewNote,
  StatusBadge,
  SummaryCard,
} from '../../components/common';

type HistoryFilter = 'all' | 'reply' | 'rewrite' | 'idea';

export function HistoryView() {
  const { app, refresh } = useAppStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkHistoryRecord | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const initializedExpansion = useRef(false);

  const records = useMemo(() => {
    if (!app) return [];
    const normalized = query.trim().toLocaleLowerCase();
    return app.history
      .filter((record) => filter === 'all' || record.type === filter)
      .filter(
        (record) => !normalized || searchableText(record).toLocaleLowerCase().includes(normalized),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [app, filter, query]);

  useEffect(() => {
    if (initializedExpansion.current || records.length === 0) return;
    const firstReply = records.find((record) => record.type === 'reply');
    setExpanded((firstReply ?? records[0])?.id ?? null);
    initializedExpansion.current = true;
  }, [records]);

  if (!app) return null;

  const deleteRecord = async (record: WorkHistoryRecord) => {
    await storageRepository.deleteHistory(record.id);
    if (expanded === record.id) setExpanded(null);
    setDeleteTarget(null);
    await refresh();
  };

  return (
    <>
      <PageHeading
        title="History"
        description="Stored with Chrome extension storage"
        compact
        action={
          <Button
            size="compact"
            variant="secondary"
            className="text-muted hover:border-[#d8b8b6] hover:bg-danger-bg hover:text-danger"
            disabled={app.history.length === 0}
            onClick={() => setClearOpen(true)}
          >
            Clear all
          </Button>
        }
      />
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_118px] gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search replies, refinements, ideas or sources"
          aria-label="Search History"
        />
        <SelectRoot value={filter} onValueChange={(value) => setFilter(value as HistoryFilter)}>
          <SelectTrigger aria-label="Filter History">
            <span>{filterLabel(filter)}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All work</SelectItem>
            <SelectItem value="reply">Replies</SelectItem>
            <SelectItem value="rewrite">Refinements</SelectItem>
            <SelectItem value="idea">Ideas</SelectItem>
          </SelectContent>
        </SelectRoot>
      </div>
      {records.length === 0 ? (
        <Card className="grid min-h-64 content-center justify-items-center gap-2 p-5 text-center">
          <h3 className="font-display text-[17px] font-bold">No matching history</h3>
          <p className="text-xs text-muted">Change the filter or create new writing.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <HistoryRecordCard
              key={record.id}
              record={record}
              expanded={expanded === record.id}
              onToggle={() => setExpanded((current) => (current === record.id ? null : record.id))}
              onDelete={() => setDeleteTarget(record)}
              onSave={async (next) => {
                await storageRepository.addHistory(next);
                await refresh();
              }}
            />
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget ? recordTitle(deleteTarget) : 'this item'}?`}
        description="Its source snapshot, drafts, edits, feedback, and revisions will be removed from this device."
        confirmLabel="Delete"
        onConfirm={() => (deleteTarget ? deleteRecord(deleteTarget) : undefined)}
      />
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear all History?"
        description="All saved replies, rewrites, ideas, source snapshots, edits, feedback, and revisions will be removed. Learned preferences and settings will remain."
        confirmLabel="Clear all"
        onConfirm={async () => {
          await storageRepository.clearHistory();
          setExpanded(null);
          setClearOpen(false);
          await refresh();
        }}
      />
    </>
  );
}

function HistoryRecordCard({
  record,
  expanded,
  onToggle,
  onDelete,
  onSave,
}: {
  record: WorkHistoryRecord;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onSave: (record: WorkHistoryRecord) => Promise<void>;
}) {
  return (
    <Card className="overflow-hidden">
      <div className={expanded ? 'px-4 pt-4' : 'p-4'}>
        <div className="flex items-center justify-between gap-3">
          <StatusBadge>{recordBadge(record)}</StatusBadge>
          <Button
            size="icon"
            variant="secondary"
            className="text-muted hover:border-[#d8b8b6] hover:bg-danger-bg hover:text-danger"
            aria-label={`Delete ${recordTitle(record)}`}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="mt-1 block w-full text-left font-display text-[15px] font-[680] leading-tight tracking-[-0.015em] text-ink hover:text-primary"
        >
          {recordTitle(record)}
        </button>
        <RecordMeta record={record} />
        {!expanded ? <RecordPreview record={record} /> : null}
      </div>
      {expanded ? <ExpandedRecord record={record} onSave={onSave} /> : null}
    </Card>
  );
}

function ExpandedRecord({
  record,
  onSave,
}: {
  record: WorkHistoryRecord;
  onSave: (record: WorkHistoryRecord) => Promise<void>;
}) {
  const [language, setLanguage] = useState<'english' | 'bangla'>('english');
  if (record.type === 'reply') {
    const selected =
      record.directions.find((direction) => direction.id === record.selectedDirection) ??
      record.directions[0];
    if (!selected) return null;
    return (
      <div className="space-y-3 px-4 pb-4 pt-3">
        <SummaryCard summary={record.summary} language={language} onLanguageChange={setLanguage} />
        <ReviewNote>{record.reviewNote}</ReviewNote>
        <TabsRoot
          value={record.selectedDirection}
          onValueChange={(value) =>
            void onSave({
              ...record,
              selectedDirection: value as ReplyDirectionId,
              updatedAt: new Date().toISOString(),
            })
          }
        >
          <TabsList className="grid-cols-4">
            {record.directions.map((direction) => (
              <TabsTrigger key={direction.id} value={direction.id}>
                {directionLabel(direction.id)}
              </TabsTrigger>
            ))}
          </TabsList>
          {record.directions.map((direction) => (
            <TabsContent key={direction.id} forceMount hidden value={direction.id} />
          ))}
        </TabsRoot>
        <div className="space-y-2">
          <SavedContentHeader
            label="Saved reply"
            text={selected.currentText}
            meta={
              <>
                {directionLabel(selected.id)} · edited
                {selected.feedback?.rating === 'liked'
                  ? ' · 👍 Helpful'
                  : selected.feedback?.rating === 'disliked'
                    ? ' · Needs improvement'
                    : ''}
              </>
            }
          />
          <Textarea
            aria-label="Saved reply"
            value={selected.currentText}
            onChange={(event) =>
              void onSave({
                ...record,
                updatedAt: new Date().toISOString(),
                directions: record.directions.map((direction) =>
                  direction.id === selected.id
                    ? { ...direction, currentText: event.target.value }
                    : direction,
                ),
              })
            }
            className="min-h-48"
          />
        </div>
        <AccordionRoot type="single" defaultValue="source" collapsible>
          <AccordionItem value="source">
            <AccordionTrigger>Source and reasoning</AccordionTrigger>
            <AccordionContent className="space-y-2 leading-relaxed">
              <p>
                <strong>Source:</strong> {record.source.author} · “{record.source.postExcerpt}”{' '}
                {record.source.permalink ? (
                  <a
                    className="inline-flex items-center gap-1 text-proof underline"
                    href={record.source.permalink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open LinkedIn post <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span className="text-muted">Link unavailable</span>
                )}
              </p>
              <p>
                <strong>Approach:</strong> {selected.approach}
              </p>
            </AccordionContent>
          </AccordionItem>
          <RevisionsItem revisions={selected.revisions} />
        </AccordionRoot>
      </div>
    );
  }
  if (record.type === 'rewrite') {
    return (
      <div className="space-y-3 border-t border-rule px-4 pb-4 pt-3">
        <div className="space-y-2">
          <SavedContentHeader
            label={record.mode === 'context' ? 'Saved profile-grounded post' : 'Saved refinement'}
            text={record.currentText}
          />
          <Textarea
            aria-label="Saved refinement"
            value={record.currentText}
            onChange={(event) =>
              void onSave({
                ...record,
                currentText: event.target.value,
                updatedAt: new Date().toISOString(),
              })
            }
            className="min-h-48"
          />
        </div>
        <AccordionRoot type="multiple" defaultValue={['original']}>
          <AccordionItem value="original">
            <AccordionTrigger>
              {record.mode === 'context' ? 'Original source and provenance' : 'Original content'}
            </AccordionTrigger>
            <AccordionContent className="space-y-2">
              <p className="whitespace-pre-wrap leading-relaxed">{record.original}</p>
              {record.source?.permalink ? (
                <a
                  href={record.source.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-proof underline"
                >
                  Open {record.source.author}’s LinkedIn post
                  <ExternalLink className="size-3" />
                </a>
              ) : null}
            </AccordionContent>
          </AccordionItem>
          {record.grounding ? (
            <AccordionItem value="grounding">
              <AccordionTrigger>Grounding report</AccordionTrigger>
              <AccordionContent className="space-y-2 leading-relaxed">
                <p>
                  <strong>Profile:</strong> {record.grounding.profile}
                </p>
                <p>
                  <strong>Experience:</strong>{' '}
                  {record.experiencePerspective || 'No personal experience claim'}
                </p>
                <p>
                  <strong>Tone and preferences:</strong> {record.grounding.tone} ·{' '}
                  {record.grounding.preferences}
                </p>
              </AccordionContent>
            </AccordionItem>
          ) : null}
          <RevisionsItem revisions={record.revisions} />
        </AccordionRoot>
      </div>
    );
  }
  return (
    <div className="space-y-3 border-t border-rule px-4 pb-4 pt-3">
      {record.summary ? (
        <SummaryCard summary={record.summary} language={language} onLanguageChange={setLanguage} />
      ) : null}
      <div className="space-y-2">
        <SavedContentHeader label="Saved post" text={record.currentText} />
        <Textarea
          aria-label="Saved post"
          value={record.currentText}
          onChange={(event) =>
            void onSave({
              ...record,
              currentText: event.target.value,
              updatedAt: new Date().toISOString(),
            })
          }
          className="min-h-48"
        />
      </div>
      <AccordionRoot type="multiple" defaultValue={['source']}>
        <AccordionItem value="source">
          <AccordionTrigger>Source and writing direction</AccordionTrigger>
          <AccordionContent className="space-y-2 leading-relaxed">
            <p>
              <strong>Source:</strong>{' '}
              {record.origin.kind === 'source' ? (
                <a
                  href={record.origin.evidence.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-proof underline"
                >
                  {record.origin.evidence.title}
                </a>
              ) : (
                'Your experience'
              )}
            </p>
            <p>
              <strong>Direction:</strong> {record.direction}
            </p>
          </AccordionContent>
        </AccordionItem>
        <RevisionsItem revisions={record.revisions} />
      </AccordionRoot>
    </div>
  );
}

function SavedContentHeader({
  label,
  text,
  meta,
}: {
  label: string;
  text: string;
  meta?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await copyText(text);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1_400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex min-h-[34px] items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <strong className="text-xs">{label}</strong>
        <Button
          size="icon"
          variant="secondary"
          aria-label={
            copied ? `Copied ${label.toLocaleLowerCase()}` : `Copy ${label.toLocaleLowerCase()}`
          }
          title={copied ? 'Copied' : 'Copy'}
          data-copied={copied || undefined}
          onClick={() => void copy()}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
      {meta ? <span className="text-right text-[10px] text-muted">{meta}</span> : null}
      <span className="sr-only" aria-live="polite">
        {copied ? `${label} copied to clipboard` : ''}
      </span>
    </div>
  );
}

function RevisionsItem({
  revisions,
}: {
  revisions: Array<{ id: string; text: string; createdAt: string; pinned: boolean }>;
}) {
  if (revisions.length === 0) return null;
  return (
    <AccordionItem value="revisions" className="mt-2">
      <AccordionTrigger>
        Revisions{' '}
        <span className="ml-auto mr-2 font-utility text-[10px] font-normal text-muted">
          {String(revisions.length)}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-2">
        {revisions.map((revision) => (
          <div key={revision.id} className="rounded-lg border border-rule bg-soft p-2">
            <div className="flex justify-between gap-2 text-[9.5px] text-muted">
              <span>{revision.pinned ? 'Pinned' : 'Previous'}</span>
              <time>{new Date(revision.createdAt).toLocaleString()}</time>
            </div>
            <p className="mt-2 line-clamp-3 leading-relaxed">{revision.text}</p>
          </div>
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}

function RecordMeta({ record }: { record: WorkHistoryRecord }) {
  const sourceLink =
    record.type === 'reply'
      ? record.source.permalink
      : record.type === 'rewrite' && record.mode === 'context'
        ? record.source?.permalink
        : record.type === 'idea' && record.origin.kind === 'source'
          ? record.origin.evidence.url
          : undefined;
  return (
    <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[10.5px] text-muted">
      {record.type === 'reply' ? <span>{record.source.author}</span> : null}
      {record.type === 'rewrite' && record.mode === 'context' ? (
        <span>{record.source?.author}</span>
      ) : null}
      {record.type === 'idea' && record.origin.kind === 'source' ? (
        <span>{sourceName(record.origin.evidence.source)}</span>
      ) : null}
      <time>{compactTimestamp(record.updatedAt)}</time>
      {sourceLink ? (
        <a href={sourceLink} target="_blank" rel="noreferrer" className="text-proof underline">
          {record.type === 'reply' || record.type === 'rewrite'
            ? 'Open source post'
            : 'Open source'}
        </a>
      ) : null}
    </div>
  );
}

function RecordPreview({ record }: { record: WorkHistoryRecord }) {
  const text =
    record.type === 'reply'
      ? record.directions.find((item) => item.id === record.selectedDirection)?.currentText
      : record.currentText;
  return (
    <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-[11px] leading-relaxed text-ink">
      {text}
    </p>
  );
}

function recordTitle(record: WorkHistoryRecord): string {
  if (record.type === 'reply') return record.title ?? `Reply to ${record.source.author}`;
  if (record.type === 'rewrite')
    return record.mode === 'context' && record.source
      ? `Your perspective on ${record.source.author}’s post`
      : record.original.slice(0, 72);
  return record.title;
}

function recordBadge(record: WorkHistoryRecord): string {
  if (record.type === 'reply') return 'Reply · edited';
  if (record.type === 'rewrite')
    return record.mode === 'context' ? 'Refine · LinkedIn source' : 'Refine';
  return record.origin.kind === 'source' ? 'Idea · sourced' : 'Idea · experience';
}

function searchableText(record: WorkHistoryRecord): string {
  if (record.type === 'reply')
    return [
      record.source.author,
      record.source.postExcerpt,
      ...record.directions.flatMap((direction) => [direction.currentText, direction.approach]),
    ].join(' ');
  if (record.type === 'rewrite')
    return [
      record.original,
      record.currentText,
      record.source?.author,
      record.experiencePerspective,
    ].join(' ');
  return [
    record.title,
    record.currentText,
    record.origin.kind === 'source'
      ? `${record.origin.evidence.title} ${record.origin.evidence.source}`
      : record.origin.lesson,
  ].join(' ');
}

function directionLabel(direction: ReplyDirectionId): string {
  return { insight: 'Insight', question: 'Question', extend: 'Extend', challenge: 'Challenge' }[
    direction
  ];
}

function filterLabel(filter: HistoryFilter): string {
  return { all: 'All work', reply: 'Replies', rewrite: 'Refinements', idea: 'Ideas' }[filter];
}

function compactTimestamp(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const difference = Math.round((today - day) / 86_400_000);
  const label =
    difference === 0
      ? 'Today'
      : difference === 1
        ? 'Yesterday'
        : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${label}, ${date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })}`;
}

function sourceName(source: 'hacker-news' | 'dev' | 'medium' | 'lobsters' | 'stack-overflow') {
  return {
    'hacker-news': 'Hacker News',
    dev: 'DEV',
    medium: 'Medium',
    lobsters: 'Lobsters',
    'stack-overflow': 'Stack Overflow',
  }[source];
}
