import { z } from 'zod';
import { AppError } from '../../application/errors';

const DATABASE_NAME = 'thoughtline-vault';
const DATABASE_VERSION = 1;
const KEY_STORE = 'device-keys';
const DEVICE_KEY_ID = 'credential-key-v1';
const CREDENTIALS_KEY = 'thoughtline.provider-credentials';
const SESSION_CREDENTIALS_KEY = 'thoughtline.session-credentials';
const credentialNameSchema = z.enum(['gemini', 'groq', 'cloudflare-images']);
export type CredentialName = z.infer<typeof credentialNameSchema>;

const encryptedCredentialSchema = z.object({
  algorithm: z.literal('AES-GCM'),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
  version: z.literal(1),
});

const encryptedCredentialMapSchema = z.partialRecord(
  credentialNameSchema,
  encryptedCredentialSchema,
);
const sessionCredentialMapSchema = z.partialRecord(credentialNameSchema, z.string().min(1));

export class CredentialVault {
  async save(provider: CredentialName, apiKey: string): Promise<void> {
    const value = apiKey.trim();
    if (value.length < 10 || value.length > 500) {
      throw new AppError('credential-invalid', `The ${providerLabel(provider)} key is invalid.`);
    }
    const key = await getDeviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(value),
    );
    const current = await this.readEncrypted();
    current[provider] = {
      algorithm: 'AES-GCM',
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(ciphertext)),
      version: 1,
    };
    await chrome.storage.local.set({ [CREDENTIALS_KEY]: current });
    await this.cacheSession(provider, value);
  }

  async get(provider: CredentialName): Promise<string | null> {
    const session = await this.readSession();
    if (session[provider]) return session[provider] ?? null;
    const encrypted = (await this.readEncrypted())[provider];
    if (!encrypted) return null;
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(encrypted.iv) },
        await getDeviceKey(),
        fromBase64(encrypted.ciphertext),
      );
      const apiKey = new TextDecoder().decode(plaintext);
      await this.cacheSession(provider, apiKey);
      return apiKey;
    } catch (error) {
      throw new AppError(
        'credential-invalid',
        `The saved ${providerLabel(provider)} key cannot be unlocked on this device.`,
        error,
      );
    }
  }

  async has(provider: CredentialName): Promise<boolean> {
    return Boolean((await this.readEncrypted())[provider]);
  }

  async remove(provider: CredentialName): Promise<void> {
    const encrypted = await this.readEncrypted();
    delete encrypted[provider];
    await chrome.storage.local.set({ [CREDENTIALS_KEY]: encrypted });
    const session = await this.readSession();
    delete session[provider];
    await chrome.storage.session.set({ [SESSION_CREDENTIALS_KEY]: session });
  }

  private async readEncrypted(): Promise<z.infer<typeof encryptedCredentialMapSchema>> {
    const result = await chrome.storage.local.get(CREDENTIALS_KEY);
    return encryptedCredentialMapSchema.parse(result[CREDENTIALS_KEY] ?? {});
  }

  private async readSession(): Promise<z.infer<typeof sessionCredentialMapSchema>> {
    const result = await chrome.storage.session.get(SESSION_CREDENTIALS_KEY);
    return sessionCredentialMapSchema.parse(result[SESSION_CREDENTIALS_KEY] ?? {});
  }

  private async cacheSession(provider: CredentialName, apiKey: string): Promise<void> {
    const session = await this.readSession();
    session[provider] = apiKey;
    await chrome.storage.session.set({ [SESSION_CREDENTIALS_KEY]: session });
  }
}

async function getDeviceKey(): Promise<CryptoKey> {
  const database = await openDatabase();
  try {
    const existing = await requestResult(
      database.transaction(KEY_STORE, 'readonly').objectStore(KEY_STORE).get(DEVICE_KEY_ID),
    );
    if (existing instanceof CryptoKey) return existing;

    const created = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const transaction = database.transaction(KEY_STORE, 'readwrite');
    transaction.objectStore(KEY_STORE).put(created, DEVICE_KEY_ID);
    await transactionComplete(transaction);
    return created;
  } finally {
    database.close();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(KEY_STORE)) {
        request.result.createObjectStore(KEY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open the credential vault.'));
  });
}

function requestResult(request: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as unknown);
    request.onerror = () =>
      reject(request.error ?? new Error('Could not read the credential vault.'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Could not update the credential vault.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('The credential vault update was aborted.'));
  });
}

function toBase64(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function providerLabel(provider: CredentialName): string {
  if (provider === 'gemini') return 'Gemini';
  if (provider === 'groq') return 'Groq';
  return 'Cloudflare image';
}

export const credentialVault = new CredentialVault();
