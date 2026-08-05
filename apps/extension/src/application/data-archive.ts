import { z } from 'zod';
import {
  appDataSchema,
  learnedPreferencesSchema,
  workHistoryRecordSchema,
  writingProfileSchema,
  type AppData,
} from '../domain/schemas';
import { AppError } from './errors';
import { createId } from '../shared/id';

const ARCHIVE_ITERATIONS = 310_000;

const portableSettingsSchema = appDataSchema.shape.settings.omit({
  consent: true,
  providerValidation: true,
  onboardingComplete: true,
});

const archivePayloadSchema = z.object({
  format: z.literal('thoughtline-data'),
  version: z.literal(1),
  archiveId: z.uuid(),
  createdAt: z.iso.datetime(),
  history: z.array(workHistoryRecordSchema),
  profile: writingProfileSchema,
  settings: portableSettingsSchema,
  learnedPreferences: learnedPreferencesSchema,
});
export type ArchivePayload = z.infer<typeof archivePayloadSchema>;

const encryptedArchiveSchema = z.object({
  format: z.literal('thoughtline-encrypted'),
  version: z.literal(1),
  kdf: z.object({
    name: z.literal('PBKDF2-SHA-256'),
    iterations: z.literal(ARCHIVE_ITERATIONS),
    salt: z.string(),
  }),
  cipher: z.object({ name: z.literal('AES-256-GCM'), iv: z.string() }),
  ciphertext: z.string(),
});

export async function exportEncryptedArchive(app: AppData, passphrase: string): Promise<Blob> {
  if (passphrase.length < 10) {
    throw new AppError('invalid-input', 'Use an archive passphrase with at least 10 characters.');
  }
  const payload = archivePayload(app);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveArchiveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const envelope = encryptedArchiveSchema.parse({
    format: 'thoughtline-encrypted',
    version: 1,
    kdf: { name: 'PBKDF2-SHA-256', iterations: ARCHIVE_ITERATIONS, salt: encode(salt) },
    cipher: { name: 'AES-256-GCM', iv: encode(iv) },
    ciphertext: encode(new Uint8Array(ciphertext)),
  });
  return new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/octet-stream' });
}

export function exportReadableArchive(app: AppData): Blob {
  return new Blob([JSON.stringify(archivePayload(app), null, 2)], { type: 'application/json' });
}

export async function readArchive(file: File, passphrase: string): Promise<ArchivePayload> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text()) as unknown;
  } catch (error) {
    throw new AppError('invalid-input', 'The selected archive is not valid JSON.', error);
  }
  const readable = archivePayloadSchema.safeParse(raw);
  if (readable.success) return readable.data;
  const encrypted = encryptedArchiveSchema.safeParse(raw);
  if (!encrypted.success)
    throw new AppError('invalid-input', 'This is not a supported Thoughtline archive.');
  if (!passphrase) throw new AppError('invalid-input', 'Enter the archive passphrase.');
  try {
    const key = await deriveArchiveKey(passphrase, decode(encrypted.data.kdf.salt));
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decode(encrypted.data.cipher.iv) },
      key,
      decode(encrypted.data.ciphertext),
    );
    return archivePayloadSchema.parse(JSON.parse(new TextDecoder().decode(plaintext)) as unknown);
  } catch (error) {
    throw new AppError(
      'invalid-input',
      'The passphrase is incorrect or the archive is damaged.',
      error,
    );
  }
}

export function mergeArchive(
  current: AppData,
  archive: ArchivePayload,
  options: { history: boolean; profile: boolean; settings: boolean; preferences: boolean },
): AppData {
  const next = structuredClone(current);
  if (options.history) {
    const byId = new Map(next.history.map((record) => [record.id, record]));
    for (const incoming of archive.history) {
      const existing = byId.get(incoming.id);
      if (!existing || incoming.updatedAt > existing.updatedAt) byId.set(incoming.id, incoming);
    }
    next.history = [...byId.values()];
  }
  if (options.profile) next.profile = archive.profile;
  if (options.settings) next.settings = { ...next.settings, ...archive.settings };
  if (options.preferences) next.learnedPreferences = archive.learnedPreferences;
  return appDataSchema.parse(next);
}

function archivePayload(app: AppData): ArchivePayload {
  return archivePayloadSchema.parse({
    format: 'thoughtline-data',
    version: 1,
    archiveId: createId(),
    createdAt: new Date().toISOString(),
    history: app.history,
    profile: app.profile,
    settings: {
      retention: app.settings.retention,
      publicResearchEnabled: app.settings.publicResearchEnabled,
      selectedSources: app.settings.selectedSources,
    },
    learnedPreferences: app.learnedPreferences,
  });
}

async function deriveArchiveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ARCHIVE_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function encode(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
