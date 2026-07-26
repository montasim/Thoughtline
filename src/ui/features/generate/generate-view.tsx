import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, ShieldCheck } from 'lucide-react';
import { AppError } from '../../../application/errors';
import { feedbackAfterEdit, feedbackAfterRating } from '../../../application/feedback';
import { addRevision, refineLinkedInPost, rewriteContent } from '../../../application/workflows';
import {
  isProfileComplete,
  isProviderReady,
  postContextSchema,
  type Feedback,
  type PostContext,
  type RefinementState,
  type RewriteGoal,
  type RewriteHistoryRecord,
} from '../../../domain/schemas';
import { hasLinkedInPermission, hasProviderPermissions } from '../../../infrastructure/permissions';
import { storageRepository } from '../../../infrastructure/storage/chrome-storage';
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
import { Input } from '../../primitives/input';
import { FieldGroup, Label } from '../../primitives/label';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '../../primitives/select';
import { SwitchControl } from '../../primitives/switch';
import { Textarea } from '../../primitives/textarea';
import {
  copyText,
  EditorActions,
  EmptyState,
  PageHeading,
  ProgressState,
  StatusBadge,
} from '../../components/common';

const REFINEMENT_STAGE_LABELS = {
  'checking-setup': 'Checking profile and permissions',
  extracting: 'Reading the selected rendered post',
  validating: 'Confirming the LinkedIn post boundary',
  refining: 'Creating a distinct perspective in your voice',
  saving: 'Saving source provenance to History',
} as const;

