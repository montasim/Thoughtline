import { z } from 'zod';
import { calibratedLayoutRecipeListSchema } from '../domain/calibration';
import {
  appDataSchema,
  parseAppDataWithMigration,
  sourceNameSchema,
  type AppData,
  type ProviderName,
  type SourceName,
} from '../domain/schemas';
import {
  IMAGE_PROVIDER_ORIGIN,
  LINKEDIN_ORIGIN,
  PROVIDER_ORIGINS,
  SOURCE_ORIGINS,
} from '../infrastructure/permissions';
import { storageRepository } from '../infrastructure/storage/chrome-storage';
import { credentialVault } from '../infrastructure/storage/credential-vault';
import {
  cloudflareImageCredentialsSchema,
  imageCredentialRepository,
} from '../infrastructure/storage/image-credentials';
import { AppError } from './errors';

const permissionStateSchema = z.object({
  linkedIn: z.boolean(),
  providers: z.boolean(),
  imageProvider: z.boolean(),
  researchSources: z.array(sourceNameSchema).max(5),
  unlimitedStorage: z.boolean(),
});

const secretsSchema = z.object({
  openrouterApiKey: z.string().min(10).max(500).nullable(),
  geminiApiKey: z.string().min(10).max(500).nullable(),
  groqApiKey: z.string().min(10).max(500).nullable(),
  cloudflareImages: cloudflareImageCredentialsSchema.nullable(),
});

export const configurationBackupSchema = z.object({
  format: z.literal('thoughtline-configuration'),
  version: z.literal(2),
  createdAt: z.iso.datetime(),
  extensionVersion: z.string().min(1).max(80),
  app: appDataSchema,
  calibratedLayouts: calibratedLayoutRecipeListSchema,
  permissions: permissionStateSchema,
  secrets: secretsSchema.optional(),
});
export type ConfigurationBackup = z.infer<typeof configurationBackupSchema>;

export async function exportConfiguration(app: AppData, includeSecrets: boolean): Promise<Blob> {
  const [calibratedLayouts, permissions, secrets] = await Promise.all([
    storageRepository.loadLayoutRecipes(),
    readPermissionState(),
    includeSecrets ? readSecrets() : Promise.resolve(undefined),
  ]);
  const backup = configurationBackupSchema.parse({
    format: 'thoughtline-configuration',
    version: 2,
    createdAt: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest().version,
    app,
    calibratedLayouts,
    permissions,
    ...(secrets ? { secrets } : {}),
  });
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
}

export async function readConfiguration(file: File): Promise<ConfigurationBackup> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text()) as unknown;
  } catch (error) {
    throw new AppError('invalid-input', 'The selected configuration is not valid JSON.', error);
  }
  const parsed = configurationBackupSchema.safeParse(normalizeConfigurationBackup(raw));
  if (!parsed.success) {
    throw new AppError('invalid-input', 'This is not a supported Thoughtline configuration file.');
  }
  return parsed.data;
}

export async function applyConfiguration(
  current: AppData,
  backup: ConfigurationBackup,
): Promise<{ app: AppData; permissionsGranted: boolean }> {
  const permissionsGranted = await applyPermissionState(backup.permissions);
  await storageRepository.replaceLayoutRecipes(backup.calibratedLayouts);

  const next = structuredClone(backup.app);
  if (backup.secrets) {
    await replaceSecrets(backup.secrets);
    for (const provider of ['openrouter', 'gemini', 'groq'] as const) {
      const key = secretForProvider(backup.secrets, provider);
      next.settings.providerValidation[provider] = {
        state: key ? 'unvalidated' : 'missing',
        credentialVersion:
          current.settings.providerValidation[provider].credentialVersion + (key ? 1 : 0),
      };
    }
    next.settings.aiRouting.zeroCostConfirmed = false;
  } else {
    for (const provider of ['openrouter', 'gemini', 'groq'] as const) {
      next.settings.providerValidation[provider] =
        next.settings.aiRouting.models[provider] === current.settings.aiRouting.models[provider]
          ? current.settings.providerValidation[provider]
          : {
              state:
                current.settings.providerValidation[provider].state === 'missing'
                  ? 'missing'
                  : 'unvalidated',
              credentialVersion: current.settings.providerValidation[provider].credentialVersion,
            };
    }
    next.settings.aiRouting.zeroCostConfirmed = current.settings.aiRouting.zeroCostConfirmed;
  }

  return { app: appDataSchema.parse(next), permissionsGranted };
}

