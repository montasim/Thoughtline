import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ExternalLink } from 'lucide-react';
import { AppError } from '../../../application/errors';
import {
  feedbackAfterDirectionSelection,
  feedbackAfterEdit,
  feedbackAfterRating,
} from '../../../application/feedback';
import { analyzeReply, regenerateReplyDirection } from '../../../application/workflows';
import { getSetupSteps, type SetupAccess } from '../../../application/setup-readiness';
import {
  isProfileComplete,
  isProviderReady,
  postContextSchema,
  type AppData,
  type ReplyDirectionId,
  type Feedback,
  type ReplyHistoryRecord,
} from '../../../domain/schemas';
import { hasLinkedInPermission, hasProviderPermissions } from '../../../infrastructure/permissions';
import { storageRepository } from '../../../infrastructure/storage/chrome-storage';
import { createId } from '../../../shared/id';
import type { RuntimeResponse } from '../../../shared/protocol';
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
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from '../../primitives/tabs';
import { Textarea } from '../../primitives/textarea';
import {
  copyText,
  EditorActions,
  EmptyState,
  InfoButton,
  PageHeading,
  ProgressState,
  ReviewNote,
  SummaryCard,
} from '../../components/common';

const DIRECTION_LABELS: Record<ReplyDirectionId, string> = {
  insight: 'Insight',
  question: 'Question',
  extend: 'Extend',
  challenge: 'Challenge',
};

const STAGE_LABELS = {
  opening: 'Opening Thoughtline',
  'checking-setup': 'Checking setup and permissions',
  extracting: 'Reading the selected visible discussion',
  validating: 'Visible discussion validated',
  analyzing: 'Creating four reply directions',
  saving: 'Saving the editable result',
} as const;

