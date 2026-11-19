const mean = a => a.reduce((s,x) => s+x,0)/a.length
const deviation = a => {
  const m = mean(a)
  return Math.sqrt(mean(a.map(x => (x-m)**2)))
}
const scale = (x,low,high) => Math.max(0,Math.min(1,(x-low)/(high-low)))
const lags = [0,1,-1,2,-2,3,-3,4,-4]
const correlation = (a,b) => {
  const x=mean(a), y=mean(b)
  return mean(a.map((v,i) => (v-x)*(b[i]-y)))/(deviation(a)*deviation(b)+1e-12)
}
const average = (series,radius) => series.map((_,i) =>
  mean(series.slice(Math.max(0,i-radius),i+radius+1)))
const detrend = series => {
  const slow = average(series,30)
  return average(series,2).map((x,i) => x-slow[i])
}

// Evaluate the same cue and lag in all three sections. One shared transition
// cannot carry the result, and choosing a different region per section cannot help.
function match(audio, picture, continuous) {
  let best = {score:0,correlation:0,lagMs:0,audioActivity:0,pictureActivity:0,
    audioFeature:null,pictureFeature:null,sectionCorrelations:[0,0,0]}
  for (const [audioFeature,a,rawAudio] of audio) {
    for (const [pictureFeature,v,rawPicture] of picture) {
      const audioActivity=continuous ? scale(deviation(a),.00008,.001) : scale(deviation(a),.15,1.4)
      const pictureActivity=scale(deviation(v),.00006,.0007)
      if (!audioActivity || !pictureActivity) continue
      if (continuous && (!oscillates(rawAudio,.0002) || !oscillates(rawPicture,.00015))) continue
      for (const lag of lags) {
        const sectionCorrelations = [0,1,2].map(section => {
          const start=section*100+4, end=(section+1)*100-4
          return correlation(a.slice(start,end),v.slice(start+lag,end+lag))
        })
        const sorted=[...sectionCorrelations].sort((a,b)=>a-b)
        const r=(sorted[0]+2*sorted[1])/3
        const score=100*scale(r,continuous ? .23 : .12,.9)*audioActivity*pictureActivity
        if (score>best.score) best={score,correlation:r,lagMs:lag*50,audioActivity,pictureActivity,
          audioFeature,pictureFeature,sectionCorrelations}
      }
    }
  }
  return best
}
function oscillates(series, floor) {
  // Count alternating, appreciable legs on 250 ms block means.
  let previous = mean(series.slice(0,5)), direction=0, reversals=0
  for (let i=5;i<series.length;i+=5) {
    const value=mean(series.slice(i,i+5))
    const delta=value-previous
    if (Math.abs(delta)<floor) continue
    const next=Math.sign(delta)
    if (direction && direction!==next) reversals++
    direction=next
    previous=value
  }
  return reversals>=3
}

export function syncScore(audio,picture) {
  const structuredPicture=1-scale(picture.measures.detail,.08,.14)
  const motion = Object.entries(picture.motionFeatures)
  const event=match([['attack',audio.onsets]],motion.map(([name,series])=>['motion:'+name,series]),false)
  const continuous=match(
    Object.entries(audio.energy).map(([name,series])=>[name,detrend(series),series]),
    [...Object.entries(picture.brightness).map(([name,series])=>['brightness:'+name,series]),
      ...motion.map(([name,series])=>['motion:'+name,series])]
      .map(([name,series])=>[name,detrend(series),series]),
    true)
  event.score*=structuredPicture
  continuous.score*=structuredPicture
  const winner=event.score>=continuous.score ? event : continuous
  const {score, correlation, lagMs, audioActivity, pictureActivity}=winner
  return {score,measures:{correlation,lagMs,audioActivity,pictureActivity,event,continuous}}
}
