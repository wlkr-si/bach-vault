export const title = "Gossamer";

export function start({ audioContext, canvas, duration, random }) {
  const sr = audioContext.sampleRate;
  const ctx = canvas.getContext("2d", { alpha: false });
  const W = canvas.width;
  const H = canvas.height;
  const t0 = audioContext.currentTime + 0.03;
  const S = duration / 15;
  const beatDur = 0.6 * S;
  const TAU = Math.PI * 2;
  const now0 = () => audioContext.currentTime;

  const rnd = () => random();
  const irand = (a, b) => a + rnd() * (b - a);
  const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const easeIn = (t) => t * t;
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  const master = audioContext.createGain();
  master.gain.value = 0.85;
  const comp = audioContext.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 18;
  comp.ratio.value = 3.6;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.72;
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const waveData = new Uint8Array(analyser.fftSize);

  master.connect(comp);
  comp.connect(analyser);
  analyser.connect(audioContext.destination);

  const bus = audioContext.createGain();
  bus.gain.value = 1;
  bus.connect(master);

  const revSend = audioContext.createGain();
  revSend.gain.value = 0.28;
  const preDelay = audioContext.createDelay(0.2);
  preDelay.delayTime.value = 0.038;
  const conv = audioContext.createConvolver();
  const irLen = Math.floor(sr * 1.85);
  const ir = audioContext.createBuffer(2, irLen, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < irLen; i++) {
      const env = (1 - i / irLen) ** 2.35;
      d[i] = (rnd() * 2 - 1) * env * (i % 2 === c ? 1 : 0.7);
    }
  }
  conv.buffer = ir;
  revSend.connect(preDelay);
  preDelay.connect(conv);
  conv.connect(master);

  const padGain = audioContext.createGain();
  padGain.gain.value = 0.0;
  padGain.connect(bus);
  padGain.connect(revSend);

  function noiseBuffer(sec) {
    const n = Math.floor(sr * sec);
    const buf = audioContext.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
    return buf;
  }
  const n1 = noiseBuffer(1.2);
  const n2 = noiseBuffer(2.4);

  function makePluck(freq) {
    const dur = Math.min(4.2, 0.55 + 220 / freq);
    const len = Math.floor(sr * dur);
    const buf = audioContext.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const p = Math.max(2, Math.round(sr / freq));
    for (let i = 0; i < p; i++) {
      const w = Math.sin((Math.PI * i) / p);
      d[i] = (rnd() * 2 - 1) * w;
    }
    const damp = Math.pow(0.989, 42 / Math.sqrt(freq));
    let prev = d[p - 1];
    for (let i = p; i < len; i++) {
      const cur = d[i - p];
      const y = 0.5 * (prev + cur) * damp;
      d[i] = y;
      prev = cur;
    }
    let max = 1e-6;
    for (let i = 0; i < len; i++) max = Math.max(max, Math.abs(d[i]));
    const inv = 0.95 / max;
    for (let i = 0; i < len; i++) d[i] *= inv;
    return buf;
  }
  const pluckMap = new Map();
  function pluckBuf(freq) {
    const k = freq.toFixed(2);
    if (!pluckMap.has(k)) pluckMap.set(k, makePluck(freq));
    return pluckMap.get(k);
  }

  function duckPad(t, amt = 0.55) {
    const g = padGain.gain;
    g.setValueAtTime(g.value, t);
    try {
      const cur = 0.09;
      g.setValueAtTime(cur, t);
      g.linearRampToValueAtTime(cur * amt, t + 0.03);
      g.linearRampToValueAtTime(cur, t + 0.28);
    } catch (e) { /* automation collision is fine */ }
  }

  const hits = [];

  function playBuf(buf, t, amp, pan, wet = 0.4, rate = 1) {
    const src = audioContext.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = audioContext.createGain();
    g.gain.setValueAtTime(Math.max(0.0001, amp), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + buf.duration / rate);
    const p = audioContext.createStereoPanner();
    p.pan.setValueAtTime(pan, t);
    src.connect(g);
    g.connect(p);
    p.connect(bus);
    if (wet > 0) {
      const w = audioContext.createGain();
      w.gain.value = wet;
      p.connect(w);
      w.connect(revSend);
    }
    src.start(t);
    src.stop(t + buf.duration / rate + 0.01);
  }

  function playSine(freq, t, dur, amp, type = "sine", pan = 0, attack = 0.02) {
    const o = audioContext.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = audioContext.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = audioContext.createStereoPanner();
    p.pan.value = pan;
    const lp = audioContext.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(sr / 2, freq * 8 + 1200);
    o.connect(lp);
    lp.connect(g);
    g.connect(p);
    p.connect(bus);
    p.connect(revSend);
    o.start(t);
    o.stop(t + dur + 0.02);
    return o;
  }

  function playGlass(freq, t, dur, amp, pan = 0) {
    const car = audioContext.createOscillator();
    const mod = audioContext.createOscillator();
    const mg = audioContext.createGain();
    const g = audioContext.createGain();
    const lp = audioContext.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(freq * 5.5, t);
    lp.frequency.exponentialRampToValueAtTime(freq * 2.2, t + dur);
    car.type = "sine";
    mod.type = "sine";
    car.frequency.value = freq;
    mod.frequency.value = freq * 2.003;
    mg.gain.setValueAtTime(freq * 1.35, t);
    mg.gain.exponentialRampToValueAtTime(freq * 0.2, t + dur * 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = audioContext.createStereoPanner();
    p.pan.value = pan;
    mod.connect(mg);
    mg.connect(car.frequency);
    car.connect(lp);
    lp.connect(g);
    g.connect(p);
    p.connect(bus);
    const w = audioContext.createGain();
    w.gain.value = 0.5;
    p.connect(w);
    w.connect(revSend);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.03);
    mod.stop(t + dur + 0.03);
  }

  function playWhoosh(t, dur) {
    const src = audioContext.createBufferSource();
    src.buffer = n1;
    const bp = audioContext.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 3.6;
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.exponentialRampToValueAtTime(2800, t + dur * 0.42);
    bp.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g = audioContext.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.07);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = audioContext.createStereoPanner();
    p.pan.setValueAtTime(-0.85, t);
    p.pan.linearRampToValueAtTime(0.25, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(p);
    p.connect(bus);
    p.connect(revSend);
    src.start(t);
    src.stop(t + dur);
  }

  function playDrip(t, freq, amp, pan) {
    const src = audioContext.createBufferSource();
    src.buffer = n1;
    src.playbackRate.value = 3.2;
    const bp = audioContext.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 9;
    bp.frequency.setValueAtTime(freq * 4, t);
    bp.frequency.exponentialRampToValueAtTime(freq * 1.6, t + 0.09);
    const g = audioContext.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    const p = audioContext.createStereoPanner();
    p.pan.value = pan;
    src.connect(bp);
    bp.connect(g);
    g.connect(p);
    p.connect(bus);
    src.start(t);
    src.stop(t + 0.16);
    playSine(freq * 2.02, t, 0.35, amp * 0.35, "sine", pan, 0.005);
  }

  function playPizz(t, freq, amp, pan) {
    playBuf(pluckBuf(freq), t, amp, pan, 0.42);
    playSine(freq, t, 0.9, amp * 0.28, "sine", pan, 0.01);
    const o = audioContext.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq * 2, t);
    const g = audioContext.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp * 0.12, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 0.5);
  }

  function playFall(t, dur) {
    const o = audioContext.createOscillator();
    const o2 = audioContext.createOscillator();
    o.type = "sine";
    o2.type = "sine";
    o.frequency.setValueAtTime(988, t);
    o.frequency.exponentialRampToValueAtTime(110, t + dur);
    o2.frequency.setValueAtTime(1976, t);
    o2.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = audioContext.createGain();
    const g2 = audioContext.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.05, t + dur - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.045, t + 0.1);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = audioContext.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    o.connect(g);
    o2.connect(g2);
    g.connect(lp);
    g2.connect(lp);
    lp.connect(bus);
    lp.connect(revSend);
    const src = audioContext.createBufferSource();
    src.buffer = n2;
    const bp = audioContext.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(280, t + dur);
    const ng = audioContext.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.06, t + 0.2);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(bus);
    o.start(t);
    o2.start(t);
    src.start(t);
    o.stop(t + dur + 0.3);
    o2.stop(t + dur + 0.3);
    src.stop(t + dur + 0.02);
  }

  function playSplash(t) {
    const src = audioContext.createBufferSource();
    src.buffer = n1;
    const lp = audioContext.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(280, t + 0.4);
    const g = audioContext.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    src.connect(lp);
    lp.connect(g);
    g.connect(bus);
    g.connect(revSend);
    src.start(t);
    src.stop(t + 0.6);
    const chord = [110, 165, 220, 261.63, 329.63, 440, 659.25, 880];
    chord.forEach((f, i) => {
      playGlass(f, t + i * 0.012, 2.6 - i * 0.12, 0.07 / Math.sqrt(i + 1), (i % 2 ? -1 : 1) * 0.15);
      playSine(f, t, 2.4, 0.045 / Math.sqrt(i + 1), "sine", 0, 0.01);
    });
  }

  function playWind() {
    const src = audioContext.createBufferSource();
    src.buffer = n2;
    src.loop = true;
    const bp = audioContext.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(700, t0);
    bp.frequency.linearRampToValueAtTime(1400, t0 + 8 * S);
    bp.frequency.linearRampToValueAtTime(900, t0 + 15 * S);
    const g = audioContext.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.042, t0 + 1.4 * S);
    g.gain.linearRampToValueAtTime(0.07, t0 + 9.5 * S);
    g.gain.exponentialRampToValueAtTime(0.02, t0 + 15 * S);
    const lfo = audioContext.createOscillator();
    const lg = audioContext.createGain();
    lfo.frequency.value = 0.17;
    lg.gain.value = 0.018;
    lfo.connect(lg);
    lg.connect(g.gain);
    src.connect(bp);
    bp.connect(g);
    g.connect(bus);
    src.start(t0);
    lfo.start(t0);
    src.stop(t0 + duration + 0.2);
    lfo.stop(t0 + duration + 0.2);
  }

  function startPad() {
    const freqs = [110, 164.81, 220, 329.63];
    freqs.forEach((f, i) => {
      const o = audioContext.createOscillator();
      o.type = i < 2 ? "sine" : "triangle";
      o.frequency.value = f * (1 + (i - 1.5) * 0.0015);
      const lp = audioContext.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(280, t0);
      lp.frequency.linearRampToValueAtTime(1400, t0 + 11 * S);
      lp.frequency.linearRampToValueAtTime(640, t0 + 15 * S);
      o.connect(lp);
      lp.connect(padGain);
      o.start(t0);
      o.stop(t0 + duration + 0.1);
    });
    padGain.gain.setValueAtTime(0.0001, t0);
    padGain.gain.exponentialRampToValueAtTime(0.09, t0 + 2.2 * S);
    padGain.gain.linearRampToValueAtTime(0.11, t0 + 10 * S);
    padGain.gain.exponentialRampToValueAtTime(0.03, t0 + 15 * S);
  }

  function hit(beat, midi, amp, kind, pan) {
    const t = t0 + beat * beatDur;
    hits.push({ t, midi, amp, kind, pan, beat });
    const freq = midiHz(midi);
    const p = pan ?? clamp((midi - 60) * 0.04, -0.7, 0.7);
    if (kind === "pluck" || kind === "canon") {
      playPizz(t, freq, amp, p);
      if (midi <= 64) playBuf(pluckBuf(freq * 2), t, amp * 0.35, p, 0.5);
      playGlass(freq * 2, t, 1.1 + amp, amp * 0.16, p);
      duckPad(t, 0.62);
    } else if (kind === "glass") {
      playGlass(freq, t, 1.8, amp, p);
    } else if (kind === "drip") {
      playDrip(t, freq, amp, p);
    } else if (kind === "bass") {
      playPizz(t, freq, amp * 0.7, 0);
      playSine(freq / 2, t, 1.6, amp * 0.55, "sine", 0, 0.02);
      playSine(freq, t, 1.1, amp * 0.22, "triangle", 0, 0.02);
      duckPad(t, 0.5);
    }
  }

  playWhoosh(t0, 0.62 * S);
  playWind();
  startPad();
  playGlass(midiHz(81), t0 + 0.04 * S, 2.2, 0.07, 0.2);
  playSine(55, t0, 4.5 * S, 0.07, "sine", 0, 0.08);

  const SUBJECT = [
    [0, 57, 1.0],
    [1, 64, 0.74],
    [2, 60, 0.8],
    [3, 55, 0.96],
    [4, 62, 0.7],
  ];
  const voices = [
    { start: 0, off: 0, amp: 0.24, kind: "canon" },
    { start: 5, off: 7, amp: 0.2, kind: "canon" },
    { start: 10, off: 12, amp: 0.17, kind: "canon" },
  ];
  for (const v of voices) {
    for (const [b, m, a] of SUBJECT) {
      hit(v.start + b, m + v.off, v.amp * a, v.kind);
    }
  }

  const bassLine = [
    [0, 45, 0.32],
    [3, 52, 0.18],
    [5, 45, 0.3],
    [8, 52, 0.16],
    [10, 41, 0.3],
    [13, 48, 0.17],
    [15, 43, 0.28],
    [18, 50, 0.16],
    [20, 45, 0.34],
  ];
  for (const [b, m, a] of bassLine) hit(b, m, a, "bass");

  const glassLine = [
    [6.5, 76, 0.07],
    [9, 79, 0.06],
    [11, 71, 0.08],
    [12.5, 69, 0.07],
    [14, 64, 0.08],
    [16, 62, 0.07],
    [17.5, 60, 0.06],
  ];
  for (const [b, m, a] of glassLine) hit(b, m, a, "glass");

  const drips = [2.6, 4.1, 7.2, 7.8, 8.4, 11.3, 12.1, 16.4, 17.1, 19.2];
  drips.forEach((b, i) => hit(b, 72 + (i % 5) * 2, 0.09, "drip", irand(-0.6, 0.6)));

  const stretto = [
    [15, 57, 0.18],
    [16, 64, 0.14],
    [17, 69, 0.16],
    [17.5, 60, 0.12],
    [18, 76, 0.14],
    [19, 55, 0.15],
    [19.5, 62, 0.12],
  ];
  for (const [b, m, a] of stretto) hit(b, m, a, "canon");

  const series = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16];
  series.forEach((h, i) => {
    const t = t0 + (8.2 + i * 0.18) * S;
    playSine(55 * h, t, (6.2 - i * 0.12) * S, 0.028 / Math.sqrt(h), "sine", (i % 2 ? -0.3 : 0.3), 0.4);
  });

  playFall(t0 + 21 * beatDur, 2.4 * S);
  hits.push({ t: t0 + 21 * beatDur, midi: 81, amp: 0.4, kind: "fall", pan: 0, beat: 21 });
  playSplash(t0 + 23.5 * beatDur);
  hits.push({ t: t0 + 23.5 * beatDur, midi: 57, amp: 0.8, kind: "splash", pan: 0, beat: 23.5 });
  playGlass(midiHz(93), t0 + 24.15 * beatDur, 1.6 * S, 0.045, 0.1);

  const N_RAD = 16;
  const N_RING = 9;
  const maxR = 560;
  const nodes = [];
  const hub = { r: 0, k: 0, rr: 0, th: 0, j: 0, x: 0, y: 0, z: 0, e: 0, et: -99, ef: 8 };
  nodes.push(hub);
  function ringNorm(i) {
    if (i <= 0) return 0;
    if (i === 1) return 0.05;
    if (i === 2) return 0.1;
    return 0.2 + ((i - 3) / (N_RING - 3)) * 0.8;
  }
  for (let k = 0; k < N_RAD; k++) {
    const th0 = (k / N_RAD) * TAU + irand(-0.05, 0.05);
    const stretch = irand(0.86, 1.12);
    for (let r = 1; r <= N_RING; r++) {
      const th = th0 + irand(-0.03, 0.03) + (r * 0.018);
      const rr = ringNorm(r) * maxR * stretch;
      nodes.push({
        r, k, rr, th,
        j: irand(-6, 6),
        x: Math.cos(th) * rr,
        y: Math.sin(th) * rr,
        z: irand(-8, 8),
        e: 0, et: -99, ef: 7 + rnd() * 5,
      });
    }
  }
  const nodeAt = (r, k) => {
    if (r <= 0) return hub;
    const kk = ((k % N_RAD) + N_RAD) % N_RAD;
    return nodes[1 + kk * N_RING + (r - 1)];
  };

  const anchors = [];
  for (let i = 0; i < 5; i++) {
    const th = -0.55 + i * 0.78 + irand(-0.12, 0.12);
    anchors.push({
      x: Math.cos(th) * maxR * 2.35,
      y: Math.sin(th) * maxR * 2.55,
      z: irand(-40, 90),
      k: Math.round((th / TAU) * N_RAD + N_RAD) % N_RAD,
    });
  }

  const motes = Array.from({ length: 80 }, () => ({
    x: rnd() * W,
    y: rnd() * H,
    r: 0.5 + rnd() * 2.4,
    sp: 0.25 + rnd() * 1.1,
    ph: rnd() * TAU,
    a: 0.15 + rnd() * 0.55,
  }));

  const dews = [];
  for (let n of nodes) {
    if (n.r >= 4 && rnd() < 0.38) {
      dews.push({
        node: n,
        size: 3.2 + rnd() * 6.5,
        born: irand(3.2, 10.5),
        phase: rnd() * TAU,
        hero: false,
      });
    }
  }
  dews.sort((a, b) => b.size - a.size);
  const hero = dews[0] || { node: nodeAt(N_RING, 4), size: 9, born: 4, phase: 0, hero: true };
  hero.hero = true;
  hero.size = Math.max(hero.size, 8.5);

  const branchSegs = [];
  (function grow(x, y, ang, len, depth, thick) {
    if (depth <= 0 || len < 10) return;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    branchSegs.push({ x, y, x2, y2, thick, a: 0.55 + depth * 0.08 });
    grow(x2, y2, ang - irand(0.28, 0.55), len * irand(0.58, 0.72), depth - 1, thick * 0.62);
    if (rnd() > 0.25) grow(x2, y2, ang + irand(0.24, 0.5), len * irand(0.52, 0.68), depth - 1, thick * 0.58);
  })(W * 0.02, H * 0.08, irand(0.15, 0.45), 220, 5, 7);
  (function grow(x, y, ang, len, depth, thick) {
    if (depth <= 0 || len < 10) return;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    branchSegs.push({ x, y, x2, y2, thick, a: 0.5 + depth * 0.08 });
    grow(x2, y2, ang + irand(0.25, 0.5), len * irand(0.58, 0.72), depth - 1, thick * 0.62);
    if (rnd() > 0.28) grow(x2, y2, ang - irand(0.22, 0.48), len * irand(0.5, 0.66), depth - 1, thick * 0.58);
  })(W * 0.98, H * 0.05, Math.PI - irand(0.2, 0.5), 200, 5, 6);
  (function grow(x, y, ang, len, depth, thick) {
    if (depth <= 0 || len < 12) return;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    branchSegs.push({ x, y, x2, y2, thick, a: 0.62 + depth * 0.06 });
    grow(x2, y2, ang - irand(0.2, 0.42), len * 0.66, depth - 1, thick * 0.64);
    grow(x2, y2, ang + irand(0.18, 0.4), len * 0.6, depth - 1, thick * 0.6);
  })(W * 0.12, H * 1.02, -Math.PI / 2 - 0.3, 280, 4, 9);

  let grainCanvas = null;
  try {
    grainCanvas = document.createElement("canvas");
    grainCanvas.width = 128;
    grainCanvas.height = 128;
    const gctx = grainCanvas.getContext("2d");
    const img = gctx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 22;
    }
    gctx.putImageData(img, 0, 0);
  } catch (e) {
    grainCanvas = null;
  }

  function rotX(x, y, z, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [x, y * c - z * s, y * s + z * c];
  }
  function rotZ(x, y, z, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [x * c - y * s, x * s + y * c, z];
  }
  function project(x, y, z, ax, az) {
    let p = rotZ(x, y, z, az);
    p = rotX(p[0], p[1], p[2], ax);
    const fl = 1500;
    const s = fl / (fl + p[2] + 420);
    return [W * 0.5 + p[0] * s, H * 0.4 + p[1] * s, s, p[2]];
  }

  function skyAt(u) {
    const keys = [
      { t: 0, top: [7, 8, 16], bot: [14, 11, 16], sun: [255, 214, 170], amb: 0.15 },
      { t: 0.28, top: [16, 18, 38], bot: [42, 22, 40], sun: [255, 196, 150], amb: 0.28 },
      { t: 0.55, top: [38, 48, 82], bot: [120, 62, 58], sun: [255, 186, 130], amb: 0.5 },
      { t: 0.78, top: [70, 96, 138], bot: [210, 118, 78], sun: [255, 220, 170], amb: 0.78 },
      { t: 1, top: [110, 142, 178], bot: [255, 176, 118], sun: [255, 236, 210], amb: 1 },
    ];
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (u >= keys[i].t && u <= keys[i + 1].t) {
        a = keys[i];
        b = keys[i + 1];
        break;
      }
    }
    const t = (u - a.t) / Math.max(1e-6, b.t - a.t);
    const e = ease(clamp(t));
    const mix = (k) => [
      lerp(a[k][0], b[k][0], e),
      lerp(a[k][1], b[k][1], e),
      lerp(a[k][2], b[k][2], e),
    ];
    return { top: mix("top"), bot: mix("bot"), sun: mix("sun"), amb: lerp(a.amb, b.amb, e) };
  }
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  function energyOf(node, t) {
    let e = node.e * Math.exp(-6.5 * Math.max(0, t - node.et));
    if (t > node.et) e *= Math.cos((t - node.et) * node.ef * TAU);
    return e;
  }

  function impulseNode(node, t, amp, freq) {
    node.et = t;
    node.e = amp;
    node.ef = 6 + freq * 0.01;
  }

  let lastHit = 0;
  function consumeHits(tAbs) {
    while (lastHit < hits.length && hits[lastHit].t <= tAbs + 0.02) {
      const h = hits[lastHit++];
      if (h.kind === "splash" || h.kind === "fall") continue;
      const ring = clamp(Math.round(((81 - h.midi) / 36) * (N_RING - 1)), 1, N_RING);
      const rad = Math.abs((h.midi * 3 + (h.beat | 0) * 2) | 0) % N_RAD;
      const node = nodeAt(ring, rad);
      impulseNode(node, h.t, 0.7 + h.amp, midiHz(h.midi));
      impulseNode(nodeAt(ring, rad + 1), h.t, 0.25, midiHz(h.midi));
      impulseNode(nodeAt(Math.max(1, ring - 1), rad), h.t, 0.2, midiHz(h.midi));
    }
  }

  const ripples = [];

  function draw(tAbs) {
    const t = (tAbs - t0) / S;
    const u = clamp(t / 15);
    const sky = skyAt(u);
    consumeHits(tAbs);

    const breeze = Math.sin(t * 0.55) * 0.1 + Math.sin(t * 0.19) * 0.05;
    const ax = 0.98 + breeze * 0.35 + Math.sin(t * 0.31) * 0.04;
    const az = 0.08 + Math.sin(t * 0.23) * 0.06;
    const sunX = lerp(W * 0.78, W * 0.7, u);
    const sunY = lerp(H * 0.34, H * 0.16, ease(u));
    const sunR = lerp(10, 34, ease(u));

    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, rgb(sky.top));
    grd.addColorStop(0.55, rgb([
      lerp(sky.top[0], sky.bot[0], 0.45),
      lerp(sky.top[1], sky.bot[1], 0.4),
      lerp(sky.top[2], sky.bot[2], 0.5),
    ]));
    grd.addColorStop(1, rgb(sky.bot));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    const moonA = (1 - ease(clamp(u * 1.6))) * 0.55;
    if (moonA > 0.02) {
      ctx.beginPath();
      ctx.arc(W * 0.2, H * 0.16, 22, 0, TAU);
      ctx.fillStyle = `rgba(220,230,240,${moonA})`;
      ctx.fill();
    }

    const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 420);
    sg.addColorStop(0, rgb(sky.sun, 0.95 * sky.amb));
    sg.addColorStop(0.08, rgb(sky.sun, 0.45 * sky.amb));
    sg.addColorStop(0.28, rgb([255, 160, 90], 0.12 * sky.amb));
    sg.addColorStop(1, rgb([255, 140, 80], 0));
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, TAU);
    ctx.fillStyle = rgb([255, 248, 230], 0.95 * sky.amb);
    ctx.fill();

    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(waveData);
    let spec = 0;
    for (let i = 0; i < 40; i++) spec += freqData[i];
    spec /= 40 * 255;
    let rms = 0;
    for (let i = 0; i < waveData.length; i++) {
      const v = (waveData[i] - 128) / 128;
      rms += v * v;
    }
    rms = Math.sqrt(rms / waveData.length);

    for (const m of motes) {
      const my = (m.y + t * 6 * m.sp) % H;
      const mx = m.x + Math.sin(t * 0.4 * m.sp + m.ph) * 18;
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * m.sp + m.ph));
      ctx.beginPath();
      ctx.arc(mx, my, m.r * (0.8 + spec), 0, TAU);
      ctx.fillStyle = `rgba(255,236,210,${m.a * tw * sky.amb * 0.85})`;
      ctx.fill();
    }

    const radShown = ease(clamp((t - 0.02) / 4.0)) * N_RAD;
    const wrapShown = ease(clamp((t - 1.1) / 2.2));
    const spiralProg = ease(clamp((t - 2.0) / 7.4));
    const captureSegs = (N_RING - 2) * N_RAD;
    const spiralShown = spiralProg * captureSegs;
    const silkGlow = 0.22 + sky.amb * 0.55 + spec * 0.35 + rms * 1.2;

    const proj = new Map();
    function P(node) {
      const wob = energyOf(node, tAbs);
      const z = node.z + wob * 16;
      const pr = project(node.x, node.y, z, ax, az);
      proj.set(node, pr);
      return pr;
    }
    for (const n of nodes) P(n);
    const pHub = proj.get(hub);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    function thread(p1, p2, energy, width, alpha) {
      if (!p1 || !p2) return;
      const a = alpha * silkGlow;
      const w = width * 0.5 * (p1[2] + p2[2]) * (1 + Math.abs(energy) * 2.4);
      ctx.strokeStyle = `rgba(170,200,220,${0.12 * a})`;
      ctx.lineWidth = w * 3.2;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,246,228,${0.22 * a + Math.abs(energy) * 0.45})`;
      ctx.lineWidth = Math.max(0.4, w);
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
    }

    for (const an of anchors) {
      const pA = project(an.x, an.y, an.z, ax, az);
      const pN = proj.get(nodeAt(N_RING, an.k));
      thread(pA, pN, energyOf(nodeAt(N_RING, an.k), tAbs) * 0.4, 1.15, 0.55);
    }

    for (let k = 0; k < radShown; k++) {
      const kf = Math.min(N_RAD - 1, Math.floor(k));
      const frac = clamp(radShown - kf);
      const outer = nodeAt(N_RING, kf);
      thread(pHub, proj.get(outer), energyOf(outer, tAbs), 1.05, k < radShown - 1 ? 0.7 : 0.7 * frac);
      for (let r = 1; r < N_RING; r++) {
        thread(proj.get(nodeAt(r, kf)), proj.get(nodeAt(r + 1, kf)), energyOf(nodeAt(r, kf), tAbs), 0.85, k < radShown - 1 ? 0.55 : 0.55 * frac);
      }
    }

    for (let r = 1; r <= 2; r++) {
      for (let k = 0; k < N_RAD; k++) {
        thread(proj.get(nodeAt(r, k)), proj.get(nodeAt(r, k + 1)), 0, 0.7, 0.45 * wrapShown);
      }
    }

    let seg = 0;
    for (let r = 3; r <= N_RING; r++) {
      for (let k = 0; k < N_RAD; k++) {
        const local = clamp(spiralShown - seg);
        if (local > 0) {
          const a = nodeAt(r, k);
          const b = nodeAt(r, k + 1);
          const pa = proj.get(a);
          const pb = proj.get(b);
          if (local >= 1) thread(pa, pb, energyOf(a, tAbs), 0.8, 0.62);
          else {
            const x = lerp(pa[0], pb[0], local);
            const y = lerp(pa[1], pb[1], local);
            thread(pa, [x, y, pa[2]], energyOf(a, tAbs), 0.8, 0.62);
          }
        }
        seg++;
      }
    }

    ctx.beginPath();
    ctx.arc(pHub[0], pHub[1], 4.5 * pHub[2], 0, TAU);
    ctx.fillStyle = `rgba(255,240,210,${0.35 + silkGlow * 0.4})`;
    ctx.fill();

    const fallT0 = 21 * beatDur / S;
    const landT = 23.5 * beatDur / S;
    const falling = t >= fallT0;
    const landed = t >= landT;

    for (const d of dews) {
      if (t < d.born) continue;
      if (d.hero && falling) continue;
      const grow = easeOut(clamp((t - d.born) / 1.6));
      const nrg = Math.abs(energyOf(d.node, tAbs));
      const p = proj.get(d.node);
      const r = d.size * grow * p[2] * (1 + nrg * 0.4);
      const shimmer = 0.75 + 0.25 * Math.sin(t * 2.2 + d.phase);
      const gx = p[0] - r * 0.32;
      const gy = p[1] - r * 0.38;
      const g = ctx.createRadialGradient(gx, gy, r * 0.08, p[0], p[1], r);
      g.addColorStop(0, `rgba(255,255,255,${0.92 * shimmer})`);
      g.addColorStop(0.35, `rgba(210,228,230,${0.42 * shimmer})`);
      g.addColorStop(0.75, `rgba(140,170,150,${0.22})`);
      g.addColorStop(1, `rgba(80,90,70,0.04)`);
      ctx.beginPath();
      ctx.ellipse(p[0], p[1] + r * 0.08, r, r * 1.18, 0, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(gx, gy, r * 0.22, r * 0.14, -0.5, 0, TAU);
      ctx.fillStyle = `rgba(255,255,255,${0.7 * shimmer})`;
      ctx.fill();
    }

    if (falling && !landed) {
      const ft = (t - fallT0) / (landT - fallT0);
      const p0 = proj.get(hero.node);
      const x = lerp(p0[0], W * 0.5 + 18, easeIn(ft));
      const y = lerp(p0[1], H * 0.9, ft * ft);
      const r = hero.size * lerp(1, 1.35, ft);
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.4, "rgba(210,230,235,0.5)");
      g.addColorStop(1, "rgba(90,110,100,0.05)");
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 1.25, 0, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,250,240,${0.25 * (1 - ft)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.18 * (1 - ft)})`;
      for (let i = 1; i <= 5; i++) {
        const tt = ft - i * 0.045;
        if (tt < 0) continue;
        const tx = lerp(p0[0], W * 0.5 + 18, easeIn(tt));
        const ty = lerp(p0[1], H * 0.9, tt * tt);
        ctx.beginPath();
        ctx.arc(tx, ty, r * (0.4 - i * 0.05), 0, TAU);
        ctx.fill();
      }
    }

    if (landed) {
      const age = t - landT;
      if (ripples.length === 0) {
        ripples.push({ t: tAbs });
      }
      const groundY = H * 0.9;
      const groundX = W * 0.5 + 18;
      for (let i = 0; i < 4; i++) {
        const rr = 20 + age * (90 + i * 40);
        const aa = Math.max(0, 0.28 - age * 0.16 - i * 0.04);
        ctx.beginPath();
        ctx.ellipse(groundX, groundY, rr, rr * 0.22, 0, 0, TAU);
        ctx.strokeStyle = `rgba(255,230,200,${aa})`;
        ctx.lineWidth = 2.2 - i * 0.3;
        ctx.stroke();
      }
      const flash = Math.exp(-age * 3.2);
      const fg = ctx.createRadialGradient(groundX, groundY, 0, groundX, groundY, 260);
      fg.addColorStop(0, `rgba(255,245,220,${0.35 * flash})`);
      fg.addColorStop(1, "rgba(255,200,140,0)");
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.lineCap = "round";
    for (const s of branchSegs) {
      ctx.strokeStyle = `rgba(6,10,8,${s.a})`;
      ctx.lineWidth = s.thick;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }

    const vig = ctx.createRadialGradient(W * 0.5, H * 0.42, H * 0.15, W * 0.5, H * 0.45, H * 0.78);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, `rgba(0,0,0,${0.42 - sky.amb * 0.15})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    if (grainCanvas) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.drawImage(grainCanvas, 0, 0, W, H);
      ctx.restore();
    }

    const fade = t < 0.25 ? ease(t / 0.25) : t > 14.75 ? 1 - (t - 14.75) / 0.25 : 1;
    if (fade < 0.999) {
      ctx.fillStyle = `rgba(0,0,0,${1 - clamp(fade)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  let raf = 0;
  const frame = () => {
    const tAbs = now0();
    draw(tAbs);
    if (tAbs - t0 <= duration + 0.12) raf = requestAnimationFrame(frame);
    else cancelAnimationFrame(raf);
  };
  raf = requestAnimationFrame(frame);
}
