import {readFileSync, readdirSync, writeFileSync, existsSync} from 'node:fs'
import {join} from 'node:path'
import {prices} from './prices.mjs'
import {addBalance, titleWords} from './balance.mjs'

const [root, output, mode] = process.argv.slice(2)
if (!root || !output) throw Error('Usage: node score.mjs PIECES_DIR OUTPUT_JSON')
const round = (x, decimals = 4) => Number(x.toFixed(decimals))
function cost(run, price) {
  if (run.tool?.value === 'OpenCode Console') {
    const charge = run.reportedCostUsd?.value
    return Number.isFinite(charge) && charge >= 0
      ? [charge, null]
      : [null, 'OpenCode Console did not report a charge']
  }
  const get = key => {
    const value = run[key]?.value
    return Number.isSafeInteger(value) && value >= 0 ? value : null
  }
  const keys = ['inputTokens','outputTokens','cachedReadTokens','cachedWriteTokens']
  const missing = keys.filter(key => get(key) === null)
  if (missing.length) return [null, 'Missing ' + missing.join(', ')]
  if (!price) return [null, 'Public list price unavailable']
  const rate = price.usdPerMillion
  const read = get('cachedReadTokens')
  const write = get('cachedWriteTokens')
  const input = get('inputTokens') - (price.lab === 'OpenAI' ? read + write : 0)
  if (price.lab === 'xAI' && read > input) return [null, 'Thinking tokens unreported in run.json and cache accounting differs']
  if (input < 0) return [null, 'Cached counts exceed total input']
  if (!['OpenAI','Anthropic'].includes(price.lab) && get('reasoningTokens') === null)
    return [null, 'Thinking token count and output accounting unavailable']
  const thinking = get('reasoningTokens')
  if (thinking === null || thinking > get('outputTokens')) return [null, 'Thinking token count missing or inconsistent']
  const terms = [[input,rate.input],[get('outputTokens')-thinking,rate.output],[thinking,rate.thinking],[read,rate.cachedRead]]
  if (price.lab === 'Anthropic' && write) {
    const short = run.cacheWrite5mTokens?.value
    const long = run.cacheWrite1hTokens?.value
    if (!Number.isSafeInteger(short) || !Number.isSafeInteger(long) || short < 0 || long < 0 || short+long !== write) {
      return [null, 'Cache-write lifetime unavailable']
    }
    terms.push([short,rate.cachedWrite],[long,rate.cachedWriteLong])
  } else terms.push([write,rate.cachedWrite])
  if (terms.some(([count, rate]) => count && rate === null)) return [null, 'Public list price unavailable']
  return [round(terms.reduce((sum,[count,rate]) => sum + count*rate,0)/1e6,8),null]
}

const records = readdirSync(root).sort().flatMap(id => {
  const read = name => {
    const path = join(root,id,name+'.json')
    return existsSync(path) ? JSON.parse(readFileSync(path,'utf8')) : {}
  }
  const meta = read('meta')
  if (meta.status !== 'ok') return []
  const run = read('run'), analysis = read('analysis')
  const p = prices[id]
  const [costUsd,costReason] = cost(run,p)
  return [{id, title: meta.title ?? '', model: meta.model ?? id, lab: meta.lab ?? p?.lab ?? null,
    ...(meta.effort ? {effort:meta.effort} : {}),
    releaseDate:p?.releaseDate ?? null, releaseSource:p?.releaseSource ?? null,
    costUsd,costReason,timeSeconds:run.wallSeconds?.value ?? null,
    inputTokens:run.inputTokens?.value ?? null, outputTokens:run.outputTokens?.value ?? null,
    thinkingTokens:run.reasoningTokens?.value ?? null,cachedReadTokens:run.cachedReadTokens?.value ?? null,
    cachedWriteTokens:run.cachedWriteTokens?.value ?? null, linesOfCode:analysis.moduleLines ?? null,
    complexity:null, musicComplexity:null, pictureComplexity:null, sync:null, uniqueness:null,
    music:null, picture:null, syncMeasures:null, uniquenessMeasures:null, map:{x:null,y:null}, clipStatus:null}]
})
const words = records.flatMap(record => titleWords(record.title)).sort()
const titleWordCounts = Object.fromEntries([...new Set(words)].map(word => [word, words.filter(w => w === word).length]))
if (mode !== '--metadata') {
  const {scoreClips} = await import('./signals.mjs')
  const diagnostics = {}
  const diagnosisPath = mode === '--diagnostics' ? process.argv[5] : null
  const selected = new Set(process.argv.slice(6))
  scoreClips(root, records, titleWords, diagnosisPath ? (id, data) => {
    if (selected.has(id)) diagnostics[id] = data
  } : undefined, mode === '--capture-signals' ? (record, {palette, sound, structure}) => {
    // Save only the per-Clip measurements. The Vault reconstructs the field.
    const measurements = {...record}
    delete measurements.uniqueness
    delete measurements.uniquenessMeasures
    delete measurements.map
    writeFileSync(join(root, record.id, 'signals.json'),
      JSON.stringify({measurements, features: {palette, sound, structure}})+'\n')
  } : undefined)
  if (diagnosisPath) writeFileSync(diagnosisPath, JSON.stringify(diagnostics)+'\n')
}
addBalance(records)
writeFileSync(output, JSON.stringify({pieces:records,titleWordCounts},null,2)+'\n')
