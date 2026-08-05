import { z } from 'zod';
import { AppError } from '../../application/errors';
import type { ImageProviderCredentials } from '../../application/ports/image-generation-provider';
import { credentialVault } from './credential-vault';

const IMAGE_CREDENTIAL_ID = 'cloudflare-images' as const;

export const cloudflareImageCredentialsSchema = z.object({
  accountId: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{32}$/i, 'Enter the 32-character Account ID.'),
  apiToken: z.string().trim().min(20, 'Enter a valid Workers AI API token.').max(500),
});
export type CloudflareImageCredentials = z.infer<typeof cloudflareImageCredentialsSchema>;

export class ImageCredentialRepository {
  async save(credentials: CloudflareImageCredentials): Promise<void> {
    const parsed = cloudflareImageCredentialsSchema.safeParse(credentials);
    if (!parsed.success) {
      throw new AppError(
        'credential-invalid',
        parsed.error.issues[0]?.message ?? 'The Cloudflare image credentials are invalid.',
      );
    }
    await credentialVault.save(IMAGE_CREDENTIAL_ID, JSON.stringify(parsed.data));
  }

  async get(): Promise<ImageProviderCredentials | null> {
    const saved = await credentialVault.get(IMAGE_CREDENTIAL_ID);
    if (!saved) return null;
    try {
      const parsed = cloudflareImageCredentialsSchema.parse(JSON.parse(saved) as unknown);
      return {
        values: {
          accountId: parsed.accountId,
          apiToken: parsed.apiToken,
        },
      };
    } catch (error) {
      throw new AppError(
        'credential-invalid',
        'The saved Cloudflare image connection is invalid. Save it again in Settings.',
        error,
      );
    }
  }

  async has(): Promise<boolean> {
    return credentialVault.has(IMAGE_CREDENTIAL_ID);
  }

  async remove(): Promise<void> {
    await credentialVault.remove(IMAGE_CREDENTIAL_ID);
  }
}

export const imageCredentialRepository = new ImageCredentialRepository();
