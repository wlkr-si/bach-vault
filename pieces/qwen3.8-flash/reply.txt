export const title = "Aetherial Tide";

export function start({ audioContext, canvas, duration, random }) {
  const ctx = audioContext;
  const c = canvas.getContext("2d");
  const w = canvas.width || 1080;
  const h = canvas.height || 1350;
  const total = Math.max(4, duration || 15);
  const startOffset = 0.05;
  const pieceLen = Math.max(4, total - startOffset - 0.05);
  const beat = pieceLen / 16;
  const bar = beat * 4;
  const startTime = ctx.currentTime + startOffset;

  if (ctx.state === "suspended" && ctx.resume) ctx.resume().catch(() => {});

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function makeNoise(seconds) {
    const len = Math.max(2, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const tail = Math.pow(1 - i / len, 1.7);
      d[i] = (random() * 2 - 1) * tail;
    }
    return buf;
  }

  function makeIR(seconds) {
    const len = Math.max(2, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const tapLen = Math.max(1, Math.floor(ctx.sampleRate * 0.027));

    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0, lp2 = 0;
      for (let i = 0; i < len; i++) {
        const white = random() * 2 - 1;
        lp += (white - lp) * 0.16;
        lp2 += (lp - lp2) * 0.07;

        const env = Math.pow(1 - i / len, 2.25);
        let tap = 0;
        if (i % tapLen === 0) {
          tap = (random() * 2 - 1) * 0.25 * Math.pow(1 - i / len, 1.5);
        }
        d[i] = (lp2 * 0.75 + tap) * env;
      }
    }
    return buf;
  }

  const noiseBuffer = makeNoise(0.35);

  const master = ctx.createGain();
  master.gain.value = 0.94;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -13;
  comp.knee.value = 26;
  comp.ratio.value = 7.5;
  comp.attack.value = 0.005;
  comp.release.value = 0.18;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.82;

  master.connect(comp);
  comp.connect(analyser);
  analyser.connect(ctx.destination);

  const delay = ctx.createDelay(Math.max(0.45, beat * 1.3));
  delay.delayTime.value = Math.max(0.08, beat * 0.75);

  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = "lowpass";
  delayFilter.frequency.value = 2600;
  delayFilter.Q.value = 0.55;

  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = 0.44;

  const delayWet = ctx.createGain();
  delayWet.gain.value = 0.36;

  delay.connect(delayFilter);
  delayFilter.connect(delayFeedback);
  delayFeedback.connect(delay);
  delayFilter.connect(delayWet);
  delayWet.connect(master);

  const reverb = ctx.createConvolver();
  reverb.buffer = makeIR(0.95);
  try {
    reverb.normalize = true;
  } catch (_) {}

  const reverbWet = ctx.createGain();
  reverbWet.gain.value = 0.44;
  reverb.connect(reverbWet);
  reverbWet.connect(master);

  function makeBus(level) {
    const g = ctx.createGain();
    g.gain.value = level;
    g.connect(master);
    return g;
  }

  function addSends(bus, delayAmt, reverbAmt) {
    if (delayAmt > 0) {
      const s = ctx.createGain();
      s.gain.value = delayAmt;
      bus.connect(s);
      s.connect(delay);
    }
    if (reverbAmt > 0) {
      const s = ctx.createGain();
      s.gain.value = reverbAmt;
      bus.connect(s);
      s.connect(reverb);
    }
  }

  const padBus = makeBus(0.165);
  addSends(padBus, 0.14, 0.42);

  const pluckBus = makeBus(0.225);
  addSends(pluckBus, 0.24, 0.34);

  const leadBus = makeBus(0.275);
  addSends(leadBus, 0.22, 0.46);

  const bellBus = makeBus(0.235);
  addSends(bellBus, 0.20, 0.52);

  const bassBus = makeBus(0.355);
  addSends(bassBus, 0.04, 0.14);

  const percBus = makeBus(0.25);
  addSends(percBus, 0.08, 0.20);

  const events = [];
  function addEvent(t, midi, type, strength) {
    events.push({ t, midi, type, strength: clamp(strength, 0.15, 1.25) });
  }

  function schedulePad(midi, t, dur, peak = 0.11) {
    if (dur <= 0 || t > pieceLen + 2) return;
    const t0 = startTime + t;
    const f = midiFreq(midi);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.72;

    const g = ctx.createGain();
    const p = Math.max(0.0008, peak);
    const attackDur = Math.max(0.004, Math.min(0.9, dur * 0.32));
    const holdDur = Math.max(attackDur + 0.01, Math.min(dur * 0.78, dur - 0.02));
    const end = t0 + dur;

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p, t0 + attackDur);
    g.gain.exponentialRampToValueAtTime(p * 0.58, t0 + holdDur);
    g.gain.exponentialRampToValueAtTime(0.0001, end);

    filter.frequency.setValueAtTime(Math.max(120, f * 0.9), t0);
    filter.frequency.linearRampToValueAtTime(Math.min(3200, f * 3.2 + 720), t0 + Math.min(dur * 0.35, 1.2));
    filter.frequency.linearRampToValueAtTime(Math.max(110, f * 1.05), end);

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = f;

    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = f;
    o2.detune.value = 8;

    const o3 = ctx.createOscillator();
    o3.type = "triangle";
    o3.frequency.value = f;
    o3.detune.value = -7;

    const fundGain = ctx.createGain();
    fundGain.gain.value = 0.74;
    const mixGain = ctx.createGain();
    mixGain.gain.value = 0.58;

    o1.connect(fundGain);
    o2.connect(mixGain);
    o3.connect(mixGain);

    fundGain.connect(filter);
    mixGain.connect(filter);
    filter.connect(g);
    g.connect(padBus);

    for (const o of [o1, o2, o3]) {
      o.start(t0);
      o.stop(end + 0.08);
    }
  }

  function scheduleBass(midi, t, dur, vel = 1) {
    if (dur <= 0 || t > pieceLen + 1.5) return;
    const t0 = startTime + t;
    const f = midiFreq(midi);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.65;

    const g = ctx.createGain();
    const p = Math.max(0.0008, 0.58 * vel);
    const attackDur = Math.max(0.004, Math.min(0.018, dur * 0.08));
    const decayDur = Math.max(attackDur + 0.01, Math.min(0.25, dur * 0.35));
    const holdDur = Math.max(decayDur + 0.01, Math.min(dur * 0.82, dur - 0.02));
    const end = t0 + dur;

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p, t0 + attackDur);
    g.gain.exponentialRampToValueAtTime(p * 0.78, t0 + decayDur);
    g.gain.exponentialRampToValueAtTime(p * 0.5, t0 + holdDur);
    g.gain.exponentialRampToValueAtTime(0.0001, end);

    filter.frequency.setValueAtTime(500, t0);
    filter.frequency.linearRampToValueAtTime(170, t0 + Math.min(dur * 0.45, 0.32));
    filter.frequency.linearRampToValueAtTime(85, end);

    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = f;

    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = f;

    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.33;

    osc1.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);
    filter.connect(g);
    g.connect(bassBus);

    osc1.start(t0);
    osc1.stop(end + 0.08);
    osc2.start(t0);
    osc2.stop(end + 0.08);

    addEvent(t, midi, "bass", vel);
  }

  function schedulePluck(midi, t, dur = 0.45, vel = 1, bright = 1) {
    if (dur <= 0 || t > pieceLen + 1.2) return;
    dur = Math.max(0.18, dur);

    const t0 = startTime + t;
    const f = midiFreq(midi);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.85;

    const g = ctx.createGain();
    const p = Math.max(0.001, 0.26 * vel);
    const attackDur = Math.max(0.002, Math.min(0.006, dur * 0.15));
    const decayDur = Math.max(attackDur + 0.005, Math.min(0.09, dur * 0.45));
    const end = t0 + dur;

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p, t0 + attackDur);
    g.gain.exponentialRampToValueAtTime(p * 0.09, t0 + decayDur);
    g.gain.exponentialRampToValueAtTime(0.0001, end);

    const high = clamp(Math.max(400, f * 5 * bright), 300, 9000);
    const low = clamp(Math.max(120, f * 1.2), 80, 6000);

    filter.frequency.setValueAtTime(high, t0);
    filter.frequency.linearRampToValueAtTime(low, end);

    const partials = [
      [1, 1],
      [2.003, 0.25 * bright],
      [3.011, 0.085]
    ];

    for (const [ratio, gain] of partials) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * ratio;

      const og = ctx.createGain();
      og.gain.value = gain;

      o.connect(og);
      og.connect(filter);

      o.start(t0);
      o.stop(end + 0.04);
    }

    filter.connect(g);
    g.connect(pluckBus);

    addEvent(t, midi, "pluck", vel);
  }

  function scheduleLead(midi, t, dur = 1.0, vel = 1) {
    if (dur <= 0 || t > pieceLen + 1.0) return;
    dur = Math.max(0.35, dur);

    const t0 = startTime + t;
    const f = midiFreq(midi);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.55;
    filter.frequency.setValueAtTime(1600, t0);
    filter.frequency.linearRampToValueAtTime(2500, t0 + Math.min(0.22, dur * 0.3));
    filter.frequency.linearRampToValueAtTime(850, t0 + dur);

    const g = ctx.createGain();
    const p = Math.max(0.001, 0.18 * vel);
    const attackDur = Math.max(0.004, Math.min(0.035, dur * 0.2));
    const holdDur = Math.max(attackDur + 0.01, Math.min(dur * 0.72, dur - 0.02));
    const end = t0 + dur;

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p, t0 + attackDur);
    g.gain.exponentialRampToValueAtTime(p * 0.72, t0 + holdDur);
    g.gain.exponentialRampToValueAtTime(0.0001, end);

    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = f;

    const carrier2 = ctx.createOscillator();
    carrier2.type = "triangle";
    carrier2.frequency.value = f;
    carrier2.detune.value = -5;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 4.7 + random() * 0.7;

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.001, t0);
    lfoGain.gain.linearRampToValueAtTime(11 * vel, t0 + Math.min(0.28, dur * 0.4));

    lfo.connect(lfoGain);
    lfoGain.connect(carrier.detune);
    lfoGain.connect(carrier2.detune);

    carrier.connect(filter);
    carrier2.connect(filter);
    filter.connect(g);
    g.connect(leadBus);

    carrier.start(t0);
    carrier.stop(end + 0.08);
    carrier2.start(t0);
    carrier2.stop(end + 0.08);
    lfo.start(t0);
    lfo.stop(end + 0.08);

    addEvent(t, midi, "lead", vel);
  }

  function scheduleBell(midi, t, dur = 3.0, vel = 1) {
    if (dur <= 0 || t > pieceLen + 1.0) return;
    dur = Math.max(1.0, dur);

    const t0 = startTime + t;
    const f = midiFreq(midi);

    const g = ctx.createGain();
    const p = Math.max(0.001, 0.2 * vel);
    const attackDur = Math.max(0.003, Math.min(0.008, dur * 0.01));
    const decayDur = Math.max(attackDur + 0.02, Math.min(dur * 0.42, dur - 0.04));
    const end = t0 + dur;

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p, t0 + attackDur);
    g.gain.exponentialRampToValueAtTime(p * 0.035, t0 + decayDur);
    g.gain.exponentialRampToValueAtTime(0.0001, end);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 5600;
    filter.Q.value = 0.32;

    const partials = [
      [1, 0.7],
      [2.76, 0.28],
      [5.4, 0.12],
      [8.93, 0.045]
    ];

    for (const [ratio, gain] of partials) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * ratio;

      const og = ctx.createGain();
      og.gain.value = gain;

      o.connect(og);
      og.connect(filter);

      o.start(t0);
      o.stop(end + 0.06);
    }

    filter.connect(g);
    g.connect(bellBus);

    addEvent(t, midi, "bell", vel);
  }

  function scheduleKick(t, vel = 0.8) {
    if (t > pieceLen + 0.8) return;
    const t0 = startTime + t;
    const dur = 0.31;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(118, t0);
    osc.frequency.exponentialRampToValueAtTime(34, t0 + 0.12);
    osc.frequency.exponentialRampToValueAtTime(25, t0 + dur);

    const g = ctx.createGain();
    const p = Math.max(0.0008, 0.55 * vel);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(p * 0.05, t0 + 0.11);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(g);
    g.connect(percBus);

    osc.start(t0);
    osc.stop(t0 + dur + 0.04);

    addEvent(t, 24, "kick", vel);
  }

  function scheduleHat(t, vel = 0.3) {
    if (t > pieceLen + 0.5) return;
    const t0 = startTime + t;
    const dur = 0.055 + random() * 0.042;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = 1.2 + random() * 0.7;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 7200 + random() * 3200;
    bp.Q.value = 1.05;

    const g = ctx.createGain();
    const p = Math.max(0.0004, 0.09 * vel);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(bp);
    bp.connect(g);
    g.connect(percBus);

    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  const progression = [
    { root: 45, chord: [57, 60, 64, 69], pool: [69, 72, 76, 79, 81] },
    { root: 41, chord: [53, 57, 60, 65], pool: [65, 69, 72, 77, 81] },
    { root: 36, chord: [52, 55, 60, 64], pool: [60, 64, 67, 72, 76] },
    { root: 43, chord: [55, 59, 62, 67], pool: [62, 67, 71, 74, 79] }
  ];

  const patterns = [
    [0, 2.0, 3.25],
    [0.5, 1.25, 2.0, 2.75, 3.5],
    [0.75, 1.75, 2.75],
    [0, 0.75, 1.5, 2.25, 3.0]
  ];

  const sequences = [
    [0, 3, 1],
    [0, 2, 4, 2, 0],
    [0, 4, 2],
    [0, 2, 4, 3, 1]
  ];

  const leadPattern = [
    [0.35, 1],
    [1.65, 3],
    [2.9, 2]
  ];

  for (let b = 0; b < 4; b++) {
    const p = progression[b];
    const t0 = b * bar;

    const padDur = b === 3 ? bar * 1.3 : bar * 1.03;
    const padPeak = 0.105 + (b === 2 ? 0.014 : 0) + (b === 3 ? 0.007 : 0);

    p.chord.forEach((m, i) => {
      schedulePad(m, t0 + i * 0.014, padDur, padPeak);
    });

    addEvent(t0 + 0.01, p.chord[0] + 12, "pad", 0.48);

    scheduleBass(p.root, t0, beat * 2.0, 0.95);
    scheduleBass(p.root, t0 + beat * 2.4, beat * 1.0, 0.58);

    scheduleKick(t0 + 0.02, b === 0 ? 0.66 : 0.76);
    scheduleKick(t0 + beat * 2.25, b === 0 ? 0.38 : 0.55);
    if (b >= 2) scheduleKick(t0 + beat * 3.5, 0.32);

    if (b === 0) {
      scheduleHat(t0 + beat * 2.0, 0.18);
      scheduleHat(t0 + beat * 3.0, 0.18);
    } else if (b === 1) {
      for (let i = 0; i < 8; i++) {
        if (i % 2 === 1 || random() < 0.45) {
          scheduleHat(t0 + i * beat * 0.5, 0.14 + random() * 0.12);
        }
      }
    } else {
      for (let i = 0; i < 8; i++) {
        if (random() < 0.78) {
          scheduleHat(t0 + i * beat * 0.5, 0.12 + random() * 0.16);
        }
      }
    }

    const pat = patterns[b];
    const seq = sequences[b];
    const velBase = [0.58, 0.72, 0.82, 0.74][b];

    pat.forEach((beatPos, idx) => {
      const midi = p.pool[seq[idx % seq.length]];
      const vel = velBase * (0.78 + random() * 0.32);
      const dur = beat * (0.54 + random() * 0.36);
      schedulePluck(midi, t0 + beatPos * beat, dur, vel, 1 + b * 0.07);
    });

    if (b === 2) {
      leadPattern.forEach(([beatPos, idx]) => {
        scheduleLead(p.pool[idx], t0 + beatPos * beat, beat * 1.45, 0.95);
      });
    }

    if (b === 3) {
      const bell1 = t0 + 2.6 * beat;
      const bell2 = t0 + 3.35 * beat;
      scheduleBell(p.pool[4], bell1, Math.max(1.1, pieceLen - (bell1 - startTime) + 0.7), 0.88);
      scheduleBell(p.pool[1], bell2, Math.max(0.9, pieceLen - (bell2 - startTime) + 0.7), 0.72);
    }
  }

  master.gain.setValueAtTime(0.94, ctx.currentTime);
  master.gain.setValueAtTime(0.94, startTime + pieceLen - 1.05);
  master.gain.exponentialRampToValueAtTime(0.12, startTime + pieceLen + 0.25);

  events.sort((a, b) => a.t - b.t);

  const cx = w / 2;
  const cy = h * 0.54;
  const minDim = Math.min(w, h);
  const maxR = minDim * 0.47;
  const yScale = 1.3;

  const rings = [];
  const particles = [];
  const freqData = new Uint8Array(analyser.frequencyBinCount);

  let eventIndex = 0;
  let raf = 0;
  let stopped = false;
  const visualStart = performance.now();
  let lastFrame = visualStart;

  function hsla(hue, sat, light, alpha) {
    return "hsla(" + hue + "," + sat + "%," + light + "%," + alpha + ")";
  }

  function radiusForMidi(midi) {
    const norm = clamp((midi - 33) / 54, 0, 1);
    return maxR * (0.17 + norm * 0.83);
  }

  function typeHue(type) {
    const map = {
      kick: 300,
      bass: 318,
      pad: 192,
      pluck: 176,
      lead: 142,
      bell: 52
    };
    return map[type] || 190;
  }

  function spawnEvent(ev) {
    const hueBase = ((ev.midi % 12) + 12) % 12;
    const hue = (hueBase * 27 + typeHue(ev.type)) % 360;
    const strength = clamp(ev.strength || 0.5, 0.2, 1.2);
    const r = radiusForMidi(ev.midi);

    let ringR0 = r;
    let ringTarget = r + maxR * 0.24;
    let ringLife = 1.0;
    let ringWidth = 1.7;
    let ringAlpha = 0.26 * strength;

    if (ev.type === "kick") {
      ringR0 = maxR * 0.06;
      ringTarget = maxR * 1.05;
      ringLife = 1.05;
      ringWidth = 3.8;
      ringAlpha = 0.30 * strength;
    } else if (ev.type === "bass") {
      ringR0 = r * 0.72;
      ringTarget = r * 0.72 + maxR * 0.35;
      ringLife = 1.55;
      ringWidth = 2.3;
      ringAlpha = 0.18 * strength;
    } else if (ev.type === "pad") {
      ringR0 = r * 0.86;
      ringTarget = r * 0.86 + maxR * 0.65;
      ringLife = 3.2;
      ringWidth = 1.25;
      ringAlpha = 0.11;
    } else if (ev.type === "bell") {
      ringR0 = r;
      ringTarget = r + maxR * 0.52;
      ringLife = 4.1;
      ringWidth = 2.0;
      ringAlpha = 0.21 * strength;
    } else if (ev.type === "lead") {
      ringR0 = r + maxR * 0.06;
      ringTarget = r + maxR * 0.34;
      ringLife = 1.9;
      ringWidth = 1.8;
      ringAlpha = 0.17 * strength;
    }

    if (rings.length < 230) {
      rings.push({
        r0: ringR0,
        target: ringTarget,
        age: 0,
        life: ringLife,
        width: ringWidth,
        hue,
        sat: 70 + strength * 8,
        light: 55 + strength * 12,
        alpha: ringAlpha
      });
    }

    const desiredByType = {
      kick: 6,
      bass: 8,
      pad: 4,
      pluck: 8,
      lead: 12,
      bell: 18
    };

    let count = desiredByType[ev.type] || 8;
    const maxParticles = 850;

    if (particles.length >= maxParticles) count = 0;
    else count = Math.min(count, maxParticles - particles.length);

    if (count <= 0) return;

    const fullSpread = ev.type === "pad" || ev.type === "bell" || ev.type === "kick";
    const baseAngle = ((hueBase / 12) * Math.PI * 2) + ev.t * 0.02;
    const spread = fullSpread ? Math.PI * 2 : Math.PI * (0.22 + 0.22 * strength);

    const r0 = ev.type === "kick"
      ? maxR * 0.07
      : ev.type === "bass"
        ? r * 0.72
        : ev.type === "pad"
          ? r * 0.9
          : r;

    const vrBase = ev.type === "kick"
      ? 240
      : ev.type === "bell"
        ? 110
        : ev.type === "pad"
          ? 34
          : 150;

    const lifeBase = ev.type === "bell"
      ? 4.2
      : ev.type === "pad"
        ? 3.0
        : ev.type === "lead"
          ? 2.5
          : 1.9;

    const lightBase = ev.type === "bell"
      ? 70
      : ev.type === "kick"
        ? 62
        : 52;

    for (let i = 0; i < count; i++) {
      const angle = fullSpread
        ? random() * Math.PI * 2
        : baseAngle + (random() - 0.5) * spread;

      const jitter = (random() - 0.5) * maxR * 0.045;
      const pR0 = r0 + jitter;
      const pR = pR0 + (random() - 0.5) * maxR * 0.025;
      const life = lifeBase * (0.58 + random() * 0.72);

      const particle = {
        r: pR,
        r0: pR0,
        theta: angle,
        vr: vrBase * (0.22 + random() * 0.86) * strength,
        vt: (0.02 + random() * 0.29) * strength * (random() < 0.84 ? 1 : -0.42),
        life,
        maxLife: life,
        hue: (hue + (random() - 0.5) * 18 + 360) % 360,
        sat: 60 + random() * 30,
        light: lightBase + random() * 22,
        size: (0.55 + random() * 1.55) * (ev.type === "bell" ? 1.2 : 1),
        vib: 2 + random() * 14,
        phase: random() * Math.PI * 2,
        vf: 0.55 + clamp((ev.midi - 30) / 56, 0, 1) * 2.8 + random() * 0.7,
        strength
      };

      const rr = particle.r + Math.sin(particle.phase) * particle.vib;
      particle.px = cx + Math.cos(particle.theta) * rr;
      particle.py = cy + Math.sin(particle.theta) * rr * yScale;

      particles.push(particle);
    }
  }

  function drawSpectrum(time, bass, mid, high) {
    analyser.getByteFrequencyData(freqData);

    function avg(lo, hi) {
      lo = clamp(lo, 0, freqData.length);
      hi = clamp(hi, lo + 1, freqData.length);
      let sum = 0;
      for (let i = lo; i < hi; i++) sum += freqData[i];
      return sum / ((hi - lo) * 255);
    }

    const b = avg(0, 6);
    const m = avg(6, 34);
    const hh = avg(34, Math.min(freqData.length, 170));
    const centroid = (m * 0.7 + hh * 0.5) / Math.max(0.001, b + m + hh + 0.001);

    c.lineJoin = "round";

    for (let layer = 0; layer < 3; layer++) {
      c.beginPath();

      const N = 96;
      const base = maxR * (0.17 + layer * 0.21) + b * 38 * (1 + layer);
      const amp = maxR * (0.10 + layer * 0.055);

      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const angle = u * Math.PI * 2 - Math.PI / 2 + time * (0.025 + layer * 0.012) + centroid * 0.35;
        const idx = Math.min(freqData.length - 1, Math.floor(u * (freqData.length * 0.72) + layer * 6));
        const val = (freqData[idx] || 0) / 255;

        const r = Math.max(6, base + val * amp + Math.sin(angle * 5 + time * 0.7 + layer * 2.1) * 5 * (1 + m));
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r * yScale;

        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }

      c.closePath();

      const hue = (175 + layer * 42 + hh * 70 + time * 3) % 360;
      c.strokeStyle = hsla(hue, 82, 58, 0.05 + (m + hh) * 0.09 + layer * 0.007);
      c.lineWidth = 1.0 + layer * 0.8;
      c.stroke();
    }

    return { bass: b, mid: m, high: hh, centroid };
  }

  function drawField(time, bass, mid) {
    const rays = 26;
    c.lineWidth = 1;

    for (let i = 0; i < rays; i++) {
      const angle = (i / rays) * Math.PI * 2 + time * 0.014 + (1 - mid) * 0.25;
      const r1 = maxR * (0.07 + bass * 0.04);
      const r2 = maxR * (0.93 + mid * 0.1);
      const alpha = 0.008 + bass * 0.018 + mid * 0.009;

      c.strokeStyle = hsla((200 + i * 3.5 + time * 4) % 360, 55, 66, alpha);
      c.beginPath();
      c.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1 * yScale);
      c.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2 * yScale);
      c.stroke();
    }
  }

  function updateRings(dt, bass) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const R = rings[i];
      R.age += dt;

      if (R.age >= R.life) {
        rings[i] = rings[rings.length - 1];
        rings.pop();
        continue;
      }

      const q = R.age / R.life;
      const ease = 1 - Math.pow(1 - q, 2.8);
      const rr = R.r0 + (R.target - R.r0) * ease;
      const alpha = R.alpha * Math.pow(1 - q, 1.45) * (0.45 + bass * 0.85);

      if (alpha < 0.004 || rr < 1) continue;

      c.strokeStyle = hsla(R.hue, R.sat, R.light, alpha);
      c.lineWidth = R.width * (1 + q * 0.6);
      c.beginPath();
      c.ellipse(cx, cy, Math.max(1, rr), Math.max(1, rr * yScale), 0, 0, Math.PI * 2);
      c.stroke();
    }
  }

  function updateParticles(dt, bass, mid, high) {
    c.lineCap = "round";

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        particles[i] = particles[particles.length - 1];
        particles.pop();
        continue;
      }

      p.vr += (p.r0 - p.r) * 1.45 * dt;
      p.vr *= Math.exp(-1.85 * dt);
      p.r += p.vr * dt;

      p.theta += (p.vt + 0.035 + bass * 0.62) * dt;
      p.phase += p.vf * dt * (0.75 + mid * 0.95);

      const wob = Math.sin(p.phase) * p.vib * (0.45 + high * 1.25);
      const breathe = bass * 16 * Math.sin(p.phase * 0.27);
      const rr = Math.max(3, p.r + wob + breathe);

      const x = cx + Math.cos(p.theta) * rr;
      const y = cy + Math.sin(p.theta) * rr * yScale;

      const alpha = Math.pow(clamp(p.life / p.maxLife, 0, 1), 1.35) * (0.085 + 0.135 * p.strength);
      const light = Math.min(82, p.light + high * 16);

      c.strokeStyle = hsla(p.hue, p.sat, light, alpha);
      c.lineWidth = p.size * (0.85 + mid * 0.6);
      c.beginPath();
      c.moveTo(p.px, p.py);
      c.lineTo(x, y);
      c.stroke();

      p.px = x;
      p.py = y;
    }
  }

  c.globalCompositeOperation = "source-over";
  c.fillStyle = "#03050b";
  c.fillRect(0, 0, w, h);

  const glow = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.55);
  glow.addColorStop(0, "rgba(18, 34, 66, 0.18)");
  glow.addColorStop(0.45, "rgba(7, 12, 26, 0.07)");
  glow.addColorStop(1, "rgba(2, 3, 8, 0)");
  c.fillStyle = glow;
  c.fillRect(0, 0, w, h);

  function frame(now) {
    raf = requestAnimationFrame(frame);

    const dt = clamp((now - lastFrame) / 1000, 0.001, 0.048);
    lastFrame = now;

    const audioTime = ctx.currentTime - startTime;
    const realTime = (now - visualStart) / 1000 - startOffset;
    const time = Math.max(0, audioTime, realTime);

    while (eventIndex < events.length && events[eventIndex].t <= time + 0.005) {
      spawnEvent(events[eventIndex++]);
    }

    const { bass, mid, high } = drawSpectrum(time, 0, 0, 0);

    c.globalCompositeOperation = "source-over";
    c.fillStyle = "rgba(4, 7, 15, 0.125)";
    c.fillRect(0, 0, w, h);

    c.globalCompositeOperation = "lighter";

    drawField(time, bass, mid);
    updateRings(dt, bass);
    updateParticles(dt, bass, mid, high);

    if (time > total + 0.22 && !stopped) {
      stop();
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;

    if (raf) cancelAnimationFrame(raf);

    try {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + 0.12);
    } catch (_) {}
  }

  raf = requestAnimationFrame(frame);

  return () => stop();
}