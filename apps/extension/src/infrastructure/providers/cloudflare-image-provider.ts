import { z } from 'zod';
import { AppError } from '../../application/errors';
import { imageModelRegistry } from '../../application/image-model-registry';
import type {
  GeneratedImage,
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageProviderCredentials,
} from '../../application/ports/image-generation-provider';
import { fetchWithTimeout, mapProviderHttpError } from './provider-utils';

const cloudflareImageResponseSchema = z.object({
  success: z.boolean(),
  result: z
    .object({
      image: z.string().min(100),
    })
    .optional(),
  errors: z
    .array(
      z.object({
        message: z.string().optional(),
      }),
    )
    .optional(),
});

export class CloudflareImageProvider implements ImageGenerationProvider {
  readonly name = imageModelRegistry.cloudflare.provider;
  readonly model: string;

  constructor(model: string = imageModelRegistry.cloudflare.model) {
    this.model = model;
  }

  validateCredentials(credentials: ImageProviderCredentials): void {
    const accountId = credentials.values.accountId?.trim();
    const apiToken = credentials.values.apiToken?.trim();
    if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId) || !apiToken || apiToken.length < 20) {
      throw new AppError(
        'credential-invalid',
        'Save a valid Cloudflare Account ID and Workers AI token in Settings.',
      );
    }
  }

  async generate(
    credentials: ImageProviderCredentials,
    request: ImageGenerationRequest,
  ): Promise<GeneratedImage> {
    this.validateCredentials(credentials);
    const accountId = credentials.values.accountId!;
    const apiToken = credentials.values.apiToken!;
    const form = new FormData();
    form.set('prompt', request.prompt);
    form.set('width', String(request.width));
    form.set('height', String(request.height));
    if (request.seed !== undefined) form.set('seed', String(request.seed));

    const response = await fetchWithTimeout(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${this.model}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}` },
        body: form,
        ...(request.signal ? { signal: request.signal } : {}),
      },
      120_000,
    );
    if (response.status === 402) {
      throw new AppError(
        'provider-rate-limit',
        'The free Workers AI allowance is exhausted. It resets daily at 00:00 UTC.',
      );
    }
    if (!response.ok) throw mapProviderHttpError(response.status);

    const parsed = cloudflareImageResponseSchema.safeParse(await response.json());
    if (!parsed.success || !parsed.data.success || !parsed.data.result?.image) {
      const detail = parsed.success
        ? parsed.data.errors?.find((error) => error.message)?.message
        : undefined;
      throw new AppError(
        'provider-response-invalid',
        detail || 'Cloudflare returned an incomplete image.',
      );
    }

    return {
      dataUrl: `data:image/png;base64,${parsed.data.result.image}`,
      mimeType: 'image/png',
      width: request.width,
      height: request.height,
      provider: this.name,
      model: this.model,
    };
  }
}
