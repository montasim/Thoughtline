import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyConfiguration,
  exportConfiguration,
  readConfiguration,
} from '../../src/application/configuration-backup';
import { defaultAppData } from '../../src/domain/schemas';
import { LINKEDIN_ORIGIN, PROVIDER_ORIGINS } from '../../src/infrastructure/permissions';
import { credentialVault } from '../../src/infrastructure/storage/credential-vault';
import { imageCredentialRepository } from '../../src/infrastructure/storage/image-credentials';
import { installChromeMock } from '../helpers/chrome';

const memory = installChromeMock();

describe('configuration backups', () => {
  beforeEach(() => memory.reset());

  it('exports complete configuration while omitting secrets by default', async () => {
    const app = structuredClone(defaultAppData);
    app.profile.role = 'Senior Software Engineer';
    app.settings.hashtagPolicy = {
      generatedCount: 3,
      customHashtags: ['#Thoughtline'],
    };
    app.settings.consent = {
      accepted: true,
      version: 1,
      acceptedAt: new Date().toISOString(),
    };

    await credentialVault.save('gemini', 'gemini-secret-key');
    const text = await (await exportConfiguration(app, false)).text();
    const exported = JSON.parse(text) as Record<string, unknown>;

    expect(exported).not.toHaveProperty('secrets');
    expect(text).not.toContain('gemini-secret-key');
    expect(exported).toMatchObject({
      format: 'thoughtline-configuration',
      version: 2,
      app: {
        profile: { role: 'Senior Software Engineer' },
        settings: {
          consent: { accepted: true },
          hashtagPolicy: { generatedCount: 3, customHashtags: ['#Thoughtline'] },
        },
      },
    });
  });

  it('includes and restores secrets, permissions, and the imported app state when selected', async () => {
    const app = structuredClone(defaultAppData);
    app.profile.role = 'Imported role';
    app.settings.aiRouting.zeroCostConfirmed = true;
    app.settings.providerValidation.gemini.state = 'valid';
    app.settings.providerValidation.groq.state = 'valid';
    await credentialVault.save('openrouter', 'openrouter-secret-key');
    await credentialVault.save('gemini', 'gemini-secret-key');
    await credentialVault.save('groq', 'groq-secret-key');
    await imageCredentialRepository.save({
      accountId: '0123456789abcdef0123456789abcdef',
      apiToken: 'cloudflare-secret-token-value',
    });
    memory.permissions.add(LINKEDIN_ORIGIN);
    for (const origin of PROVIDER_ORIGINS) memory.permissions.add(origin);

    const blob = await exportConfiguration(app, true);
    const backup = await readConfiguration(new File([blob], 'thoughtline-configuration.json'));
    expect(backup.secrets).toMatchObject({
      openrouterApiKey: 'openrouter-secret-key',
      geminiApiKey: 'gemini-secret-key',
      groqApiKey: 'groq-secret-key',
      cloudflareImages: { accountId: '0123456789abcdef0123456789abcdef' },
    });

    memory.reset();
    const restored = await applyConfiguration(structuredClone(defaultAppData), backup);

    expect(restored.app.profile.role).toBe('Imported role');
    expect(restored.app.settings.providerValidation.openrouter.state).toBe('unvalidated');
    expect(restored.app.settings.providerValidation.gemini.state).toBe('unvalidated');
    expect(restored.app.settings.aiRouting.zeroCostConfirmed).toBe(false);
    expect(restored.permissionsGranted).toBe(true);
    await expect(credentialVault.get('gemini')).resolves.toBe('gemini-secret-key');
    await expect(credentialVault.get('openrouter')).resolves.toBe('openrouter-secret-key');
    await expect(credentialVault.get('groq')).resolves.toBe('groq-secret-key');
    await expect(imageCredentialRepository.get()).resolves.toMatchObject({
      values: { accountId: '0123456789abcdef0123456789abcdef' },
    });
    expect(memory.permissions.has(LINKEDIN_ORIGIN)).toBe(true);
    expect(PROVIDER_ORIGINS.every((origin) => memory.permissions.has(origin))).toBe(true);
  });

  it('preserves current provider state and secrets when the imported file omits secrets', async () => {
    const current = structuredClone(defaultAppData);
    current.settings.providerValidation.gemini.state = 'valid';
    current.settings.aiRouting.zeroCostConfirmed = true;
    await credentialVault.save('gemini', 'current-gemini-key');
    const backup = await readConfiguration(
      new File([await exportConfiguration(defaultAppData, false)], 'configuration.json'),
    );

    const restored = await applyConfiguration(current, backup);

    expect(restored.app.settings.providerValidation.gemini.state).toBe('valid');
    expect(restored.app.settings.aiRouting.zeroCostConfirmed).toBe(true);
    await expect(credentialVault.get('gemini')).resolves.toBe('current-gemini-key');
  });

  it('continues the import when Chrome cannot restore recorded permissions', async () => {
    const app = structuredClone(defaultAppData);
    app.profile.role = 'Restored without permissions';
    memory.permissions.add(LINKEDIN_ORIGIN);
    const backup = await readConfiguration(
      new File([await exportConfiguration(app, false)], 'configuration.json'),
    );
    memory.permissions.clear();
    vi.mocked(chrome.permissions.request).mockRejectedValueOnce(
      new Error('Only permissions specified in the manifest may be requested.'),
    );

    const restored = await applyConfiguration(structuredClone(defaultAppData), backup);

    expect(restored.app.profile.role).toBe('Restored without permissions');
    expect(restored.permissionsGranted).toBe(false);
    expect(chrome.permissions.remove).not.toHaveBeenCalled();
  });

  it('rejects malformed or unrelated JSON before changing configuration', async () => {
    await expect(
      readConfiguration(new File(['{"format":"something-else"}'], 'bad.json')),
    ).rejects.toMatchObject({ code: 'invalid-input' });
  });

  it('imports legacy v1 backups with safe OpenRouter defaults and no invented key', async () => {
    const legacyApp = structuredClone(defaultAppData) as unknown as {
      schemaVersion: number;
      settings: Record<string, unknown>;
    };
    legacyApp.schemaVersion = 1;
    delete legacyApp.settings.aiRouting;
    delete (legacyApp.settings.providerValidation as Record<string, unknown>).openrouter;
    const legacy = {
      format: 'thoughtline-configuration',
      version: 1,
      createdAt: new Date().toISOString(),
      extensionVersion: '0.3.0',
      app: legacyApp,
      calibratedLayouts: [],
      permissions: {
        linkedIn: false,
        providers: false,
        imageProvider: false,
        researchSources: [],
        unlimitedStorage: false,
      },
      secrets: {
        geminiApiKey: 'legacy-gemini-key',
        groqApiKey: 'legacy-groq-key',
        cloudflareImages: null,
      },
    };

    const backup = await readConfiguration(
      new File([JSON.stringify(legacy)], 'legacy-configuration.json'),
    );

    expect(backup.version).toBe(2);
    expect(backup.app.settings.aiRouting.models.openrouter).toBe('google/gemma-4-31b-it:free');
    expect(backup.secrets?.openrouterApiKey).toBeNull();
  });
});
