import type { FieldInput, FieldScores, Features } from '../../scripts/types.ts'

export function fieldScores(
  records: (FieldInput & Partial<FieldScores>)[],
  features: (Features & { words: Set<string> })[],
): void