export function ReplyView({
  onOpenSettings,
  onContinueSetup,
}: {
  onOpenSettings: () => void;
  onContinueSetup: () => void;
}) {
  const { app, session, refresh } = useAppStore();
  const job = useForegroundJob();
  const [language, setLanguage] = useState<'english' | 'bangla'>('english');
  const [ephemeralRecord, setEphemeralRecord] = useState<ReplyHistoryRecord | null>(null);
  const [setupAccess, setSetupAccess] = useState<SetupAccess | null>(null);
  const [regenerationTarget, setRegenerationTarget] = useState<ReplyDirectionId | null>(null);
  const started = useRef(new Set<string>());

  const selectedRecord = session?.activeRecordId
    ? app?.history.find((item) => item.id === session.activeRecordId && item.type === 'reply')
    : undefined;
  const record =
    ephemeralRecord ??
    (selectedRecord?.type === 'reply'
      ? selectedRecord
      : (app?.history.find((item) => item.type === 'reply') ?? null));

  useEffect(() => {
    if (
      session?.analysis.status !== 'error' ||
      !['setup-incomplete', 'permission-missing'].includes(session.analysis.code)
    ) {
      return;
    }
    let active = true;
    void Promise.all([hasLinkedInPermission(), hasProviderPermissions()])
      .then(([linkedIn, providers]) => {
        if (active) setSetupAccess({ linkedIn, providers });
      })
      .catch(() => {
        if (active) setSetupAccess({ linkedIn: false, providers: false });
      });
    return () => {
      active = false;
    };
  }, [session?.analysis]);

  useEffect(() => {
    const analysis = session?.analysis;
    if (
      !app ||
      !session ||
      analysis?.status !== 'pending' ||
      started.current.has(analysis.requestId)
    )
      return;
    started.current.add(analysis.requestId);
    void job.run(async (signal) => {
      const startedAt = new Date().toISOString();
      const updateStage = async (stage: keyof typeof STAGE_LABELS) => {
        await storageRepository.updateSession((current) => ({
          ...current,
          activeTab: 'reply',
          analysis: {
            status: 'running',
            requestId: analysis.requestId,
            tabId: analysis.tabId,
            frameId: analysis.frameId,
            stage,
            startedAt,
          },
        }));
      };
      try {
        await updateStage('checking-setup');
        if (!app.settings.onboardingComplete || !app.settings.consent.accepted) {
          throw new AppError(
            'setup-incomplete',
            'Finish setup before analyzing a LinkedIn discussion.',
          );
        }
        if (!isProfileComplete(app.profile) || !isProviderReady(app.settings)) {
          throw new AppError(
            'setup-incomplete',
            'Complete your profile and validate both API keys.',
          );
        }
        if (!(await hasLinkedInPermission())) {
          throw new AppError('permission-missing', 'Allow LinkedIn page access in Settings.');
        }
        if (!(await hasProviderPermissions())) {
          throw new AppError(
            'permission-missing',
            'Allow Gemini and Groq connections in Settings.',
          );
        }
        await updateStage('extracting');
        let response: RuntimeResponse;
        try {
          const recipes = chrome.extension.inIncognitoContext
            ? []
            : await storageRepository.loadLayoutRecipes();
          response = await chrome.tabs.sendMessage(
            analysis.tabId,
            {
              type: 'content:extract-selected-post',
              requestId: analysis.requestId,
              intent: 'reply',
              recipes: recipes.filter((recipe) => recipe.status === 'active'),
            },
            { frameId: analysis.frameId },
          );
        } catch {
          throw new AppError(
            'no-post-found',
            'LinkedIn did not return the selected post. Reload it, right-click again, and retry.',
          );
        }
        if (!response.ok || !('context' in response)) {
          if (!response.ok && response.recipeId && !chrome.extension.inIncognitoContext) {
            await storageRepository.quarantineLayoutRecipe(response.recipeId, response.message);
          }
          throw new AppError(
            'unsupported-layout',
            response.ok ? 'No post was returned.' : response.message,
            {
              recoveryKind: response.ok ? 'post' : response.recoveryKind,
            },
          );
        }
        const context = postContextSchema.safeParse(response.context);
        if (!context.success) {
          throw new AppError(
            'unsupported-layout',
            'The selected post did not pass safety validation.',
            { recoveryKind: 'post' },
          );
        }
        await updateStage('validating');
        await updateStage('analyzing');
        const completed = await analyzeReply(
          context.data,
          structuredClone(app.profile),
          structuredClone(app.learnedPreferences),
          signal,
        );
        await updateStage('saving');
        if (chrome.extension.inIncognitoContext) {
          setEphemeralRecord(completed.record);
        } else {
          await storageRepository.addHistory(completed.record);
        }
        await storageRepository.updateSession((current) => ({
          ...current,
          activeTab: 'reply',
          activeRecordId: completed.record.id,
          analysis: {
            status: 'success',
            requestId: analysis.requestId,
            recordId: completed.record.id,
          },
        }));
        await refresh();
        return completed.record;
      } catch (error) {
        const resolved =
          error instanceof AppError ? error : new AppError('unknown', 'The analysis failed.');
        const recoveryKind =
          resolved.causeValue &&
          typeof resolved.causeValue === 'object' &&
          'recoveryKind' in resolved.causeValue &&
          (resolved.causeValue.recoveryKind === 'post' ||
            resolved.causeValue.recoveryKind === 'comment')
            ? resolved.causeValue.recoveryKind
            : undefined;
        await storageRepository.updateSession((current) => ({
          ...current,
          analysis: {
            status: 'error',
            requestId: analysis.requestId,
            tabId: analysis.tabId,
            frameId: analysis.frameId,
            code: resolved.code,
            message: resolved.message,
            ...(recoveryKind ? { recoveryKind } : {}),
          },
        }));
        throw resolved;
      }
    });
  }, [app, job, refresh, session]);

  if (!app || !session) return null;
  const startCalibration = async (kind: 'post' | 'comment') => {
    if (
      session.analysis.status !== 'error' ||
      typeof session.analysis.tabId !== 'number' ||
      typeof session.analysis.frameId !== 'number'
    ) {
      return;
    }
    const { tabId, frameId } = session.analysis;
    await storageRepository.updateSession((current) => ({
      ...current,
      activeTab: 'reply',
      analysis: { status: 'idle' },
      calibration: {
        status: 'pending',
        requestId: createId(),
        tabId,
        frameId,
        kind,
        mode: 'local',
        requestedAt: new Date().toISOString(),
      },
    }));
    await refresh();
  };
  if (
    session.analysis.status === 'pending' ||
    session.analysis.status === 'running' ||
    (job.running && regenerationTarget === null)
  ) {
    const stage =
      session.analysis.status === 'running'
        ? STAGE_LABELS[session.analysis.stage]
        : 'Preparing analysis';
    return (
      <div className="pt-4">
        <ProgressState stage={stage} onCancel={job.cancel} />
      </div>
    );
  }
  if (session.analysis.status === 'error') {
    if (
      session.analysis.code === 'setup-incomplete' ||
      session.analysis.code === 'permission-missing'
    ) {
      return (
        <div className="pt-4">
          {setupAccess ? (
            <SetupGuidance
              app={app}
              access={setupAccess}
              onOpenSettings={onOpenSettings}
              onContinueSetup={onContinueSetup}
            />
          ) : (
            <EmptyState
              title="Checking your setup"
              description="Thoughtline is checking permissions, AI services, and your writing profile."
            />
          )}
        </div>
      );
    }
    const recoveryKind = session.analysis.recoveryKind;
    if (
      session.analysis.code === 'unsupported-layout' &&
      recoveryKind &&
      typeof session.analysis.tabId === 'number'
    ) {
      const targetLabel = recoveryKind === 'post' ? 'post' : 'comment';
      return (
        <div className="pt-4">
          <EmptyState
            title={`${recoveryKind === 'post' ? 'Post' : 'Comment'} layout changed`}
            description={`Thoughtline couldn’t safely identify the selected ${targetLabel} in LinkedIn’s current layout. Calibrate it on this device, then right-click the comment again. Nothing was sent to an AI provider.`}
            action={
              <Button onClick={() => void startCalibration(recoveryKind)}>
                Calibrate selected {targetLabel}
              </Button>
            }
          />
        </div>
      );
    }
    return (
      <div className="pt-4">
        <EmptyState
          title={errorTitle(session.analysis.code)}
          description={session.analysis.message}
        />
      </div>
    );
  }
  if (!record) {
    return (
      <>
        <PageHeading
          title="Reply"
          description="Choose one visible LinkedIn conversation."
          compact
        />
        <EmptyState
          title="Right-click a LinkedIn post"
          description="On LinkedIn, right-click a visible post, comment, or reply and choose “Draft a reply with Thoughtline.” Only that rendered conversation is analyzed."
          action={
            <Button
              onClick={() => void chrome.tabs.create({ url: 'https://www.linkedin.com/feed/' })}
            >
              Open LinkedIn
            </Button>
          }
        />
      </>
    );
  }

  const selected =
    record.directions.find((direction) => direction.id === record.selectedDirection) ??
    record.directions[0];
  if (!selected) return null;

  const updateRecord = async (
    next: ReplyHistoryRecord,
    signal?: { feedback: Feedback; direction: ReplyDirectionId },
  ) => {
    if (chrome.extension.inIncognitoContext) setEphemeralRecord(next);
    else await storageRepository.addHistory(next, signal);
    await refresh();
  };

  const updateSelectedText = (text: string) => {
    const feedback = feedbackAfterEdit(selected.feedback, selected.generatedText, text);
    const next: ReplyHistoryRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
      directions: record.directions.map((direction) =>
        direction.id === selected.id
          ? { ...direction, currentText: text, ...(feedback ? { feedback } : {}) }
          : direction,
      ),
    };
    void updateRecord(next, feedback ? { feedback, direction: selected.id } : undefined);
  };

  const rate = (rating: 'liked' | 'disliked') => {
    const feedback = feedbackAfterRating(
      selected.feedback,
      selected.generatedText,
      selected.currentText,
      rating,
    );
    const next: ReplyHistoryRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
      directions: record.directions.map((direction) =>
        direction.id === selected.id
          ? {
              ...direction,
              feedback,
            }
          : direction,
      ),
    };
    void updateRecord(next, { feedback, direction: selected.id });
  };

  const regenerate = (directionId: ReplyDirectionId = selected.id) => {
    setRegenerationTarget(directionId);
    void job
      .run(async (signal) => {
        const result = await regenerateReplyDirection(
          record,
          directionId,
          structuredClone(app.profile),
          structuredClone(app.learnedPreferences),
          signal,
        );
        await updateRecord(result.record);
        return result.record;
      })
      .then((result) => {
        if (result) setRegenerationTarget(null);
      });
  };
  const isRegenerating = job.running && regenerationTarget !== null;
  const regenerationLabel = DIRECTION_LABELS[regenerationTarget ?? selected.id];
  const targetType = record.source.targetType ?? 'post';
  const targetAuthor = record.source.targetAuthor ?? record.source.author;
  const isDiscussionTarget = targetType !== 'post';
  const targetLabel = targetType === 'reply' ? 'Selected reply' : 'Selected comment';

  return (
    <>
      <PageHeading
        title={
          isDiscussionTarget
            ? `Replying to ${targetAuthor}`
            : `Replying to ${record.source.author}’s post`
        }
        description={
          isDiscussionTarget
            ? `${targetType === 'reply' ? 'Reply' : 'Comment'} target · ${record.source.author}’s post`
            : `Source post${record.source.wordCount ? ` · ${String(record.source.wordCount)} words` : ''}`
        }
        compact
        action={
          <span className="mt-0.5 inline-flex items-center gap-2 whitespace-nowrap font-utility text-[10px] font-medium text-proof">
            <span className="size-1.5 rounded-full bg-proof" />4 ready
          </span>
        }
      />
      {job.error ? (
        <div
          role="alert"
          className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-bg p-3 text-[11px] text-danger"
        >
          <p className="min-w-0 leading-relaxed">
            <strong>Couldn’t regenerate {regenerationLabel}.</strong> {job.error} Your current draft
            is unchanged.
          </p>
          <Button
            size="compact"
            variant="secondary"
            className="shrink-0 border-danger/30 bg-surface text-danger hover:bg-danger-bg"
            onClick={() => regenerate(regenerationTarget ?? selected.id)}
          >
            Try again
          </Button>
        </div>
      ) : null}
      <Card className="space-y-3 p-4">
        {isDiscussionTarget ? (
          <div
            aria-label={targetLabel}
            className="border-l-2 border-proof bg-proof-soft/65 px-3 py-2.5"
          >
            <span className="font-utility text-[9.5px] font-medium uppercase tracking-[0.11em] text-proof">
              {targetLabel}
            </span>
            <p className="mt-1.5 line-clamp-4 text-[11.5px] leading-relaxed text-ink">
              “{record.source.targetExcerpt}”
            </p>
          </div>
        ) : null}
        <SummaryCard summary={record.summary} language={language} onLanguageChange={setLanguage} />
        <ReviewNote>{record.reviewNote}</ReviewNote>
        <TabsRoot
          value={record.selectedDirection}
          onValueChange={(value) => {
            const directionId = value as ReplyDirectionId;
            const direction = record.directions.find((item) => item.id === directionId);
            if (!direction) return;
            const feedback = feedbackAfterDirectionSelection(
              direction.feedback,
              direction.generatedText,
              direction.currentText,
            );
            void updateRecord(
              {
                ...record,
                selectedDirection: directionId,
                updatedAt: new Date().toISOString(),
                directions: record.directions.map((item) =>
                  item.id === directionId ? { ...item, feedback } : item,
                ),
              },
              { feedback, direction: directionId },
            );
          }}
        >
          <TabsList className="grid-cols-4">
            {record.directions.map((direction) => (
              <TabsTrigger key={direction.id} value={direction.id}>
                {DIRECTION_LABELS[direction.id]}
              </TabsTrigger>
            ))}
          </TabsList>
          {record.directions.map((direction) => (
            <TabsContent key={direction.id} forceMount hidden value={direction.id} />
          ))}
        </TabsRoot>
        <div className="relative" aria-busy={isRegenerating}>
          <div
            inert={isRegenerating}
            className={`space-y-3 transition-opacity duration-200 ${isRegenerating ? 'opacity-35' : 'opacity-100'}`}
          >
            <div className="flex min-h-[34px] items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <strong className="text-xs">Editable reply</strong>
                <InfoButton label="Rate the selected direction to tune future ordering." />
              </div>
              <EditorActions
                rating={selected.feedback?.rating ?? null}
                onRate={rate}
                onRegenerate={() => regenerate()}
                onCopy={() => copyText(selected.currentText)}
                canRegenerate={!job.running}
              />
            </div>
            <Textarea
              aria-label="Editable reply"
              value={selected.currentText}
              onChange={(event) => updateSelectedText(event.target.value)}
              className="min-h-[190px]"
              disabled={isRegenerating}
            />
          </div>
          {isRegenerating ? (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 z-10 grid place-items-center rounded-lg border border-proof/25 bg-surface/75 px-4 backdrop-blur-[1px]"
            >
              <div className="flex items-center gap-3 rounded-lg border border-rule bg-surface px-4 py-3 shadow-[0_8px_24px_rgba(32,50,71,0.12)]">
                <span
                  className="size-5 shrink-0 animate-spin rounded-full border-2 border-proof/25 border-t-proof motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <span>
                  <strong className="block text-[11.5px] text-ink">
                    Rewriting {regenerationLabel}
                  </strong>
                  <span className="mt-0.5 block text-[10px] text-muted">
                    Creating a fresh version in this direction
                  </span>
                </span>
              </div>
            </div>
          ) : null}
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
        </AccordionRoot>
      </Card>
    </>
  );
}