async function readPermissionState(): Promise<z.infer<typeof permissionStateSchema>> {
  const sourceEntries = Object.entries(SOURCE_ORIGINS) as Array<[SourceName, string]>;
  const [linkedIn, providers, imageProvider, unlimitedStorage, ...sourcePermissions] =
    await Promise.all([
      chrome.permissions.contains({ origins: [LINKEDIN_ORIGIN] }),
      chrome.permissions.contains({ origins: [...PROVIDER_ORIGINS] }),
      chrome.permissions.contains({ origins: [IMAGE_PROVIDER_ORIGIN] }),
      chrome.permissions.contains({ permissions: ['unlimitedStorage'] }),
      ...sourceEntries.map(([, origin]) => chrome.permissions.contains({ origins: [origin] })),
    ]);
  return {
    linkedIn,
    providers,
    imageProvider,
    unlimitedStorage,
    researchSources: sourceEntries
      .filter((_, index) => sourcePermissions[index])
      .map(([source]) => source),
  };
}

async function applyPermissionState(
  permissions: z.infer<typeof permissionStateSchema>,
): Promise<boolean> {
  const desiredOrigins = [
    ...(permissions.linkedIn ? [LINKEDIN_ORIGIN] : []),
    ...(permissions.providers ? [...PROVIDER_ORIGINS] : []),
    ...(permissions.imageProvider ? [IMAGE_PROVIDER_ORIGIN] : []),
    ...permissions.researchSources.map((source) => SOURCE_ORIGINS[source]),
  ];
  const desiredPermissions: chrome.runtime.ManifestPermission[] = permissions.unlimitedStorage
    ? ['unlimitedStorage']
    : [];
  const manifest = chrome.runtime.getManifest() as unknown as {
    optional_host_permissions?: unknown;
    optional_permissions?: unknown;
  };
  const declaredOrigins = new Set(stringList(manifest.optional_host_permissions));
  const declaredPermissions = new Set(stringList(manifest.optional_permissions));
  const requestableOrigins = desiredOrigins.filter((origin) => declaredOrigins.has(origin));
  const requestablePermissions = desiredPermissions.filter((permission) =>
    declaredPermissions.has(permission),
  );
  const allDesiredPermissionsDeclared =
    requestableOrigins.length === desiredOrigins.length &&
    requestablePermissions.length === desiredPermissions.length;
  let requested = allDesiredPermissionsDeclared;

  if (requestableOrigins.length > 0 || requestablePermissions.length > 0) {
    try {
      requested =
        Boolean(
          await chrome.permissions.request({
            ...(requestableOrigins.length > 0 ? { origins: requestableOrigins } : {}),
            ...(requestablePermissions.length > 0 ? { permissions: requestablePermissions } : {}),
          }),
        ) && requested;
    } catch {
      requested = false;
    }
  }

  return requested;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

async function readSecrets(): Promise<z.infer<typeof secretsSchema>> {
  const [openrouterApiKey, geminiApiKey, groqApiKey, cloudflare] = await Promise.all([
    credentialVault.get('openrouter'),
    credentialVault.get('gemini'),
    credentialVault.get('groq'),
    imageCredentialRepository.get(),
  ]);
  return secretsSchema.parse({
    openrouterApiKey,
    geminiApiKey,
    groqApiKey,
    cloudflareImages: cloudflare
      ? {
          accountId: cloudflare.values.accountId,
          apiToken: cloudflare.values.apiToken,
        }
      : null,
  });
}

async function replaceSecrets(secrets: z.infer<typeof secretsSchema>): Promise<void> {
  if (secrets.openrouterApiKey) await credentialVault.save('openrouter', secrets.openrouterApiKey);
  else await credentialVault.remove('openrouter');

  if (secrets.geminiApiKey) await credentialVault.save('gemini', secrets.geminiApiKey);
  else await credentialVault.remove('gemini');

  if (secrets.groqApiKey) await credentialVault.save('groq', secrets.groqApiKey);
  else await credentialVault.remove('groq');

  if (secrets.cloudflareImages) await imageCredentialRepository.save(secrets.cloudflareImages);
  else await imageCredentialRepository.remove();
}

function normalizeConfigurationBackup(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const candidate = value as Record<string, unknown>;
  if (candidate.format !== 'thoughtline-configuration' || candidate.version !== 1) return value;
  const legacySecrets =
    candidate.secrets && typeof candidate.secrets === 'object'
      ? { openrouterApiKey: null, ...(candidate.secrets as Record<string, unknown>) }
      : undefined;
  try {
    return {
      ...candidate,
      version: 2,
      app: parseAppDataWithMigration(candidate.app),
      ...(legacySecrets ? { secrets: legacySecrets } : {}),
    };
  } catch {
    return value;
  }
}

function secretForProvider(
  secrets: z.infer<typeof secretsSchema>,
  provider: ProviderName,
): string | null {
  if (provider === 'openrouter') return secrets.openrouterApiKey;
  return provider === 'gemini' ? secrets.geminiApiKey : secrets.groqApiKey;
}
