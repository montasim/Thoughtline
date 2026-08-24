import { useRef, useState } from 'react';
import { Download04Icon, Tick02Icon, Upload04Icon } from '@hugeicons/core-free-icons';
import {
  applyConfiguration,
  exportConfiguration,
  readConfiguration,
  type ConfigurationBackup,
} from '../../../application/configuration-backup';
import {
  exportEncryptedArchive,
  exportReadableArchive,
  mergeArchive,
  readArchive,
  type ArchivePayload,
} from '../../../application/data-archive';
import type { AppData } from '../../../domain/schemas';
import { Button } from '../../primitives/button';
import { DialogClose, DialogContent, DialogRoot, DialogTrigger } from '../../primitives/dialog';
import { Input } from '../../primitives/input';
import { FieldGroup, Label } from '../../primitives/label';
import { HugeIcon } from '../../components/huge-icon';

export function ConfigurationBackupDialogs({
  app,
  onImport,
}: {
  app: AppData;
  onImport: (app: AppData) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[10.5px] leading-relaxed text-muted">
        Move your complete Thoughtline setup to a fresh installation with one JSON file.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <ExportConfigurationDialog app={app} />
        <ImportConfigurationDialog app={app} onImport={onImport} />
      </div>
    </div>
  );
}

export function DataArchiveDialogs({
  app,
  onImport,
}: {
  app: AppData;
  onImport: (app: AppData) => Promise<void>;
}) {
  return (
    <div className="space-y-3 border-t border-rule pt-3">
      <div>
        <strong className="text-xs">Writing data archive</strong>
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
          Create an encrypted, mergeable archive of History, profile, settings, and preferences.
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <ExportDataDialog app={app} />
        <ImportDataDialog app={app} onImport={onImport} />
      </div>
    </div>
  );
}

