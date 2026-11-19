import { dirname } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { addBalance, titleWords } from '../bench/scores/balance.mjs'
import { fieldScores } from '../bench/scores/field.mjs'
import { json, publicOrigin, readJson, recordOrigin, sha256 } from './vault.ts'
import type {
  Analysis, Features, FieldScores, Measurements, Metadata, Signals, VaultDetail, VaultEntry, VaultIndex,
} from './types.ts'

function readRecord(slug: string) {
  const path = 'pieces/' + slug
  const metadata = readJson<Metadata>(path + '/meta.json')
  const measurement = readJson<Signals>(path + '/signals.json')
  const fixed = measurement.measurements
  if (metadata.status !== 'ok' || fixed.id !== slug || fixed.title !== (metadata.title ?? '') ||
      fixed.model !== metadata.model || fixed.clipStatus !== 'ok' ||
      !Number.isFinite(fixed.complexity) || !Number.isFinite(fixed.sync)) {
    throw new Error('Invalid published measurements: ' + slug)
  }
  const dimensions = { palette: 384, sound: 60, structure: 96 }
  for (const key of Object.keys(dimensions) as (keyof Features)[]) {
    const values = measurement.features[key]
    if (!Array.isArray(values) || values.length !== dimensions[key] || !values.every(Number.isFinite)) {
      throw new Error('Invalid ' + key + ' measurements: ' + slug)
    }
  }
  return {
    metadata,
    measurements: readJson<Measurements>(path + '/run.json'),
    analysis: readJson<Analysis>(path + '/analysis.json'),
    scores: { ...fixed } as Signals['measurements'] & Partial<FieldScores>,
    features: { ...measurement.features, words: new Set(titleWords(fixed.title)) },
  }
}

function build() {
  const slugs = readdirSync('pieces').sort()
  const withdrawn = readJson<string[]>('withdrawn.json')
  if (!Array.isArray(withdrawn) || new Set(withdrawn).size !== withdrawn.length ||
      withdrawn.some(slug => !slugs.includes(slug))) {
    throw new Error('withdrawn.json must list unique, existing Piece slugs')
  }
  const records = slugs.filter(slug => !withdrawn.includes(slug)).map(readRecord)
  const scores = records.map(record => record.scores)
  fieldScores(scores, records.map(record => record.features))
  addBalance(scores)

  const words = scores.flatMap(record => titleWords(record.title)).sort()
  const counts = new Map<string, number>()
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1)
  const titleWordCounts = Object.fromEntries(counts)

  const details = records.map(({ metadata, measurements, analysis, scores }) => {
    const slug = scores.id
    if (scores.uniqueness === undefined || !scores.uniquenessMeasures || !scores.map ||
        scores.balance === undefined || !scores.standing) {
      throw new Error('Missing field scores: ' + slug)
    }
    return {
      schemaVersion: 1 as const, slug, metadata, measurements, analysis,
      scores: scores as VaultDetail['scores'],
      recordUrl: recordOrigin + '/' + slug,
    }
  })

  const pieces = details.map(({ slug, metadata, analysis, scores }) => ({
    slug,
    title: metadata.title ?? 'Untitled',
    model: metadata.model,
    modelName: metadata.model.replace(/^(GPT-[\d.]+)-([A-Za-z]+)$/, '$1 $2'),
    lab: scores.lab,
    effort: metadata.effort ?? null,
    clipUrl: publicOrigin + '/pieces/' + slug + '/clip.mp4',
    posterUrl: publicOrigin + '/pieces/' + slug + '/poster.jpg',
    withdrawn: false as const,
    measurements: {
      wall: scores.timeSeconds,
      lines: analysis.moduleLines,
      characters: analysis.moduleCharacters,
      reply: analysis.replyCharacters,
      nodes: Object.values(analysis.audioNodeCallSites).reduce((sum, value) => sum + value, 0),
      loudness: analysis.integratedLoudnessLufs,
      peak: analysis.truePeakDbfs,
      silence: analysis.silentFraction === null ? null : analysis.silentFraction * 100,
      frames: analysis.distinctVideoFrames,
    },
    scores: {
      complexity: scores.complexity,
      sync: scores.sync,
      uniqueness: scores.uniqueness,
      balance: scores.balance,
      costUsd: scores.costUsd,
    },
    map: scores.map,
  } satisfies Omit<VaultEntry, 'detailUrl'>))

  const schemaVersion = 1 as const
  const revision = sha256(json({ schemaVersion, titleWordCounts, pieces, details }))
  const index: VaultIndex = {
    schemaVersion, revision, titleWordCounts,
    pieces: pieces.map(piece => ({
      ...piece, detailUrl: publicOrigin + '/derived/' + revision + '/' + piece.slug + '/detail.json',
    })),
  }
  const files = new Map<string, string>()
  for (const detail of details) {
    const document: VaultDetail = { ...detail, revision }
    files.set('derived/' + revision + '/' + detail.slug + '/detail.json', json(document))
  }
  files.set('index.json', json(index))
  return { files, pieceCount: pieces.length, revision }
}

const { files, pieceCount, revision } = build()
if (process.argv.includes('--check')) {
  if (!isDeepStrictEqual(files, build().files)) throw new Error('Vault builds differ byte for byte')
  console.log('Two builds are byte-identical: ' + revision)
} else {
  for (const [path, bytes] of files) {
    const destination = 'dist/' + path
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, bytes)
  }
  console.log('Built contract v1 for ' + pieceCount + ' Pieces: ' + revision)
}
