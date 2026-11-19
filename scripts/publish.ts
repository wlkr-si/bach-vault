import { execFileSync } from 'node:child_process'
import { put } from './r2.ts'
import { mutableCache, publicOrigin, readJson, slugPattern, vaultTarget } from './vault.ts'
import type { VaultIndex } from './types.ts'

const index = readJson<VaultIndex>('dist/index.json')
if (!/^[\da-f]{64}$/.test(index.revision)) throw new Error('Invalid index revision')
const target = vaultTarget(process.env.VAULT_BRANCH)

function onLatestBranch() {
  const repo = process.env.GITHUB_REPOSITORY
  const revision = process.env.GITHUB_SHA
  if (process.env.GITHUB_EVENT_NAME !== 'push' || process.env.GITHUB_REF !== 'refs/heads/' + target.branch ||
      repo !== 'wlkr-si/bach-vault' || !revision) {
    throw new Error('Vault publishing requires a push to the configured branch in the Vault repository')
  }
  const latest = execFileSync('gh', ['api', 'repos/' + repo + '/git/ref/heads/' + target.branch, '--jq', '.object.sha'], {
    encoding: 'utf8',
  }).trim()
  return latest === revision
}

if (!onLatestBranch()) {
  console.log('A newer revision is already queued for publication')
  process.exit(0)
}
for (const entry of index.pieces) {
  if (!slugPattern.test(entry.slug)) throw new Error('Invalid index slug: ' + entry.slug)
  const key = 'derived/' + index.revision + '/' + entry.slug + '/detail.json'
  if (entry.detailUrl !== publicOrigin + '/' + target.prefix + key) throw new Error('Invalid detail URL: ' + entry.slug)
  put(target.prefix + key, 'dist/' + key, 'application/json', mutableCache)
}
if (!onLatestBranch()) {
  console.log('Index publication deferred to newer branch revision')
  process.exit(0)
}
put(target.indexKey, 'dist/index.json', 'application/json', mutableCache)
console.log('Published ' + target.indexKey + ' for ' + index.pieces.length + ' Pieces: ' + index.revision)
