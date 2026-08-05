import { describe, expect, it } from 'vitest';
import {
  exportEncryptedArchive,
  exportReadableArchive,
  readArchive,
} from '../../src/application/data-archive';
import { defaultAppData } from '../../src/domain/schemas';

describe('local data archives', () => {
  it('structurally excludes consent, provider status, onboarding state, and credentials', async () => {
    const blob = exportReadableArchive(defaultAppData);
    const text = await blob.text();
    expect(text).not.toContain('providerValidation');
    expect(text).not.toContain('onboardingComplete');
    expect(text).not.toContain('acceptedAt');
    expect(text).not.toContain('apiKey');
  });

  it('round-trips an AES-GCM encrypted archive and rejects a wrong passphrase', async () => {
    const blob = await exportEncryptedArchive(defaultAppData, 'a strong local passphrase');
    const file = new File([blob], 'backup.thoughtline');
    await expect(readArchive(file, 'a strong local passphrase')).resolves.toMatchObject({
      format: 'thoughtline-data',
      version: 1,
    });
    await expect(readArchive(file, 'wrong passphrase')).rejects.toMatchObject({
      code: 'invalid-input',
    });
  });
});
