export type RecordId = string

export type Metadata = {
  title: string | null
  model: string
  lab: string | null
  status: 'ok'
  effort?: string
  route?: string
  instructionHash: string
}

export type Reading = { value: string | number | null; source: string }
export type Measurements = Record<string, Reading>

export type Analysis = {
  moduleLines: number
  moduleCharacters: number
  replyCharacters: number
  drawingMethods: string[]
  audioNodeCallSites: Record<string, number>
  integratedLoudnessLufs: number | null
  truePeakDbfs: number | null
  silentFraction: number | null
  distinctVideoFrames: number
  recordedVideoFrames: number
  channelRange: number
  clipSeconds: number
}

export type FieldInput = { id: RecordId; complexity: number; sync: number }
type Point = { x: number; y: number }

export type FieldScores = {
  uniqueness: number
  uniquenessMeasures: Record<string, number>
  map: Point
  balance: number | null
  standing: Record<string, number>
}

export type FixedScores = FieldInput & {
  title: string
  model: string
  lab: string | null
  effort?: string
  releaseDate: string | null
  releaseSource: string | null
  costUsd: number | null
  costReason: string | null
  timeSeconds: number | null
  inputTokens: number | null
  outputTokens: number | null
  thinkingTokens: number | null
  cachedReadTokens: number | null
  cachedWriteTokens: number | null
  linesOfCode: number | null
  musicComplexity: number
  pictureComplexity: number
  music: Record<string, number>
  picture: Record<string, number>
  syncMeasures: {
    event: { score: number }
    continuous: { score: number }
    lagMs: number
  } & Record<string, unknown>
  clipStatus: 'ok'
}

export type Features = { palette: number[]; sound: number[]; structure: number[] }
export type Signals = { measurements: FixedScores; features: Features }

export type VaultEntry = {
  slug: RecordId
  title: string
  model: string
  modelName: string
  lab: string | null
  effort: string | null
  clipUrl: string
  posterUrl: string
  detailUrl: string
  withdrawn: false
  measurements: {
    wall: number | null
    lines: number
    characters: number
    reply: number
    nodes: number
    loudness: number | null
    peak: number | null
    silence: number | null
    frames: number
  }
  scores: Pick<FixedScores, 'complexity' | 'sync' | 'costUsd'> &
    Pick<FieldScores, 'uniqueness' | 'balance'>
  map: Point
}

export type VaultIndex = {
  schemaVersion: 1
  revision: string
  titleWordCounts: Record<string, number>
  pieces: VaultEntry[]
}

export type VaultDetail = {
  schemaVersion: 1
  revision: string
  slug: RecordId
  metadata: Metadata
  measurements: Measurements
  analysis: Analysis
  scores: FixedScores & FieldScores
  recordUrl: string
}
