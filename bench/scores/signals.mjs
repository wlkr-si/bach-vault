import {spawnSync} from 'node:child_process'
import {join} from 'node:path'
import {rate, size, spectrum} from './fft.mjs'
import {fieldScores} from './field.mjs'
import {syncScore} from './sync.mjs'

const ticks = 300, hop = 600, width = 64, height = 80
const range = (x, low, high) => Math.max(0, Math.min(1, (x-low)/(high-low)))
const sum = a => a.reduce((s,x) => s+x,0)
const mean = a => a.length ? sum(a)/a.length : 0
const sd = a => {
  const center = mean(a)
  return Math.sqrt(mean(a.map(x => (x-center)**2)))
}
const quantile = (a,q) => [...a].sort((x,y) => x-y)[Math.floor((a.length-1)*q)] ?? 0
const normalized = a => {
  const total = sum(a)
  return total ? a.map(x => x/total) : a
}
const tv = (a,b) => sum(a.map((x,i) => Math.abs(x-b[i])))/2
const list = (n,fn) => Array.from({length:n},(_,i) => fn(i))

function decode(path, args) {
  const result = spawnSync('ffmpeg',['-nostdin','-v','error','-threads','1','-filter_threads','1',
    '-i',path,...args,'-t','15','-threads','1','pipe:1'],{maxBuffer:8*1024*1024})
  if (result.error?.code === 'ENOENT') throw Error('ffmpeg is required')
  return {bytes:result.stdout ?? Buffer.alloc(0), ok:result.status === 0}
}
function audio(bytes) {
  const samples = Float32Array.from(list(Math.floor(bytes.length/4),i => bytes.readFloatLE(i*4)))
  const envelope = list(ticks,i => {
    let square = 0
    for (let j=i*hop;j<(i+1)*hop;j++) square += (samples[j] || 0)**2
    return Math.sqrt(square/hop)
  })
  const energy={loudness:envelope,low:[],mid:[],high:[]}
  const poles=[180,700,2400].map(hz => 1-Math.exp(-2*Math.PI*hz/rate))
  const filter=[0,0,0]
  for (let i=0;i<ticks;i++) {
    let low=0,mid=0,high=0
    for (let j=i*hop;j<(i+1)*hop;j++) {
      const x=samples[j] || 0
      for (let k=0;k<3;k++) filter[k]+=poles[k]*(x-filter[k])
      low+=filter[0]**2
      mid+=(filter[1]-filter[0])**2
      high+=(x-filter[2])**2
    }
    energy.low.push(Math.sqrt(low/hop))
    energy.mid.push(Math.sqrt(mid/hop))
    energy.high.push(Math.sqrt(high/hop))
  }
  const levels = envelope.map(x => Math.max(-80,20*Math.log10(x)))
  const onsets = levels.map((x,i) => i && x > -62 ? Math.max(0,x-levels[i-1]-1.5) : 0)
  const events = []
  onsets.forEach((x,i) => {
    if (x >= 2 && x > (onsets[i-1] ?? 0) && x >= (onsets[i+1] ?? 0)) events.push(i)
  })
  const noteCounts = new Map()
  const profiles = []
  const widths = [], concentrations = [], voices = []
  for (let i=0; i<120; i++) {
    const center = 750+1500*i
    const bins = spectrum(samples,center)
    const power = bins.map(x => x*x)
    const total = sum(power.subarray(9))
    const bands = Array(10).fill(0)
    const peaks = []
    let low = 0, high = 0, cumulative = 0
    for (let k=9;k<bins.length;k++) {
      cumulative += power[k]
      if (!low && cumulative >= .05*total) low=k
      if (!high && cumulative >= .95*total) high=k
      bands[Math.min(9,Math.floor(2*Math.log2(k/9)))] += power[k]
      if (k >= 900 || bins[k] <= bins[k-1] || bins[k] <= bins[k+1]) continue
      const local = sum(power.subarray(k-1,k+2))
      if (local < .018*total || bins[k] < .00025) continue
      const offset = .5*(bins[k-1]-bins[k+1])/(bins[k-1]-2*bins[k]+bins[k+1])
      peaks.push({k, hz:(k+offset)*rate/size, local})
    }
    peaks.sort((a,b) => b.local-a.local || a.k-b.k)
    const concentration = total ? sum(peaks.slice(0,6).map(p => p.local))/total : 0
    const active = levels[Math.floor(center/hop)] > -62
    const tonal = active && concentration >= .28
    profiles.push(active ? normalized(bands) : Array(10).fill(0))
    concentrations.push(active ? range(concentration,.25,.7) : 0)
    if (!tonal) continue
    widths.push(Math.log2(high/low))
    const fundamentals = []
    for (const p of peaks.sort((a,b) => a.k-b.k)) {
      if (fundamentals.some(f => {
        const harmonic = Math.round(p.hz/f)
        return harmonic >= 2 && Math.abs(p.hz-f*harmonic) < Math.max(4,p.hz*.012)
      })) continue
      fundamentals.push(p.hz)
      if (fundamentals.length === 6) break
    }
    const notes = new Set(fundamentals.map(f => Math.round(69+12*Math.log2(f/440))))
    for (const note of notes) noteCounts.set(note,(noteCounts.get(note) ?? 0)+1)
    voices.push(notes.size)
  }
  const intervals = events.slice(1).map((t,i) => t-events[i])
  const segments = list(6,i => list(10,b => mean(profiles.slice(i*20,i*20+20).map(p => p[b]))))
  const profileChange = mean(segments.slice(1).map((s,i) => tv(s,segments[i])))
  // Compare onset and spectral timelines to shifted copies, looking for a repeated idea.
  const repetition = Math.max(...list(41,i => {
    const lag = i+8
    const spectral = mean(profiles.slice(lag).map((p,j) => tv(p,profiles[j])))
    const shift = Math.round(lag*2.5)
    const timing = correlation(onsets.slice(shift),onsets.slice(0,-shift))
    return (1-range(spectral,0,.25))*Math.max(0,timing)
  }))
  const activeLevels = levels.filter(x => x > -62)
  const measures = {
    distinctPitches:[...noteCounts.values()].filter(n => n>=2).length,
    onsetsPerSecond:events.length/15, simultaneousPitches:mean(voices),
    rhythmicVariety:intervals.length >= 3 ? sd(intervals)/mean(intervals) : 0,
    frequencyRangeOctaves:mean(widths),
    dynamicRangeDb:quantile(activeLevels,.9)-quantile(activeLevels,.1),
    structuralChange:profileChange*(1-.65*repetition), repetition,
    endingDropDb:Math.max(0,mean(levels.slice(250,280))-mean(levels.slice(295))),
    tonalPresence:mean(concentrations),
  }
  const m = measures
  const score = 100*m.tonalPresence*mean([
    range(m.distinctPitches,1,32),range(m.onsetsPerSecond,.2,5),
    range(m.simultaneousPitches,1,4),range(m.rhythmicVariety,.08,1),
    range(m.frequencyRangeOctaves,.1,5),range(m.dynamicRangeDb,2,20),
    range(m.structuralChange,.025,.35),range(m.endingDropDb,3,28),
  ])
  return {measures,score,onsets,energy,profile:segments.flat()}
}
function picture(bytes) {
  const frameSize = width*height*3
  const motion = [], edges = [], coarseEdges = [], coherence = [], layouts = [], palettes = []
  const regionNames=list(16,i => 'r'+(Math.floor(i/4)+1)+'c'+(i%4+1))
  const names=['frame',...list(4,i=>'row'+(i+1)),...regionNames]
  const motionFeatures=Object.fromEntries(names.map(name=>[name,[]]))
  const brightness=Object.fromEntries(names.map(name=>[name,[]]))
  let previous = new Float64Array(width*height*3)
  for (let t=0;t<ticks;t++) {
    const frame = bytes.subarray(t*frameSize,(t+1)*frameSize)
    const present = frame.length === frameSize
    const rgb = present ? Float64Array.from(frame,x => x/255) : previous
    const palette = Array(64).fill(0), layout = Array(16).fill(0)
    const regionChange=Array(16).fill(0)
    const coarse = new Float64Array(frameSize/16)
    let edge=0, delta=0, signed=0, neighbor=0, count=0
    for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
      const i=(y*width+x)*3
      const bin = c => Math.min(3,Math.floor(rgb[i+c]*4))
      const luma = (rgb[i]+rgb[i+1]+rgb[i+2])/3
      palette[bin(0)*16+bin(1)*4+bin(2)] += 1
      const region=Math.floor(y/20)*4+Math.floor(x/16)
      layout[region] += luma/320
      for (let c=0;c<3;c++) {
        const j=i+c, d=rgb[j]-previous[j]
        coarse[(Math.floor(y/4)*(width/4)+Math.floor(x/4))*3+c]+=rgb[j]/16
        delta+=Math.abs(d)
        regionChange[region]+=Math.abs(d)/960
        signed+=d
        if (x+1>=width || y+1>=height) continue
        edge += (Math.abs(rgb[j]-rgb[j+3])+Math.abs(rgb[j]-rgb[j+width*3]))/2
        neighbor += (Math.abs(d-rgb[j+3]+previous[j+3])+Math.abs(d-rgb[j+width*3]+previous[j+width*3]))/2
        count++
      }
    }
    const change = delta/frameSize
    motion.push(t ? change : 0)
    names.forEach((name,i)=>{
      const start=i===0 ? 0 : i<5 ? (i-1)*4 : i-5
      const end=i===0 ? 16 : i<5 ? start+4 : start+1
      motionFeatures[name].push(t ? mean(regionChange.slice(start,end)) : 0)
      brightness[name].push(mean(layout.slice(start,end)))
    })
    coherence.push(t ? change*range(1-neighbor/count/(change+1e-9),.05,.7)*
      range(1-Math.abs(signed)/(delta+1e-9),.1,.7) : 0)
    edges.push(edge/count)
    let coarseEdge=0, coarseCount=0
    for (let y=0;y<height/4-1;y++) for (let x=0;x<width/4-1;x++) {
      for (let c=0;c<3;c++) {
        const i=(y*(width/4)+x)*3+c
        const right=Math.abs(coarse[i]-coarse[i+3])
        const below=Math.abs(coarse[i]-coarse[i+(width/4)*3])
        coarseEdge+=((right>=.025 ? right : 0)+(below>=.025 ? below : 0))/2
        coarseCount++
      }
    }
    coarseEdges.push(coarseEdge/coarseCount)
    palettes.push(normalized(palette))
    layouts.push(layout)
    previous=rgb
  }
  const segments = list(6,i => list(64,b => mean(palettes.slice(i*50,i*50+50).map(p => p[b]))))
  const structure = list(6,i => list(16,b => mean(layouts.slice(i*50,i*50+50).map(p => p[b]))))
  const effectiveColors = mean(palettes.map(p => Math.exp(-sum(p.filter(Boolean).map(x => x*Math.log(x))))))
  const measures = {detail:mean(edges), effectiveColors, motion:mean(coherence),
    motionVariety:sd(coherence), paletteChange:mean(segments.slice(1).map((p,i) => tv(p,segments[i]))),
    spatialMotionShare:sum(coherence)/(sum(motion)+1e-9)}
  const m=measures
  // A supported edge survives area averaging. Cap fine detail by the
  // coarse gradient per original pixel so static grain cannot supply it.
  const supportedDetail=Math.min(m.detail,mean(coarseEdges)/4)
  const content = range(supportedDetail,.0008,.008)*(1-range(m.detail,.08,.14))
  const score = 100*content*mean([
    range(supportedDetail,.002,.038),range(Math.log2(m.effectiveColors),0,3),
    range(m.motion,.00003,.003),range(m.motionVariety,.0001,.005),
    range(m.paletteChange,.01,.3)*range(m.spatialMotionShare,.01,.3),
  ])
  return {measures,score,motion,motionFeatures,brightness,palette:segments.flat(),structure:structure.flat()}
}
function correlation(a,b) {
  const x=mean(a), y=mean(b)
  return mean(a.map((v,i) => (v-x)*(b[i]-y)))/(sd(a)*sd(b)+1e-12)
}
function legacySync(a,v) {
  let best=0, lagFrames=0
  const motionEvents=v.map(x => Math.max(0,x-.001))
  for (const lag of [0,1,-1,2,-2,3,-3,4,-4]) {
    const start=Math.max(0,-lag), end=Math.min(ticks,ticks-lag)
    const r=correlation(a.slice(start,end),motionEvents.slice(start+lag,end+lag))
    if (r>best) {best=r; lagFrames=lag}
  }
  const audioActivity=range(sd(a),.15,1.4)
  const pictureActivity=range(sd(motionEvents),.0007,.012)
  return {score:100*range(best,.06,.8)*audioActivity*pictureActivity,
    correlation:best, lagMs:lagFrames*50,audioActivity,pictureActivity}
}
const rounded = obj => Object.fromEntries(Object.entries(obj).map(([k,v]) => [k,Number(v.toFixed(4))]))
export function scoreClips(root,records,titleWords,diagnose,capture) {
  const features = records.map(record => {
    const path=join(root,record.id,'clip.mp4')
    const pcm=decode(path,['-map','0:a:0','-af','aresample=12000:async=1:first_pts=0','-ac','1','-f','f32le'])
    const rgb=decode(path,['-map','0:v:0','-vf','fps=20:start_time=0,scale=64:80:flags=area','-pix_fmt','rgb24','-f','rawvideo'])
    const a=audio(pcm.bytes), v=picture(rgb.bytes)
    const {score,measures:syncMeasures}=syncScore(a,v)
    diagnose?.(record.id,{
      old:legacySync(a.onsets,v.motion),attack:a.onsets,
      oldPictureChange:v.motion.map(x=>Math.max(0,x-.001)),
      rawPictureChange:v.motion,energy:a.energy,motion:v.motionFeatures,brightness:v.brightness,
    })
    Object.assign(record,rounded({complexity:(a.score+v.score)/2,musicComplexity:a.score,pictureComplexity:v.score,sync:score}),{
      music:rounded(a.measures),picture:rounded(v.measures),syncMeasures:JSON.parse(JSON.stringify(syncMeasures,(_,value) =>
        typeof value === 'number' ? Number(value.toFixed(4)) : value)),
      clipStatus:pcm.ok && rgb.ok ? 'ok' : pcm.bytes.length || rgb.bytes.length ? 'partial' : 'unreadable',
    })
    const features = {palette:v.palette,sound:a.profile,structure:v.structure,words:new Set(titleWords(record.title))}
    capture?.(record, features)
    return features
  })
  fieldScores(records,features)
}