function SetupGuidance({
  app,
  access,
  onOpenSettings,
  onContinueSetup,
}: {
  app: AppData;
  access: SetupAccess;
  onOpenSettings: () => void;
  onContinueSetup: () => void;
}) {
  const steps = getSetupSteps(app, access);
  const remaining = steps.filter((step) => !step.ready).length;
  const needsOnboarding = !app.settings.onboardingComplete;

  return (
    <Card className="overflow-hidden rounded-[10px]">
      <div className="p-5 pb-4">
        <p className="font-utility text-[9.5px] font-medium uppercase tracking-[0.13em] text-proof">
          Setup checklist
        </p>
        <h3 className="mt-2 font-display text-[18px] font-bold leading-tight text-ink">
          {remaining === 0
            ? 'Setup is ready'
            : remaining === 1
              ? 'One step needs attention'
              : `${String(remaining)} steps need attention`}
        </h3>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          Complete these items, then right-click the LinkedIn discussion again.
        </p>
      </div>
      <ol className="border-y border-rule bg-soft/60 px-5">
        {steps.map((step, index) => (
          <li
            key={step.label}
            className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-rule/80 py-3 last:border-b-0"
          >
            <span
              className={`mt-0.5 grid size-[22px] place-items-center rounded-full border font-utility text-[9px] font-medium ${step.ready ? 'border-proof/30 bg-proof-soft text-proof' : 'border-[#e9c985] bg-warning-bg text-warning'}`}
              aria-hidden="true"
            >
              {step.ready ? <Check className="size-3" /> : index + 1}
            </span>
            <span className="min-w-0">
              <strong className="block text-[11.5px] font-semibold text-ink">{step.label}</strong>
              <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted">
                {step.detail}
              </span>
            </span>
            <span
              className={`pt-0.5 font-utility text-[9px] font-medium uppercase tracking-[0.08em] ${step.ready ? 'text-proof' : 'text-warning'}`}
            >
              {step.ready ? 'Done' : 'Needed'}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex justify-end p-4">
        <Button variant="primary" onClick={needsOnboarding ? onContinueSetup : onOpenSettings}>
          {needsOnboarding ? 'Continue setup' : 'Review settings'}
          <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </Card>
  );
}

function errorTitle(code: string): string {
  if (code === 'no-post-found') return 'No post found';
  if (code === 'linkedin-not-open') return 'LinkedIn is not open';
  if (code === 'credential-invalid') return 'Review your API keys';
  if (code === 'provider-rate-limit') return 'Provider limit reached';
  if (code === 'setup-incomplete') return 'Finish setup first';
  return 'Analysis could not finish';
}
