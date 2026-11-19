import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { put, r2 } from './r2.ts'
import { immutableCache, mediaTypes, readJson, sha256, slugPattern } from './vault.ts'
import type { Manifest } from './vault.ts'

const [root, mode] = process.argv.slice(2)
if (!root || !['--dry-run', '--upload'].includes(mode)) {
  throw new Error('Usage: node scripts/media.ts MEDIA_ROOT --dry-run|--upload')
}

const manifest = readJson<Manifest>('manifest.json')
const keys = r2<{ Contents?: { Key: string }[] }>('list-objects-v2', ['--prefix', 'pieces/'])
const existing = new Set(
  (keys.Contents ?? []).map(({ Key }) => Key).filter(key => !key.startsWith('pieces/_trial/')),
)
const pending = []
for (const [key, item] of Object.entries(manifest.media)) {
  const [prefix, slug, filename, ...extra] = key.split('/')
  if (prefix !== 'pieces' || !slugPattern.test(slug) || extra.length ||
      !Object.hasOwn(mediaTypes, filename) ||
      mediaTypes[filename as keyof typeof mediaTypes] !== item.contentType ||
      item.cacheControl !== immutableCache) {
    throw new Error('Invalid upload path or headers: ' + key)
  }
  if (existing.has(key)) {
    console.log('Already present, verify with integrity --remote: ' + key)
    continue
  }
  const path = join(root, key)
  const bytes = readFileSync(path)
  if (bytes.length !== item.size || sha256(bytes) !== item.sha256) throw new Error('Local media mismatch: ' + key)
  console.log([key, item.size, item.sha256, item.contentType, item.cacheControl].join('\t'))
  pending.push({ key, path, item })
}
console.log(pending.length + ' create-only uploads, ' + existing.size + ' existing production objects')
if (mode === '--upload') {
  for (const { key, path, item } of pending) {
    put(key, path, item.contentType, item.cacheControl, item)
    console.log('Stored ' + key)
  }
}
