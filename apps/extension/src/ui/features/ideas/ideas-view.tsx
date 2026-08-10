import { useState } from 'react';
import { ArrowLeft, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { collectSourceEvidence } from '../../../application/idea-research';
import { feedbackAfterEdit, feedbackAfterRating } from '../../../application/feedback';
import {
  addRevision,
  createIdeaHistory,
  draftPost,
  synthesizeIdeas,
} from '../../../application/workflows';
import type {
  Feedback,
  IdeaCandidate,
  IdeaHistoryRecord,
  SourceEvidence,
} from '../../../domain/schemas';
import { requestSourcePermissions } from '../../../infrastructure/permissions';
import { storageRepository } from '../../../infrastructure/storage/chrome-storage';
import { createId } from '../../../shared/id';
import { useForegroundJob } from '../../hooks/use-foreground-job';
import { useAppStore } from '../../state/app-store';
import {
  AccordionContent,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from '../../primitives/accordion';
import { Button } from '../../primitives/button';
import { Card } from '../../primitives/card';
import { Textarea } from '../../primitives/textarea';
import {
  copyText,
  EditorActions,
  EmptyState,
  PageHeading,
  ProgressState,
  StatusBadge,
  SummaryCard,
} from '../../components/common';
import { SchedulePreviewDialog } from './schedule-preview-dialog';

export function IdeasView() {
  const { app, session, refresh, saveApp } = useAppStore();
  const job = useForegroundJob();
  const [ratings, setRatings] = useState<Record<string, 'liked' | 'disliked' | null>>({});
  const [language, setLanguage] = useState<'english' | 'bangla'>('english');
  const [ephemeral, setEphemeral] = useState<IdeaHistoryRecord | null>(null);
  const [searchStage, setSearchStage] = useState('Collecting source evidence');

  const selected = session?.activeRecordId
    ? app?.history.find((item) => item.id === session.activeRecordId && item.type === 'idea')
    : undefined;
  const postRecord = ephemeral ?? (selected?.type === 'idea' ? selected : null);

  if (!app || !session) return null;

  const saveSession = async (patch: Partial<typeof session>) => {
    await storageRepository.updateSession((current) => ({ ...current, ...patch }));
    await refresh();
  };

  const startSearch = () => {
    void (async () => {
      job.setError(null);
      const granted = await requestSourcePermissions(app.settings.selectedSources);
      if (!granted) {
        job.setError('Allow access to the selected public sources to find ideas.');
        return null;
      }
      if (!app.settings.publicResearchEnabled) {
        await saveApp({
          ...app,
          settings: { ...app.settings, publicResearchEnabled: true },
        });
      }
      setSearchStage('Collecting source evidence');
      await job.run(async (signal) => {
        const research = await collectSourceEvidence(
          app.settings.selectedSources,
          app.profile.topics,
          signal,
        );
        if (research.evidence.length === 0) {
          await saveSession({ ideaView: 'experience' });
          return null;
        }
        setSearchStage('Ranking the strongest ideas');
        const synthesized = await synthesizeIdeas(
          research.evidence,
          structuredClone(app.profile),
          signal,
        );
        if (synthesized.candidates.length === 0) {
          await saveSession({ ideaView: 'experience' });
          return null;
        }
        const ideaSession = {
          id: createId(),
          createdAt: new Date().toISOString(),
          candidates: synthesized.candidates,
          unavailableSources: research.unavailableSources,
          createdRecordIds: {},
        };
        await saveSession({ ideaView: 'results', ideaSession });
        return ideaSession;
      });
      return null;
    })();
  };

  const createPost = (candidate: IdeaCandidate) => {
    const existingId = session.ideaSession?.createdRecordIds[candidate.id];
    if (existingId) {
      void saveSession({ ideaView: 'post', activeRecordId: existingId });
      return;
    }
    void job.run(async (signal) => {
      const generated = await draftPost(
        candidate.source,
        structuredClone(app.profile),
        structuredClone(app.learnedPreferences),
        structuredClone(app.settings.hashtagPolicy),
        signal,
      );
      const record = createIdeaHistory(candidate.title, candidate.source, generated);
      if (chrome.extension.inIncognitoContext) setEphemeral(record);
      else await storageRepository.addHistory(record);
      await storageRepository.updateSession((current) => {
        const currentIdeas = current.ideaSession;
        return {
          ...current,
          activeTab: 'idea',
          activeRecordId: record.id,
          ideaView: 'post',
          ...(currentIdeas
            ? {
                ideaSession: {
                  ...currentIdeas,
                  createdRecordIds: { ...currentIdeas.createdRecordIds, [candidate.id]: record.id },
                },
              }
            : {}),
        };
      });
      await refresh();
      return record;
    });
  };

  const createExperiencePost = () => {
    const lesson = session.experienceLesson.trim();
    if (!lesson) return;
    void job.run(async (signal) => {
      const generated = await draftPost(
        { lesson },
        structuredClone(app.profile),
        structuredClone(app.learnedPreferences),
        structuredClone(app.settings.hashtagPolicy),
        signal,
      );
      const title = lesson.split(/[.!?\n]/)[0]?.slice(0, 120) || 'A lesson from your experience';
      const record = createIdeaHistory(title, { lesson }, generated);
      if (chrome.extension.inIncognitoContext) setEphemeral(record);
      else await storageRepository.addHistory(record);
      await saveSession({ ideaView: 'post', activeRecordId: record.id, experienceLesson: '' });
      return record;
    });
  };

  if (session.ideaView === 'post' && postRecord) {
    return (
      <IdeaPostEditor
        record={postRecord}
        language={language}
        onLanguageChange={setLanguage}
        running={job.running}
        error={job.error}
        onBack={() =>
          void saveSession({ ideaView: session.ideaSession ? 'results' : 'experience' })
        }
        onSave={async (next, feedback) => {
          if (chrome.extension.inIncognitoContext) setEphemeral(next);
          else await storageRepository.addHistory(next, feedback ? { feedback } : undefined);
          await refresh();
        }}
        onRegenerate={() => {
          void job.run(async (signal) => {
            const source =
              postRecord.origin.kind === 'source'
                ? postRecord.origin.evidence
                : { lesson: postRecord.origin.lesson };
            const generated = await draftPost(
              source,
              structuredClone(app.profile),
              structuredClone(app.learnedPreferences),
              structuredClone(app.settings.hashtagPolicy),
              signal,
            );
            const next = addRevision(postRecord, generated.output.post, generated.provider);
            if (next.type === 'idea') {
              if (chrome.extension.inIncognitoContext) setEphemeral(next);
              else await storageRepository.addHistory(next);
            }
            await refresh();
            return next;
          });
        }}
      />
    );
  }

  if (session.ideaView === 'experience') {
    return (
      <>
        <PageHeading
          title="From your experience"
          description="Start with one real lesson you can stand behind."
          compact
          action={
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="secondary"
                aria-label="Back to ideas"
                title="Back to ideas"
                onClick={() => void saveSession({ ideaView: 'search', activeRecordId: undefined })}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <Button size="compact" onClick={startSearch}>
                Try sources
              </Button>
            </div>
          }
        />
        {job.error ? <ErrorMessage message={job.error} /> : null}
        <Card className="space-y-4 p-4">
          <StatusBadge>Experience fallback</StatusBadge>
          <div>
            <label htmlFor="experience-lesson" className="text-xs font-semibold">
              Your lesson
            </label>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
              Thoughtline will not invent an experience for you.
            </p>
          </div>
          <Textarea
            id="experience-lesson"
            value={session.experienceLesson}
            onChange={(event) => void saveSession({ experienceLesson: event.target.value })}
            placeholder="What happened, what did you learn, and who would this help?"
            className="min-h-52"
          />
          <Button
            variant="primary"
            className="w-full"
            disabled={job.running || !session.experienceLesson.trim()}
            onClick={createExperiencePost}
          >
            {job.running ? 'Creating post…' : 'Create evergreen post'}
          </Button>
        </Card>
      </>
    );
  }

  if (session.ideaView !== 'results' || !session.ideaSession) {
    return (
      <>
        <PageHeading
          title="Ideas"
          description="Find timely ideas."
          compact
          action={
            <div className="flex items-center gap-1">
              <SchedulePreviewDialog />
              <Button size="compact" variant="primary" onClick={startSearch}>
                New search
              </Button>
            </div>
          }
        />
        {job.error ? <ErrorMessage message={job.error} /> : null}
        {job.running ? (
          <ProgressState
            title="Searching selected sources"
            stage={searchStage}
            description="Thoughtline is collecting source-native evidence, then one AI job will rank the strongest ideas."
            onCancel={job.cancel}
          />
        ) : (
          <EmptyState
            title="Find something to post"
            description="New search uses your saved topics and only the public sources you enabled. Each source can contribute at most one idea."
            action={
              <Button variant="primary" onClick={startSearch}>
                New search
              </Button>
            }
          />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeading
        title={`${String(session.ideaSession.candidates.length)} ${session.ideaSession.candidates.length === 1 ? 'idea' : 'ideas'} found`}
        infoLabel={
          session.ideaSession.unavailableSources.length > 0
            ? `Public-source research was enabled. ${String(session.ideaSession.unavailableSources.length)} source${session.ideaSession.unavailableSources.length === 1 ? '' : 's'} unavailable.`
            : 'Public-source research was enabled for this search.'
        }
        action={
          <div className="flex items-center gap-1">
            <SchedulePreviewDialog />
            <Button size="compact" onClick={startSearch}>
              New search
            </Button>
          </div>
        }
      />
      {job.error ? <ErrorMessage message={job.error} /> : null}
      <div className="space-y-3">
        {session.ideaSession.candidates.map((candidate) => (
          <IdeaCard
            key={candidate.id}
            candidate={candidate}
            rating={ratings[candidate.id] ?? null}
            onRate={(rating) =>
              setRatings((current) => ({
                ...current,
                [candidate.id]: current[candidate.id] === rating ? null : rating,
              }))
            }
            onCreate={() => createPost(candidate)}
            busy={job.running}
          />
        ))}
      </div>
    </>
  );
}

function IdeaCard({
  candidate,
  rating,
  onRate,
  onCreate,
  busy,
}: {
  candidate: IdeaCandidate;
  rating: 'liked' | 'disliked' | null;
  onRate: (rating: 'liked' | 'disliked') => void;
  onCreate: () => void;
  busy: boolean;
}) {
  const sourceLabel = sourceName(candidate.source.source);
  const [whyOpen, setWhyOpen] = useState(false);
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge variant={candidate.fit === 'strong' ? 'proof' : 'warning'}>
          {candidate.fit === 'strong' ? 'Strong fit' : 'Good option'}
        </StatusBadge>
        <span className="text-[11px] text-muted">
          {sourceLabel} · {relativeDay(candidate.source.publishedAt)}
        </span>
      </div>
      <h3 className="mt-3 font-display text-[16px] font-[680] leading-[1.35] tracking-[-0.015em] text-ink">
        {candidate.title}
      </h3>
      <p className="mt-2 text-[11.5px] leading-[1.55] text-muted">{candidate.rationale}</p>
      {candidate.improvement ? (
        <p className="mt-3 text-[10.5px] leading-[1.5] text-warning">{candidate.improvement}</p>
      ) : null}
      <a
        href={candidate.source.url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 block border-l-2 border-rule pl-3 text-[11px] leading-[1.45] text-muted hover:border-primary hover:text-primary hover:underline hover:underline-offset-2"
      >
        Source: {candidate.source.title}{' '}
        <span aria-hidden="true" className="font-bold text-primary">
          ↗
        </span>
      </a>
      <div className="mt-3 flex min-h-10 items-center justify-between gap-3">
        <button
          type="button"
          aria-expanded={whyOpen}
          onClick={() => setWhyOpen((open) => !open)}
          className="motion-inline-action inline-flex items-center gap-1 text-[12px] font-[650] text-proof"
        >
          Why this idea? <span className="text-[15px] font-normal">{whyOpen ? '−' : '+'}</span>
        </button>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant={rating === 'liked' ? 'primary' : 'secondary'}
            aria-label="Like idea"
            aria-pressed={rating === 'liked'}
            onClick={() => onRate('liked')}
          >
            <ThumbsUp className="size-4" />
          </Button>
          <Button
            size="icon"
            variant={rating === 'disliked' ? 'primary' : 'secondary'}
            aria-label="Dislike idea"
            aria-pressed={rating === 'disliked'}
            onClick={() => onRate('disliked')}
          >
            <ThumbsDown className="size-4" />
          </Button>
          <Button
            size="icon"
            aria-label="Create a post from this idea"
            onClick={onCreate}
            disabled={busy}
          >
            <Sparkles className="size-4" />
          </Button>
        </div>
      </div>
      {whyOpen ? (
        <div className="motion-reveal rounded-lg border border-rule bg-soft p-3 text-[10.5px] leading-relaxed text-muted">
          <strong className="text-ink">Source evidence:</strong> {candidate.source.excerpt}
          {candidate.source.aggregateSignal ? ` · ${candidate.source.aggregateSignal}` : ''}
        </div>
      ) : null}
    </Card>
  );
}

function IdeaPostEditor({
  record,
  language,
  onLanguageChange,
  running,
  error,
  onBack,
  onSave,
  onRegenerate,
}: {
  record: IdeaHistoryRecord;
  language: 'english' | 'bangla';
  onLanguageChange: (language: 'english' | 'bangla') => void;
  running: boolean;
  error: string | null;
  onBack: () => void;
  onSave: (record: IdeaHistoryRecord, feedback?: Feedback) => Promise<void>;
  onRegenerate: () => void;
}) {
  const rate = (rating: 'liked' | 'disliked') => {
    const feedback = feedbackAfterRating(
      record.feedback,
      record.generatedText,
      record.currentText,
      rating,
    );
    void onSave(
      {
        ...record,
        updatedAt: new Date().toISOString(),
        feedback,
      },
      feedback,
    );
  };
  const source = record.origin.kind === 'source' ? record.origin.evidence : null;
  return (
    <>
      <PageHeading
        title="Your post"
        description="Edit the wording until it sounds like you, then copy it."
        compact
        action={
          <Button
            size="compact"
            className="mt-1 min-h-8 gap-[5px] px-[9px] py-[5px] text-[10.5px]"
            onClick={onBack}
          >
            <ArrowLeft className="size-3.5" />
            Back to ideas
          </Button>
        }
      />
      {error ? <ErrorMessage message={error} /> : null}
      <Card className="space-y-3 p-4">
        <StatusBadge>{source ? 'Based on a sourced idea' : 'From your experience'}</StatusBadge>
        {record.summary && source ? (
          <SummaryCard
            summary={record.summary}
            language={language}
            onLanguageChange={onLanguageChange}
          />
        ) : (
          <Card className="p-3">
            <strong className="text-xs">Your lesson</strong>
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-[1.58]">
              {record.origin.kind === 'experience' ? record.origin.lesson : ''}
            </p>
          </Card>
        )}
        <div className="flex min-h-10 items-center justify-between gap-2">
          <strong className="text-xs">Editable post</strong>
          <EditorActions
            rating={record.feedback?.rating ?? null}
            onRate={rate}
            onRegenerate={onRegenerate}
            onCopy={() => copyText(record.currentText)}
            canRegenerate={!running}
          />
        </div>
        <Textarea
          value={record.currentText}
          onChange={(event) => {
            const feedback = feedbackAfterEdit(
              record.feedback,
              record.generatedText,
              event.target.value,
            );
            void onSave(
              {
                ...record,
                currentText: event.target.value,
                updatedAt: new Date().toISOString(),
                ...(feedback ? { feedback } : {}),
              },
              feedback,
            );
          }}
          className="min-h-[190px]"
          aria-label="Editable post"
        />
        <AccordionRoot type="single" defaultValue="source" collapsible>
          <AccordionItem value="source">
            <AccordionTrigger>Source and writing direction</AccordionTrigger>
            <AccordionContent className="space-y-2 leading-relaxed">
              {source ? (
                <p>
                  <strong>Source:</strong>{' '}
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-proof underline"
                  >
                    {source.title}
                  </a>
                </p>
              ) : (
                <p>
                  <strong>Source:</strong> Your experience
                </p>
              )}
              <p>
                <strong>Direction:</strong> {record.direction}
              </p>
            </AccordionContent>
          </AccordionItem>
        </AccordionRoot>
      </Card>
    </>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="mb-3 rounded-lg border border-danger/30 bg-danger-bg p-3 text-[11px] text-danger">
      {message}
    </p>
  );
}

function sourceName(source: SourceEvidence['source']): string {
  return {
    'hacker-news': 'Hacker News',
    dev: 'DEV',
    medium: 'Medium',
    lobsters: 'Lobsters',
    'stack-overflow': 'Stack Overflow',
  }[source];
}

function relativeDay(value?: string): string {
  if (!value) return 'recent';
  const published = new Date(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfPublished = new Date(
    published.getFullYear(),
    published.getMonth(),
    published.getDate(),
  ).getTime();
  const days = Math.round((startOfToday - startOfPublished) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return published.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