function ExportConfigurationDialog({ app }: { app: AppData }) {
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportBackup = async () => {
    setError(null);
    setExporting(true);
    try {
      const blob = await exportConfiguration(app, includeSecrets);
      downloadBlob(blob, `thoughtline-configuration-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The configuration could not be exported.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <DialogRoot
      onOpenChange={(open) => {
        if (!open) {
          setIncludeSecrets(false);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <HugeIcon icon={Download04Icon} className="size-4" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Export configuration"
        description="Downloads a validated JSON backup of your current Thoughtline setup."
      >
        <div className="space-y-4">
          <p className="text-[10.5px] leading-relaxed text-muted">
            Includes settings, permissions, profile, preferences, History, the selected OpenRouter →
            Gemini → Groq models, provider status, and calibrated layouts.
          </p>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-rule bg-soft p-3 text-xs leading-relaxed">
            <input
              className="mt-0.5"
              type="checkbox"
              checked={includeSecrets}
              onChange={(event) => setIncludeSecrets(event.target.checked)}
            />
            <span>
              <strong>Include secrets</strong>
              <span className="mt-1 block text-[10.5px] text-muted">
                Add API keys, tokens, and account or client IDs to this JSON file.
              </span>
            </span>
          </label>
          {includeSecrets ? (
            <p className="rounded-lg border border-[#e9c985] bg-warning-bg p-3 text-[10.5px] leading-relaxed text-warning">
              Secrets are readable in the exported JSON. Store the file securely and do not share
              it.
            </p>
          ) : null}
          {error ? <p className="text-[11px] text-danger">{error}</p> : null}
          <div className="flex justify-end">
            <Button variant="primary" disabled={exporting} onClick={() => void exportBackup()}>
              {exporting ? 'Exporting…' : 'Export JSON'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

export function ImportConfigurationDialog({
  app,
  onImport,
  triggerLabel = 'Import',
}: {
  app: AppData;
  onImport: (app: AppData) => Promise<void>;
  triggerLabel?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ConfigurationBackup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setImporting(false);
    setConfirmation(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const inspect = async () => {
    if (!file) return;
    setError(null);
    setConfirmation(null);
    try {
      setPreview(await readConfiguration(file));
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The configuration could not be read.');
    }
  };

  const importBackup = async () => {
    if (!preview) return;
    setError(null);
    setImporting(true);
    try {
      const result = await applyConfiguration(app, preview);
      await onImport(result.app);
      setConfirmation(
        result.permissionsGranted
          ? 'Thoughtline will now use the imported configuration.'
          : 'Thoughtline will use the imported configuration, but Chrome did not grant every requested permission.',
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The configuration could not be imported.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <DialogRoot
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <HugeIcon icon={Upload04Icon} className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Import configuration"
        description="The complete file is validated before any current configuration changes."
      >
        {confirmation ? (
          <div
            role="status"
            className="space-y-3 rounded-lg border border-proof/35 bg-proof-soft p-4 text-proof"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-proof text-white">
                <HugeIcon icon={Tick02Icon} className="size-4" aria-hidden="true" />
              </span>
              <div>
                <strong className="text-xs">Configuration imported</strong>
                <p className="mt-1 text-[10.5px] leading-relaxed">{confirmation}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <DialogClose asChild>
                <Button variant="primary">Done</Button>
              </DialogClose>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <FieldGroup>
              <Label htmlFor="configuration-file">Configuration JSON</Label>
              <Input
                ref={fileRef}
                id="configuration-file"
                type="file"
                accept=".json,application/json"
                className="p-1 text-[11px] file:mr-2 file:min-h-8 file:rounded-md file:border file:border-field file:bg-surface file:px-3 file:py-2 file:text-[11px] file:font-semibold file:text-primary"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPreview(null);
                }}
              />
            </FieldGroup>
            {!preview ? (
              <div className="flex justify-end">
                <Button variant="primary" disabled={!file} onClick={() => void inspect()}>
                  Review configuration
                </Button>
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border border-rule bg-soft p-3">
                <strong className="text-xs">Ready to import</strong>
                <p className="text-[10.5px] leading-relaxed text-muted">
                  Exported {new Date(preview.createdAt).toLocaleString()} ·{' '}
                  {String(preview.app.history.length)} History records ·{' '}
                  {preview.secrets ? 'includes secrets' : 'keeps secrets already on this device'}
                </p>
                <p className="text-[10.5px] leading-relaxed text-muted">
                  Route: {preview.app.settings.aiRouting.models.openrouter} →{' '}
                  {preview.app.settings.aiRouting.models.gemini} →{' '}
                  {preview.app.settings.aiRouting.models.groq}
                </p>
                <p className="text-[10.5px] leading-relaxed text-muted">
                  Imported values replace the current settings, profile, preferences, History, and
                  calibrated layouts. Chrome may ask you to approve imported permissions.
                </p>
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    disabled={importing}
                    onClick={() => void importBackup()}
                  >
                    {importing ? 'Importing…' : 'Use this configuration'}
                  </Button>
                </div>
              </div>
            )}
            {error ? <p className="text-[11px] text-danger">{error}</p> : null}
          </div>
        )}
      </DialogContent>
    </DialogRoot>
  );
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ExportDataDialog({ app }: { app: AppData }) {
  const [passphrase, setPassphrase] = useState('');
  const [readable, setReadable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportArchive = async () => {
    setError(null);
    try {
      const blob = readable
        ? exportReadableArchive(app)
        : await exportEncryptedArchive(app, passphrase);
      downloadBlob(
        blob,
        `thoughtline-${new Date().toISOString().slice(0, 10)}.${readable ? 'json' : 'thoughtline'}`,
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The archive could not be exported.');
    }
  };

  return (
    <DialogRoot>
      <DialogTrigger asChild>
        <Button>
          <HugeIcon icon={Download04Icon} className="size-4" />
          Export data
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Export Thoughtline data"
        description="Provider keys, permissions, consent, and transient jobs are never included."
      >
        <div className="space-y-4">
          {!readable ? (
            <FieldGroup>
              <Label htmlFor="export-passphrase">Archive passphrase</Label>
              <Input
                id="export-passphrase"
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                autoComplete="new-password"
              />
              <p className="text-[10.5px] leading-relaxed text-muted">
                This passphrase cannot be recovered. Store it separately.
              </p>
            </FieldGroup>
          ) : (
            <p className="rounded-lg border border-[#e9c985] bg-warning-bg p-3 text-[10.5px] leading-relaxed text-warning">
              Readable JSON is not encrypted. Anyone with the file can read its writing and profile
              data.
            </p>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={readable}
              onChange={(event) => setReadable(event.target.checked)}
            />
            Advanced: export readable JSON
          </label>
          <p className="text-[10.5px] text-muted">
            Includes {String(app.history.length)} History records, writing profile, settings, and
            learned preferences.
          </p>
          {error ? <p className="text-[11px] text-danger">{error}</p> : null}
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => void exportArchive()}
              disabled={!readable && passphrase.length < 10}
            >
              Export archive
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

function ImportDataDialog({
  app,
  onImport,
}: {
  app: AppData;
  onImport: (app: AppData) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [preview, setPreview] = useState<ArchivePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState({
    history: true,
    profile: true,
    settings: true,
    preferences: true,
  });

  const inspect = async () => {
    if (!file) return;
    setError(null);
    try {
      setPreview(await readArchive(file, passphrase));
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The archive could not be read.');
    }
  };

  return (
    <DialogRoot
      onOpenChange={(open) => {
        if (!open) {
          setPreview(null);
          setFile(null);
          setPassphrase('');
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <HugeIcon icon={Upload04Icon} className="size-4" />
          Import data
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Import Thoughtline data"
        description="The whole archive is validated before local data changes."
      >
        <div className="space-y-4">
          <FieldGroup>
            <Label htmlFor="archive-file">Archive file</Label>
            <Input
              ref={fileRef}
              id="archive-file"
              type="file"
              accept=".thoughtline,.json,application/json"
              className="p-1 text-[11px] file:mr-2 file:min-h-8 file:rounded-md file:border file:border-field file:bg-surface file:px-3 file:py-2 file:text-[11px] file:font-semibold file:text-primary"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="import-passphrase">Passphrase, if encrypted</Label>
            <Input
              id="import-passphrase"
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </FieldGroup>
          {!preview ? (
            <div className="flex justify-end">
              <Button variant="primary" disabled={!file} onClick={() => void inspect()}>
                Review import
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-rule bg-soft p-3">
              <strong className="text-xs">Import preview</strong>
              <p className="text-[10.5px] text-muted">
                {String(preview.history.length)} History records · archive from{' '}
                {new Date(preview.createdAt).toLocaleString()}
              </p>
              {Object.entries(categories).map(([key, selected]) => (
                <label key={key} className="flex items-center gap-2 text-xs capitalize">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) =>
                      setCategories((current) => ({ ...current, [key]: event.target.checked }))
                    }
                  />
                  {key === 'preferences' ? 'Learned preferences' : key}
                </label>
              ))}
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  onClick={() => void onImport(mergeArchive(app, preview, categories))}
                >
                  Merge selected data
                </Button>
              </div>
            </div>
          )}
          {error ? <p className="text-[11px] text-danger">{error}</p> : null}
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
