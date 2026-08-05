import { useEffect, useState } from 'react';
import { deriveProfile } from '../../application/workflows';
import { isProfileComplete, isProviderReady, type WritingProfile } from '../../domain/schemas';
import {
  hasLinkedInPermission,
  hasProviderPermissions,
  requestLinkedInPermission,
} from '../../infrastructure/permissions';
import { sendRuntimeMessage } from '../../shared/protocol';
import { AppHeader } from '../components/brand';
import { ApiKeysPanel } from '../features/settings/api-keys-panel';
import { useForegroundJob } from '../hooks/use-foreground-job';
import { Button } from '../primitives/button';
import { Card } from '../primitives/card';
import { DialogContent, DialogRoot } from '../primitives/dialog';
import { Input } from '../primitives/input';
import { FieldGroup, Label } from '../primitives/label';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '../primitives/select';
import { useAppStore } from '../state/app-store';

const STEPS = [
  { id: 1, title: 'Boundaries' },
  { id: 2, title: 'Connections' },
  { id: 3, title: 'About you' },
  { id: 4, title: 'Ready' },
] as const;

type Tone = WritingProfile['tone'];

const TONES: Array<{ value: Tone; label: string }> = [
  { value: 'conversational', label: 'Conversational' },
  { value: 'concise', label: 'Concise' },
  { value: 'analytical', label: 'Analytical' },
  { value: 'supportive', label: 'Supportive' },
  { value: 'challenging', label: 'Challenging' },
];

