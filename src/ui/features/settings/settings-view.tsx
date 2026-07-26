import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ExternalLink, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { collectFeedbackExamples } from '../../../application/feedback';
import {
  analyzeFeedbackPreferences,
  analyzeStyle,
  deriveProfile,
} from '../../../application/workflows';
import { collectWritingSamples } from '../../../application/writing-samples';
import {
  isProfileComplete,
  isProviderReady,
  defaultAppData,
  writingProfileSchema,
  type AppData,
  type RetentionPolicy,
  type SourceName,
  type WritingProfile,
} from '../../../domain/schemas';
import type { CalibratedLayoutRecipe } from '../../../domain/calibration';
import {
  hasLinkedInPermission,
  hasProviderPermissions,
  requestLinkedInPermission,
  requestSourcePermissions,
  requestUnlimitedStorage,
} from '../../../infrastructure/permissions';
import { storageRepository } from '../../../infrastructure/storage/chrome-storage';
import { sendRuntimeMessage } from '../../../shared/protocol';
import { useForegroundJob } from '../../hooks/use-foreground-job';
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
import { DialogContent, DialogRoot } from '../../primitives/dialog';
import { Input } from '../../primitives/input';
import { FieldGroup, Label } from '../../primitives/label';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '../../primitives/select';
import { SwitchControl } from '../../primitives/switch';
import { Textarea } from '../../primitives/textarea';
import { PageHeading, StatusBadge } from '../../components/common';
import { ApiKeysPanel } from './api-keys-panel';
import { ArchiveDialogs } from './archive-dialogs';

const SOURCES: Array<{ id: SourceName; label: string }> = [
  { id: 'hacker-news', label: 'Hacker News' },
  { id: 'dev', label: 'DEV' },
  { id: 'medium', label: 'Medium' },
  { id: 'lobsters', label: 'Lobsters' },
  { id: 'stack-overflow', label: 'Stack Overflow' },
];

const LENGTH_OPTIONS: Array<{
  value: WritingProfile['length'];
  label: string;
  wordCount: string;
}> = [
  { value: 'concise', label: 'Concise', wordCount: 'Up to 35 words' },
  { value: 'standard', label: 'Standard', wordCount: '36–70 words' },
  { value: 'detailed', label: 'Detailed', wordCount: '71–120 words' },
];

