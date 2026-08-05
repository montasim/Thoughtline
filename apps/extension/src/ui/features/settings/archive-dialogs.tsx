import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import {
  exportEncryptedArchive,
  exportReadableArchive,
  mergeArchive,
  readArchive,
  type ArchivePayload,
} from '../../../application/data-archive';
import type { AppData } from '../../../domain/schemas';
import { Button } from '../../primitives/button';
import { DialogContent, DialogRoot, DialogTrigger } from '../../primitives/dialog';
import { Input } from '../../primitives/input';
import { FieldGroup, Label } from '../../primitives/label';

export function ArchiveDialogs({
  app,
  onImport,
}: {
  app: AppData;
  onImport: (app: AppData) => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <ExportDialog app={app} />
      <ImportDialog app={app} onImport={onImport} />
    </div>
  );
}

function ExportDialog({ app }: { app: AppData }) {
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
          <Download className="size-4" />
          Export data
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Export Thoughtline data"
        description="Provider keys, encryption keys, permissions, consent, and transient jobs are never included."
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

function ImportDialog({
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
  const importArchive = async () => {
    if (!preview) return;
    await onImport(mergeArchive(app, preview, categories));
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
          <Upload className="size-4" />
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
                <Button variant="primary" onClick={() => void importArchive()}>
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

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
