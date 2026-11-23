/* PETRICHOR — fifteen seconds of rain.
   F major, 3/4, seven bars that fill the duration exactly.
   Voice A states a rising subject; voice B answers as a free counter-line;
   a bass walks I–vi–IV–I–IV–V7–I; bells and a cymbal of noise crown the
   climax; a low bell ends it. The image is the score writing itself: two
   ribbons trace the two voices (pitch is height, time scrolls left), every
   note falls as a drop and strikes the water, and a flower of light opens
   at the climax and dissolves into the final chord. */

export const title = 'Petrichor';

export function start({ audioContext: ac, canvas, duration, random }) {
  const rnd = typeof random === 'function' ? random : Math.random;
  const DUR = Number(duration) || 15;
  const BEAT = DUR / 21;                       // 3/4 · 7 bars · exactly `duration`
  const LEAD = 0.12;
  const t0 = ac.currentTime + 0.2;
  if (ac.state === 'suspended') ac.resume();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const mt = (b, e) => (b * 3 + (e || 0)) * BEAT + LEAD;
  const TAU = 6.2831853;

  /* ── score ── [bar, beat, midi, beats] */
  const VOICE_A = [
    [0,0,65,1],[0,1,69,1],[0,2,72,1], [1,0,74,1],[1,1,72,1],[1,2,69,1],
    [2,0,70,1],[2,1,72,1],[2,2,74,1], [3,0,72,1],[3,1,69,1],[3,2,65,1],
    [4,0,70,1],[4,1,74,1],[4,2,77,1], [5,0,76,1],[5,1,79,1],[5,2,82,1],
    [6,0,81,2],[6,2,77,1]];
  const VOICE_B = [
    [1,0,57,1],[1,1,60,1],[1,2,62,1], [2,0,65,1],[2,1,62,1],[2,2,58,1],
    [3,0,57,1],[3,1,60,1],[3,2,53,1], [4,0,55,1],[4,1,58,1],[4,2,62,1],
    [5,0,57,1],[5,1,55,1],[5,2,53,1], [6,0,57,2],[6,2,53,1]];
  const BASS = [
    [0,0,41,3],[1,0,38,3],[2,0,34,3],[3,0,41,3],
    [4,0,34,1.5],[4,2,41,1.5],[5,0,36,1.5],[5,2,43,1.5],[6,0,41,4.5]];
  const PADS = [   // [bar, voicing, beats, level]
    [0,[53,57,60,64,67],3,.80], [1,[50,53,57,60,64],3,.85],
    [2,[46,50,53,57,60],3,.95], [3,[53,57,60,64,67],3,1.00],
    [4,[46,50,53,57,60],3,1.10], [5,[48,52,55,58,62],3,1.25],
    [6,[41,53,57,60,64,67],6.2,1.30]];
  const BELLS = [  // [bar, beat, midi, level, pan]
    [2,2,86,.45,-.45],[4,2,89,.55,.45],[5,0,88,.60,-.5],[5,1,91,.55,.5],
    [5,2,94,.50,-.3],[6,0,93,.60,.4],[6,.66,89,.45,-.4],[6,1.33,96,.42,.3]];

  /* ── master chain ── */
  const master = ac.createGain();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 22; comp.ratio.value = 3;
  comp.attack.value = .005; comp.release.value = .22;
  const limiter = ac.createWaveShaper();
  { const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 1.7) / Math.tanh(1.7); }
    limiter.curve = c; }
  const analyser = ac.createAnalyser();
  analyser.fftSize = 1024; analyser.smoothingTimeConstant = .7;
  master.connect(comp); comp.connect(limiter); limiter.connect(analyser);
  analyser.connect(ac.destination);
  master.gain.setValueAtTime(.0001, t0);
  master.gain.linearRampToValueAtTime(.9, t0 + .5);
  master.gain.setValueAtTime(.9, t0 + DUR - 1.3);
  master.gain.linearRampToValueAtTime(.0001, t0 + DUR);

  const rev = ac.createConvolver();          // reverb: noise tail + early reflections
  rev.buffer = (() => {
    const rate = ac.sampleRate, len = Math.floor(rate * 3), buf = ac.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      let p = 0;
      for (let i = 0; i < len; i++) { p = p * .34 + d[i] * .66; d[i] = p; }
      [.011,.019,.031,.047,.063].forEach((tp,i) => {
        const k = Math.floor(tp * rate); if (k < len) d[k] += (ch ? -1 : 1) * (.55 - i * .09); });
    }
    return buf;
  })();
  const revLevel = ac.createGain(); revLevel.gain.value = .85;
  rev.connect(revLevel); revLevel.connect(master);

  const dly = ac.createDelay(2); dly.delayTime.value = BEAT * 1.5;   // dotted-quarter echo
  const dlyLP = ac.createBiquadFilter(); dlyLP.type = 'lowpass'; dlyLP.frequency.value = 2300;
  const dlyFB = ac.createGain(); dlyFB.gain.value = .34;
  const dlyOut = ac.createGain(); dlyOut.gain.value = .42;
  dly.connect(dlyLP); dlyLP.connect(dlyFB); dlyFB.connect(dly); dlyLP.connect(dlyOut); dlyOut.connect(master);

  const bus = v => { const g = ac.createGain(); g.gain.value = v; g.connect(master); return g; };
  const pianoBus = bus(.55), echoBus = bus(.42), bellBus = bus(.30), bassBus = bus(.50), percBus = bus(.42);
  const padBus = ac.createGain(); padBus.gain.value = .30;
  const padLP = ac.createBiquadFilter(); padLP.type = 'lowpass'; padLP.frequency.value = 1350; padLP.Q.value = .6;
  const padLFO = ac.createOscillator(); padLFO.frequency.value = .11;
  const padLFOG = ac.createGain(); padLFOG.gain.value = 480;
  padLFO.connect(padLFOG); padLFOG.connect(padLP.frequency);
  padBus.connect(padLP); padLP.connect(master);
  padLFO.start(t0); padLFO.stop(t0 + DUR + 1);

  const sendTo = (n, a) => { const g = ac.createGain(); g.gain.value = a; n.connect(g); g.connect(rev); };
  sendTo(pianoBus,.30); sendTo(echoBus,.55); sendTo(padBus,.60);
  sendTo(bellBus,.75); sendTo(bassBus,.10); sendTo(percBus,.50);
  pianoBus.connect(dly); echoBus.connect(dly);

  const noiseBuf = (() => {
    const n = Math.floor(ac.sampleRate * 2), b = ac.createBuffer(1, n, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
    return b;
  })();
  const pw = (() => {
    const n = 9, re = new Float32Array(n), im = new Float32Array(n);
    const h = [0,.5,.22,.1,.05,.03,.016,.008,.004];
    for (let i = 1; i < n; i++) im[i] = h[i];
    return ac.createPeriodicWave(re, im);
  })();

  /* ── voices ── */
  function piano(t, midi, beats, vel, pan, out) {
    const f = mtof(midi), d = Math.max(.5, beats * BEAT * 1.35);
    const g = ac.createGain(), lp = ac.createBiquadFilter(), pn = ac.createStereoPanner();
    lp.type = 'lowpass'; lp.Q.value = .5; pn.pan.value = pan;
    g.connect(lp); lp.connect(pn); pn.connect(out);
    const peak = .26 * vel;
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + .007);
    g.gain.exponentialRampToValueAtTime(peak * .3, t + .18);
    g.gain.exponentialRampToValueAtTime(.0001, t + d);
    lp.frequency.setValueAtTime(clamp(f * 9 + 800, 500, 12000), t);
    lp.frequency.exponentialRampToValueAtTime(clamp(f * 2.4 + 160, 260, 9000), t + d * .6);
    const o1 = ac.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
    o1.detune.value = (rnd() - .5) * 6;
    const g1 = ac.createGain(); g1.gain.value = .85;
    o1.connect(g1); g1.connect(g); o1.start(t); o1.stop(t + d + .1);
    const o2 = ac.createOscillator(); o2.setPeriodicWave(pw); o2.frequency.value = f;
    o2.detune.value = (rnd() - .5) * 8;
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(.42 * vel, t); g2.gain.exponentialRampToValueAtTime(.0004, t + d * .5);
    o2.connect(g2); g2.connect(g); o2.start(t); o2.stop(t + d + .1);
  }
  function pad(t, midis, secs, level) {
    const pans = [-.7,.62,-.35,.45,-.12,.7];
    const peak = .11 * level / Math.sqrt(midis.length);
    const a = .85, sus = Math.max(a + .05, secs * .55);
    midis.forEach((m, i) => {
      const f = mtof(m);
      const g = ac.createGain(), pn = ac.createStereoPanner();
      pn.pan.value = pans[i % pans.length];
      g.connect(pn); pn.connect(padBus);
      g.gain.setValueAtTime(.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.linearRampToValueAtTime(peak, t + sus);
      g.gain.exponentialRampToValueAtTime(.0001, t + secs + .9);
      for (const det of [-7, 7]) {
        const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        const og = ac.createGain(); og.gain.value = .3;
        o.connect(og); og.connect(g); o.start(t); o.stop(t + secs + 1.1);
      }
      const sub = ac.createOscillator(); sub.type = 'sine'; sub.frequency.value = f * .5;
      const sg = ac.createGain(); sg.gain.value = .4;
      sub.connect(sg); sg.connect(g); sub.start(t); sub.stop(t + secs + 1.1);
    });
  }
  function bell(t, midi, vel, pan) {
    const f = mtof(midi);
    const g = ac.createGain(), pn = ac.createStereoPanner(); pn.pan.value = pan;
    g.connect(pn); pn.connect(bellBus);
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(.24 * vel, t + .005);
    g.gain.exponentialRampToValueAtTime(.0001, t + 2.2);
    const car = ac.createOscillator(); car.type = 'sine'; car.frequency.value = f;
    const mod = ac.createOscillator(); mod.type = 'sine'; mod.frequency.value = f * 3.51;
    const mg = ac.createGain();
    mg.gain.setValueAtTime(f * 2.2 * vel, t); mg.gain.exponentialRampToValueAtTime(f * .05, t + .35);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g);
    car.start(t); car.stop(t + 2.3); mod.start(t); mod.stop(t + 2.3);
  }
  function bass(t, midi, secs, vel) {
    const f = mtof(midi);
    const g = ac.createGain(), lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    g.connect(lp); lp.connect(bassBus);
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(.5 * vel, t + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t + secs);
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    o.connect(g); o.start(t); o.stop(t + secs + .05);
    const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(.25 * vel, t); g2.gain.exponentialRampToValueAtTime(.0005, t + secs * .5);
    o2.connect(g2); g2.connect(g); o2.start(t); o2.stop(t + secs + .05);
  }
  const noiseSrc = (t, dur) => {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    s.start(t, rnd() * 1.5); s.stop(t + dur); return s;
  };
  function kick(t, vel) {
    const g = ac.createGain(); g.connect(percBus);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.5 * vel, t + .006);
    g.gain.exponentialRampToValueAtTime(.0001, t + .34);
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(46, t + .11);
    o.connect(g); o.start(t); o.stop(t + .36);
  }
  function shaker(t, vel, pan) {
    const s = noiseSrc(t, .09);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6400; bp.Q.value = 1.1;
    const g = ac.createGain(), pn = ac.createStereoPanner(); pn.pan.value = pan;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.16 * vel, t + .004);
    g.gain.exponentialRampToValueAtTime(.0001, t + .075);
    s.connect(bp); bp.connect(g); g.connect(pn); pn.connect(percBus);
  }
  function splash(t, vel, dark) {
    const s = noiseSrc(t, 1.4);
    const f = ac.createBiquadFilter(); f.type = dark ? 'lowpass' : 'highpass'; f.frequency.value = dark ? 1400 : 3800;
    const g = ac.createGain(), pn = ac.createStereoPanner(); pn.pan.value = dark ? -.2 : .15;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.22 * vel, t + .006);
    g.gain.exponentialRampToValueAtTime(.0001, t + (dark ? .9 : 1.3));
    s.connect(f); f.connect(g); g.connect(pn); pn.connect(percBus);
    const rs = ac.createGain(); rs.gain.value = .8; g.connect(rs); rs.connect(rev);
  }
  function riser(t, dur) {
    const s = noiseSrc(t, dur + .1);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(280, t); bp.frequency.exponentialRampToValueAtTime(6800, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.075, t + dur * .92);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(percBus);
    const rs = ac.createGain(); rs.gain.value = .5; g.connect(rs); rs.connect(rev);
  }
  function plip(t, v) {
    const g = ac.createGain(), pn = ac.createStereoPanner(); pn.pan.value = (rnd() - .5) * .8;
    g.connect(pn); pn.connect(pianoBus);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.26 * v, t + .004);
    g.gain.exponentialRampToValueAtTime(.0001, t + .3);
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1400 + rnd() * 500, t);
    o.frequency.exponentialRampToValueAtTime(380, t + .1);
    o.connect(g); o.start(t); o.stop(t + .32);
  }

  const rain = ac.createBufferSource(); rain.buffer = noiseBuf; rain.loop = true;
  const rainBP = ac.createBiquadFilter(); rainBP.type = 'bandpass'; rainBP.frequency.value = 5200; rainBP.Q.value = .45;
  const rainG = ac.createGain(); rainG.gain.value = .016;
  const rainLFO = ac.createOscillator(); rainLFO.frequency.value = .6;
  const rainLFOG = ac.createGain(); rainLFOG.gain.value = .008;
  rainLFO.connect(rainLFOG); rainLFOG.connect(rainG.gain);
  rain.connect(rainBP); rainBP.connect(rainG); rainG.connect(master);
  rain.start(t0); rain.stop(t0 + DUR + 1);
  rainLFO.start(t0); rainLFO.stop(t0 + DUR + 1);

  /* ── schedule ── */
  const EV = [];
  for (const [b, e, m, d] of VOICE_A) {
    const T = mt(b, e);
    piano(t0 + T, m, d, .94 + rnd() * .08, -.07, pianoBus);
    EV.push({ t: T, k: 'A', m, v: 1 });
  }
  for (const [b, e, m, d] of VOICE_B) {
    const T = mt(b, e);
    piano(t0 + T, m, d, .52 + rnd() * .07, .42, echoBus);
    EV.push({ t: T, k: 'B', m, v: .62 });
  }
  for (const [b, e, m, d] of BASS) {
    const T = mt(b, e);
    bass(t0 + T, m, Math.min(d, 3) * BEAT, .95);
    EV.push({ t: T, k: 'bass', m, v: .8 });
  }
  for (const [b, midis, beats, lvl] of PADS) pad(t0 + mt(b), midis, beats * BEAT, lvl);
  for (const [b, e, m, lvl, pan] of BELLS) {
    const T = mt(b, e);
    bell(t0 + T, m, lvl, pan);
    EV.push({ t: T, k: 'bell', m, v: lvl });
  }
  for (const [b, e, v] of [[2,1,.4],[2,2,.45],[3,1,.45],[3,2,.5],[4,0,.5],[4,1,.55],[4,2,.6],[5,0,.6],[5,1,.55],[5,2,.5]])
    shaker(t0 + mt(b, e), v, .25 + rnd() * .3);
  for (const [b, v] of [[2,.7],[3,.75],[4,.8],[5,.9]]) kick(t0 + mt(b), v);
  splash(t0 + mt(5), 1, false);
  splash(t0 + mt(6), .5, true);
  riser(t0 + mt(4), 3 * BEAT);
  for (const [b, e, v] of [[0,0,.9],[2,0,.5],[4,2,.55]]) {
    const T = mt(b, e); plip(t0 + T, v); EV.push({ t: T, k: 'plip', m: 65, v });
  }
  EV.push({ t: mt(5), k: 'hit' });
  EV.push({ t: mt(6), k: 'end' });
  EV.sort((a, b) => a.t - b.t);

  /* ── image ── */
  const cv = canvas;
  if (!cv.width) { cv.width = 1080; cv.height = 1350; }
  const W = cv.width, H = cv.height;
  const ctx = cv.getContext('2d');
  const doc = cv.ownerDocument || document;
  const layer = doc.createElement('canvas'); layer.width = W; layer.height = H;
  const lx = layer.getContext('2d');
  const bgc = doc.createElement('canvas'); bgc.width = W; bgc.height = H;
  const bx = bgc.getContext('2d');

  const WATER = H * .70, HEADX = W * .80;
  const Y_TOP = H * .20, Y_BOT = H * .66, M_LO = 52, M_HI = 90;
  const pitchY = m => Y_TOP + (Y_BOT - Y_TOP) * (M_HI - m) / (M_HI - M_LO);
  const SCROLL = W * .68 / 4.4;
  const A_COL = [255,206,150], A_GLOW = [255,176,96];
  const B_COL = [150,240,225], B_GLOW = [86,214,202];

  (function paintBG() {
    const g = bx.createLinearGradient(0, 0, W * .3, H);
    g.addColorStop(0, '#070a16'); g.addColorStop(.42, '#0a1526');
    g.addColorStop(.72, '#0c2b2e'); g.addColorStop(1, '#060d14');
    bx.fillStyle = g; bx.fillRect(0, 0, W, H);
    const hz = bx.createRadialGradient(W * .5, WATER, 0, W * .5, WATER, W * .9);
    hz.addColorStop(0, 'rgba(255,190,120,.18)');
    hz.addColorStop(.45, 'rgba(120,200,190,.06)');
    hz.addColorStop(1, 'rgba(0,0,0,0)');
    bx.fillStyle = hz; bx.fillRect(0, 0, W, H);
    const wg = bx.createLinearGradient(0, WATER, 0, H);
    wg.addColorStop(0, 'rgba(10,42,50,.5)'); wg.addColorStop(1, 'rgba(4,10,18,.92)');
    bx.fillStyle = wg; bx.fillRect(0, WATER, W, H - WATER);
    bx.strokeStyle = 'rgba(150,220,215,.05)'; bx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) { const y = 330 + i * 132; bx.beginPath(); bx.moveTo(0, y); bx.lineTo(W, y); bx.stroke(); }
    bx.strokeStyle = 'rgba(180,235,225,.18)'; bx.lineWidth = 2;
    bx.beginPath(); bx.moveTo(0, WATER); bx.lineTo(W, WATER); bx.stroke();
  })();

  const vign = ctx.createRadialGradient(W * .5, H * .5, H * .3, W * .5, H * .5, H * .8);
  vign.addColorStop(0, 'rgba(0,0,0,0)'); vign.addColorStop(1, 'rgba(0,0,0,.55)');

  const glowCache = new Map();
  function glowSprite(rgb) {
    const key = rgb.join(',');
    if (glowCache.has(key)) return glowCache.get(key);
    const s = doc.createElement('canvas'); s.width = s.height = 128;
    const c = s.getContext('2d');
    const rg = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`);
    rg.addColorStop(.18, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.5)`);
    rg.addColorStop(.5, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.13)`);
    rg.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    c.fillStyle = rg; c.fillRect(0, 0, 128, 128);
    glowCache.set(key, s); return s;
  }
  const glowTo = (g, rgb, x, y, r, a) => {
    g.globalAlpha = a; g.drawImage(glowSprite(rgb), x - r, y - r, r * 2, r * 2); g.globalAlpha = 1;
  };

  const rib = {
    A: { pts: [], y: pitchY(65), ty: pitchY(65), vel: 1, col: A_COL, w: 3.2 },
    B: { pts: [], y: pitchY(57), ty: pitchY(57), vel: .6, col: B_COL, w: 2.4 },
  };
  const drops = [], ripples = [], sparks = [], stamps = [], motes = [];
  for (let i = 0; i < 44; i++) motes.push({ x: rnd() * W, y: rnd() * WATER, r: .8 + rnd() * 2.2, s: 5 + rnd() * 16, p: rnd() * TAU });
  let bloom = null, flash = 0;

  function fire(e) {
    if (e.k === 'A' || e.k === 'B') {
      const r = rib[e.k];
      r.ty = pitchY(e.m); r.vel = e.v;
      stamps.push({ x: HEADX, y: r.ty, rgb: e.k === 'A' ? A_COL : B_COL, v: e.v, age: 0 });
      drops.push({ x: HEADX + (rnd() - .5) * 6, y: r.ty, vx: (rnd() - .5) * 26,
        vy: -20 - rnd() * 30, r: (e.k === 'A' ? 5 : 3.6) * (.7 + e.v * .5),
        rgb: e.k === 'A' ? A_GLOW : B_GLOW });
    } else if (e.k === 'bass') {
      drops.push({ x: HEADX, y: pitchY(e.m), vx: (rnd() - .5) * 12, vy: -8, r: 8, rgb: [255,214,170] });
      ripples.push({ x: HEADX, t: 0, max: 30, rgb: [255,220,180] });
    } else if (e.k === 'bell') {
      stamps.push({ x: HEADX, y: pitchY(e.m), rgb: [255,240,214], v: e.v * .7, age: 0 });
      for (let i = 0; i < 3; i++)
        sparks.push({ x: HEADX, y: pitchY(e.m), vx: (rnd() - .5) * 60, vy: -30 - rnd() * 60, life: 0, max: .8 + rnd() * .7, rgb: [255,238,205] });
    } else if (e.k === 'plip') {
      drops.push({ x: HEADX, y: pitchY(e.m), vx: (rnd() - .5) * 20, vy: -30, r: 4 + 3 * e.v, rgb: A_GLOW });
    } else if (e.k === 'hit') {
      bloom = makeBloom(W * .5, H * .46, H * .30, 132); flash = 1;
    } else if (e.k === 'end') {
      ripples.push({ x: W * .5, t: 0, max: W * .5, rgb: [255,226,190] }); flash = .55;
    }
  }
  function makeBloom(cx, cy, maxR, count) {
    const petals = [];
    for (let i = 0; i < count; i++) {
      const ring = i % 3;
      petals.push({ ang: i / count * TAU + (rnd() - .5) * .07,
        len: maxR * (.42 + .58 * rnd()) * (ring === 0 ? 1 : ring === 1 ? .72 : .5),
        w: ring === 0 ? 2.2 : 1.4, grow: .9 + rnd() * .9, delay: rnd() * .5, spin: (rnd() - .5) * .5 });
    }
    return { cx, cy, petals, t: 0 };
  }
  function drawRibbon(g, r) {
    const p = r.pts, n = p.length;
    if (n < 3) return;
    const c = r.col;
    const grad = g.createLinearGradient(W * .09, 0, HEADX, 0);
    grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    grad.addColorStop(.55, `rgba(${c[0]},${c[1]},${c[2]},.15)`);
    grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},.85)`);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < n - 1; i++) {
      const q = p[i], s = p[i + 1];
      g.quadraticCurveTo(q.x, q.y, (q.x + s.x) / 2, (q.y + s.y) / 2);
    }
    g.lineTo(p[n - 1].x, p[n - 1].y);
    g.strokeStyle = grad;
    g.lineWidth = 16; g.globalAlpha = .10; g.stroke();
    g.lineWidth = 6.5; g.globalAlpha = .16; g.stroke();
    g.lineWidth = r.w; g.globalAlpha = .95; g.stroke();
    g.globalAlpha = 1;
  }
  function drawStamp(g, s) {
    const a = clamp(s.age / .12, 0, 1) * clamp((s.x - W * .07) / 110, 0, 1);
    if (a <= 0) return;
    const c = s.rgb;
    glowTo(g, c, s.x, s.y, 18 + 16 * s.v, .32 * a);
    g.fillStyle = `rgba(255,250,238,${.75 * a})`;
    g.beginPath(); g.arc(s.x, s.y, 3.2 + 1.8 * s.v, 0, TAU); g.fill();
    g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${.38 * a})`;
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(s.x, s.y + 4); g.lineTo(s.x, s.y + 28 + 20 * s.v); g.stroke();
  }
  function drawDrop(g, d) {
    const stretch = 1 + clamp(d.vy / 900, 0, 1) * 1.1;
    glowTo(g, d.rgb, d.x, d.y, d.r * 3.2, .45);
    g.save(); g.translate(d.x, d.y); g.scale(1 / stretch, stretch);
    g.fillStyle = 'rgba(255,252,244,.9)';
    g.beginPath(); g.arc(0, 0, d.r * .55, 0, TAU); g.fill();
    g.restore();
  }
  function drawRipple(g, r) {
    const t = clamp(r.t / 1.25, 0, 1);
    const rx = r.max * (1 - Math.pow(1 - t, 2.2));
    const a = (1 - t) * .5, c = r.rgb;
    g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    g.lineWidth = 1.6 + 2.4 * (1 - t);
    g.beginPath(); g.ellipse(r.x, r.y, rx, rx * .26, 0, 0, TAU); g.stroke();
    g.strokeStyle = `rgba(255,255,255,${a * .32})`;
    g.lineWidth = 1;
    g.beginPath(); g.ellipse(r.x, r.y, rx * .55, rx * .15, 0, 0, TAU); g.stroke();
  }
  function drawSpark(g, s) {
    const a = 1 - s.life / s.max;
    glowTo(g, s.rgb, s.x, s.y, 7 + 5 * (1 - a), .5 * a);
  }
  function drawBloom(g, b) {
    const c = [255,226,190];
    for (const p of b.petals) {
      const l = clamp((b.t - p.delay) / p.grow, 0, 1);
      if (l <= 0) continue;
      const e = t => 1 - Math.pow(1 - t, 2.4);
      const r1 = p.len * e(l), r0 = p.len * e(clamp(l - .09, 0, 1));
      const a1 = p.ang + b.t * p.spin, a0 = p.ang + (b.t - .016) * p.spin;
      g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${.5 * (1 - l * .55)})`;
      g.lineWidth = p.w;
      g.beginPath();
      g.moveTo(b.cx + Math.cos(a0) * r0, b.cy + Math.sin(a0) * r0);
      g.lineTo(b.cx + Math.cos(a1) * r1, b.cy + Math.sin(a1) * r1);
      g.stroke();
    }
  }

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  let ei = 0, last = performance.now(), energy = 0, raf = 0;

  function frame(nowMs) {
    const dt = clamp((nowMs - last) / 1000, .0005, .05);
    last = nowMs;
    const T = ac.currentTime - t0;
    while (ei < EV.length && EV[ei].t <= T) fire(EV[ei++]);

    const dx = SCROLL * dt;
    for (const k of ['A', 'B']) {
      const r = rib[k];
      r.y += (r.ty - r.y) * (1 - Math.exp(-dt * 9));
      r.pts.push({ x: HEADX, y: r.y });
      for (const q of r.pts) q.x -= dx;
      while (r.pts.length && r.pts[0].x < W * .09) r.pts.shift();
      if (r.pts.length > 460) r.pts.splice(0, r.pts.length - 460);
    }
    for (const s of stamps) { s.x -= dx; s.age += dt; }
    for (let i = stamps.length - 1; i >= 0; i--) if (stamps[i].x < W * .07) stamps.splice(i, 1);
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.vy += 760 * dt; d.y += d.vy * dt; d.x += (d.vx - dx) * dt;
      if (d.y >= WATER) {
        ripples.push({ x: d.x, t: 0, max: 34 + d.r * 6, rgb: d.rgb });
        for (let s = 0; s < 3; s++)
          sparks.push({ x: d.x, y: WATER, vx: (rnd() - .5) * 90, vy: -40 - rnd() * 70, life: 0, max: .45 + rnd() * .4, rgb: d.rgb });
        drops.splice(i, 1);
      }
    }
    for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 1.3) ripples.splice(i, 1); }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.vy += 520 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life += dt;
      if (s.life > s.max) sparks.splice(i, 1);
    }
    for (const m of motes) {
      m.x += m.s * dt; m.y -= m.s * .3 * dt; m.p += dt;
      if (m.x > W + 10) { m.x = -10; m.y = rnd() * WATER; }
    }
    if (bloom) bloom.t += dt;
    flash *= Math.pow(.02, dt);

    analyser.getByteFrequencyData(freqData);
    let e = 0;
    for (let i = 0; i < freqData.length; i++) e += freqData[i];
    energy += (e / (freqData.length * 255) - energy) * .25;

    lx.globalCompositeOperation = 'destination-out';
    lx.fillStyle = `rgba(0,0,0,${1 - Math.pow(.96, dt * 60)})`;
    lx.fillRect(0, 0, W, H);
    lx.globalCompositeOperation = 'lighter';
    drawRibbon(lx, rib.A); drawRibbon(lx, rib.B);
    for (const s of stamps) drawStamp(lx, s);
    for (const d of drops) drawDrop(lx, d);
    for (const r of ripples) drawRipple(lx, r);
    for (const s of sparks) drawSpark(lx, s);
    if (bloom) drawBloom(lx, bloom);
    lx.globalCompositeOperation = 'source-over';

    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bgc, 0, 0);
    ctx.drawImage(layer, 0, 0);

    ctx.globalCompositeOperation = 'lighter';
    glowTo(ctx, [255,200,150], W * .5, WATER, W * (.34 + .3 * energy), .08 + .2 * energy);
    for (const m of motes) {
      ctx.fillStyle = `rgba(200,235,230,${.09 + .09 * Math.sin(m.p * 2)})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
    }
    const pa = ctx.createLinearGradient(HEADX - 60, 0, HEADX + 4, 0);
    pa.addColorStop(0, 'rgba(255,235,205,0)'); pa.addColorStop(1, 'rgba(255,235,205,.13)');
    ctx.fillStyle = pa; ctx.fillRect(HEADX - 60, 0, 64, WATER);
    for (const k of ['A', 'B']) {
      const r = rib[k], a = .5 + .5 * r.vel;
      glowTo(ctx, k === 'A' ? A_GLOW : B_GLOW, HEADX, r.y, 30 + 26 * r.vel, .5 * a);
      ctx.fillStyle = `rgba(255,250,240,${.85 * a})`;
      ctx.beginPath(); ctx.arc(HEADX, r.y, 4.5 + 2 * r.vel, 0, TAU); ctx.fill();
    }
    if (flash > .004) {
      ctx.fillStyle = `rgba(255,244,225,${flash * .1})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,.035)';
    for (let i = 0; i < 90; i++) ctx.fillRect(rnd() * W, rnd() * H, 1.4, 1.4);
    ctx.fillStyle = vign; ctx.fillRect(0, 0, W, H);

    if (T < DUR + .6) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}
