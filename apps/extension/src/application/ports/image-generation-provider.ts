export interface ImageProviderCredentials {
  values: Record<string, string>;
}

export interface ImageGenerationRequest {
  prompt: string;
  width: number;
  height: number;
  seed?: number;
  signal?: AbortSignal;
}

export interface GeneratedImage {
  dataUrl: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  provider: string;
  model: string;
}

export interface ImageGenerationProvider {
  readonly name: string;
  readonly model: string;
  validateCredentials(credentials: ImageProviderCredentials): void;
  generate(
    credentials: ImageProviderCredentials,
    request: ImageGenerationRequest,
  ): Promise<GeneratedImage>;
}