export function SettingsView() {
  const { app, saveApp } = useAppStore();
  const styleJob = useForegroundJob();
  const profileJob = useForegroundJob();
  const [linkedInAllowed, setLinkedInAllowed] = useState(false);
  const [providersAllowed, setProvidersAllowed] = useState(false);
  const [clearProfileOpen, setClearProfileOpen] = useState(false);
  const [pendingRetention, setPendingRetention] = useState<RetentionPolicy | null>(null);
  const [pendingStyle, setPendingStyle] = useState<string | null>(null);
  const [newSample, setNewSample] = useState('');
  const [sampleDrafts, setSampleDrafts] = useState<string[]>([]);
  const [profileSuggestion, setProfileSuggestion] = useState<{
    role: string;
    topics: string[];
    audience: string;
  } | null>(null);
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [diagnosticCopied, setDiagnosticCopied] = useState(false);
  const [feedbackReviewOpen, setFeedbackReviewOpen] = useState(false);
  const [pendingLearnedSummary, setPendingLearnedSummary] = useState<string | null>(null);
  const [resetPreferencesOpen, setResetPreferencesOpen] = useState(false);
  const [layoutRecipes, setLayoutRecipes] = useState<CalibratedLayoutRecipe[]>([]);
  const [resetLayoutsOpen, setResetLayoutsOpen] = useState(false);
  const feedbackJob = useForegroundJob();

  const form = useForm<WritingProfile>({
    resolver: zodResolver(writingProfileSchema),
    defaultValues: app?.profile ?? defaultAppData.profile,
  });

  useEffect(() => {
    if (app) form.reset(app.profile);
  }, [app, form]);

  useEffect(() => {
    if (app) setSampleDrafts(app.profile.writingSamples);
  }, [app]);

  useEffect(() => {
    void Promise.all([hasLinkedInPermission(), hasProviderPermissions()]).then(
      ([linkedIn, providers]) => {
        setLinkedInAllowed(linkedIn);
        setProvidersAllowed(providers);
      },
    );
  }, [app?.settings]);

  useEffect(() => {
    if (chrome.extension.inIncognitoContext) return;
    void storageRepository.loadLayoutRecipes().then(setLayoutRecipes);
  }, [app]);

  const readiness = useMemo(() => {
    if (!app) return [];
    return [
      { label: 'Permission', ready: linkedInAllowed && app.settings.consent.accepted },
      { label: 'AI services', ready: providersAllowed && isProviderReady(app.settings) },
      { label: 'Writing profile', ready: isProfileComplete(app.profile) },
      { label: 'Ideas', ready: true },
    ];
  }, [app, linkedInAllowed, providersAllowed]);
  const feedbackExamples = useMemo(
    () =>
      app
        ? collectFeedbackExamples(app.history, app.learnedPreferences.analyzedFeedbackIds, 12)
        : [],
    [app],
  );

  if (!app) return null;

  const saveProfile = async (profile: WritingProfile) => {
    await saveApp({ ...app, profile });
  };

  const saveProfileForm = form.handleSubmit(saveProfile);

  const toggleResearch = async (enabled: boolean) => {
    if (enabled && !(await requestSourcePermissions(app.settings.selectedSources))) return;
    await saveApp({ ...app, settings: { ...app.settings, publicResearchEnabled: enabled } });
  };

  const toggleSource = async (source: SourceName, selected: boolean) => {
    if (
      selected &&
      app.settings.publicResearchEnabled &&
      !(await requestSourcePermissions([source]))
    )
      return;
    const selectedSources = selected
      ? [...new Set([...app.settings.selectedSources, source])]
      : app.settings.selectedSources.filter((item) => item !== source);
    if (selectedSources.length === 0) return;
    await saveApp({ ...app, settings: { ...app.settings, selectedSources } });
  };

  const chooseRetention = async (retention: RetentionPolicy) => {
    if (retention === 'forever' && !(await requestUnlimitedStorage())) return;
    if (retentionWouldPrune(app, retention) > 0) setPendingRetention(retention);
    else await saveApp({ ...app, settings: { ...app.settings, retention } });
  };

  const saveRefinementSettings = async (
    patch: Partial<
      Pick<
        AppData['settings'],
        'contextRefinementEnabled' | 'retainRefinementSourceLink' | 'requireExperienceConfirmation'
      >
    >,
  ) => {
    await saveApp({ ...app, settings: { ...app.settings, ...patch } });
    if ('contextRefinementEnabled' in patch) {
      await sendRuntimeMessage({ type: 'integration:sync' });
    }
  };

  const importProfile = (file: File) => {
    if (!ownershipConfirmed) return;
    void profileJob.run(async (signal) => {
      const { extractProfessionalPdfText } = await import('../../../application/profile-pdf');
      const professionalText = await extractProfessionalPdfText(file);
      const derived = await deriveProfile(professionalText, signal);
      setProfileSuggestion(derived.value);
      setOwnershipConfirmed(false);
      return derived.value;
    });
  };

  const createStyleGuide = () => {
    const samples = collectWritingSamples(sampleDrafts, newSample);
    if (samples.length === 0) return;
    void styleJob.run(async (signal) => {
      const result = await analyzeStyle(samples, signal);
      setPendingStyle(result.value.styleGuide);
      return result.value;
    });
  };

  const saveWritingSamples = async (samples: string[]) => {
    const normalized = collectWritingSamples(samples);
    setSampleDrafts(normalized);
    await saveApp({
      ...app,
      profile: { ...app.profile, writingSamples: normalized },
    });
  };

  const addWritingSample = async () => {
    if (!newSample.trim() || sampleDrafts.length >= 8) return;
    await saveWritingSamples([...sampleDrafts, newSample]);
    setNewSample('');
  };

  const reviewFeedback = () => {
    if (feedbackExamples.length < 3) return;
    void feedbackJob.run(async (signal) => {
      const result = await analyzeFeedbackPreferences(
        feedbackExamples,
        app.learnedPreferences.acceptedSummary,
        signal,
      );
      setPendingLearnedSummary(result.value.summary);
      return result.value;
    });
  };

  const copyDiagnostics = async () => {
    const diagnostic = {
      product: 'Thoughtline',
      version: chrome.runtime.getManifest().version,
      chrome: navigator.userAgent,
      timestamp: new Date().toISOString(),
      states: {
        linkedinPermission: linkedInAllowed,
        providerOrigins: providersAllowed,
        providerReadiness: isProviderReady(app.settings),
        profileComplete: isProfileComplete(app.profile),
        historyCount: app.history.length,
        calibratedLayoutCount: layoutRecipes.length,
        quarantinedLayoutCount: layoutRecipes.filter((recipe) => recipe.status === 'quarantined')
          .length,
      },
    };
    await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2));
    setDiagnosticCopied(true);
  };

  return (
    <>
      <PageHeading
        title="Settings"
        description="Manage setup, tone and connections."
        compact
        action={<span className="font-utility text-[11px] font-[650] text-proof">Auto-saved</span>}
      />
      <Card className="mb-3 rounded-[10px] border-[#a8c6c3] bg-[linear-gradient(180deg,var(--color-surface),var(--color-proof-soft))] p-4">
        <div className="flex items-center gap-2 text-[11px] font-[650] leading-[1.2] text-proof">
          <span className="size-[7px] rounded-full bg-proof" />
          Ready to write
        </div>
        <h3 className="mt-1 font-display text-[16px] font-[680] leading-[1.35]">
          Your essentials are{' '}
          {readiness.every((item) => item.ready) ? 'complete' : 'not complete yet'}.
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {readiness.map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#c7ddd9] bg-surface px-2 py-1 text-[11px] text-proof"
            >
              {item.ready ? <Check className="size-3" /> : null}
              {item.label}
            </span>
          ))}
        </div>
      </Card>
      <AccordionRoot type="multiple" className="space-y-3">
        <SettingsSection
          value="connections"
          title="Connections"
          subtitle={`${linkedInAllowed ? 'LinkedIn allowed' : 'LinkedIn not allowed'} · Gemini and Groq ${isProviderReady(app.settings) ? 'ready' : 'need review'}`}
        >
          <ConnectionRow
            icon="in"
            title="LinkedIn page permission"
            description="Chrome site access—no LinkedIn account connection"
            status={linkedInAllowed ? 'Allowed' : 'Needed'}
          />
          <ConnectionRow
            icon="AI"
            title="Gemini"
            description="Primary provider for every writing workflow"
            status={app.settings.providerValidation.gemini.state === 'valid' ? 'Ready' : 'Review'}
          />
          <ConnectionRow
            icon="GQ"
            title="Groq"
            description="Automatic fallback for every writing workflow"
            status={app.settings.providerValidation.groq.state === 'valid' ? 'Ready' : 'Review'}
          />
          <div className="flex justify-end border-t border-rule pt-3">
            {!linkedInAllowed ? (
              <Button
                onClick={() => {
                  void (async () => {
                    const allowed = await requestLinkedInPermission();
                    setLinkedInAllowed(allowed);
                    await sendRuntimeMessage({ type: 'integration:sync' });
                  })();
                }}
              >
                Allow LinkedIn
              </Button>
            ) : (
              <StatusBadge>Permission</StatusBadge>
            )}
          </div>
          <ApiKeysPanel app={app} onSave={saveApp} />
          <div className="rounded-lg border border-rule bg-soft p-3 text-[10.5px] leading-relaxed text-muted">
            AI work is sent directly to Gemini, with one automatic Groq fallback. Free-tier handling
            and retention follow your provider accounts.{' '}
            <a
              className="text-proof underline"
              href="https://ai.google.dev/gemini-api/terms"
              target="_blank"
              rel="noreferrer"
            >
              Gemini controls <ExternalLink className="inline size-3" />
            </a>
            {' · '}
            <a
              className="text-proof underline"
              href="https://console.groq.com/docs/your-data"
              target="_blank"
              rel="noreferrer"
            >
              Groq controls <ExternalLink className="inline size-3" />
            </a>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <strong className="text-xs">AI processing permission</strong>
              <p className="mt-1 text-[10.5px] text-muted">Required only for new AI work.</p>
            </div>
            <Button
              variant={app.settings.consent.accepted ? 'danger' : 'secondary'}
              onClick={() =>
                void saveApp({
                  ...app,
                  settings: {
                    ...app.settings,
                    consent: {
                      accepted: !app.settings.consent.accepted,
                      version: 1,
                      ...(!app.settings.consent.accepted
                        ? { acceptedAt: new Date().toISOString() }
                        : {}),
                    },
                  },
                })
              }
            >
              {app.settings.consent.accepted ? 'Revoke' : 'Allow'}
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection
          value="context-refinement"
          title="Context-menu refinement"
          subtitle={`${app.settings.contextRefinementEnabled ? 'Profile-grounded' : 'Hidden'} · ${app.settings.retainRefinementSourceLink ? 'source link kept' : 'source link optional'}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <strong className="text-xs">Show “Refine the post to make your own”</strong>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                Available when you right-click inside a rendered LinkedIn post.
              </p>
            </div>
            <SwitchControl
              aria-label="Show context-menu post refinement"
              checked={app.settings.contextRefinementEnabled}
              onCheckedChange={(checked) =>
                void saveRefinementSettings({ contextRefinementEnabled: checked })
              }
            />
          </div>
          <label className="flex cursor-pointer items-start gap-2 border-t border-rule pt-3 text-[10.5px] leading-relaxed text-muted">
            <input
              className="mt-0.5"
              type="checkbox"
              checked={app.settings.retainRefinementSourceLink}
              onChange={(event) =>
                void saveRefinementSettings({
                  retainRefinementSourceLink: event.target.checked,
                })
              }
            />
            <span>Keep the original post link in refined drafts by default.</span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-[10.5px] leading-relaxed text-muted">
            <input
              className="mt-0.5"
              type="checkbox"
              checked={app.settings.requireExperienceConfirmation}
              onChange={(event) =>
                void saveRefinementSettings({
                  requireExperienceConfirmation: event.target.checked,
                })
              }
            />
            <span>
              Require explicit confirmation before using an experience perspective or making a
              personal claim.
            </span>
          </label>
          <p className="rounded-lg border border-rule bg-soft p-3 text-[10.5px] leading-relaxed text-muted">
            The action uses your current profile, tone, style guide, and accepted preferences. Every
            draft stays editable and keeps its source provenance in History.
          </p>
        </SettingsSection>

        <SettingsSection
          value="history"
          title="History & storage"
          subtitle={`${retentionLabel(app.settings.retention)} · stored on this device`}
        >
          <FieldGroup>
            <Label>Retention</Label>
            <SelectRoot
              value={app.settings.retention}
              onValueChange={(value) => void chooseRetention(value as RetentionPolicy)}
            >
              <SelectTrigger>
                <span>{retentionLabel(app.settings.retention)}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest-20">Latest 20 items</SelectItem>
                <SelectItem value="latest-50">Latest 50 items</SelectItem>
                <SelectItem value="30-days">Keep for 30 days</SelectItem>
                <SelectItem value="forever">Keep until deleted</SelectItem>
              </SelectContent>
            </SelectRoot>
          </FieldGroup>
          <ArchiveDialogs app={app} onImport={saveApp} />
        </SettingsSection>

        <SettingsSection
          value="profile"
          title="Writing profile"
          subtitle={`${app.profile.role || 'Role not set'} · ${app.profile.audience || 'audience not set'}`}
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveProfileForm();
            }}
          >
            <Field label="Your role">
              <Input {...form.register('role')} onBlur={() => void saveProfileForm()} />
            </Field>
            <Field label="Topics you know well">
              <Input
                value={form.watch('topics').join(', ')}
                onChange={(event) =>
                  form.setValue(
                    'topics',
                    event.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                    { shouldValidate: true },
                  )
                }
                onBlur={() => void saveProfileForm()}
              />
              <p className="mt-1 text-[10px] text-muted">Separate topics with commas.</p>
            </Field>
            <Field label="People you want to reach">
              <Input {...form.register('audience')} onBlur={() => void saveProfileForm()} />
            </Field>
            <div className="rounded-lg border border-rule bg-soft p-3">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                <strong className="text-xs">Import your LinkedIn PDF</strong>
              </div>
              <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                Text is extracted locally, contact details are removed, and the raw file is
                discarded.
              </p>
              <label className="mt-3 flex items-start gap-2 text-[10.5px]">
                <input
                  type="checkbox"
                  checked={ownershipConfirmed}
                  onChange={(event) => setOwnershipConfirmed(event.target.checked)}
                />
                I own this LinkedIn PDF and want profile suggestions.
              </label>
              <Input
                type="file"
                accept="application/pdf"
                disabled={!ownershipConfirmed || profileJob.running}
                className="mt-3"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importProfile(file);
                }}
              />
              {profileJob.error ? (
                <p className="mt-2 text-[10.5px] text-danger">{profileJob.error}</p>
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button variant="danger" type="button" onClick={() => setClearProfileOpen(true)}>
                Clear profile
              </Button>
            </div>
          </form>
        </SettingsSection>

        <SettingsSection
          value="preferences"
          title="Writing preferences"
          subtitle={`${lengthLabel(form.watch('length'))} length · ${app.profile.writingLanguage === 'match-source' ? 'match source language' : app.profile.writingLanguage}`}
        >
          <Field label="Tone">
            <SelectRoot
              value={form.watch('tone')}
              onValueChange={(value) => {
                const tone = value as WritingProfile['tone'];
                form.setValue('tone', tone);
                void saveProfile({ ...form.getValues(), tone });
              }}
            >
              <SelectTrigger>
                <span>{toneLabel(form.watch('tone'))}</span>
              </SelectTrigger>
              <SelectContent>
                {[
                  'conversational',
                  'concise',
                  'analytical',
                  'supportive',
                  'challenging',
                  'custom',
                ].map((tone) => (
                  <SelectItem key={tone} value={tone}>
                    {toneLabel(tone as WritingProfile['tone'])}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </Field>
          {form.watch('tone') === 'custom' ? (
            <Field label="Custom tone instructions">
              <Textarea {...form.register('customTone')} onBlur={() => void saveProfileForm()} />
            </Field>
          ) : null}
          <Field label="Writing language">
            <SelectRoot
              value={form.watch('writingLanguage')}
              onValueChange={(value) => {
                const writingLanguage = value as WritingProfile['writingLanguage'];
                form.setValue('writingLanguage', writingLanguage);
                void saveProfile({ ...form.getValues(), writingLanguage });
              }}
            >
              <SelectTrigger>
                <span>{languageLabel(form.watch('writingLanguage'))}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="match-source">Match the source</SelectItem>
                <SelectItem value="english">English</SelectItem>
                <SelectItem value="bangla">Bangla</SelectItem>
              </SelectContent>
            </SelectRoot>
          </Field>
          <Field label="Length">
            <SelectRoot
              value={form.watch('length')}
              onValueChange={(value) => {
                const length = value as WritingProfile['length'];
                form.setValue('length', length);
                void saveProfile({ ...form.getValues(), length });
              }}
            >
              <SelectTrigger>
                <span className="flex items-baseline gap-2">
                  <span>{lengthLabel(form.watch('length'))}</span>
                  <span className="font-utility text-[10px] text-muted">
                    {lengthWordCount(form.watch('length'))}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent>
                {LENGTH_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} detail={option.wordCount}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </Field>
        </SettingsSection>

        <SettingsSection
          value="ideas"
          title="Ideas & research"
          subtitle={`${String(app.profile.topics.length)} topics · public research ${app.settings.publicResearchEnabled ? 'enabled' : 'optional'}`}
        >
          <div className="flex items-center justify-between gap-4 rounded-lg border border-rule bg-soft p-3">
            <div>
              <strong className="text-xs">Use public sources</strong>
              <p className="mt-1 text-[10.5px] text-muted">
                Include enabled sources in new searches.
              </p>
            </div>
            <SwitchControl
              checked={app.settings.publicResearchEnabled}
              onCheckedChange={(value) => void toggleResearch(value)}
            />
          </div>
          <Field label="Topics">
            <Input
              value={app.profile.topics.join(', ')}
              onChange={(event) =>
                form.setValue(
                  'topics',
                  event.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                )
              }
              onBlur={() => void saveProfileForm()}
            />
          </Field>
          <div className="overflow-hidden rounded-lg border border-rule">
            {SOURCES.map((source) => (
              <div
                key={source.id}
                className="flex min-h-10 items-center justify-between border-b border-rule px-3 text-xs last:border-b-0"
              >
                <span>{source.label}</span>
                <SwitchControl
                  size="mini"
                  aria-label={`Use ${source.label}`}
                  checked={app.settings.selectedSources.includes(source.id)}
                  onCheckedChange={(checked) => void toggleSource(source.id, checked)}
                />
              </div>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection
          value="tone"
          title="Tone & voice"
          subtitle={`${toneLabel(form.watch('tone'))} · ${form.watch('customTone').trim() ? 'custom guidance active' : 'custom guidance optional'}`}
        >
          {sampleDrafts.map((sample, index) => (
            <FieldGroup key={index}>
              <div className="flex items-center justify-between gap-2">
                <Label>{`Writing sample ${String(index + 1)}`}</Label>
                <button
                  type="button"
                  className="text-[10.5px] font-semibold text-muted hover:text-danger"
                  onClick={() =>
                    void saveWritingSamples(sampleDrafts.filter((_, item) => item !== index))
                  }
                >
                  Remove
                </button>
              </div>
              <Textarea
                aria-label={`Writing sample ${String(index + 1)}`}
                value={sample}
                onChange={(event) => {
                  const next = [...sampleDrafts];
                  next[index] = event.target.value;
                  setSampleDrafts(next);
                }}
                onBlur={() => void saveWritingSamples(sampleDrafts)}
                className="min-h-28"
              />
            </FieldGroup>
          ))}
          {sampleDrafts.length < 8 ? (
            <Field
              label={sampleDrafts.length === 0 ? 'Add a writing sample' : 'New writing sample'}
            >
              <Textarea
                aria-label="New writing sample"
                value={newSample}
                onChange={(event) => setNewSample(event.target.value)}
                className="min-h-28"
              />
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => void addWritingSample()}
              disabled={!newSample.trim() || sampleDrafts.length >= 8}
            >
              Add sample
            </Button>
            <Button
              variant="primary"
              onClick={createStyleGuide}
              disabled={styleJob.running || (sampleDrafts.length === 0 && !newSample.trim())}
            >
              {styleJob.running ? 'Creating…' : 'Create style guide'}
            </Button>
          </div>
          <Field label="Edit style guide">
            <Textarea
              value={app.profile.styleGuide}
              onChange={(event) =>
                void saveApp({
                  ...app,
                  profile: { ...app.profile, styleGuide: event.target.value },
                })
              }
              className="min-h-32"
            />
          </Field>
          <div className="rounded-lg border border-rule bg-soft p-3">
            <strong className="text-xs">Learned preferences</strong>
            <p className="mt-1 text-[10.5px] text-muted">
              {String(app.learnedPreferences.feedbackCount)} meaningful feedback examples.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                disabled={feedbackExamples.length < 3}
                onClick={() => setFeedbackReviewOpen(true)}
              >
                Review feedback
              </Button>
              <Button
                variant="danger"
                disabled={
                  !app.learnedPreferences.acceptedSummary &&
                  Object.keys(app.learnedPreferences.directionScores).length === 0 &&
                  Object.keys(app.learnedPreferences.featureScores).length === 0
                }
                onClick={() => setResetPreferencesOpen(true)}
              >
                Reset
              </Button>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          value="calibrated-layouts"
          title="Calibrated layouts"
          subtitle={`${String(layoutRecipes.filter((recipe) => recipe.status === 'active').length)} active · saved on this device`}
        >
          <p className="text-[10.5px] leading-relaxed text-muted">
            Structural recipes stay in this Chrome profile and are excluded from exports.
          </p>
          {layoutRecipes.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-rule bg-surface">
              {layoutRecipes.map((recipe) => (
                <div
                  key={recipe.id}
                  className="flex items-center justify-between gap-3 border-b border-rule px-3 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <strong className="text-[11px] capitalize">{recipe.kind}</strong>
                      <span
                        className={
                          recipe.status === 'active'
                            ? 'font-utility text-[9px] text-proof'
                            : 'font-utility text-[9px] text-warning'
                        }
                      >
                        {recipe.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[9.5px] text-muted">
                      {recipe.surface === 'post-detail' ? 'Post detail' : 'Feed'} ·{' '}
                      {String(recipe.validationCount)} examples ·{' '}
                      {new Date(recipe.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="compact"
                    onClick={() =>
                      void storageRepository.removeLayoutRecipe(recipe.id).then(async () => {
                        setLayoutRecipes(await storageRepository.loadLayoutRecipes());
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-rule bg-surface px-3 py-3 text-[10.5px] text-muted">
              No saved layouts. Use Thoughtline’s LinkedIn context menu to calibrate one.
            </p>
          )}
          {layoutRecipes.length > 0 ? (
            <div className="flex justify-end">
              <Button variant="danger" onClick={() => setResetLayoutsOpen(true)}>
                Reset all layouts
              </Button>
            </div>
          ) : null}
        </SettingsSection>

        <SettingsSection
          value="help"
          title="Help & support"
          subtitle="Diagnostics, privacy and project support"
        >
          <p className="text-[10.5px] leading-relaxed text-muted">
            Diagnostics stay on this device until you copy and share them. They exclude content and
            credentials.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              data-confirmed={diagnosticCopied || undefined}
              onClick={() => void copyDiagnostics()}
            >
              {diagnosticCopied ? 'Copied' : 'Copy diagnostics'}
            </Button>
            <Button asChild>
              <a href="https://www.supportkori.com/montasim" target="_blank" rel="noreferrer">
                Open support
              </a>
            </Button>
          </div>
        </SettingsSection>
      </AccordionRoot>

      <ConfirmDialog
        open={resetLayoutsOpen}
        onOpenChange={setResetLayoutsOpen}
        title="Reset all calibrated layouts?"
        description="Every active and quarantined structural recipe will be removed. Work History and writing preferences remain."
        confirmLabel="Reset layouts"
        onConfirm={async () => {
          await storageRepository.clearLayoutRecipes();
          setLayoutRecipes([]);
          setResetLayoutsOpen(false);
        }}
      />
      <ConfirmDialog
        open={clearProfileOpen}
        onOpenChange={setClearProfileOpen}
        title="Clear writing profile?"
        description="Role, topics, audience, and profile-derived data will be removed. History, API keys, Style Guide, and learned preferences remain."
        confirmLabel="Clear profile"
        onConfirm={async () => {
          await saveApp({
            ...app,
            profile: { ...app.profile, role: '', topics: [], audience: '' },
            settings: { ...app.settings, onboardingComplete: false },
          });
          setClearProfileOpen(false);
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingRetention)}
        onOpenChange={(open) => !open && setPendingRetention(null)}
        title="Apply stricter retention?"
        description={`${String(pendingRetention ? retentionWouldPrune(app, pendingRetention) : 0)} saved records will be removed immediately.`}
        confirmLabel="Apply retention"
        onConfirm={async () => {
          if (!pendingRetention) return;
          await saveApp({ ...app, settings: { ...app.settings, retention: pendingRetention } });
          setPendingRetention(null);
        }}
      />
      <DialogRoot
        open={Boolean(pendingStyle)}
        onOpenChange={(open) => !open && setPendingStyle(null)}
      >
        <DialogContent
          title="Review style guide"
          description="Nothing changes until you apply this editable guide."
        >
          <Textarea
            value={pendingStyle ?? ''}
            onChange={(event) => setPendingStyle(event.target.value)}
            className="min-h-64"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setPendingStyle(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!pendingStyle) return;
                void saveApp({ ...app, profile: { ...app.profile, styleGuide: pendingStyle } });
                setPendingStyle(null);
              }}
            >
              Apply style guide
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
      <DialogRoot
        open={feedbackReviewOpen}
        onOpenChange={(open) => {
          setFeedbackReviewOpen(open);
          if (!open) setPendingLearnedSummary(null);
        }}
      >
        <DialogContent
          title={pendingLearnedSummary ? 'Review learned preferences' : 'Review feedback evidence'}
          description={
            pendingLearnedSummary
              ? 'Edit the proposed guidance before it can affect later writing.'
              : `These ${String(feedbackExamples.length)} recent examples will be sent for one explicit analysis.`
          }
        >
          {pendingLearnedSummary ? (
            <>
              <Textarea
                value={pendingLearnedSummary}
                onChange={(event) => setPendingLearnedSummary(event.target.value)}
                className="min-h-52"
              />
              <div className="mt-4 flex justify-end gap-2">
                <Button onClick={() => setFeedbackReviewOpen(false)}>Reject</Button>
                <Button
                  variant="primary"
                  disabled={!pendingLearnedSummary.trim()}
                  onClick={() => {
                    const analyzedFeedbackIds = [
                      ...new Set([
                        ...feedbackExamples.map((example) => example.id),
                        ...app.learnedPreferences.analyzedFeedbackIds,
                      ]),
                    ].slice(0, 100);
                    void saveApp({
                      ...app,
                      learnedPreferences: {
                        ...app.learnedPreferences,
                        acceptedSummary: pendingLearnedSummary.trim(),
                        analyzedFeedbackIds,
                      },
                    });
                    setFeedbackReviewOpen(false);
                    setPendingLearnedSummary(null);
                  }}
                >
                  Accept preferences
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {feedbackExamples.map((example) => (
                  <div key={example.id} className="rounded-lg border border-rule bg-soft p-3">
                    <div className="font-utility text-[9.5px] text-proof">
                      {example.workflow} · {example.rating ?? 'edited or selected'}
                    </div>
                    <p className="mt-2 line-clamp-2 text-[10.5px] text-muted">
                      {example.editedText}
                    </p>
                  </div>
                ))}
              </div>
              {feedbackJob.error ? (
                <p className="mt-3 text-[10.5px] text-danger">{feedbackJob.error}</p>
              ) : null}
              <div className="mt-4 flex justify-end gap-2">
                <Button onClick={() => setFeedbackReviewOpen(false)}>Cancel</Button>
                <Button variant="primary" disabled={feedbackJob.running} onClick={reviewFeedback}>
                  {feedbackJob.running ? 'Analyzing…' : 'Analyze feedback'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </DialogRoot>
      <ConfirmDialog
        open={resetPreferencesOpen}
        onOpenChange={setResetPreferencesOpen}
        title="Reset learned preferences?"
        description="Accepted guidance and local preference scores will be removed. Raw feedback remains in History and can be reviewed again."
        confirmLabel="Reset preferences"
        onConfirm={async () => {
          await saveApp({
            ...app,
            learnedPreferences: {
              acceptedSummary: '',
              feedbackCount: app.learnedPreferences.feedbackCount,
              analyzedFeedbackIds: [],
              directionScores: {},
              featureScores: {},
              scoredFeedbackIds: [],
            },
          });
          setResetPreferencesOpen(false);
        }}
      />
      <DialogRoot
        open={Boolean(profileSuggestion)}
        onOpenChange={(open) => !open && setProfileSuggestion(null)}
      >
        <DialogContent
          title="Review profile suggestions"
          description="Your saved profile has not changed."
        >
          {profileSuggestion ? (
            <div className="space-y-3">
              <Field label="Your role">
                <Input
                  value={profileSuggestion.role}
                  onChange={(event) =>
                    setProfileSuggestion({ ...profileSuggestion, role: event.target.value })
                  }
                />
              </Field>
              <Field label="Topics you know well">
                <Input
                  value={profileSuggestion.topics.join(', ')}
                  onChange={(event) =>
                    setProfileSuggestion({
                      ...profileSuggestion,
                      topics: event.target.value
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
              <Field label="People you want to reach">
                <Input
                  value={profileSuggestion.audience}
                  onChange={(event) =>
                    setProfileSuggestion({ ...profileSuggestion, audience: event.target.value })
                  }
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button onClick={() => setProfileSuggestion(null)}>Cancel</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    void saveApp({ ...app, profile: { ...app.profile, ...profileSuggestion } });
                    setProfileSuggestion(null);
                  }}
                >
                  Apply changes
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </DialogRoot>
    </>
  );
}

function SettingsSection({
  value,
  title,
  subtitle,
  children,
}: {
  value: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="min-h-[54px]">
        <span className="grid min-w-0 flex-1 gap-1">
          <span>{title}</span>
          <span className="truncate text-[11px] font-normal text-muted" title={subtitle}>
            {subtitle}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3">{children}</AccordionContent>
    </AccordionItem>
  );
}

function ConnectionRow({
  icon,
  title,
  description,
  status,
}: {
  icon: string;
  title: string;
  description: string;
  status: string;
}) {
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule pb-3">
      <span className="grid size-8 place-items-center rounded-[7px] bg-primary text-[11px] font-bold text-white">
        {icon}
      </span>
      <div>
        <strong className="text-xs">{title}</strong>
        <p className="mt-0.5 text-[10px] leading-tight text-muted">{description}</p>
      </div>
      <span className="inline-flex items-center gap-2 whitespace-nowrap text-[10px] font-semibold text-proof">
        <span className="size-1.5 rounded-full bg-proof" />
        {status}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <FieldGroup>
      <Label>{label}</Label>
      {children}
    </FieldGroup>
  );
}

function retentionWouldPrune(app: AppData, policy: RetentionPolicy): number {
  if (policy === 'latest-20') return Math.max(0, app.history.length - 20);
  if (policy === 'latest-50') return Math.max(0, app.history.length - 50);
  if (policy === '30-days') {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1_000;
    return app.history.filter((record) => new Date(record.updatedAt).getTime() < cutoff).length;
  }
  return 0;
}

function retentionLabel(value: RetentionPolicy): string {
  return {
    'latest-20': 'Latest 20 items',
    'latest-50': 'Latest 50 items',
    '30-days': 'Keep for 30 days',
    forever: 'Keep until deleted',
  }[value];
}
function toneLabel(value: WritingProfile['tone']): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function languageLabel(value: WritingProfile['writingLanguage']): string {
  return { 'match-source': 'Match the source', english: 'English', bangla: 'Bangla' }[value];
}
function lengthLabel(value: WritingProfile['length']): string {
  return LENGTH_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
function lengthWordCount(value: WritingProfile['length']): string {
  return LENGTH_OPTIONS.find((option) => option.value === value)?.wordCount ?? '';
}
