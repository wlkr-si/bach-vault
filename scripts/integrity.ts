import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import {
  commonFiles, immutableCache, mediaKey, mediaTypes, publicOrigin, readJson, recordFiles, sha256, slugPattern,
  vaultTarget,
} from './vault.ts'
import type { Manifest } from './vault.ts'
import type { Metadata } from './types.ts'

function checkManifest(manifest: Manifest) {
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported manifest version')
  const files = new Set(commonFiles)
  const media = new Set<string>()
  const instructionHash = sha256(readFileSync('bench/instruction.md'))
  for (const entry of readdirSync('pieces', { withFileTypes: true })) {
    const slug = entry.name
    if (!entry.isDirectory() || !slugPattern.test(slug)) {
      throw new Error('Unexpected permanent record path: pieces/' + slug)
    }
    const root = 'pieces/' + slug + '/'
    for (const name of readdirSync(root)) {
      if (!recordFiles.includes(name)) throw new Error('Unexpected permanent file: ' + root + name)
    }
    for (const name of recordFiles) files.add(root + name)
    for (const [name, type] of Object.entries(mediaTypes)) {
      const path = root + name
      mediaKey(path)
      media.add(path)
      const item = manifest.media[path]
      if (!item || item.contentType !== type || item.cacheControl !== immutableCache ||
          !/^[\da-f]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.size) || item.size <= 0) {
        throw new Error('Missing or invalid locked media manifest entry: ' + path)
      }
    }
  }

  for (const path of files) {
    if (!manifest.files[path]) throw new Error('Missing permanent file manifest entry: ' + path)
    if (!lstatSync(path, { throwIfNoEntry: false })?.isFile()) throw new Error('Missing permanent file: ' + path)
    if (sha256(readFileSync(path)) !== manifest.files[path]) throw new Error('SHA-256 mismatch: ' + path)
    if (path.endsWith('/meta.json') && readJson<Metadata>(path).instructionHash !== instructionHash) {
      throw new Error('Instruction hash mismatch: ' + path)
    }
  }
  for (const path of Object.keys(manifest.files)) {
    if (!files.has(path)) throw new Error('Unexpected permanent file manifest entry: ' + path)
  }
  for (const path of Object.keys(manifest.media)) {
    if (!media.has(path)) throw new Error('Unexpected media manifest entry: ' + path)
  }
}

function checkBase(manifest: Manifest, revision: string) {
  if (!/^[\da-f]{40}$/.test(revision)) throw new Error('BASE_REVISION must be a commit SHA')
  const path = execFileSync('git', ['ls-tree', '--name-only', revision, '--', 'manifest.json'], { encoding: 'utf8' })
  if (!path.trim()) return
  const base = JSON.parse(execFileSync('git', ['show', revision + ':manifest.json'], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  })) as Manifest
  const target = vaultTarget(process.env.VAULT_BRANCH)
  if (target.prefix) {
    for (const path of Object.keys(manifest.media)) {
      if (!base.media[path] && mediaKey(path, target) === path) {
        throw new Error('Staging may add only Workshop fixture media: ' + path)
      }
    }
  }
  for (const [path, digest] of Object.entries(base.files)) {
    if (manifest.files[path] !== digest) throw new Error('Changed permanent file manifest entry: ' + path)
  }
  for (const [path, media] of Object.entries(base.media)) {
    const current = manifest.media[path]
    if (!current || current.sha256 !== media.sha256 || current.size !== media.size ||
        current.contentType !== media.contentType || current.cacheControl !== media.cacheControl ||
        current.sourceUrl !== media.sourceUrl) {
      throw new Error('Changed permanent media manifest entry: ' + path)
    }
  }
}

const manifest = readJson<Manifest>('manifest.json')
if (process.env.BASE_REVISION) checkBase(manifest, process.env.BASE_REVISION)
checkManifest(manifest)
console.log('Verified ' + Object.keys(manifest.files).length + ' permanent files and ' +
  Object.keys(manifest.media).length + ' media manifest entries')

if (process.argv.includes('--remote')) {
  const media = Object.entries(manifest.media)
  for (let start = 0; start < media.length; start += 8) {
    await Promise.all(media.slice(start, start + 8).map(async ([path, item]) => {
      const response = await fetch(publicOrigin + '/' + mediaKey(path), {
        redirect: 'error', signal: AbortSignal.timeout(45_000),
      })
      if (response.status !== 200) throw new Error('HTTP ' + response.status + ': ' + path)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length !== item.size || sha256(bytes) !== item.sha256) throw new Error('Media SHA-256 mismatch: ' + path)
      if (response.headers.get('content-type') !== item.contentType ||
          response.headers.get('cache-control') !== item.cacheControl) {
        throw new Error('Incorrect locked media headers: ' + path)
      }
      console.log('Verified ' + path + ' ' + item.size + ' bytes ' + item.sha256)
    }))
  }
  console.log('Public bytes and headers verified for ' + media.length + ' media objects')
}
