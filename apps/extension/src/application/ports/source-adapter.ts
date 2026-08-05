import type { SourceEvidence, SourceName } from '../../domain/schemas';

export interface SourceAdapter {
  readonly source: SourceName;
  findBest(topics: string[], signal?: AbortSignal): Promise<SourceEvidence | null>;
}
