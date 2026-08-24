import { useEffect, useState } from 'react';
import { ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { AppError, toAppError } from '../../../application/errors';
import { modelRegistry } from '../../../application/model-registry';
import { providerOrchestrator } from '../../../application/provider-orchestrator';
import type { AppData, ProviderName } from '../../../domain/schemas';
import { requestProviderPermissions } from '../../../infrastructure/permissions';
import { credentialVault } from '../../../infrastructure/storage/credential-vault';
import { useForegroundJob } from '../../hooks/use-foreground-job';
import {
  AccordionContent,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from '../../primitives/accordion';
import { Button } from '../../primitives/button';
import { ConfirmDialog } from '../../primitives/alert-dialog';
import { Input } from '../../primitives/input';
import { FieldGroup, Label } from '../../primitives/label';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '../../primitives/select';
import { CredentialSetupGuide } from './credential-setup-guide';
import { HugeIcon } from '../../components/huge-icon';

const providerGuides = {
  openrouter: {
    title: 'Get an OpenRouter API key',
    href: 'https://openrouter.ai/settings/keys',
    actionLabel: 'Open OpenRouter keys',
    steps: [
      'Sign in to OpenRouter and open API Keys.',
      'Create a key dedicated to Thoughtline.',
      'Copy the key and paste it in the field above.',
    ],
    note: 'Thoughtline accepts only curated :free models. A $10 lifetime purchase raises the shared free-model allowance to 1,000 requests per day.',
  },
  gemini: {
    title: 'Get a Gemini API key',
    href: 'https://aistudio.google.com/apikey',
    actionLabel: 'Open AI Studio',
    steps: [
      'Sign in and accept the Gemini API terms if Google asks.',
      'Select or import a Google Cloud project, then choose Create API key.',
      'Copy the new key and paste it in the field above.',
    ],
  },
  groq: {
    title: 'Get a Groq API key',
    href: 'https://console.groq.com/keys',
    actionLabel: 'Open Groq keys',
    steps: [
      'Sign in to GroqCloud and select the project Thoughtline should use.',
      'Choose Create API Key and give the key a recognizable name.',
      'Copy the generated key and paste it in the field above.',
    ],
    note: 'Only a Groq team owner or a user with the developer role can create API keys.',
  },
} as const satisfies Record<
  ProviderName,
  {
    title: string;
    href: string;
    actionLabel: string;
    steps: readonly string[];
    note?: string;
  }
>;

export function ApiKeysPanel({
  app,
  onSave,
  defaultOpen = false,
  triggerLabel = 'Review API keys',
}: {
  app: AppData;
  onSave: (app: AppData) => Promise<void>;
  defaultOpen?: boolean;
  triggerLabel?: string;
}) {
  const job = useForegroundJob();
  const [keys, setKeys] = useState<Record<ProviderName, string>>({
    openrouter: '',
    gemini: '',
    groq: '',
  });
  const [visible, setVisible] = useState<Record<ProviderName, boolean>>({
    openrouter: false,
    gemini: false,
    groq: false,
  });
  const [hasStored, setHasStored] = useState<Record<ProviderName, boolean>>({
    openrouter: false,
    gemini: false,
    groq: false,
  });
  const [result, setResult] = useState<Record<ProviderName, string>>({
    openrouter: '',
    gemini: '',
    groq: '',
  });
  const [removeTarget, setRemoveTarget] = useState<ProviderName | null>(null);

  useEffect(() => {
    void Promise.all([
      credentialVault.has('openrouter'),
      credentialVault.has('gemini'),
      credentialVault.has('groq'),
    ]).then(([openrouter, gemini, groq]) => setHasStored({ openrouter, gemini, groq }));
  }, [app.settings.providerValidation]);

  const reveal = async (provider: ProviderName) => {
    if (!visible[provider] && !keys[provider] && hasStored[provider]) {
      const saved = await credentialVault.get(provider);
      if (saved) setKeys((current) => ({ ...current, [provider]: saved }));
    }
    setVisible((current) => ({ ...current, [provider]: !current[provider] }));
  };

  const checkConnections = async () => {
    const permission = await requestProviderPermissions();
    if (!permission) {
      setResult({
        openrouter: 'Permission declined',
        gemini: 'Permission declined',
        groq: 'Permission declined',
      });
      return;
    }
    void job.run(
      async (signal) => {
        const stored = {
          openrouter: await credentialVault.get('openrouter'),
          gemini: await credentialVault.get('gemini'),
          groq: await credentialVault.get('groq'),
        };
        const candidates = {
          openrouter: keys.openrouter || stored.openrouter,
          gemini: keys.gemini || stored.gemini,
          groq: keys.groq || stored.groq,
        };
        const outcomes = await Promise.allSettled(
          (['openrouter', 'gemini', 'groq'] as const).map(async (provider) => {
            const key = candidates[provider];
            if (!key) throw new AppError('credential-missing', 'Enter an API key.');
            const valid = await providerOrchestrator.validate(
              provider,
              app.settings.aiRouting.models[provider],
              key,
              signal,
            );
            if (!valid) {
              throw new AppError('credential-invalid', 'The provider rejected this API key.');
            }
            if (keys[provider]) await credentialVault.save(provider, key);
            return {
              provider,
              replaced: Boolean(keys[provider] && keys[provider] !== stored[provider]),
            };
          }),
        );
        const now = new Date().toISOString();
        const next = structuredClone(app);
        const messages = { openrouter: '', gemini: '', groq: '' };
        outcomes.forEach((outcome, index) => {
          const provider = (['openrouter', 'gemini', 'groq'] as const)[index];
          if (!provider) return;
          if (outcome.status === 'fulfilled') {
            const previous = next.settings.providerValidation[provider];
            next.settings.providerValidation[provider] = {
              state: 'valid',
              checkedAt: now,
              credentialVersion: previous.credentialVersion + (keys[provider] ? 1 : 0),
            };
            if (outcome.value.replaced) next.settings.aiRouting.zeroCostConfirmed = false;
            messages[provider] = outcome.value.replaced
              ? 'Passed and saved; reconfirm the zero-cost route'
              : 'Passed';
          } else {
            const previous = next.settings.providerValidation[provider];
            if (previous.state !== 'valid') {
              next.settings.providerValidation[provider] = {
                state: hasStored[provider] ? 'invalid' : 'missing',
                credentialVersion: previous.credentialVersion,
                checkedAt: now,
              };
            }
            messages[provider] =
              previous.state === 'valid'
                ? `Candidate failed; saved key unchanged. ${toAppError(outcome.reason).message}`
                : `Failed: ${toAppError(outcome.reason).message}`;
          }
        });
        setResult(messages);
        setKeys({
          openrouter: outcomes[0]?.status === 'fulfilled' ? '' : keys.openrouter,
          gemini: outcomes[1]?.status === 'fulfilled' ? '' : keys.gemini,
          groq: outcomes[2]?.status === 'fulfilled' ? '' : keys.groq,
        });
        setVisible({ openrouter: false, gemini: false, groq: false });
        await onSave(next);
        return outcomes;
      },
      { requiresAiSetup: false },
    );
  };

  const remove = async (provider: ProviderName) => {
    await credentialVault.remove(provider);
    const next = structuredClone(app);
    next.settings.providerValidation[provider] = {
      state: 'missing',
      credentialVersion: next.settings.providerValidation[provider].credentialVersion + 1,
    };
    next.settings.aiRouting.zeroCostConfirmed = false;
    await onSave(next);
    setRemoveTarget(null);
  };

  const selectModel = async (provider: ProviderName, model: string) => {
    const next = structuredClone(app);
    next.settings.aiRouting.models[provider] = model as never;
    next.settings.providerValidation[provider] = {
      state: hasStored[provider] ? 'unvalidated' : 'missing',
      credentialVersion: next.settings.providerValidation[provider].credentialVersion,
    };
    next.settings.aiRouting.zeroCostConfirmed = false;
    await onSave(next);
  };

  const confirmZeroCostRoute = async (confirmed: boolean) => {
    const next = structuredClone(app);
    next.settings.aiRouting.zeroCostConfirmed = confirmed;
    await onSave(next);
  };

  return (
    <>
      <AccordionRoot type="single" collapsible {...(defaultOpen ? { defaultValue: 'keys' } : {})}>
        <AccordionItem value="keys">
          <AccordionTrigger>{triggerLabel}</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="rounded-lg border border-rule bg-soft p-3 text-[10.5px] leading-relaxed text-muted">
              Requests follow this fixed route: <strong className="text-ink">1 OpenRouter</strong>
              {' → '}
              <strong className="text-ink">2 Gemini</strong>
              {' → '}
              <strong className="text-ink">3 Groq</strong>. Thoughtline never selects a paid
              OpenRouter model.
            </div>
            {(['openrouter', 'gemini', 'groq'] as const).map((provider, index) => (
              <FieldGroup key={provider} className="rounded-lg border border-rule bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`${provider}-key`}>
                    {String(index + 1)}. {providerLabel(provider)} API key
                  </Label>
                  {hasStored[provider] ? (
                    <Button
                      size="compact"
                      variant="ghost"
                      className="min-h-7 py-1 text-danger/75"
                      onClick={() => setRemoveTarget(provider)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                <div className="mt-2">
                  <Label htmlFor={`${provider}-model`}>Model</Label>
                  <SelectRoot
                    value={app.settings.aiRouting.models[provider]}
                    onValueChange={(value) => void selectModel(provider, value)}
                  >
                    <SelectTrigger id={`${provider}-model`} className="mt-1 w-full">
                      {modelRegistry[provider].find(
                        (candidate) => candidate.model === app.settings.aiRouting.models[provider],
                      )?.label ?? app.settings.aiRouting.models[provider]}
                    </SelectTrigger>
                    <SelectContent>
                      {modelRegistry[provider].map((candidate) => (
                        <SelectItem key={candidate.model} value={candidate.model}>
                          {candidate.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </SelectRoot>
                </div>
                <div className="relative">
                  <Input
                    id={`${provider}-key`}
                    type={visible[provider] ? 'text' : 'password'}
                    value={keys[provider]}
                    placeholder={hasStored[provider] ? 'Saved on this device' : 'Enter API key'}
                    onChange={(event) =>
                      setKeys((current) => ({ ...current, [provider]: event.target.value }))
                    }
                    onBlur={() => setVisible((current) => ({ ...current, [provider]: false }))}
                    className="pr-11"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    aria-label={`${visible[provider] ? 'Hide' : 'Show'} ${provider} key`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void reveal(provider)}
                    className="absolute right-1 top-1 grid size-8 place-items-center rounded-md text-primary focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <HugeIcon
                      icon={visible[provider] ? ViewOffSlashIcon : ViewIcon}
                      className="size-4"
                    />
                  </button>
                </div>
                {result[provider] ? (
                  <p className="text-[10.5px] text-muted">{result[provider]}</p>
                ) : null}
                <CredentialSetupGuide {...providerGuides[provider]} />
              </FieldGroup>
            ))}
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-rule bg-soft p-3 text-[10.5px] leading-relaxed text-muted">
              <input
                className="mt-0.5"
                type="checkbox"
                checked={app.settings.aiRouting.zeroCostConfirmed}
                onChange={(event) => void confirmZeroCostRoute(event.target.checked)}
              />
              <span>
                I confirm this route must use only OpenRouter <code>:free</code> models, Gemini with
                billing disabled, and Groq on Free Plan.
              </span>
            </label>
            <p className="text-[10.5px] leading-relaxed text-muted">
              Keys are encrypted with AES-256-GCM before Chrome stores them on this device. A
              non-exportable device key unlocks them for this extension only.
            </p>
          </AccordionContent>
        </AccordionItem>
      </AccordionRoot>
      {job.error ? <p className="mt-2 text-[11px] text-danger">{job.error}</p> : null}
      <div className="mt-3 flex justify-end">
        <Button onClick={() => void checkConnections()} disabled={job.running}>
          {job.running ? 'Checking…' : 'Check connections'}
        </Button>
      </div>
      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={`Remove ${removeTarget ? providerLabel(removeTarget) : ''} key?`}
        description="New AI work will be blocked until all three provider keys validate again. Existing local writing remains available."
        confirmLabel="Remove key"
        onConfirm={() => (removeTarget ? remove(removeTarget) : undefined)}
      />
    </>
  );
}

function providerLabel(provider: ProviderName): string {
  if (provider === 'openrouter') return 'OpenRouter';
  return provider === 'gemini' ? 'Gemini' : 'Groq';
}
