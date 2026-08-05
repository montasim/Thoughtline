export function collectWritingSamples(
  savedSamples: readonly string[],
  currentSample = '',
): string[] {
  return [...savedSamples, currentSample]
    .map((sample) => sample.trim())
    .filter(Boolean)
    .slice(0, 8);
}
