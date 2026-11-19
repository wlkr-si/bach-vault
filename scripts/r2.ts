import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { bucket, sha256 } from './vault.ts'

export function r2<T>(operation: string, args: string[]): T {
  const endpoint = process.env.R2_ENDPOINT
  if (!endpoint || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('Set R2_ENDPOINT, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for the Vault bucket')
  }
  try {
    const response = execFileSync('aws', [
      's3api', operation, '--endpoint-url', endpoint, '--bucket', bucket,
      '--region', 'auto', '--output', 'json', '--no-cli-pager', ...args,
    ], {
      encoding: 'utf8',
      env: { ...process.env, AWS_REQUEST_CHECKSUM_CALCULATION: 'WHEN_REQUIRED' },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 90_000,
    })
    return JSON.parse(response) as T
  } catch {
    const keyIndex = args.indexOf('--key')
    const target = keyIndex === -1 ? 'the Vault bucket' : args[keyIndex + 1]
    throw new Error('R2 ' + operation + ' failed for ' + target)
  }
}

export function put(
  key: string,
  path: string,
  contentType: string,
  cacheControl: string,
  writeOnce?: { sha256: string },
) {
  const bytes = readFileSync(path)
  if (writeOnce && sha256(bytes) !== writeOnce.sha256) {
    throw new Error('Media changed after upload preflight: ' + key)
  }
  const md5 = createHash('md5').update(bytes).digest('base64')
  r2('put-object', [
    '--key', key, '--body', path, '--content-type', contentType,
    '--cache-control', cacheControl, '--content-md5', md5,
    ...(writeOnce ? ['--if-none-match', '*'] : []),
  ])
}