export function OnboardingApp() {
  const { app, loading, saveApp, refresh } = useAppStore();
  const profileJob = useForegroundJob();
  const [step, setStep] = useState(1);
  const [linkedInAllowed, setLinkedInAllowed] = useState(false);
  const [providersAllowed, setProvidersAllowed] = useState(false);
  const [draftProfile, setDraftProfile] = useState<WritingProfile | null>(null);
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profileSuggestion, setProfileSuggestion] = useState<{
    role: string;
    topics: string[];
    audience: string;
  } | null>(null);

  useEffect(() => {
    void Promise.all([hasLinkedInPermission(), hasProviderPermissions()]).then(
      ([linkedIn, providers]) => {
        setLinkedInAllowed(linkedIn);
        setProvidersAllowed(providers);
      },
    );
  }, [app?.settings]);

  useEffect(() => {
    if (app && !draftProfile) setDraftProfile(structuredClone(app.profile));
  }, [app, draftProfile]);

  if (loading || !app || !draftProfile) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas font-body text-sm text-muted">
        Preparing Thoughtline…
      </div>
    );
  }

  const consentReady = app.settings.consent.accepted;
  const connectionsReady = linkedInAllowed && providersAllowed && isProviderReady(app.settings);
  const profileReady = isProfileComplete(app.profile);
  const draftProfileReady = isProfileComplete(draftProfile);
  const allReady = consentReady && connectionsReady && profileReady;

  const stepComplete = (id: number) => {
    if (id === 1) return consentReady;
    if (id === 2) return connectionsReady;
    if (id === 3) return profileReady;
    return allReady;
  };

  const saveProfile = async () => {
    await saveApp({ ...app, profile: draftProfile });
  };

  const createProfileSuggestions = () => {
    if (!ownershipConfirmed || !profileFile) return;
    void profileJob.run(async (signal) => {
      const { extractProfessionalPdfText } = await import('../../application/profile-pdf');
      const professionalText = await extractProfessionalPdfText(profileFile);
      const result = await deriveProfile(professionalText, signal);
      setProfileSuggestion(result.value);
      setProfileFile(null);
      setOwnershipConfirmed(false);
      return result.value;
    });
  };

  const startWriting = () => {
    if (!allReady) return;
    void saveApp({ ...app, settings: { ...app.settings, onboardingComplete: true } }).then(
      async () => {
        await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
        window.close();
      },
    );
  };

  return (
    <div className="min-h-dvh bg-canvas p-0 font-body text-ink min-[431px]:p-4">
      <div className="mx-auto min-h-[690px] w-full max-w-[900px] overflow-hidden border-rule bg-canvas min-[431px]:rounded-[14px] min-[431px]:border min-[431px]:shadow-panel">
        <AppHeader setup statusLabel={`Step ${String(step)} of 4`} />
        <div className="grid gap-6 p-4 md:grid-cols-[190px_minmax(0,1fr)] md:gap-8 md:p-6">
          <nav
            aria-label="Setup steps"
            className="grid grid-cols-2 content-start gap-1 md:block md:space-y-1"
          >
            {STEPS.map((item) => {
              const active = step === item.id;
              const complete = stepComplete(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'step' : undefined}
                  aria-label={`${item.title}${complete ? ', complete' : ''}`}
                  onClick={() => setStep(item.id)}
                  className={`grid min-h-11 w-full min-w-0 grid-cols-[24px_minmax(0,1fr)] items-center gap-2 rounded-[7px] p-2 text-left text-xs font-semibold ${active ? 'bg-tint text-primary' : 'text-muted hover:bg-tint/60'}`}
                >
                  <span
                    className={`grid size-[23px] place-items-center rounded-full border font-utility text-[10px] ${active ? 'border-primary bg-primary text-white' : complete ? 'border-proof/35 bg-proof-soft text-proof' : 'border-field bg-surface'}`}
                  >
                    {String(item.id)}
                  </span>
                  <span className="truncate">{item.title}</span>
                </button>
              );
            })}
          </nav>

          <main className="min-w-0">
            {step === 1 ? (
              <SetupPanel title="You stay in control">
                <p className="text-[13px] leading-[1.58] text-muted">
                  Choose a LinkedIn conversation yourself. The extension reads only the visible
                  content inside that selected post and gives you drafts to review.
                </p>
                <div className="mt-4 space-y-2">
                  <label className="flex items-start gap-2 rounded-lg border border-rule bg-soft p-3 text-xs leading-[1.55]">
                    <input
                      type="checkbox"
                      className="mt-px size-[17px] shrink-0 accent-primary"
                      checked={app.settings.consent.accepted}
                      onChange={(event) =>
                        void saveApp({
                          ...app,
                          settings: {
                            ...app.settings,
                            consent: {
                              accepted: event.target.checked,
                              version: 1,
                              ...(event.target.checked
                                ? { acceptedAt: new Date().toISOString() }
                                : {}),
                            },
                          },
                        })
                      }
                    />
                    <span>
                      I agree to the{' '}
                      <a
                        href={chrome.runtime.getURL('/terms.html')}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-proof underline underline-offset-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Terms of Service
                      </a>{' '}
                      and to send the content needed for a writing request to Gemini and, if
                      automatic fallback is needed, Groq.
                    </span>
                  </label>
                </div>
                <SetupActions step={step} setStep={setStep} continueDisabled={!consentReady} />
              </SetupPanel>
            ) : null}

            {step === 2 ? (
              <SetupPanel title="Allow LinkedIn and add your AI keys">
                <p className="text-[13px] leading-[1.58] text-muted">
                  Gemini handles each writing request first. Groq retries automatically if Gemini
                  cannot complete it.
                </p>
                <div className="mt-4">
                  <ConnectionRow
                    icon="in"
                    title="LinkedIn page permission"
                    description="Chrome access only—no LinkedIn account connection"
                    ready={linkedInAllowed}
                    action={
                      linkedInAllowed ? undefined : (
                        <Button
                          size="compact"
                          onClick={() => {
                            void (async () => {
                              const allowed = await requestLinkedInPermission();
                              setLinkedInAllowed(allowed);
                              await sendRuntimeMessage({ type: 'integration:sync' });
                            })();
                          }}
                        >
                          Allow
                        </Button>
                      )
                    }
                  />
                  <ConnectionRow
                    icon="AI"
                    title="Gemini API key"
                    description="Validated with Google and encrypted on this device"
                    ready={app.settings.providerValidation.gemini.state === 'valid'}
                  />
                  <ConnectionRow
                    icon="GQ"
                    title="Groq API key"
                    description="Validated with Groq and encrypted on this device"
                    ready={app.settings.providerValidation.groq.state === 'valid'}
                  />
                </div>
                <div className="mt-3">
                  <ApiKeysPanel
                    app={app}
                    defaultOpen
                    triggerLabel="Replace or review your API keys"
                    onSave={async (next) => {
                      await saveApp(next);
                      await refresh();
                      setProvidersAllowed(await hasProviderPermissions());
                    }}
                  />
                </div>
                <SetupActions step={step} setStep={setStep} continueDisabled={!connectionsReady} />
              </SetupPanel>
            ) : null}

            {step === 3 ? (
              <SetupPanel title="Give drafts your point of view">
                <p className="text-[13px] leading-[1.58] text-muted">
                  Three short answers are enough to start. You can personalize more later.
                </p>
                <section className="mt-4 rounded-[9px] border border-rule bg-soft p-3">
                  <h3 className="font-display text-sm font-bold">
                    Import your LinkedIn profile{' '}
                    <span className="font-body text-[11px] font-normal text-muted">Optional</span>
                  </h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    Use LinkedIn’s Save to PDF export to prefill the editable fields below.
                  </p>
                  <label className="mt-3 flex items-start gap-2 rounded-lg border border-rule bg-surface p-3 text-xs leading-[1.55]">
                    <input
                      type="checkbox"
                      className="mt-px size-[17px] shrink-0 accent-primary"
                      checked={ownershipConfirmed}
                      onChange={(event) => setOwnershipConfirmed(event.target.checked)}
                    />
                    <span>I confirm this PDF is an export of my own LinkedIn profile.</span>
                  </label>
                  <FieldGroup className="mt-3">
                    <Label htmlFor="profile-pdf">LinkedIn profile PDF</Label>
                    <Input
                      id="profile-pdf"
                      type="file"
                      accept="application/pdf,.pdf"
                      className="p-1 text-[11px] file:mr-2 file:min-h-8 file:rounded-md file:border file:border-field file:bg-surface file:px-3 file:py-2 file:text-[11px] file:font-semibold file:text-primary"
                      onChange={(event) => setProfileFile(event.target.files?.[0] ?? null)}
                    />
                    <p className="text-[11px] leading-relaxed text-muted">
                      The raw PDF is discarded after the profile suggestions are created.
                    </p>
                    <div className="flex justify-end">
                      <Button
                        disabled={!ownershipConfirmed || !profileFile || profileJob.running}
                        onClick={createProfileSuggestions}
                      >
                        {profileJob.running
                          ? 'Creating suggestions…'
                          : 'Create profile suggestions'}
                      </Button>
                    </div>
                    {profileJob.error ? (
                      <p className="text-[11px] text-danger">{profileJob.error}</p>
                    ) : null}
                  </FieldGroup>
                </section>
                <div className="mt-3 space-y-3">
                  <Field id="profile-role" label="Your role" required>
                    <Input
                      id="profile-role"
                      value={draftProfile.role}
                      onChange={(event) =>
                        setDraftProfile({ ...draftProfile, role: event.target.value })
                      }
                    />
                  </Field>
                  <Field id="profile-topics" label="Topics you know well" required>
                    <Input
                      id="profile-topics"
                      value={draftProfile.topics.join(', ')}
                      onChange={(event) =>
                        setDraftProfile({
                          ...draftProfile,
                          topics: event.target.value
                            .split(',')
                            .map((item) => item.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </Field>
                  <Field id="profile-audience" label="People you want to reach" required>
                    <Input
                      id="profile-audience"
                      value={draftProfile.audience}
                      onChange={(event) =>
                        setDraftProfile({ ...draftProfile, audience: event.target.value })
                      }
                    />
                  </Field>
                  <Field id="profile-tone" label="Default tone">
                    <SelectRoot
                      value={draftProfile.tone}
                      onValueChange={(value) =>
                        setDraftProfile({ ...draftProfile, tone: value as Tone })
                      }
                    >
                      <SelectTrigger id="profile-tone">
                        <span>{toneLabel(draftProfile.tone)}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {TONES.map((tone) => (
                          <SelectItem key={tone.value} value={tone.value}>
                            {tone.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </SelectRoot>
                  </Field>
                </div>
                <SetupActions
                  step={step}
                  setStep={setStep}
                  continueLabel="Save and continue"
                  continueDisabled={!draftProfileReady}
                  onContinue={saveProfile}
                />
              </SetupPanel>
            ) : null}

            {step === 4 ? (
              <SetupPanel title={allReady ? 'You’re ready to write' : 'Finish setup to continue'}>
                <div
                  className={`grid size-12 place-items-center rounded-xl border text-2xl ${allReady ? 'border-proof/40 bg-proof-soft text-proof' : 'border-field bg-soft text-muted'}`}
                  aria-hidden="true"
                >
                  {allReady ? '✓' : '·'}
                </div>
                <p className="text-[13px] leading-[1.58] text-muted">
                  {allReady ? (
                    <>
                      On LinkedIn, right-click a visible post or comment and choose{' '}
                      <strong>Draft a reply with Thoughtline</strong>. You can set up original post
                      ideas later.
                    </>
                  ) : (
                    'Complete Boundaries, Connections, and About you before starting.'
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => setStep(3)}>Back</Button>
                  <Button variant="primary" disabled={!allReady} onClick={startWriting}>
                    Start writing
                  </Button>
                </div>
              </SetupPanel>
            ) : null}
          </main>
        </div>
      </div>

      <DialogRoot
        open={Boolean(profileSuggestion)}
        onOpenChange={(open) => !open && setProfileSuggestion(null)}
      >
        <DialogContent
          title="Review profile suggestions"
          description="Edit these suggestions before applying them to setup."
        >
          {profileSuggestion ? (
            <div className="space-y-3">
              <Field id="suggested-role" label="Your role">
                <Input
                  id="suggested-role"
                  value={profileSuggestion.role}
                  onChange={(event) =>
                    setProfileSuggestion({ ...profileSuggestion, role: event.target.value })
                  }
                />
              </Field>
              <Field id="suggested-topics" label="Topics you know well">
                <Input
                  id="suggested-topics"
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
              <Field id="suggested-audience" label="People you want to reach">
                <Input
                  id="suggested-audience"
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
                    setDraftProfile({ ...draftProfile, ...profileSuggestion });
                    setProfileSuggestion(null);
                  }}
                >
                  Apply suggestions
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </DialogRoot>
    </div>
  );
}

function SetupPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="max-w-[580px]">
      <Card className="relative space-y-3 overflow-hidden p-6">
        <h2 className="font-display text-[19px] font-bold leading-[1.28] tracking-[-0.015em]">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}

function SetupActions({
  step,
  setStep,
  continueDisabled,
  continueLabel = 'Continue',
  onContinue,
}: {
  step: number;
  setStep: (step: number) => void;
  continueDisabled: boolean;
  continueLabel?: string;
  onContinue?: () => Promise<void>;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {step > 1 ? <Button onClick={() => setStep(step - 1)}>Back</Button> : null}
      <Button
        variant="primary"
        disabled={continueDisabled}
        onClick={() =>
          void (async () => {
            await onContinue?.();
            setStep(step + 1);
          })()
        }
      >
        {continueLabel}
      </Button>
    </div>
  );
}

function ConnectionRow({
  icon,
  title,
  description,
  ready,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  ready: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-3 last:border-b-0">
      <span className="grid size-8 place-items-center rounded-[7px] bg-primary text-[11px] font-bold text-white">
        {icon}
      </span>
      <span className="min-w-0">
        <strong className="block text-xs">{title}</strong>
        <small className="mt-0.5 block text-[11px] leading-tight text-muted">{description}</small>
      </span>
      {action ?? (
        <span className="inline-flex items-center gap-2 whitespace-nowrap text-[11px] font-semibold text-proof before:size-[7px] before:rounded-full before:bg-proof">
          {ready ? 'Ready' : 'Review'}
        </span>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  required = false,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <FieldGroup>
      <Label htmlFor={id}>
        {label}{' '}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {children}
    </FieldGroup>
  );
}

function toneLabel(tone: Tone): string {
  return TONES.find((item) => item.value === tone)?.label ?? 'Conversational';
}