export function GenerateView() {
  const { app, session, refresh } = useAppStore();
  const job = useForegroundJob();
  const [editingSource, setEditingSource] = useState(false);
  const [ephemeral, setEphemeral] = useState<RewriteHistoryRecord | null>(null);
  const started = useRef(new Set<string>());
  const reviewCache = useRef<Extract<RefinementState, { status: 'review' }> | null>(null);

  const selected = session?.activeRecordId
    ? app?.history.find((item) => item.id === session.activeRecordId && item.type === 'rewrite')
    : undefined;
  const record = ephemeral ?? (selected?.type === 'rewrite' ? selected : null);
  const refinement = session?.refinement;

  useEffect(() => {
    if (refinement?.status === 'review') reviewCache.current = refinement;
  }, [refinement]);

  useEffect(() => {
    if (
      !app ||
      !session ||
      refinement?.status !== 'pending' ||
      started.current.has(refinement.requestId)
    ) {
      return;
    }
    started.current.add(refinement.requestId);
    void job
      .run(
        async (signal) => {
          const startedAt = new Date().toISOString();
          const updateStage = async (
            stage: Extract<RefinementState, { status: 'running' }>['stage'],
          ) => {
            await storageRepository.updateSession((current) => ({
              ...current,
              activeTab: 'generate',
              refinement: {
                status: 'running',
                requestId: refinement.requestId,
                tabId: refinement.tabId,
                frameId: refinement.frameId,
                stage,
                startedAt,
              },
            }));
          };
          try {
            await updateStage('checking-setup');
            if (
              !app.settings.onboardingComplete ||
              !app.settings.consent.accepted ||
              !isProfileComplete(app.profile) ||
              !isProviderReady(app.settings)
            ) {
              throw new AppError(
                'setup-incomplete',
                'Complete your writing profile and validate both AI services before refining a post.',
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
            signal.throwIfAborted();
            await updateStage('extracting');
            let response: RuntimeResponse;
            try {
              const recipes = chrome.extension.inIncognitoContext
                ? []
                : await storageRepository.loadLayoutRecipes();
              response = await chrome.tabs.sendMessage(
                refinement.tabId,
                {
                  type: 'content:extract-selected-post',
                  requestId: refinement.requestId,
                  recipes: recipes.filter((recipe) => recipe.status === 'active'),
                },
                { frameId: refinement.frameId },
              );
            } catch {
              throw new AppError(
                'no-post-found',
                'LinkedIn did not return a post. Reload it, right-click inside the post, and retry.',
              );
            }
            signal.throwIfAborted();
            if (!response.ok || !('context' in response)) {
              if (!response.ok && response.recipeId && !chrome.extension.inIncognitoContext) {
                await storageRepository.quarantineLayoutRecipe(response.recipeId, response.message);
              }
              throw new AppError(
                'unsupported-layout',
                response.ok ? 'No post was returned.' : response.message,
              );
            }
            await updateStage('validating');
            const context = postContextSchema.safeParse(response.context);
            if (!context.success || context.data.responseTarget.type !== 'post') {
              throw new AppError(
                'no-post-found',
                'Right-click inside the main post. Comments and replies can only be used in Reply.',
              );
            }
            const selectedPost = { ...context.data, discussion: [] };
            await storageRepository.updateSession((current) => ({
              ...current,
              activeTab: 'generate',
              refinement: {
                status: 'review',
                requestId: refinement.requestId,
                tabId: refinement.tabId,
                frameId: refinement.frameId,
                context: selectedPost,
                experiencePerspective: '',
                experienceConfirmed: false,
                retainSourceLink:
                  app.settings.retainRefinementSourceLink && Boolean(selectedPost.postPermalink),
                capturedAt: new Date().toISOString(),
              },
            }));
            await refresh();
            return selectedPost;
          } catch (error) {
            if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
            const resolved =
              error instanceof AppError
                ? error
                : new AppError('unknown', 'The selected post could not be prepared.');
            await storageRepository.updateSession((current) => ({
              ...current,
              refinement: {
                status: 'error',
                requestId: refinement.requestId,
                code: resolved.code,
                message: resolved.message,
              },
            }));
            await refresh();
            throw resolved;
          }
        },
        { requiresAiSetup: false },
      )
      .then(async (result) => {
        if (result) return;
        await storageRepository.updateSession((current) =>
          current.refinement.status === 'running' &&
          current.refinement.requestId === refinement.requestId
            ? { ...current, refinement: { status: 'idle' } }
            : current,
        );
        await refresh();
      });
  }, [app, job, refinement, refresh, session]);

  if (!app || !session) return null;

  const updateCompose = async (patch: Partial<typeof session.generateCompose>) => {
    await storageRepository.updateSession((current) => ({
      ...current,
      generateCompose: { ...current.generateCompose, ...patch },
    }));
    await refresh();
  };

  const persistRecord = async (
    next: RewriteHistoryRecord,
    refinementSuccess?: Extract<RefinementState, { status: 'success' }>,
  ) => {
    if (chrome.extension.inIncognitoContext) setEphemeral(next);
    else await storageRepository.addHistory(next);
    await storageRepository.updateSession((current) => ({
      ...current,
      activeRecordId: next.id,
      activeTab: 'generate',
      refinement: refinementSuccess ?? current.refinement,
      generateCompose: { original: '', goal: 'clearer', customGoal: '' },
    }));
    setEditingSource(false);
    await refresh();
  };

  const generate = () => {
    const compose = session.generateCompose;
    void job.run(async (signal) => {
      const completed = await rewriteContent(
        compose.original,
        compose.goal,
        compose.customGoal,
        structuredClone(app.profile),
        structuredClone(app.learnedPreferences),
        signal,
      );
      await persistRecord({ ...completed.record, mode: 'manual' });
      return completed.record;
    });
  };

  const createContextVersion = (
    review: Extract<RefinementState, { status: 'review' }>,
    previous?: RewriteHistoryRecord,
  ) => {
    if (app.settings.requireExperienceConfirmation && !review.experienceConfirmed) {
      job.setError('Confirm the experience perspective before creating your version.');
      return;
    }
    reviewCache.current = review;
    void job
      .run(async (signal) => {
        await storageRepository.updateSession((current) => ({
          ...current,
          refinement: {
            status: 'running',
            requestId: review.requestId,
            tabId: review.tabId,
            frameId: review.frameId,
            stage: 'refining',
            startedAt: new Date().toISOString(),
          },
        }));
        const completed = await refineLinkedInPost(
          review.context,
          review.experiencePerspective,
          review.retainSourceLink,
          structuredClone(app.profile),
          structuredClone(app.learnedPreferences),
          signal,
        );
        await storageRepository.updateSession((current) => ({
          ...current,
          refinement:
            current.refinement.status === 'running'
              ? { ...current.refinement, stage: 'saving' }
              : current.refinement,
        }));
        const next =
          previous && previous.type === 'rewrite'
            ? {
                ...(addRevision(
                  previous,
                  completed.record.currentText,
                  completed.record.provider,
                ) as RewriteHistoryRecord),
                mode: completed.record.mode,
                source: completed.record.source,
                experiencePerspective: completed.record.experiencePerspective,
                retainSourceLink: completed.record.retainSourceLink,
                grounding: completed.record.grounding,
              }
            : completed.record;
        const success = {
          status: 'success' as const,
          requestId: review.requestId,
          recordId: next.id,
          context: review.context,
          tabId: review.tabId,
          frameId: review.frameId,
          experiencePerspective: review.experiencePerspective,
          experienceConfirmed: review.experienceConfirmed,
          retainSourceLink: review.retainSourceLink,
        };
        await persistRecord(next, success);
        return next;
      })
      .then(async (result) => {
        if (result) return;
        const cached = reviewCache.current;
        if (!cached) return;
        await storageRepository.updateSession((current) =>
          current.refinement.status === 'running' &&
          current.refinement.requestId === cached.requestId
            ? { ...current, refinement: cached }
            : current,
        );
        await refresh();
      });
  };

  const resetToManual = async () => {
    await storageRepository.updateSession((current) => {
      const next = {
        ...current,
        activeTab: 'generate' as const,
        refinement: { status: 'idle' as const },
      };
      delete next.activeRecordId;
      return next;
    });
    setEphemeral(null);
    await refresh();
  };

  if (refinement?.status === 'pending' || refinement?.status === 'running') {
    const stage =
      refinement.status === 'running'
        ? REFINEMENT_STAGE_LABELS[refinement.stage]
        : 'Preparing the selected post';
    return (
      <div className="pt-4">
        <ProgressState stage={stage} onCancel={job.cancel} />
      </div>
    );
  }

  if (refinement?.status === 'error') {
    const setupError = ['setup-incomplete', 'permission-missing'].includes(refinement.code);
    return (
      <>
        <PageHeading
          title={setupError ? 'Finish setup first' : 'No post found'}
          description={
            setupError
              ? 'The selected post has not been sent to an AI provider.'
              : 'The right-click was outside a supported rendered post boundary.'
          }
          compact
        />
        <EmptyState
          title={setupError ? 'Your perspective needs grounding' : 'Right-click inside the post'}
          description={refinement.message}
          action={
            <div className="flex gap-2">
              {setupError ? (
                <Button
                  onClick={() =>
                    void storageRepository
                      .updateSession((current) => ({
                        ...current,
                        activeTab: 'settings',
                        refinement: { status: 'idle' },
                      }))
                      .then(refresh)
                  }
                >
                  Review Settings
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => void resetToManual()}>
                Back to Refine
              </Button>
            </div>
          }
        />
      </>
    );
  }

  if (refinement?.status === 'review') {
    return (
      <ContextRefinementReview
        review={refinement}
        profile={app.profile}
        preferences={app.learnedPreferences.acceptedSummary}
        error={job.error}
        running={job.running}
        requireConfirmation={app.settings.requireExperienceConfirmation}
        onCreate={createContextVersion}
        onCancel={resetToManual}
      />
    );
  }

  const contextRecord = record?.mode === 'context' ? record : null;
  if (refinement?.status === 'success' && contextRecord) {
    const adjustLens = async () => {
      if (!refinement.context) return;
      await storageRepository.updateSession((current) => ({
        ...current,
        refinement: {
          status: 'review',
          requestId: refinement.requestId,
          tabId: refinement.tabId ?? 1,
          frameId: refinement.frameId ?? 0,
          context: refinement.context as PostContext,
          experiencePerspective: refinement.experiencePerspective ?? '',
          experienceConfirmed: refinement.experienceConfirmed ?? true,
          retainSourceLink: refinement.retainSourceLink ?? false,
          capturedAt: new Date().toISOString(),
        },
      }));
      await refresh();
    };
    return (
      <RefinementResult
        record={contextRecord}
        error={job.error}
        running={job.running}
        onAdjust={adjustLens}
        onRegenerate={() => {
          if (!refinement.context) return;
          createContextVersion(
            {
              status: 'review',
              requestId: refinement.requestId,
              tabId: refinement.tabId ?? 1,
              frameId: refinement.frameId ?? 0,
              context: refinement.context,
              experiencePerspective: refinement.experiencePerspective ?? '',
              experienceConfirmed: refinement.experienceConfirmed ?? true,
              retainSourceLink: refinement.retainSourceLink ?? false,
              capturedAt: new Date().toISOString(),
            },
            contextRecord,
          );
        }}
        onUpdate={async (next, feedback) => {
          if (chrome.extension.inIncognitoContext) setEphemeral(next);
          else await storageRepository.addHistory(next, feedback ? { feedback } : undefined);
          await refresh();
        }}
      />
    );
  }

  const compose = session.generateCompose;
  if (!record || editingSource) {
    return (
      <>
        <PageHeading
          title="Refine your content"
          description="Paste text and reshape it using your saved writing profile and voice."
          compact
          action={
            record ? (
              <Button size="compact" onClick={() => setEditingSource(false)}>
                Back to result
              </Button>
            ) : undefined
          }
        />
        <Card className="p-4">
          <FieldGroup>
            <Label htmlFor="rewrite-source">Content to refine</Label>
            <Textarea
              id="rewrite-source"
              value={compose.original}
              onChange={(event) => void updateCompose({ original: event.target.value })}
              placeholder="Paste a paragraph, draft, note or post here."
              className="min-h-[180px]"
              maxLength={12_000}
            />
          </FieldGroup>
          <FieldGroup className="mt-3">
            <Label htmlFor="rewrite-goal">Refinement goal</Label>
            <SelectRoot
              value={compose.goal}
              onValueChange={(value) => void updateCompose({ goal: value as RewriteGoal })}
            >
              <SelectTrigger id="rewrite-goal">
                <span>{goalLabel(compose.goal)}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clearer">Polish and clarify</SelectItem>
                <SelectItem value="shorter">Make it more concise</SelectItem>
                <SelectItem value="more-professional">More professional</SelectItem>
                <SelectItem value="more-conversational">Make it conversational</SelectItem>
                <SelectItem value="custom">Custom goal</SelectItem>
              </SelectContent>
            </SelectRoot>
          </FieldGroup>
          {compose.goal === 'custom' ? (
            <FieldGroup className="mt-3">
              <Label htmlFor="custom-rewrite-goal">Custom goal</Label>
              <Input
                id="custom-rewrite-goal"
                value={compose.customGoal}
                onChange={(event) => void updateCompose({ customGoal: event.target.value })}
              />
            </FieldGroup>
          ) : null}
          <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-muted before:font-bold before:text-proof before:content-['✓']">
            Uses your tone, writing profile, style guide, and accepted preferences.
          </p>
          {job.error ? (
            <p role="alert" className="mt-2 text-[11px] text-danger">
              {job.error}
            </p>
          ) : null}
          <div className="mt-3 flex justify-end">
            <Button variant="primary" disabled={job.running} onClick={generate}>
              {job.running ? 'Refining…' : 'Refine content'}
            </Button>
          </div>
        </Card>
      </>
    );
  }

  const updateManualRecord = async (next: RewriteHistoryRecord, feedback?: Feedback) => {
    if (chrome.extension.inIncognitoContext) setEphemeral(next);
    else await storageRepository.addHistory(next, feedback ? { feedback } : undefined);
    await refresh();
  };
  const regenerate = () => {
    void job.run(async (signal) => {
      const completed = await rewriteContent(
        record.original,
        record.goal,
        record.customGoal,
        structuredClone(app.profile),
        structuredClone(app.learnedPreferences),
        signal,
      );
      const next = addRevision(record, completed.record.currentText, completed.record.provider);
      if (next.type === 'rewrite') await persistRecord(next);
      return next;
    });
  };
  return (
    <ManualRefinementResult
      record={record}
      error={job.error}
      running={job.running}
      onRegenerate={regenerate}
      onEditSource={() => {
        void updateCompose({
          original: record.original,
          goal: record.goal,
          customGoal: record.customGoal,
        });
        setEditingSource(true);
      }}
      onUpdate={updateManualRecord}
    />
  );
}

function ContextRefinementReview({
  review,
  profile,
  preferences,
  error,
  running,
  requireConfirmation,
  onCreate,
  onCancel,
}: {
  review: Extract<RefinementState, { status: 'review' }>;
  profile: {
    role: string;
    audience: string;
    topics: string[];
    tone: string;
    customTone: string;
    styleGuide: string;
  };
  preferences: string;
  error: string | null;
  running: boolean;
  requireConfirmation: boolean;
  onCreate: (review: Extract<RefinementState, { status: 'review' }>) => void;
  onCancel: () => Promise<void>;
}) {
  const context = review.context;
  const tone = profile.tone === 'custom' ? profile.customTone : profile.tone;
  const [experiencePerspective, setExperiencePerspective] = useState(review.experiencePerspective);
  const [experienceConfirmed, setExperienceConfirmed] = useState(review.experienceConfirmed);
  const [retainSourceLink, setRetainSourceLink] = useState(review.retainSourceLink);
  const [sourcePermalink, setSourcePermalink] = useState(context.postPermalink ?? '');
  const [sourceLinkAttempted, setSourceLinkAttempted] = useState(false);
  const sourceLinkInput = useRef<HTMLInputElement>(null);
  const resolvedPermalink = normalizeLinkedInPostUrl(sourcePermalink);
  const showSourceLinkError =
    retainSourceLink &&
    !resolvedPermalink &&
    (sourceLinkAttempted || Boolean(sourcePermalink.trim()));
  const contextForReview = { ...context };
  if (resolvedPermalink) contextForReview.postPermalink = resolvedPermalink;
  else delete contextForReview.postPermalink;
  const currentReview = {
    ...review,
    context: contextForReview,
    experiencePerspective,
    experienceConfirmed,
    retainSourceLink,
  };
  return (
    <>
      <PageHeading
        title="Review the source and your lens"
        description="Nothing is generated until you confirm both."
        compact
        action={<StatusBadge>Ready</StatusBadge>}
      />
      <Card className="space-y-4 p-4">
        <section>
          <p className="font-utility text-[10px] font-[650] uppercase tracking-[0.08em] text-proof">
            01 · Selected source
          </p>
          <div className="mt-2 rounded-lg border border-rule bg-soft p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong className="text-xs">{context.author}’s LinkedIn post</strong>
                <p className="mt-0.5 text-[10px] text-muted">
                  {String(context.wordCount)} words · rendered DOM only
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-[650] text-proof">
                <Check className="size-3" /> Confirmed
              </span>
            </div>
            <p className="mt-3 line-clamp-5 whitespace-pre-wrap text-[11.5px] leading-relaxed">
              {context.postText}
            </p>
          </div>
        </section>
        <section>
          <p className="font-utility text-[10px] font-[650] uppercase tracking-[0.08em] text-proof">
            02 · Your saved lens
          </p>
          <dl className="mt-2 grid gap-2 rounded-lg border border-rule p-3 text-[10.5px]">
            <LensRow label="Profile" value={`${profile.role} · ${profile.audience}`} />
            <LensRow label="Experience" value={profile.topics.join(' · ')} />
            <LensRow label="Tone" value={[tone, profile.styleGuide].filter(Boolean).join(' · ')} />
            <LensRow
              label="Preferences"
              value={preferences || 'Saved local feedback preferences will be applied.'}
            />
          </dl>
          <FieldGroup className="mt-3">
            <Label htmlFor="refinement-experience">Experience perspective</Label>
            <Textarea
              id="refinement-experience"
              value={experiencePerspective}
              onChange={(event) => {
                setExperiencePerspective(event.target.value);
                setExperienceConfirmed(false);
              }}
              placeholder="Describe one experience you want to add, or leave blank for no personal claim."
              className="min-h-24"
              maxLength={2_000}
            />
          </FieldGroup>
          {requireConfirmation ? (
            <label className="mt-2 flex cursor-pointer items-start gap-2 text-[10.5px] leading-relaxed text-muted">
              <input
                type="checkbox"
                className="mt-0.5 size-3.5 accent-primary"
                checked={experienceConfirmed}
                onChange={(event) => {
                  setExperienceConfirmed(event.target.checked);
                }}
              />
              <span>
                I confirm Thoughtline may use only the experience written above; if it is blank,
                make no personal experience claim.
              </span>
            </label>
          ) : null}
        </section>
        <section>
          <p className="font-utility text-[10px] font-[650] uppercase tracking-[0.08em] text-proof">
            03 · Origin and safeguards
          </p>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-rule p-3">
            <div>
              <strong className="text-[11px]">Keep the original source link</strong>
              <p className="mt-0.5 text-[10px] text-muted">
                {resolvedPermalink
                  ? 'Adds reviewable attribution to your draft.'
                  : retainSourceLink
                    ? 'Paste the LinkedIn post link below to add attribution.'
                    : 'Optional. Turn on to add the source link.'}
              </p>
            </div>
            <SwitchControl
              aria-label="Keep original source link"
              checked={retainSourceLink}
              onCheckedChange={(checked) => {
                setRetainSourceLink(checked);
                if (!checked) setSourceLinkAttempted(false);
              }}
            />
          </div>
          {retainSourceLink && !context.postPermalink ? (
            <FieldGroup className="mt-2">
              <Label htmlFor="refinement-source-link">
                Original LinkedIn post link <span className="text-danger">(required)</span>
              </Label>
              <Input
                ref={sourceLinkInput}
                id="refinement-source-link"
                type="url"
                inputMode="url"
                value={sourcePermalink}
                onChange={(event) => {
                  setSourcePermalink(event.target.value);
                }}
                placeholder="Paste the post’s full LinkedIn URL"
                maxLength={2_048}
                aria-invalid={showSourceLinkError}
                aria-describedby="refinement-source-link-help"
              />
              <p
                id="refinement-source-link-help"
                role={showSourceLinkError ? 'alert' : undefined}
                className={
                  resolvedPermalink
                    ? 'text-[10px] text-proof'
                    : showSourceLinkError
                      ? 'text-[10px] text-danger'
                      : 'text-[10px] text-muted'
                }
              >
                {resolvedPermalink
                  ? 'Link ready. Tracking parameters will be removed.'
                  : showSourceLinkError
                    ? 'Paste a complete LinkedIn post or feed-update link.'
                    : 'Required because LinkedIn did not expose this post’s permalink.'}
              </p>
            </FieldGroup>
          ) : null}
          <div className="mt-2 flex gap-2 rounded-lg border border-[#a8c6c3] bg-proof-soft p-3 text-[10.5px] leading-relaxed text-proof">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <p>
              The draft may use only experience you confirm. It must add a distinct point of view,
              avoid close phrasing, and never invent a result or role.
            </p>
          </div>
        </section>
      </Card>
      {error ? (
        <p role="alert" className="mt-3 text-[11px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => void onCancel()}>
          Use pasted content
        </Button>
        <Button
          variant="primary"
          disabled={running}
          onClick={() => {
            if (retainSourceLink && !resolvedPermalink) {
              setSourceLinkAttempted(true);
              sourceLinkInput.current?.focus();
              return;
            }
            onCreate(currentReview);
          }}
        >
          {running ? 'Creating…' : 'Create my version'}
        </Button>
      </div>
    </>
  );
}

function normalizeLinkedInPostUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLocaleLowerCase();
    if (
      url.protocol !== 'https:' ||
      (hostname !== 'linkedin.com' && !hostname.endsWith('.linkedin.com')) ||
      (!url.pathname.includes('/feed/update/') && !url.pathname.includes('/posts/'))
    ) {
      return undefined;
    }
    url.hostname = 'www.linkedin.com';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

function LensRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-2">
      <dt className="font-[650] text-ink">{label}</dt>
      <dd className="line-clamp-2 text-muted">{value || 'Not set'}</dd>
    </div>
  );
}

function RefinementResult({
  record,
  error,
  running,
  onAdjust,
  onRegenerate,
  onUpdate,
}: {
  record: RewriteHistoryRecord;
  error: string | null;
  running: boolean;
  onAdjust: () => Promise<void>;
  onRegenerate: () => void;
  onUpdate: (record: RewriteHistoryRecord, feedback?: Feedback) => Promise<void>;
}) {
  const rate = (rating: 'liked' | 'disliked') => {
    const feedback = feedbackAfterRating(
      record.feedback,
      record.generatedText,
      record.currentText,
      rating,
    );
    void onUpdate({ ...record, updatedAt: new Date().toISOString(), feedback }, feedback);
  };
  return (
    <>
      <PageHeading
        title="Your version is ready"
        description={`Profile-grounded post${record.retainSourceLink ? ' · source link retained' : ''}`}
        compact
        action={<StatusBadge>Saved</StatusBadge>}
      />
      {error ? (
        <p role="alert" className="mb-3 text-[11px] text-danger">
          {error}
        </p>
      ) : null}
      <Card className="p-4">
        <div className="rounded-lg border border-[#a8c6c3] bg-proof-soft p-3 text-[10.5px] leading-relaxed text-proof">
          <strong>Your distinct lens:</strong>{' '}
          {record.experiencePerspective ||
            'Your saved professional profile, without a personal experience claim.'}
        </div>
        <div className="mt-3 flex min-h-[34px] items-center justify-between gap-2">
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
          aria-label="Editable refined post"
          onChange={(event) => {
            const feedback = feedbackAfterEdit(
              record.feedback,
              record.generatedText,
              event.target.value,
            );
            void onUpdate(
              {
                ...record,
                currentText: event.target.value,
                updatedAt: new Date().toISOString(),
                ...(feedback ? { feedback } : {}),
              },
              feedback,
            );
          }}
          className="mt-3 min-h-[280px]"
        />
        <AccordionRoot className="mt-3 space-y-3" type="multiple" defaultValue={['grounding']}>
          <AccordionItem value="grounding">
            <AccordionTrigger>Grounding report</AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-2 text-[10.5px] leading-relaxed text-muted">
                {record.grounding?.safeguards.map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 size-3 shrink-0 text-proof" /> {item}
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="source">
            <AccordionTrigger>Original source and provenance</AccordionTrigger>
            <AccordionContent className="space-y-2">
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed">{record.original}</p>
              {record.source?.permalink ? (
                <a
                  href={record.source.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10.5px] text-proof underline"
                >
                  Open {record.source.author}’s LinkedIn post
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                <p className="text-[10.5px] text-muted">Source link unavailable.</p>
              )}
            </AccordionContent>
          </AccordionItem>
        </AccordionRoot>
        <div className="mt-3 flex justify-end">
          <Button variant="secondary" onClick={() => void onAdjust()}>
            Adjust my lens
          </Button>
        </div>
      </Card>
    </>
  );
}

function ManualRefinementResult({
  record,
  error,
  running,
  onRegenerate,
  onEditSource,
  onUpdate,
}: {
  record: RewriteHistoryRecord;
  error: string | null;
  running: boolean;
  onRegenerate: () => void;
  onEditSource: () => void;
  onUpdate: (record: RewriteHistoryRecord, feedback?: Feedback) => Promise<void>;
}) {
  const rate = (rating: 'liked' | 'disliked') => {
    const feedback = feedbackAfterRating(
      record.feedback,
      record.generatedText,
      record.currentText,
      rating,
    );
    void onUpdate({ ...record, updatedAt: new Date().toISOString(), feedback }, feedback);
  };
  return (
    <>
      <PageHeading
        title="Your refined version"
        description="Edit the result until it sounds right."
        compact
        actionAlign="center"
        action={
          <Button size="compact" onClick={onEditSource}>
            Edit source
          </Button>
        }
      />
      {error ? (
        <p className="mb-3 rounded-lg border border-danger/30 bg-danger-bg p-3 text-[11px] text-danger">
          {error}
        </p>
      ) : null}
      <Card className="p-4">
        <StatusBadge>Refined in your voice</StatusBadge>
        <div className="flex min-h-[34px] items-center justify-between gap-2">
          <strong className="text-xs">Editable refinement</strong>
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
          aria-label="Editable refinement"
          onChange={(event) => {
            const feedback = feedbackAfterEdit(
              record.feedback,
              record.generatedText,
              event.target.value,
            );
            void onUpdate(
              {
                ...record,
                currentText: event.target.value,
                updatedAt: new Date().toISOString(),
                ...(feedback ? { feedback } : {}),
              },
              feedback,
            );
          }}
          className="mt-3 min-h-[280px]"
        />
        <AccordionRoot className="mt-3" type="single" defaultValue="original" collapsible>
          <AccordionItem value="original">
            <AccordionTrigger>Original content</AccordionTrigger>
            <AccordionContent>
              <p className="whitespace-pre-wrap text-[11.5px] leading-[1.5] text-muted">
                {record.original}
              </p>
            </AccordionContent>
          </AccordionItem>
        </AccordionRoot>
      </Card>
    </>
  );
}

function goalLabel(goal: RewriteGoal): string {
  return {
    clearer: 'Polish and clarify',
    shorter: 'Make it more concise',
    'more-professional': 'More professional',
    'more-conversational': 'Make it conversational',
    custom: 'Custom goal',
  }[goal];
}
