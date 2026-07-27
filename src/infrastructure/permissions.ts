import type { SourceName } from '../domain/schemas';

export const LINKEDIN_ORIGIN = 'https://www.linkedin.com/*';
export const PROVIDER_ORIGINS = [
  'https://generativelanguage.googleapis.com/*',
  'https://api.groq.com/*',
] as const;
export const IMAGE_PROVIDER_ORIGIN = 'https://api.cloudflare.com/*';

export const SOURCE_ORIGINS: Record<SourceName, string> = {
  'hacker-news': 'https://hacker-news.firebaseio.com/*',
  dev: 'https://dev.to/*',
  medium: 'https://medium.com/*',
  lobsters: 'https://lobste.rs/*',
  'stack-overflow': 'https://api.stackexchange.com/*',
};

export async function requestLinkedInPermission(): Promise<boolean> {
  return chrome.permissions.request({ origins: [LINKEDIN_ORIGIN] });
}

export async function hasLinkedInPermission(): Promise<boolean> {
  return chrome.permissions.contains({ origins: [LINKEDIN_ORIGIN] });
}

export async function requestProviderPermissions(): Promise<boolean> {
  return chrome.permissions.request({ origins: [...PROVIDER_ORIGINS] });
}

export async function hasProviderPermissions(): Promise<boolean> {
  return chrome.permissions.contains({ origins: [...PROVIDER_ORIGINS] });
}

export async function requestImageProviderPermission(): Promise<boolean> {
  return chrome.permissions.request({ origins: [IMAGE_PROVIDER_ORIGIN] });
}

export async function hasImageProviderPermission(): Promise<boolean> {
  return chrome.permissions.contains({ origins: [IMAGE_PROVIDER_ORIGIN] });
}

export async function requestSourcePermissions(sources: SourceName[]): Promise<boolean> {
  const origins = sources.map((source) => SOURCE_ORIGINS[source]);
  return chrome.permissions.request({ origins });
}

export async function hasSourcePermission(source: SourceName): Promise<boolean> {
  return chrome.permissions.contains({ origins: [SOURCE_ORIGINS[source]] });
}

export async function removeSourcePermission(source: SourceName): Promise<boolean> {
  return chrome.permissions.remove({ origins: [SOURCE_ORIGINS[source]] });
}

export async function requestUnlimitedStorage(): Promise<boolean> {
  return chrome.permissions.request({ permissions: ['unlimitedStorage'] });
}
