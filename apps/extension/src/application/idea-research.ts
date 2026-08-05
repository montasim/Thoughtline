import type { SourceEvidence, SourceName } from '../domain/schemas';
import { sourceAdapters } from '../infrastructure/sources/adapters';

export interface ResearchResult {
  evidence: SourceEvidence[];
  unavailableSources: SourceName[];
}

export async function collectSourceEvidence(
  sources: SourceName[],
  topics: string[],
  signal?: AbortSignal,
): Promise<ResearchResult> {
  const settled = await Promise.allSettled(
    sources.map(async (source) => ({
      source,
      evidence: await sourceAdapters[source].findBest(topics, signal),
    })),
  );
  const evidence: SourceEvidence[] = [];
  const unavailableSources: SourceName[] = [];
  settled.forEach((result, index) => {
    const source = sources[index];
    if (!source) return;
    if (result.status === 'fulfilled') {
      if (result.value.evidence) evidence.push(result.value.evidence);
    } else {
      unavailableSources.push(source);
    }
  });
  return { evidence, unavailableSources };
}
