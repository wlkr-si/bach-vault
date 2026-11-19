import type { FieldInput, FieldScores } from '../../scripts/types.ts'

export function titleWords(title: string): string[]
export function addBalance(records: (FieldInput & Partial<FieldScores>)[]): void
