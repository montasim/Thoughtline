import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { AppError, toAppError } from '../../../application/errors';
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
  const [keys, setKeys] = useState<Record<ProviderName, string>>({ gemini: '', groq: '' });
  const [visible, setVisible] = useState<Record<ProviderName, boolean>>({
    gemini: false,
    groq: false,
  });
  const [hasStored, setHasStored] = useState<Record<ProviderName, boolean>>({
    gemini: false,
    groq: false,
  });
  const [result, setResult] = useState<Record<ProviderName, string>>({ gemini: '', groq: '' });
  const [removeTarget, setRemoveTarget] = useState<ProviderName | null>(null);

  useEffect(() => {
    void Promise.all([credentialVault.has('gemini'), credentialVault.has('groq')]).then(
      ([gemini, groq]) => setHasStored({ gemini, groq }),
    );
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
      setResult({ gemini: 'Permission declined', groq: 'Permission declined' });
      return;
    }
    void job.run(
      async (signal) => {
        const candidates = {
          gemini: keys.gemini || (await credentialVault.get('gemini')),
          groq: keys.groq || (await credentialVault.get('groq')),
        };
        const outcomes = await Promise.allSettled(
          (['gemini', 'groq'] as const).map(async (provider) => {
            const key = candidates[provider];
            if (!key) throw new AppError('credential-missing', 'Enter an API key.');
            const valid = await providerOrchestrator.validate(provider, key, signal);
            if (!valid) {
              throw new AppError('credential-invalid', 'The provider rejected this API key.');
            }
            if (keys[provider]) await credentialVault.save(provider, key);
            return provider;
          }),
        );
        const now = new Date().toISOString();
        const next = structuredClone(app);
        const messages = { gemini: '', groq: '' };
        outcomes.forEach((outcome, index) => {
          const provider = (['gemini', 'groq'] as const)[index];
          if (!provider) return;
          if (outcome.status === 'fulfilled') {
            const previous = next.settings.providerValidation[provider];
            next.settings.providerValidation[provider] = {
              state: 'valid',
              checkedAt: now,
              credentialVersion: previous.credentialVersion + (keys[provider] ? 1 : 0),
            };
            messages[provider] = keys[provider] ? 'Passed and saved' : 'Passed';
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
          gemini: outcomes[0]?.status === 'fulfilled' ? '' : keys.gemini,
          groq: outcomes[1]?.status === 'fulfilled' ? '' : keys.groq,
        });
        setVisible({ gemini: false, groq: false });
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
    await onSave(next);
    setRemoveTarget(null);
  };

  return (
    <>
      <AccordionRoot type="single" collapsible {...(defaultOpen ? { defaultValue: 'keys' } : {})}>
        <AccordionItem value="keys">
          <AccordionTrigger>{triggerLabel}</AccordionTrigger>
          <AccordionContent className="space-y-4">
            {(['gemini', 'groq'] as const).map((provider) => (
              <FieldGroup key={provider}>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`${provider}-key`}>
                    {provider === 'gemini' ? 'Gemini' : 'Groq'} API key
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
                    {visible[provider] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {result[provider] ? (
                  <p className="text-[10.5px] text-muted">{result[provider]}</p>
                ) : null}
              </FieldGroup>
            ))}
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
        title={`Remove ${removeTarget === 'gemini' ? 'Gemini' : 'Groq'} key?`}
        description="New AI work will be blocked until both provider keys validate again. Existing local writing remains available."
        confirmLabel="Remove key"
        onConfirm={() => (removeTarget ? remove(removeTarget) : undefined)}
      />
    </>
  );
}
