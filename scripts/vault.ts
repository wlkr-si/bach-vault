import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const publicOrigin = 'https://vault.bach.wlkr.si'
export const recordOrigin = 'https://github.com/wlkr-si/bach-vault/tree/main/pieces'
export const rawRecordOrigin = 'https://raw.githubusercontent.com/wlkr-si/bach-vault/main/pieces'
export const bucket = 'bach-bench-vault'
export const mutableCache = 'public, max-age=60, must-revalidate'
export const immutableCache = 'public, max-age=31536000, immutable'
export const mediaTypes = { 'clip.mp4': 'video/mp4', 'poster.jpg': 'image/jpeg' }
export const recordFiles = ['analysis.json', 'meta.json', 'piece.js', 'reply.txt', 'run.json', 'signals.json', 'timeline.json']
export const commonFiles = ['bench/instruction.md', 'bench/record.mjs']
export const slugPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/
const fixturePrefix = 'workshop-fixture-'

export function vaultTarget(branch = 'main') {
  const lane = /^workshop-staging-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(branch)?.[1]
  if (branch !== 'main' && !lane) throw new Error('Invalid Vault branch: ' + branch)
  const prefix = lane ? 'staging/workshop/' + lane + '/' : ''
  return { branch, prefix, indexKey: prefix + 'index.json' }
}

export function mediaKey(path: string, target = vaultTarget(process.env.VAULT_BRANCH)) {
  const slug = path.split('/')[1]
  if (!slug?.startsWith(fixturePrefix)) return path
  if (!target.prefix) throw new Error('Workshop fixtures cannot enter the live Vault: ' + slug)
  return target.prefix + path
}

type Media = { sha256: string; size: number; contentType: string; cacheControl: string; sourceUrl?: string }
export type Manifest = { schemaVersion: 1; files: Record<string, string>; media: Record<string, Media> }

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

export function json(value: unknown) {
  return JSON.stringify(value, null, 2) + '\n'
}

export function sha256(bytes: string | Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}
