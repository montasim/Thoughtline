import { Eye, EyeOff, ImagePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toAppError } from '../../../application/errors';
import { imageModelRegistry } from '../../../application/image-model-registry';
import { requestImageProviderPermission } from '../../../infrastructure/permissions';
import {
  cloudflareImageCredentialsSchema,
  imageCredentialRepository,
} from '../../../infrastructure/storage/image-credentials';
import {
  AccordionContent,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from '../../primitives/accordion';
import { ConfirmDialog } from '../../primitives/alert-dialog';
import { Button } from '../../primitives/button';
import { Input } from '../../primitives/input';
import { FieldGroup, Label } from '../../primitives/label';
import { CredentialSetupGuide } from './credential-setup-guide';

export function ImageConnectionPanel() {
  const [accountId, setAccountId] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [accountIdVisible, setAccountIdVisible] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [hasStored, setHasStored] = useState(false);
  const [status, setStatus] = useState('');
  const [removeOpen, setRemoveOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await imageCredentialRepository.has();
        setHasStored(stored);
      } catch (error) {
        setStatus(toAppError(error).message);
      }
    })();
  }, []);

  const revealAccountId = async () => {
    if (!accountIdVisible && !accountId && hasStored) {
      const saved = await imageCredentialRepository.get();
      if (saved) setAccountId(saved.values.accountId ?? '');
    }
    setAccountIdVisible((current) => !current);
  };

  const revealSaved = async () => {
    if (!tokenVisible && !apiToken && hasStored) {
      const saved = await imageCredentialRepository.get();
      if (saved) {
        setApiToken(saved.values.apiToken ?? '');
      }
    }
    setTokenVisible((current) => !current);
  };

  const save = async () => {
    setStatus('');
    const saved = hasStored ? await imageCredentialRepository.get() : null;
    const parsed = cloudflareImageCredentialsSchema.safeParse({
      accountId: accountId || saved?.values.accountId || '',
      apiToken: apiToken || saved?.values.apiToken || '',
    });
    if (!parsed.success) {
      setStatus(parsed.error.issues[0]?.message ?? 'Check the Cloudflare connection details.');
      return;
    }
    setSaving(true);
    try {
      const allowed = await requestImageProviderPermission();
      if (!allowed) {
        setStatus('Cloudflare connection permission was declined.');
        return;
      }
      await imageCredentialRepository.save(parsed.data);
      setHasStored(true);
      setAccountId('');
      setApiToken('');
      setAccountIdVisible(false);
      setTokenVisible(false);
      setStatus('Saved on this device. The first image will confirm model access.');
    } catch (error) {
      setStatus(toAppError(error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await imageCredentialRepository.remove();
    setAccountId('');
    setApiToken('');
    setHasStored(false);
    setStatus('Cloudflare image connection removed.');
    setRemoveOpen(false);
  };

  return (
    <>
      <AccordionRoot type="single" collapsible>
        <AccordionItem value="image-connection">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <ImagePlus className="size-4 text-primary" />
              Image generation
              <span className="font-normal text-muted">
                · {hasStored ? 'Connected' : 'Optional'}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="rounded-lg border border-[#a8c6c3] bg-proof-soft p-3 text-[10.5px] leading-relaxed text-proof">
              <strong>Cloudflare Workers AI</strong>
              <p className="mt-1">
                Creates an on-demand visual companion with FLUX.2 Klein 4B after a post is refined.
                The writing result still works without this connection.
              </p>
            </div>
            <CredentialSetupGuide
              title="Get your Cloudflare Account ID and token"
              href="https://dash.cloudflare.com/?to=%2F%3Aaccount%2Fai%2Fworkers-ai"
              actionLabel="Open Workers AI"
              steps={[
                'Sign in to Cloudflare and choose the account Thoughtline should use.',
                'On the Workers AI page, choose Use REST API.',
                'Choose Create a Workers AI API Token, review the template, create it, and copy the token.',
                'Copy the Account ID shown in the same REST API setup screen, then paste both values below.',
              ]}
              note="Creating a custom token instead? Give it both Workers AI Read and Workers AI Edit permissions."
            />
            <FieldGroup>
              <Label htmlFor="cloudflare-account-id">Cloudflare Account ID</Label>
              <div className="relative">
                <Input
                  id="cloudflare-account-id"
                  type={accountIdVisible ? 'text' : 'password'}
                  value={accountId}
                  placeholder={hasStored ? 'Saved on this device' : '32-character Account ID'}
                  onChange={(event) => setAccountId(event.target.value)}
                  onBlur={() => setAccountIdVisible(false)}
                  className="pr-11"
                  autoComplete="off"
                />
                <button
                  type="button"
                  aria-label={`${accountIdVisible ? 'Hide' : 'Show'} Cloudflare Account ID`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void revealAccountId()}
                  className="absolute right-1 top-1 grid size-8 place-items-center rounded-md text-primary focus-visible:outline-2 focus-visible:outline-focus"
                >
                  {accountIdVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </FieldGroup>
            <FieldGroup>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="cloudflare-api-token">Workers AI API token</Label>
                {hasStored ? (
                  <Button
                    size="compact"
                    variant="ghost"
                    className="min-h-7 py-1 text-danger/75"
                    onClick={() => setRemoveOpen(true)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="relative">
                <Input
                  id="cloudflare-api-token"
                  type={tokenVisible ? 'text' : 'password'}
                  value={apiToken}
                  placeholder={hasStored ? 'Saved on this device' : 'Paste the API token'}
                  onChange={(event) => setApiToken(event.target.value)}
                  onBlur={() => setTokenVisible(false)}
                  className="pr-11"
                  autoComplete="off"
                />
                <button
                  type="button"
                  aria-label={`${tokenVisible ? 'Hide' : 'Show'} Cloudflare API token`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void revealSaved()}
                  className="absolute right-1 top-1 grid size-8 place-items-center rounded-md text-primary focus-visible:outline-2 focus-visible:outline-focus"
                >
                  {tokenVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </FieldGroup>
            <p className="text-[10.5px] leading-relaxed text-muted">
              Model: <code>{imageModelRegistry.cloudflare.model}</code>. Credentials receive the
              same device-bound encryption as the writing-provider keys.
            </p>
            {status ? (
              <p
                role="status"
                className={
                  status.startsWith('Saved') || status.endsWith('removed.')
                    ? 'text-[10.5px] text-proof'
                    : 'text-[10.5px] text-danger'
                }
              >
                {status}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button variant="primary" disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save image connection'}
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </AccordionRoot>
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove Cloudflare image connection?"
        description="Refined writing stays available. New illustrations will be blocked until the connection is saved again."
        confirmLabel="Remove connection"
        onConfirm={remove}
      />
    </>
  );
}
