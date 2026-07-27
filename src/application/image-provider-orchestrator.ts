import { AppError } from './errors';
import type {
  GeneratedImage,
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageProviderCredentials,
} from './ports/image-generation-provider';
import { CloudflareImageProvider } from '../infrastructure/providers/cloudflare-image-provider';
import { imageCredentialRepository } from '../infrastructure/storage/image-credentials';

export interface ImageCredentialReader {
  get: () => Promise<ImageProviderCredentials | null>;
}

export class ImageProviderOrchestrator {
  constructor(
    private readonly provider: ImageGenerationProvider = new CloudflareImageProvider(),
    private readonly credentials: ImageCredentialReader = imageCredentialRepository,
  ) {}

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const credentials = await this.credentials.get();
    if (!credentials) {
      throw new AppError(
        'credential-missing',
        'Connect Cloudflare image generation in Settings first.',
      );
    }
    return this.provider.generate(credentials, request);
  }
}

export const imageProviderOrchestrator = new ImageProviderOrchestrator();
