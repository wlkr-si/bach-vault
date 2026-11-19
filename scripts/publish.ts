import { execFileSync } from 'node:child_process'
import { put } from './r2.ts'
import { mutableCache, publicOrigin, readJson, slugPattern } from './vault.ts'
import type { VaultIndex } from './types.ts'

const index = readJson<VaultIndex>('dist/index.json')
if (!/^[\da-f]{64}$/.test(index.revision)) throw new Error('Invalid index revision')

function onLatestMain() {
  const repo = process.env.GITHUB_REPOSITORY
  const revision = process.env.GITHUB_SHA
  if (process.env.GITHUB_EVENT_NAME !== 'push' || process.env.GITHUB_REF !== 'refs/heads/main' ||
      repo !== 'wlkr-si/bach-vault' || !revision) {
    throw new Error('Vault publishing requires a push to main in the Vault repository')
  }
  const latest = execFileSync('gh', ['api', 'repos/' + repo + '/git/ref/heads/main', '--jq', '.object.sha'], {
    encoding: 'utf8',
  }).trim()
  return latest === revision
}

if (!onLatestMain()) {
  console.log('A newer main revision is already queued for publication')
  process.exit(0)
}
for (const entry of index.pieces) {
  if (!slugPattern.test(entry.slug)) throw new Error('Invalid index slug: ' + entry.slug)
  const key = 'derived/' + index.revision + '/' + entry.slug + '/detail.json'
  if (entry.detailUrl !== publicOrigin + '/' + key) throw new Error('Invalid detail URL: ' + entry.slug)
  put(key, 'dist/' + key, 'application/json', mutableCache)
}
if (!onLatestMain()) {
  console.log('Index publication deferred to newer main revision')
  process.exit(0)
}
put('index.json', 'dist/index.json', 'application/json', mutableCache)
console.log('Published contract v1 for ' + index.pieces.length + ' Pieces: ' + index.revision)
