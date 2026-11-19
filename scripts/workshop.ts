import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { put, r2 } from './r2.ts'
import {
  immutableCache, json, mediaKey, mediaTypes, readJson, recordFiles, sha256, slugPattern, vaultTarget,
} from './vault.ts'
import type { Manifest } from './vault.ts'
import type { Measurements, Metadata } from './types.ts'

const [action, slug, source, resume] = process.argv.slice(2)
const target = vaultTarget(process.env.VAULT_BRANCH)
if (!slugPattern.test(slug ?? '') || !['preflight', 'add'].includes(action) ||
    Boolean(target.prefix) !== slug.startsWith('workshop-fixture-') ||
    (action === 'add' && !source) || (resume && resume !== '--resume')) {
  throw new Error('Supply a Piece slug for the configured Vault branch and a saved recording for add.')
}

const folder = 'pieces/' + slug
const manifest = readJson<Manifest>('manifest.json')

const prefix = mediaKey(folder + '/', target)
const existing = new Set((r2<{ Contents?: { Key: string }[] }>(
  'list-objects-v2', ['--prefix', prefix],
).Contents ?? []).map(({ Key }) => Key))
if (existing.size && !resume) throw new Error('Duplicate upload refused. Media already exists under ' + prefix)
if (existsSync(folder)) throw new Error('The Vault already contains this Piece: ' + slug)
if (action === 'preflight') process.exit(0)

const metadata = readJson<Metadata>(join(source, 'meta.json'))
if (metadata.status !== 'ok') throw new Error('Only a mechanically accepted Piece can enter the Vault')

const publicRunFields = [
  'wallSeconds', 'toolReportedDurationSeconds', 'inputTokens', 'outputTokens', 'reasoningTokens',
  'cachedReadTokens', 'cachedWriteTokens', 'reportedCostUsd', 'reportedModelId', 'requestedModelId',
  'tool', 'toolVersion', 'effort', 'effortSetting', 'cacheWrite5mTokens', 'cacheWrite1hTokens',
]
const run = readJson<Measurements>(join(source, 'run.json'))
const publicRun = Object.fromEntries(publicRunFields.flatMap(key => {
  const reading = run[key]
  if (!reading) return []
  const { value, source } = reading
  if (value !== null && typeof value !== 'number' && typeof value !== 'string') {
    throw new Error('Invalid public run reading: ' + key)
  }
  if (!['tool-result', 'hand-paste', 'fixture', 'bench'].includes(source)) {
    throw new Error('Invalid provenance for public run reading: ' + key)
  }
  return [[key, { value, source }]]
}))

const scratch = mkdtempSync(join(tmpdir(), 'bach-vault-export-'))
try {
  const captureRoot = join(scratch, 'media')
  const capture = join(captureRoot, slug)
  mkdirSync(capture, { recursive: true })
  const { model, lab, title, route, instructionHash, status } = metadata
  const effort = metadata.effort ?? (typeof publicRun.effortSetting?.value === 'string' ? publicRun.effortSetting.value : undefined)
  writeFileSync(join(capture, 'meta.json'), json({ model, lab, title, route, instructionHash, status, effort }))
  writeFileSync(join(capture, 'run.json'), json(publicRun))
  for (const file of ['analysis.json', 'piece.js', 'reply.txt', ...Object.keys(mediaTypes)]) {
    copyFileSync(join(source, file), join(capture, file))
  }
  // Only the R2 child process needs the upload credential.
  const env = { ...process.env }
  delete env.R2_ENDPOINT
  delete env.AWS_ACCESS_KEY_ID
  delete env.AWS_SECRET_ACCESS_KEY
  execFileSync(process.execPath, ['bench/scores/score.mjs', captureRoot, join(scratch, 'scores.json'), '--capture-signals'], {
    env, stdio: 'inherit',
  })
  execFileSync(process.execPath, ['bench/timeline.mjs', join(capture, 'clip.mp4'), join(capture, 'timeline.json')], {
    env, stdio: 'inherit',
  })

  mkdirSync(folder)
  for (const file of recordFiles) {
    const path = folder + '/' + file
    copyFileSync(join(capture, file), path)
    manifest.files[path] = sha256(readFileSync(path))
  }
  for (const [name, contentType] of Object.entries(mediaTypes)) {
    const path = folder + '/' + name
    const body = join(capture, name)
    const bytes = readFileSync(body)
    manifest.media[path] = { sha256: sha256(bytes), size: bytes.length, contentType, cacheControl: immutableCache }
  }
  writeFileSync('manifest.json', json(manifest))
  execFileSync(process.execPath, ['scripts/integrity.ts'], { env, stdio: 'inherit' })
  execFileSync(process.execPath, ['scripts/build.ts', '--check'], { env, stdio: 'inherit' })

  // Reconcile all previously saved objects before writing any missing objects.
  for (const name of Object.keys(mediaTypes)) {
    const path = folder + '/' + name
    const key = mediaKey(path, target)
    if (!existing.has(key)) continue
    const saved = join(scratch, name)
    const metadata = r2<{ ContentType: string; CacheControl: string }>('get-object', ['--key', key, saved])
    const item = manifest.media[path]
    const bytes = readFileSync(saved)
    if (bytes.length !== item.size || sha256(bytes) !== item.sha256 ||
        metadata.ContentType !== item.contentType || metadata.CacheControl !== item.cacheControl) {
      throw new Error('Existing media differs from the saved recording: ' + key)
    }
    console.log('Verified existing media without re-uploading ' + key)
  }
  for (const [name, contentType] of Object.entries(mediaTypes)) {
    const path = folder + '/' + name
    const key = mediaKey(path, target)
    if (existing.has(key)) continue
    put(key, join(capture, name), contentType, immutableCache, manifest.media[path])
    console.log('Stored create-only ' + key + ' ' + manifest.media[path].size + ' bytes ' + manifest.media[path].sha256)
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
