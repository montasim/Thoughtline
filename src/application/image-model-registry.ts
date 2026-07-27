export interface ImageModelConfiguration {
  provider: string;
  model: string;
  defaultWidth: number;
  defaultHeight: number;
}

export const imageModelRegistry = {
  cloudflare: {
    provider: 'cloudflare',
    model: '@cf/black-forest-labs/flux-2-klein-4b',
    defaultWidth: 1_200,
    defaultHeight: 627,
  },
} as const satisfies Record<string, ImageModelConfiguration>;
