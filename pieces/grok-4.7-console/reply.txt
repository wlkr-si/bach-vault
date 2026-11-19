export const title = "The Blue Branch";

export function start({ audioContext, canvas, duration, random }) {
  const ctx = audioContext;
  const S = duration / 15;
  const t0 = ctx.currentTime + 0.03;
  const at = (sec) => t0 + sec * S;
  const endAt = at(15.05);

  const W = canvas.width;
  const H = canvas.height;
  const g = canvas.getContext("2d");
  const TAU = Math.PI * 2;
  const horizon = H * 0.726;

  const master = ctx.createGain();
  master.gain.value = 1;

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 20;
  hp.Q.value = 0.707;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -5.5;
  comp.knee.value = 10;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;

  const curveN = 2048;
  const curve = new Float32Array(curveN);
  for (let i = 0; i < curveN; i++) {
    const x = (i * 2) / curveN - 1;
    curve[i] = Math.tanh(x * 1.25) * 0.92;
  }
  const shaper = ctx.createWaveShaper();
  shaper.curve = curve;
  shaper.oversample = "2x";

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.linearRampToValueAtTime(0.94, at(0.06));
  out.gain.setValueAtTime(0.94, at(14.22));
  out.gain.linearRampToValueAtTime(0.0001, at(14.94));

  master.connect(hp);
  hp.connect(comp);
  comp.connect(shaper);
  shaper.connect(out);
  out.connect(ctx.destination);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.74;
  out.connect(analyser);
  const freqBins = new Uint8Array(analyser.frequencyBinCount);
  const timeBins = new Uint8Array(analyser.fftSize);

  function makeIR(seconds) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      const cut = ch === 0 ? 0.46 : 0.38;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const sample = (random() * 2 - 1) * Math.exp(-3.15 * t);
        lp += (sample - lp) * cut;
        d[i] = lp;
      }
      const refs = [0.0055, 0.0105, 0.018, 0.029, 0.046];
      for (let r = 0; r < refs.length; r++) {
        const idx = Math.floor(refs[r] * rate);
        if (idx > 0 && idx < len) d[idx] += (ch ? -1 : 1) * (0.42 - r * 0.06);
      }
    }
    return buf;
  }

  function makeNoise(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const edge = Math.min(1, i / 300, (len - 1 - i) / 300);
      d[i] = (random() * 2 - 1) * edge;
    }
    return buf;
  }

  const noiseBuf = makeNoise(2);
  const convolver = ctx.createConvolver();
  convolver.buffer = makeIR(2.35);

  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 1;
  const verbHP = ctx.createBiquadFilter();
  verbHP.type = "highpass";
  verbHP.frequency.value = 150;
  const preDelay = ctx.createDelay(0.08);
  preDelay.delayTime.value = 0.027;
  const wet = ctx.createGain();
  wet.gain.setValueAtTime(0.3, t0);
  wet.gain.linearRampToValueAtTime(0.4, at(8.4));
  wet.gain.linearRampToValueAtTime(0.52, at(14.2));
  reverbSend.connect(verbHP);
  verbHP.connect(preDelay);
  preDelay.connect(convolver);
  convolver.connect(wet);
  wet.connect(master);

  const delay = ctx.createDelay(1.6);
  delay.delayTime.value = 0.8 * S;
  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = "lowpass";
  delayFilter.frequency.setValueAtTime(2700, t0);
  delayFilter.frequency.linearRampToValueAtTime(1100, at(14));
  const delayFb = ctx.createGain();
  delayFb.gain.value = 0.3;
  const delaySend = ctx.createGain();
  delaySend.gain.value = 0.22;
  const delayOut = ctx.createGain();
  delayOut.gain.value = 0.72;
  delaySend.connect(delay);
  delay.connect(delayFilter);
  delayFilter.connect(delayFb);
  delayFb.connect(delay);
  delayFilter.connect(delayOut);
  delayOut.connect(master);
  delayOut.connect(reverbSend);

  const padBus = ctx.createGain();
  padBus.gain.value = 1;
  const padVerb = ctx.createGain();
  padVerb.gain.value = 0.42;
  padBus.connect(master);
  padBus.connect(padVerb);
  padVerb.connect(reverbSend);

  function oddIdentity(freq) {
    let x = freq / 64;
    for (let i = 0; i < 6; i++) {
      const r = Math.round(x);
      if (r >= 1 && Math.abs(x - r) < 0.035) {
        let k = r;
        while (k % 2 === 0) k /= 2;
        return k;
      }
      x *= 2;
    }
    return 1;
  }

  function hueForId(k) {
    if (k === 1) return 30;
    if (k === 3) return 42;
    if (k === 5) return 8;
    if (k === 7) return 206;
    if (k === 9) return 50;
    if (k === 11) return 82;
    if (k === 13) return 262;
    return 36;
  }

  function loopsFor(freq) {
    let x = freq / 64;
    for (let i = 0; i < 6; i++) {
      const r = Math.round(x);
      if (r >= 1 && Math.abs(x - r) < 0.035) return r;
      x *= 2;
    }
    return 4;
  }

  function visualLoops(freq) {
    const id = oddIdentity(freq);
    if (id === 7) return 7;
    return Math.max(2, Math.min(8, loopsFor(freq)));
  }

  function fmRatio(freq) {
    const id = oddIdentity(freq);
    if (id === 7) return Math.SQRT2;
    if (id === 11) return 1.5;
    if (id === 13) return 1.414;
    return 2;
  }

  function fmIndex(freq) {
    const id = oddIdentity(freq);
    if (id === 7) return 2.35;
    if (id === 11 || id === 13) return 1.9;
    return 1.05;
  }

  const notes = [];

  function playBell(note) {
    const time = at(note.t);
    const d = note.dur * S;
    const freq = note.freq;
    const amp = note.amp;
    const pan = Math.max(-0.9, Math.min(0.9, note.pan + (random() - 0.5) * 0.05));
    const ratio = fmRatio(freq);
    const index = fmIndex(freq);

    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const body = ctx.createOscillator();
    const env = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    const panner = ctx.createStereoPanner();

    carrier.type = "sine";
    mod.type = "sine";
    body.type = "sine";
    carrier.frequency.setValueAtTime(freq, time);
    body.frequency.setValueAtTime(freq, time);
    mod.frequency.setValueAtTime(freq * ratio, time);

    const deviation = Math.max(8, freq * ratio * index);
    modGain.gain.setValueAtTime(deviation, time);
    modGain.gain.exponentialRampToValueAtTime(1, time + d * 0.42);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    lp.type = "lowpass";
    lp.Q.value = 0.35;
    lp.frequency.setValueAtTime(Math.min(9000, freq * 7), time);
    lp.frequency.exponentialRampToValueAtTime(Math.max(180, freq * 1.35), time + d);

    const attack = Math.max(0.008, 0.012 * S);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(amp, time + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, amp * 0.3), time + d * 0.34);
    env.gain.exponentialRampToValueAtTime(0.0001, time + d);

    const bodyEnv = ctx.createGain();
    bodyEnv.gain.setValueAtTime(0.0001, time);
    bodyEnv.gain.exponentialRampToValueAtTime(amp * 0.4, time + attack * 1.6);
    bodyEnv.gain.exponentialRampToValueAtTime(0.0001, time + d);

    carrier.connect(lp);
    lp.connect(env);
    env.connect(panner);
    body.connect(bodyEnv);
    bodyEnv.connect(panner);
    panner.pan.setValueAtTime(pan, time);
    panner.connect(master);
    panner.connect(reverbSend);
    if (note.echo) panner.connect(delaySend);

    const tick = ctx.createBufferSource();
    tick.buffer = noiseBuf;
    const tickF = ctx.createBiquadFilter();
    tickF.type = "highpass";
    tickF.frequency.value = 1800;
    const tickE = ctx.createGain();
    tickE.gain.setValueAtTime(amp * 0.2, time);
    tickE.gain.exponentialRampToValueAtTime(0.0001, time + 0.028 * Math.max(1, S));
    tick.connect(tickF);
    tickF.connect(tickE);
    tickE.connect(panner);

    const stop = time + d + 0.22;
    carrier.start(time);
    mod.start(time);
    body.start(time);
    tick.start(time, random() * 0.8);
    carrier.stop(stop);
    mod.stop(stop);
    body.stop(stop);
    tick.stop(time + 0.05);
  }

  function scheduleBell(pieceT, freq, dur, amp, pan, voice, extra) {
    const opt = extra || {};
    const id = oddIdentity(freq);
    const note = {
      t: pieceT,
      freq,
      dur,
      amp,
      pan,
      voice,
      hue: hueForId(id),
      seventh: id === 7,
      loops: visualLoops(freq),
      glow: opt.glow != null ? opt.glow : voice === "cascade" || voice === "sparkle" ? 0.58 : 1,
      echo: opt.echo !== false,
      targetX: opt.targetX != null ? opt.targetX : null,
      targetY: opt.targetY != null ? opt.targetY : null,
      lantern: null,
      lanternIndex: -1
    };
    notes.push(note);
    playBell(note);
    return note;
  }

  function padVoice(freq, amp, count, tStart, attack, tEnd, release) {
    const detunes =
      count <= 1
        ? [{ d: 0, pan: 0 }]
        : count === 2
          ? [
              { d: -0.28, pan: -0.42 },
              { d: 0.28, pan: 0.42 }
            ]
          : [
              { d: -0.32, pan: -0.52 },
              { d: 0, pan: 0 },
              { d: 0.32, pan: 0.52 }
            ];
    for (let i = 0; i < detunes.length; i++) {
      const det = detunes[i];
      const o = ctx.createOscillator();
      const e = ctx.createGain();
      const p = ctx.createStereoPanner();
      o.type = "sine";
      o.frequency.setValueAtTime(freq + det.d, at(tStart));
      e.gain.setValueAtTime(0.0001, at(tStart));
      e.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), at(tStart + attack));
      e.gain.setValueAtTime(Math.max(0.0002, amp), at(tEnd));
      e.gain.exponentialRampToValueAtTime(0.0001, at(tEnd + release));
      p.pan.value = det.pan;
      o.connect(e);
      e.connect(p);
      p.connect(padBus);
      o.start(at(tStart));
      o.stop(at(tEnd + release + 0.06));
    }
  }

  function playPulse(pieceT, amp) {
    const time = at(pieceT);
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(72, time);
    o.frequency.exponentialRampToValueAtTime(44, time + 0.16 * S);
    e.gain.setValueAtTime(0.0001, time);
    e.gain.exponentialRampToValueAtTime(amp, time + 0.008);
    e.gain.exponentialRampToValueAtTime(0.0001, time + 0.34 * S);
    o.connect(e);
    e.connect(master);
    o.start(time);
    o.stop(time + 0.4 * S);
  }

  function chirp(pieceT, f1, f2, pan, amp) {
    const time = at(pieceT);
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    const p = ctx.createStereoPanner();
    o.type = "sine";
    o.frequency.setValueAtTime(f1, time);
    o.frequency.exponentialRampToValueAtTime(f2, time + 0.12 * S);
    e.gain.setValueAtTime(0.0001, time);
    e.gain.exponentialRampToValueAtTime(amp, time + 0.016 * S);
    e.gain.exponentialRampToValueAtTime(0.0001, time + 0.15 * S);
    p.pan.setValueAtTime(pan, time);
    o.connect(e);
    e.connect(p);
    p.connect(master);
    p.connect(reverbSend);
    o.start(time);
    o.stop(time + 0.2 * S);
  }

  function birdCall(pieceT, f1, f2, pan) {
    chirp(pieceT, f1, f2, pan, 0.017);
    chirp(pieceT + 0.16, f1 * 0.96, f2 * 0.92, pan, 0.013);
  }

  function swell(pieceT, dur, amp) {
    const time = at(pieceT);
    const d = dur * S;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.6;
    f.frequency.setValueAtTime(280, time);
    f.frequency.exponentialRampToValueAtTime(1600, time + d);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, time);
    e.gain.exponentialRampToValueAtTime(amp, time + d * 0.9);
    e.gain.exponentialRampToValueAtTime(0.0001, time + d);
    src.connect(f);
    f.connect(e);
    e.connect(master);
    e.connect(reverbSend);
    src.start(time);
    src.stop(time + d + 0.05);
  }

  // Harmonic series of 32 Hz. The blue pitches are multiples of the 7th harmonic.
  padVoice(64, 0.02, 2, 0.15, 2.4, 14.25, 0.45);
  padVoice(128, 0.018, 3, 0.35, 2.1, 14.25, 0.45);
  padVoice(192, 0.015, 3, 0.9, 2.3, 14.15, 0.5);
  padVoice(32, 0.011, 1, 3.15, 2.2, 12.15, 0.7);
  padVoice(224, 0.013, 3, 3.35, 1.7, 12.15, 0.75);
  padVoice(160, 0.011, 3, 6.05, 1.7, 11.45, 0.6);
  padVoice(256, 0.009, 3, 7.7, 1.4, 13.45, 0.55);
  padVoice(512, 0.007, 2, 8.4, 0.35, 10.9, 0.7);
  padVoice(640, 0.0055, 2, 8.55, 0.4, 10.7, 0.6);
  padVoice(768, 0.0045, 2, 8.7, 0.45, 10.5, 0.55);

  const wool = ctx.createOscillator();
  wool.type = "triangle";
  wool.frequency.setValueAtTime(128, t0);
  const woolF = ctx.createBiquadFilter();
  woolF.type = "lowpass";
  woolF.frequency.value = 460;
  const woolG = ctx.createGain();
  woolG.gain.setValueAtTime(0.0001, t0);
  woolG.gain.exponentialRampToValueAtTime(0.028, at(2.2));
  woolG.gain.linearRampToValueAtTime(0.016, at(13.2));
  woolG.gain.linearRampToValueAtTime(0.0001, at(14.4));
  wool.connect(woolF);
  woolF.connect(woolG);
  woolG.connect(master);
  wool.start(t0);
  wool.stop(endAt);

  const threadA = ctx.createOscillator();
  const threadB = ctx.createOscillator();
  threadA.type = "sine";
  threadB.type = "sine";
  threadA.frequency.setValueAtTime(512, t0);
  threadB.frequency.setValueAtTime(512.22, t0);
  const threadG = ctx.createGain();
  threadG.gain.setValueAtTime(0.0001, t0);
  threadG.gain.linearRampToValueAtTime(0.012, at(2.4));
  threadG.gain.linearRampToValueAtTime(0.016, at(9));
  threadG.gain.linearRampToValueAtTime(0.005, at(13.4));
  threadG.gain.linearRampToValueAtTime(0.0001, at(14.55));
  const trem = ctx.createOscillator();
  trem.frequency.value = 0.18;
  const tremG = ctx.createGain();
  tremG.gain.value = 0.0025;
  trem.connect(tremG);
  tremG.connect(threadG.gain);
  const threadPan = ctx.createStereoPanner();
  threadPan.pan.value = 0.28;
  threadA.connect(threadG);
  threadB.connect(threadG);
  threadG.connect(threadPan);
  threadPan.connect(master);
  threadPan.connect(reverbSend);
  threadA.start(t0);
  threadB.start(t0);
  trem.start(t0);
  threadA.stop(endAt);
  threadB.stop(endAt);
  trem.stop(endAt);

  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuf;
  wind.loop = true;
  const windF = ctx.createBiquadFilter();
  windF.type = "bandpass";
  windF.Q.value = 0.55;
  windF.frequency.setValueAtTime(480, t0);
  windF.frequency.linearRampToValueAtTime(860, at(8.2));
  windF.frequency.linearRampToValueAtTime(360, at(14.2));
  const windG = ctx.createGain();
  windG.gain.setValueAtTime(0.0001, t0);
  windG.gain.exponentialRampToValueAtTime(0.016, at(1.4));
  windG.gain.linearRampToValueAtTime(0.024, at(4.2));
  windG.gain.linearRampToValueAtTime(0.015, at(7.6));
  windG.gain.linearRampToValueAtTime(0.03, at(8.7));
  windG.gain.linearRampToValueAtTime(0.01, at(13));
  windG.gain.linearRampToValueAtTime(0.0001, at(14.6));
  const windPan = ctx.createStereoPanner();
  const windLfo = ctx.createOscillator();
  windLfo.frequency.value = 0.045;
  const windLfoG = ctx.createGain();
  windLfoG.gain.value = 0.35;
  windLfo.connect(windLfoG);
  windLfoG.connect(windPan.pan);
  wind.connect(windF);
  windF.connect(windG);
  windG.connect(windPan);
  windPan.connect(master);
  windPan.connect(reverbSend);
  wind.start(t0);
  windLfo.start(t0);
  wind.stop(endAt);
  windLfo.stop(endAt);

  const step = 0.8;
  const v1Start = 1.2;
  const v2Start = 3.6;
  const arch = [256, 320, 384, 448, 512, 448, 384, 320, 256];
  const mirror = [512, 448, 384, 320, 256, 320, 384, 448, 512];

  scheduleBell(0.15, 192, 4.1, 0.125, 0.02, "prelude", {
    targetX: W * 0.52,
    targetY: horizon - 250,
    glow: 1.12
  });
  scheduleBell(0.7, 512, 2.05, 0.036, 0.4, "sparkle", {
    targetX: W * 0.32,
    targetY: horizon - 500,
    glow: 0.66,
    echo: true
  });

  for (let i = 0; i < arch.length; i++) {
    scheduleBell(v1Start + i * step, arch[i], 2.55, 0.15, 0.3, "v1");
  }
  for (let i = 0; i < mirror.length; i++) {
    scheduleBell(v2Start + i * step, mirror[i], 2.35, 0.112, -0.38, "v2");
  }

  scheduleBell(3.6, 896, 1.55, 0.022, -0.12, "sparkle", { glow: 0.5, echo: false });
  scheduleBell(6.8, 640, 1.4, 0.02, 0.22, "sparkle", { glow: 0.48, echo: false });

  const cascade = [512, 576, 640, 704, 768, 832, 896, 1024];
  for (let i = 0; i < cascade.length; i++) {
    scheduleBell(8.4 + i * 0.082, cascade[i], 1.12, 0.034, -0.46 + i * 0.13, "cascade", {
      echo: false,
      glow: 0.52,
      targetX: W * 0.16 + i * (W * 0.085)
    });
  }

  const bloom = [
    { f: 256, p: 0.34 },
    { f: 320, p: -0.18 },
    { f: 384, p: 0.12 },
    { f: 448, p: -0.42 }
  ];
  for (let i = 0; i < bloom.length; i++) {
    scheduleBell(8.4, bloom[i].f, 2.45, 0.05, bloom[i].p, "bloom", { glow: 0.85 });
  }

  scheduleBell(11.55, 128, 2.9, 0.06, 0.0, "resolve", { glow: 1.05 });
  scheduleBell(11.62, 192, 2.75, 0.062, -0.12, "resolve", { glow: 1 });
  scheduleBell(11.72, 256, 2.55, 0.055, 0.14, "resolve", { glow: 0.95 });
  scheduleBell(13.42, 192, 1.35, 0.048, 0.04, "resolve", { glow: 0.9 });

  const pulses = [];
  for (let i = 0; i <= 10; i++) {
    const t = 3.6 + i * step;
    const shaped = Math.sin((i / 10) * Math.PI);
    const accent = Math.abs(t - 8.4) < 0.001;
    pulses.push({
      t,
      amp: accent ? 0.145 : 0.04 + shaped * 0.075,
      visual: accent ? 1 : 0.32 + shaped * 0.5
    });
  }
  for (let i = 0; i < pulses.length; i++) playPulse(pulses[i].t, pulses[i].amp);

  swell(7.32, 1.08, 0.04);

  const birdEvents = [
    { t: 9.42, x: W * 0.78, y: horizon - 470, f1: 1920, f2: 1600, pan: 0.6 },
    { t: 10.02, x: W * 0.84, y: horizon - 510, f1: 2240, f2: 1920, pan: 0.72 },
    { t: 12.68, x: W * 0.73, y: horizon - 440, f1: 1920, f2: 1600, pan: 0.46 }
  ];
  for (let i = 0; i < birdEvents.length; i++) {
    const b = birdEvents[i];
    birdCall(b.t, b.f1, b.f2, b.pan);
  }

  const branches = [];
  const lanternPoints = [];
  const treeBases = [];

  function grow(x, y, angle, depth, len, width, phase, treeIndex, distant) {
    const ang = Math.max(-1.08, Math.min(1.08, angle));
    const x2 = x + Math.sin(ang) * len;
    const y2 = y - Math.cos(ang) * len;
    branches.push({
      x1: x,
      y1: y,
      x2,
      y2,
      w: width,
      phase,
      treeIndex,
      distant
    });
    if (!distant && depth <= 2 && y2 > 150 && y2 < horizon - 16 && x2 > 24 && x2 < W - 24) {
      lanternPoints.push({ x: x2, y: y2, phase, sway: 1, treeIndex });
    }
    if (depth <= 0) return;
    const shrink = 0.66 + random() * 0.05;
    const spread = 0.3 + random() * 0.28;
    grow(x2, y2, ang - spread, depth - 1, len * shrink, width * 0.66, phase + 0.45, treeIndex, distant);
    grow(
      x2,
      y2,
      ang + spread * (0.84 + random() * 0.22),
      depth - 1,
      len * (shrink - 0.015),
      width * 0.62,
      phase + 0.95,
      treeIndex,
      distant
    );
    if (depth > 3 && random() > 0.6) {
      grow(
        x2,
        y2,
        ang + (random() - 0.5) * 0.45,
        depth - 2,
        len * 0.5,
        width * 0.46,
        phase + 1.5,
        treeIndex,
        distant
      );
    }
  }

  function addTree(x, depth, len, width, lean, distant) {
    treeBases.push({ x, y: horizon + 6, distant });
    grow(x, horizon + 6, lean, depth, len, width, random() * 6.2, treeBases.length - 1, distant);
  }

  addTree(W * 0.12, 5, H * 0.075, 6.5, 0.05, true);
  addTree(W * 0.28, 7, H * 0.118, 13, -0.07, false);
  addTree(W * 0.53, 7, H * 0.132, 15.5, 0.045, false);
  addTree(W * 0.8, 7, H * 0.12, 13, -0.11, false);

  if (lanternPoints.length < 12) {
    for (let i = 0; i < 24; i++) {
      lanternPoints.push({
        x: W * 0.12 + (i % 6) * W * 0.13,
        y: horizon - 160 - Math.floor(i / 6) * 90,
        phase: i * 0.7,
        sway: 0.4,
        treeIndex: 1
      });
    }
  }

  function yForFreq(freq) {
    const n = Math.log(Math.max(96, freq) / 128) / Math.log(8);
    const c = Math.min(1, Math.max(0, n));
    return horizon - 80 - c * (horizon - 300);
  }

  function assignLanterns() {
    const used = new Map();
    const ordered = notes.slice().sort((a, b) => a.t - b.t || a.freq - b.freq);
    for (let n = 0; n < ordered.length; n++) {
      const note = ordered[n];
      const yTarget = note.targetY != null ? note.targetY : yForFreq(note.freq);
      const xTarget = note.targetX != null ? note.targetX : W * 0.5 + note.pan * W * 0.38;
      let best = 0;
      let bestScore = Infinity;
      for (let i = 0; i < lanternPoints.length; i++) {
        const p = lanternPoints[i];
        let score = Math.abs(p.y - yTarget) * 1.2 + Math.abs(p.x - xTarget) * 0.9;
        if (note.seventh) score += p.x * 0.16;
        const prev = used.get(i);
        if (prev != null) score += note.t - prev < 2.4 ? 260 : 80;
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
      note.lantern = lanternPoints[best];
      note.lanternIndex = best;
      used.set(best, note.t);
    }
    return used;
  }

  const usedLanterns = assignLanterns();
  const v1Notes = notes.filter((n) => n.voice === "v1");
  const v2Notes = notes.filter((n) => n.voice === "v2");

  const unlit = [];
  for (let i = 0; i < lanternPoints.length && unlit.length < 16; i++) {
    if (usedLanterns.has(i)) continue;
    if (random() > 0.78) unlit.push(lanternPoints[i]);
  }

  const stars = [];
  for (let i = 0; i < 130; i++) {
    stars.push({
      x: random() * W,
      y: random() * (horizon - 30),
      r: random() * 1.35 + 0.25,
      phase: random() * TAU,
      speed: 0.45 + random() * 2.1,
      bright: 0.35 + random() * 0.65,
      hue: random() > 0.92 ? 40 : random() > 0.84 ? 210 : 220,
      sat: random() > 0.88 ? 45 : 10
    });
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const rad = 120 + random() * 64;
    stars.push({
      x: W * 0.18 + Math.cos(a) * rad,
      y: H * 0.115 + Math.sin(a) * rad * 0.62,
      r: 0.4 + random() * 0.7,
      phase: random() * TAU,
      speed: 0.6 + random(),
      bright: 0.5,
      hue: 220,
      sat: 12
    });
  }

  const flies = [];
  for (let i = 0; i < 42; i++) {
    flies.push({
      x: random() * W,
      y: horizon * 0.28 + random() * horizon * 0.62,
      phase: random() * TAU,
      drift: random() * TAU,
      speed: 0.35 + random() * 0.9,
      blink: 1.1 + random() * 2.4,
      hue: random() > 0.86 ? 206 : 40,
      rad: 1.3 + random() * 1.5
    });
  }

  const reeds = [];
  for (let i = 0; i < 26; i++) {
    reeds.push({
      x: 30 + random() * (W - 60),
      h: 18 + random() * 46,
      phase: random() * TAU,
      lean: (random() - 0.5) * 10
    });
  }

  const clouds = [];
  for (let i = 0; i < 4; i++) {
    clouds.push({
      x: random() * W,
      y: 70 + random() * 180,
      rx: 90 + random() * 150,
      ry: 16 + random() * 18,
      speed: 6 + random() * 10,
      alpha: 0.03 + random() * 0.035
    });
  }

  const petals = [];
  for (let i = 0; i < 34; i++) {
    petals.push({
      spawn: 8.32 + random() * 3.4,
      x: W * 0.12 + random() * W * 0.76,
      y: 240 + random() * 380,
      vx: -14 + random() * 28,
      vy: 14 + random() * 30,
      rot: random() * TAU,
      vr: -1.1 + random() * 2.2,
      size: 3 + random() * 4.2,
      hue: random() > 0.7 ? 206 : random() > 0.45 ? 8 : 34,
      life: 3.4 + random() * 2.3
    });
  }

  const gather = [];
  for (let i = 0; i < 22; i++) {
    gather.push({
      t: 7.4 + random() * 0.45,
      x: random() * W,
      y: horizon - 30 - random() * 200,
      tx: W * 0.18 + random() * W * 0.64,
      ty: 400 + random() * 200,
      life: 1.05 + random() * 0.45
    });
  }

  const motes = [];
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (!n.seventh || n.voice === "cascade") continue;
    const count = n.voice === "sparkle" ? 3 : 5;
    for (let k = 0; k < count; k++) {
      motes.push({
        note: n,
        ox: (random() - 0.5) * 36,
        oy: random() * 8,
        vx: (random() - 0.5) * 14,
        vy: 18 + random() * 32,
        life: 2.2 + random() * 1.6,
        size: 1 + random() * 1.4
      });
    }
  }

  const glints = [];
  for (let i = 0; i < 18; i++) {
    glints.push({
      x: random() * W,
      y: horizon + 30 + random() * (H - horizon - 50),
      phase: random() * TAU,
      speed: 0.8 + random() * 2
    });
  }

  let grainPattern = null;
  try {
    const doc = canvas.ownerDocument;
    if (doc) {
      const tile = doc.createElement("canvas");
      tile.width = 128;
      tile.height = 128;
      const tg = tile.getContext("2d");
      const img = tg.createImageData(128, 128);
      const pix = img.data;
      for (let i = 0; i < pix.length; i += 4) {
        const v = (random() * 255) | 0;
        pix[i] = pix[i + 1] = pix[i + 2] = v;
        pix[i + 3] = 255;
      }
      tg.putImageData(img, 0, 0);
      grainPattern = g.createPattern(tile, "repeat");
    }
  } catch (err) {
    grainPattern = null;
  }

  function hsla(h, s, l, a) {
    return "hsla(" + h + ", " + s + "%, " + l + "%, " + a + ")";
  }

  function warmth(now) {
    if (now < 0.25) return 0.08;
    if (now < 8.2) return 0.08 + (now - 0.25) * 0.042;
    if (now < 9.15) return 0.41 + ((now - 8.2) / 0.95) * 0.59;
    if (now < 12.7) return 1 - (now - 9.15) * 0.15;
    return Math.max(0.1, 0.47 - (now - 12.7) * 0.16);
  }

  function envAt(now, n) {
    const dt = now - n.t;
    if (dt < 0 || dt > n.dur) return 0;
    const attack = 0.03;
    if (dt < attack) return dt / attack;
    return Math.exp((-2.55 * (dt - attack)) / n.dur);
  }

  function swayX(x, y, now, phase, sway) {
    const s = sway == null ? 1 : sway;
    const h = Math.max(0, (horizon - y) / horizon);
    return x + Math.sin(now * 0.52 + phase + y * 0.006) * h * h * 15 * s;
  }

  function swayY(y, now, phase) {
    const h = Math.max(0, (horizon - y) / horizon);
    return y + Math.sin(now * 0.4 + phase * 1.3) * h * 2;
  }

  function posOf(p, now) {
    return {
      x: swayX(p.x, p.y, now, p.phase, p.sway),
      y: swayY(p.y, now, p.phase)
    };
  }

  function sparkAt(list, now) {
    if (!list.length || now < list[0].t) return null;
    const last = list[list.length - 1];
    if (now >= last.t) {
      const age = now - last.t;
      if (age > last.dur || !last.lantern) return null;
      const p = posOf(last.lantern, now);
      return {
        x: p.x,
        y: p.y,
        fade: 1 - age / last.dur,
        hue: last.hue,
        seventh: last.seventh
      };
    }
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (now >= a.t && now < b.t) {
        if (!a.lantern || !b.lantern) return null;
        const u = (now - a.t) / (b.t - a.t);
        const s = u * u * (3 - 2 * u);
        const pa = posOf(a.lantern, now);
        const pb = posOf(b.lantern, now);
        return {
          x: pa.x + (pb.x - pa.x) * s,
          y: pa.y + (pb.y - pa.y) * s,
          fade: 1,
          hue: a.hue,
          seventh: a.seventh
        };
      }
    }
    return null;
  }

  function moonPos(now) {
    return {
      x: W * 0.182 + Math.sin(now * 0.12) * 7,
      y: H * 0.112 - now * 1.05
    };
  }

  const E = { rms: 0, low: 0, seventh: 0, warmth: 0, pulse: 0 };

  function drawBranch(b, now, rim) {
    const x1 = swayX(b.x1, b.y1, now, b.phase, 1);
    const y1 = b.y1 < horizon - 8 ? swayY(b.y1, now, b.phase) : b.y1;
    const x2 = swayX(b.x2, b.y2, now, b.phase, 1);
    const y2 = swayY(b.y2, now, b.phase);
    const mx = (x1 + x2) / 2 + Math.sin(b.phase) * 7;
    const my = (y1 + y2) / 2;
    g.beginPath();
    g.moveTo(x1, y1);
    g.quadraticCurveTo(mx, my, x2, y2);
    if (rim) {
      g.strokeStyle = b.distant ? "rgba(120, 140, 150, 0.22)" : "rgba(96, 118, 132, 0.3)";
      g.lineWidth = b.w + 1.6;
    } else {
      g.strokeStyle = b.distant ? "rgba(28, 38, 46, 0.72)" : "rgba(7, 12, 11, 0.96)";
      g.lineWidth = Math.max(1.2, b.w);
    }
    g.stroke();
  }

  function drawString(n, now, intensity) {
    if (!n.lantern || intensity < 0.12) return;
    if (n.voice === "cascade" || n.voice === "sparkle") return;
    const top = posOf(n.lantern, now);
    if (top.y > horizon - 24) return;
    const botX = swayX(n.lantern.x, horizon - 20, now, n.lantern.phase, 0.25);
    const botY = horizon - 4;
    const loops = n.loops;
    const amp = intensity * (n.seventh ? 8.5 : 6.2);
    const phase = now * (0.5 + loops * 0.2);
    const steps = loops * 10;
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const y = top.y + (botY - top.y) * u;
      const baseX = top.x + (botX - top.x) * u;
      const wave =
        Math.sin(loops * Math.PI * u) * Math.sin(phase * TAU) * amp * Math.sin(Math.PI * u);
      const x = baseX + wave;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    const alpha = intensity * (n.seventh ? 0.42 : 0.22);
    g.strokeStyle = hsla(n.hue, 75, 72, alpha);
    g.lineWidth = n.seventh ? 1.7 : 1.15;
    g.stroke();
  }

  function drawTrail(list, now, width, alpha) {
    const pts = [];
    for (let dt = 1.28; dt >= 0; dt -= 0.032) {
      const s = sparkAt(list, now - dt);
      if (s) pts.push(s);
    }
    if (pts.length < 2) return;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    const head = pts[pts.length - 1];
    g.strokeStyle = hsla(head.hue, 90, 70, alpha * head.fade);
    g.lineWidth = width;
    g.stroke();
  }

  function draw(now) {
    const w = warmth(now);
    E.warmth = w;
    let seventh = 0;
    for (let i = 0; i < notes.length; i++) {
      if (!notes[i].seventh) continue;
      const v = envAt(now, notes[i]);
      if (v > seventh) seventh = v;
    }
    E.seventh = seventh;
    let pulse = 0;
    for (let i = 0; i < pulses.length; i++) {
      const age = now - pulses[i].t;
      if (age >= 0 && age < 0.72) {
        const v = (1 - age / 0.72) * pulses[i].visual;
        if (v > pulse) pulse = v;
      }
    }
    E.pulse = pulse;

    analyser.getByteFrequencyData(freqBins);
    analyser.getByteTimeDomainData(timeBins);
    let low = 0;
    for (let i = 0; i < 8; i++) low += freqBins[i];
    low /= 8 * 255;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < timeBins.length; i += 8) {
      const v = (timeBins[i] - 128) / 128;
      sum += v * v;
      count++;
    }
    const rms = Math.sqrt(sum / Math.max(1, count));
    E.rms = rms;
    E.low = low;
    const glowMul = 0.86 + Math.min(0.42, rms * 2.4);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    g.lineCap = "round";
    g.lineJoin = "round";

    const sky = g.createLinearGradient(0, 0, 0, horizon);
    const topR = 14 + w * 18;
    const topG = 18 + w * 6;
    const topB = 36 + w * 8;
    sky.addColorStop(0, "rgb(" + (topR | 0) + "," + (topG | 0) + "," + (topB | 0) + ")");
    sky.addColorStop(0.45, "rgb(" + (18 + w * 16) + "," + (26 + w * 4) + "," + (48 + w * 6) + ")");
    sky.addColorStop(0.82, "rgb(" + (28 + w * 22) + "," + (36 + w * 8) + "," + (52 - w * 6) + ")");
    sky.addColorStop(1, "rgb(" + (22 + w * 20) + "," + (32 + w * 6) + "," + (36) + ")");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    g.save();
    g.translate(W * 0.62, H * 0.2);
    g.rotate(-0.55);
    const mw = g.createLinearGradient(-420, 0, 420, 0);
    mw.addColorStop(0, "rgba(190, 200, 230, 0)");
    mw.addColorStop(0.5, "rgba(190, 205, 230, 0.055)");
    mw.addColorStop(1, "rgba(190, 200, 230, 0)");
    g.fillStyle = mw;
    g.fillRect(-480, -70, 960, 140);
    g.restore();

    const starBoost = 1 + Math.max(0, now - 12.4) * 0.07;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      if (s.y < -10 || s.y > horizon) continue;
      const tw = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(now * s.speed + s.phase), 5);
      g.fillStyle = hsla(s.hue, s.sat, 88, tw * s.bright * starBoost);
      g.beginPath();
      g.arc(s.x, s.y, s.r, 0, TAU);
      g.fill();
    }

    const moon = moonPos(now);
    const shaft = g.createLinearGradient(moon.x, moon.y, moon.x - 40, horizon);
    shaft.addColorStop(0, "rgba(244, 228, 196, " + (0.09 + w * 0.04) + ")");
    shaft.addColorStop(1, "rgba(244, 228, 196, 0)");
    g.fillStyle = shaft;
    g.beginPath();
    g.moveTo(moon.x - 16, moon.y + 20);
    g.lineTo(moon.x - 210, horizon);
    g.lineTo(moon.x + 70, horizon);
    g.closePath();
    g.fill();

    const halo = g.createRadialGradient(moon.x, moon.y, 10, moon.x, moon.y, 230 + pulse * 16);
    halo.addColorStop(0, "rgba(255, 244, 220, 0.55)");
    halo.addColorStop(0.25, "rgba(244, 220, 180, 0.16)");
    halo.addColorStop(1, "rgba(244, 220, 180, 0)");
    g.fillStyle = halo;
    g.beginPath();
    g.arc(moon.x, moon.y, 230, 0, TAU);
    g.fill();

    g.beginPath();
    g.arc(moon.x, moon.y, 52, 0, TAU);
    g.fillStyle = "#f4e7cc";
    g.fill();
    g.fillStyle = "rgba(176, 156, 124, 0.22)";
    g.beginPath();
    g.ellipse(moon.x - 12, moon.y + 8, 14, 10, 0.4, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(moon.x + 16, moon.y - 10, 8, 6, -0.3, 0, TAU);
    g.fill();
    g.strokeStyle = "rgba(255, 250, 240, 0.7)";
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(moon.x, moon.y, 52, 0, TAU);
    g.stroke();

    g.save();
    g.translate(moon.x, moon.y);
    g.rotate(now * 0.08);
    g.beginPath();
    for (let i = 0; i <= 7; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 7;
      const px = Math.cos(a) * 96;
      const py = Math.sin(a) * 96;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.strokeStyle = "rgba(198, 214, 230, " + (0.14 + seventh * 0.28) + ")";
    g.lineWidth = 1.15;
    g.stroke();
    g.restore();

    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + now * 0.1 + (i * TAU) / 7;
      const x = moon.x + Math.cos(a) * 96;
      const y = moon.y + Math.sin(a) * 96;
      const blue = i === 6;
      const e = blue ? 0.35 + seventh * 0.7 : 0.22;
      if (blue && seventh > 0.05) {
        const grd = g.createRadialGradient(x, y, 0, x, y, 16 + seventh * 18);
        grd.addColorStop(0, "rgba(170, 214, 255, " + seventh * 0.7 + ")");
        grd.addColorStop(1, "rgba(170, 214, 255, 0)");
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x, y, 16 + seventh * 18, 0, TAU);
        g.fill();
      }
      g.fillStyle = blue ? hsla(206, 80, 76, e) : "rgba(230, 236, 244, " + e + ")";
      g.beginPath();
      g.arc(x, y, blue ? 2.6 + seventh * 1.8 : 1.7, 0, TAU);
      g.fill();
    }

    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      const x = ((c.x + now * c.speed) % (W + 500) + (W + 500)) % (W + 500) - 220;
      g.fillStyle = "rgba(206, 216, 230, " + c.alpha + ")";
      g.beginPath();
      g.ellipse(x, c.y, c.rx, c.ry, 0, 0, TAU);
      g.fill();
    }

    for (let i = 0; i < branches.length; i++) drawBranch(branches[i], now, true);
    for (let i = 0; i < branches.length; i++) drawBranch(branches[i], now, false);

    for (let i = 0; i < unlit.length; i++) {
      const p = posOf(unlit[i], now);
      g.fillStyle = "rgba(54, 38, 26, 0.55)";
      g.beginPath();
      g.moveTo(p.x, p.y - 4);
      g.lineTo(p.x + 2.4, p.y);
      g.lineTo(p.x, p.y + 4.5);
      g.lineTo(p.x - 2.4, p.y);
      g.closePath();
      g.fill();
    }

    for (let i = 0; i < notes.length; i++) drawString(notes[i], now, envAt(now, notes[i]));

    g.fillStyle = "#0c1210";
    g.beginPath();
    g.moveTo(0, horizon + 10);
    g.quadraticCurveTo(W * 0.16, horizon - 34, W * 0.34, horizon - 6);
    g.quadraticCurveTo(W * 0.52, horizon + 30, W * 0.7, horizon - 16);
    g.quadraticCurveTo(W * 0.86, horizon - 38, W, horizon + 6);
    g.lineTo(W, horizon + 34);
    g.lineTo(0, horizon + 34);
    g.fill();

    for (let i = 0; i < treeBases.length; i++) {
      const t = treeBases[i];
      g.fillStyle = "rgba(0, 0, 0, 0.28)";
      g.beginPath();
      g.ellipse(t.x, horizon + 2, t.distant ? 26 : 46, 7, 0, 0, TAU);
      g.fill();
    }

    g.strokeStyle = "rgba(18, 36, 30, 0.75)";
    g.lineWidth = 1.25;
    for (let i = 0; i < reeds.length; i++) {
      const r = reeds[i];
      const tip = r.x + r.lean + Math.sin(now * 0.85 + r.phase) * 4;
      g.beginPath();
      g.moveTo(r.x, horizon + 6);
      g.quadraticCurveTo(tip, horizon - r.h * 0.55, tip + Math.sin(r.phase) * 2, horizon - r.h);
      g.stroke();
    }

    g.globalCompositeOperation = "lighter";

    if (w > 0.5) {
      const bloomG = g.createRadialGradient(W * 0.52, horizon - 270, 20, W * 0.52, horizon - 250, 440);
      bloomG.addColorStop(0, "rgba(255, 196, 130, " + (w - 0.5) * 0.22 + ")");
      bloomG.addColorStop(1, "rgba(255, 196, 130, 0)");
      g.fillStyle = bloomG;
      g.beginPath();
      g.arc(W * 0.52, horizon - 260, 440, 0, TAU);
      g.fill();
    }

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const intensity = envAt(now, n);
      if (intensity < 0.03 || !n.lantern) continue;
      const age = now - n.t;
      if (age > 0 && age < 1.35) {
        const p = posOf(n.lantern, now);
        const radius = 8 + age * 78 * n.glow;
        const alpha = (1 - age / 1.35) * 0.5 * Math.min(1, intensity * 1.3);
        g.beginPath();
        g.arc(p.x, p.y, radius, 0, TAU);
        g.strokeStyle = hsla(n.hue, 85, 70, alpha);
        g.lineWidth = n.seventh ? 2.2 : 1.5;
        g.stroke();
      }
    }

    drawTrail(v1Notes, now, 7, 0.13);
    drawTrail(v1Notes, now, 1.8, 0.55);
    drawTrail(v2Notes, now, 6, 0.1);
    drawTrail(v2Notes, now, 1.5, 0.42);

    const s1 = sparkAt(v1Notes, now);
    const s2 = sparkAt(v2Notes, now);
    if (s1 && s2) {
      const blue = s1.seventh || s2.seventh;
      g.strokeStyle = blue
        ? "rgba(150, 198, 255, " + 0.28 * s1.fade * s2.fade + ")"
        : "rgba(255, 214, 160, " + 0.14 * s1.fade * s2.fade + ")";
      g.lineWidth = blue ? 1.7 : 1.1;
      g.beginPath();
      g.moveTo(s1.x, s1.y);
      g.lineTo(s2.x, s2.y);
      g.stroke();
    }

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const intensity = envAt(now, n) * glowMul;
      if (intensity < 0.025 || !n.lantern) continue;
      const p = posOf(n.lantern, now);
      const r = Math.max(4, (15 + intensity * 50) * n.glow);
      const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grd.addColorStop(0, hsla(n.hue, 95, 80, 0.9 * Math.min(1, intensity)));
      grd.addColorStop(0.2, hsla(n.hue, 88, 60, 0.36 * intensity));
      grd.addColorStop(0.55, hsla(n.hue, 80, 50, 0.1 * intensity));
      grd.addColorStop(1, hsla(n.hue, 80, 42, 0));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, TAU);
      g.fill();
      if (intensity > 0.25) {
        const r2 = r * 1.7;
        const grd2 = g.createRadialGradient(p.x, p.y, r * 0.3, p.x, p.y, r2);
        grd2.addColorStop(0, hsla(n.hue, 70, 60, 0.08 * intensity));
        grd2.addColorStop(1, hsla(n.hue, 70, 50, 0));
        g.fillStyle = grd2;
        g.beginPath();
        g.arc(p.x, p.y, r2, 0, TAU);
        g.fill();
      }
    }

    function drawSpark(s) {
      if (!s || s.fade < 0.02) return;
      const r = 16 * s.fade;
      const grd = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      grd.addColorStop(0, "rgba(255, 252, 240, " + 0.95 * s.fade + ")");
      grd.addColorStop(0.35, hsla(s.hue, 90, 68, 0.45 * s.fade));
      grd.addColorStop(1, hsla(s.hue, 90, 60, 0));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(s.x, s.y, r, 0, TAU);
      g.fill();
    }
    drawSpark(s1);
    drawSpark(s2);

    for (let i = 0; i < flies.length; i++) {
      const f = flies[i];
      const fx = f.x + Math.sin(now * f.speed + f.drift) * 26;
      const fy = f.y + Math.cos(now * f.speed * 0.75 + f.phase) * 16;
      const blink = Math.max(
        pulse * 0.55,
        Math.pow(Math.max(0, Math.sin(now * f.blink + f.phase)), 5)
      );
      if (blink < 0.04) continue;
      g.fillStyle = hsla(f.hue, 85, 68, blink * 0.85);
      g.beginPath();
      g.arc(fx, fy, f.rad, 0, TAU);
      g.fill();
    }

    for (let i = 0; i < gather.length; i++) {
      const m = gather[i];
      const age = now - m.t;
      if (age < 0 || age > m.life) continue;
      const u = age / m.life;
      const s = u * u * (3 - 2 * u);
      const x = m.x + (m.tx - m.x) * s;
      const y = m.y + (m.ty - m.y) * s;
      const alpha = Math.sin(Math.min(1, u) * Math.PI) * 0.75;
      g.fillStyle = "rgba(255, 220, 170, " + alpha + ")";
      g.beginPath();
      g.arc(x, y, 2.1, 0, TAU);
      g.fill();
    }

    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      const age = now - m.note.t;
      if (age < 0 || age > m.life || !m.note.lantern) continue;
      const p = posOf(m.note.lantern, now);
      const x = p.x + m.ox + m.vx * age;
      const y = p.y + m.oy + m.vy * age;
      const alpha = (1 - age / m.life) * Math.min(1, age * 4) * 0.7;
      g.fillStyle = hsla(206, 80, 72, alpha);
      g.beginPath();
      g.arc(x, y, m.size, 0, TAU);
      g.fill();
    }

    g.globalCompositeOperation = "source-over";

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const intensity = envAt(now, n);
      if (intensity < 0.08 || !n.lantern) continue;
      const p = posOf(n.lantern, now);
      g.strokeStyle = "rgba(40, 28, 18, 0.45)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(p.x, p.y - 9);
      g.lineTo(p.x, p.y - 3);
      g.stroke();
      const s = 3.2 + intensity * 2.4;
      g.fillStyle = hsla(n.hue, 80, 62, 0.35 + intensity * 0.5);
      g.beginPath();
      g.moveTo(p.x, p.y - s);
      g.lineTo(p.x + s * 0.62, p.y);
      g.lineTo(p.x, p.y + s * 1.15);
      g.lineTo(p.x - s * 0.62, p.y);
      g.closePath();
      g.fill();
      g.fillStyle = "rgba(255, 252, 242, " + (0.55 + intensity * 0.45) + ")";
      g.beginPath();
      g.arc(p.x, p.y, 1.5 + intensity, 0, TAU);
      g.fill();
    }

    for (let i = 0; i < birdEvents.length; i++) {
      const b = birdEvents[i];
      const age = now - b.t;
      if (age < 0 || age > 0.42) continue;
      const u = age / 0.42;
      const x = b.x + u * 64;
      const y = b.y - u * 30 - Math.sin(u * Math.PI) * 8;
      g.strokeStyle = "rgba(255, 232, 190, " + (1 - u) * 0.85 + ")";
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x - 7, y + 1);
      g.quadraticCurveTo(x, y - 5, x + 8, y + 1);
      g.stroke();
    }

    g.beginPath();
    g.moveTo(0, horizon);
    for (let x = 12; x <= W; x += 12) {
      const y =
        horizon +
        Math.sin(x * 0.02 + now * 1.25) * 2.1 +
        Math.sin(x * 0.006 + now * 0.65) * 3.2;
      g.lineTo(x, y);
    }
    g.strokeStyle = "rgba(168, 196, 206, 0.2)";
    g.lineWidth = 1.4;
    g.stroke();

    g.beginPath();
    g.moveTo(0, horizon + 2);
    for (let x = 0; x <= W; x += 14) {
      const y = horizon + 5 + Math.sin(x * 0.018 + now * 1.1) * 2;
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.closePath();
    const pond = g.createLinearGradient(0, horizon, 0, H);
    pond.addColorStop(0, "rgb(" + (20 + w * 8) + "," + (36 + w * 4) + ", 46)");
    pond.addColorStop(0.35, "#0c181e");
    pond.addColorStop(1, "#07090c");
    g.fillStyle = pond;
    g.fill();

    g.save();
    g.beginPath();
    g.rect(0, horizon, W, H - horizon);
    g.clip();

    if (seventh > 0.04) {
      const blue = g.createRadialGradient(W * 0.5, horizon + 130, 8, W * 0.5, horizon + 150, 320);
      blue.addColorStop(0, "rgba(90, 150, 230, " + seventh * 0.2 + ")");
      blue.addColorStop(1, "rgba(90, 150, 230, 0)");
      g.fillStyle = blue;
      g.fillRect(0, horizon, W, H - horizon);
    }

    if (pulse > 0.05) {
      const pg = g.createRadialGradient(W * 0.5, horizon + 70, 4, W * 0.5, horizon + 90, 80 + pulse * 220);
      pg.addColorStop(0, "rgba(210, 225, 230, " + pulse * 0.16 + ")");
      pg.addColorStop(1, "rgba(210, 225, 230, 0)");
      g.fillStyle = pg;
      g.beginPath();
      g.ellipse(W * 0.5, horizon + 78, 40 + pulse * 200, 12 + pulse * 36, 0, 0, TAU);
      g.fill();
    }

    for (let i = 0; i < pulses.length; i++) {
      const age = now - pulses[i].t;
      if (age < 0 || age > 2.3) continue;
      const alpha = (1 - age / 2.3) * 0.22 * pulses[i].visual;
      g.beginPath();
      g.ellipse(W * 0.5, horizon + 64 + age * 36, 16 + age * 170, 5 + age * 26, 0, 0, TAU);
      g.strokeStyle = "rgba(186, 210, 220, " + alpha + ")";
      g.lineWidth = 1.2;
      g.stroke();
    }

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const intensity = envAt(now, n);
      if (intensity < 0.06 || !n.lantern) continue;
      const p = posOf(n.lantern, now);
      const baseY = horizon + (horizon - p.y) * 0.36 + 18;
      const hgt = 8 + intensity * 46;
      for (let k = 0; k < 7; k++) {
        const yy = baseY + k * (hgt / 5.5);
        if (yy >= H - 2) break;
        const ox = Math.sin(yy * 0.07 + now * 2.1 + p.x * 0.01) * (2.5 + k * 0.7);
        const alpha = intensity * (0.16 - k * 0.018) * n.glow;
        if (alpha <= 0) continue;
        const ww = (16 + intensity * 26) * (1 - k / 9);
        g.strokeStyle = hsla(n.hue, 75, 68, alpha);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(p.x + ox - ww, yy);
        g.lineTo(p.x + ox + ww, yy);
        g.stroke();
      }
    }

    for (let k = 0; k < 9; k++) {
      const yy = horizon + 18 + k * 28;
      const ox = Math.sin(now * 1.7 + k * 0.8) * (4 + k);
      const alpha = 0.09 - k * 0.008;
      if (alpha <= 0) continue;
      g.strokeStyle = "rgba(236, 226, 200, " + alpha + ")";
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(moon.x + ox - (18 + k * 4), yy);
      g.lineTo(moon.x + ox + (10 + k * 2), yy);
      g.stroke();
    }

    for (let i = 0; i < glints.length; i++) {
      const gl = glints[i];
      const tw = 0.5 + 0.5 * Math.sin(now * gl.speed + gl.phase);
      if (tw < 0.72) continue;
      g.fillStyle = "rgba(220, 230, 236, " + (tw - 0.72) * 1.6 + ")";
      g.fillRect(gl.x, gl.y, 1.6, 1.6);
    }

    g.restore();

    for (let i = 0; i < petals.length; i++) {
      const p = petals[i];
      const age = now - p.spawn;
      if (age < 0 || age > p.life) continue;
      const x = p.x + p.vx * age + Math.sin(age * 2.1 + p.rot) * 10;
      const y = p.y + p.vy * age + 7 * age * age;
      if (y > H + 10) continue;
      const alpha = Math.min(1, age * 5) * Math.max(0, 1 - age / p.life) * 0.72;
      g.save();
      g.translate(x, y);
      g.rotate(p.rot + p.vr * age);
      g.fillStyle = hsla(p.hue, 68, 62, alpha);
      g.beginPath();
      g.ellipse(0, 0, p.size * 0.42, p.size, 0, 0, TAU);
      g.fill();
      g.restore();
    }

    const mist = g.createLinearGradient(0, horizon - 56, 0, horizon + 48);
    mist.addColorStop(0, "rgba(190, 204, 214, 0)");
    mist.addColorStop(0.55, "rgba(196, 208, 216, " + (0.05 + rms * 0.08 + pulse * 0.04) + ")");
    mist.addColorStop(1, "rgba(190, 204, 214, 0)");
    g.fillStyle = mist;
    g.fillRect(0, horizon - 56, W, 110);

    if (w > 0.2) {
      g.fillStyle = "rgba(255, 150, 80, " + w * 0.035 + ")";
      g.fillRect(0, 0, W, H);
    }

    const vig = g.createRadialGradient(W * 0.5, H * 0.42, H * 0.22, W * 0.5, H * 0.46, H * 0.72);
    vig.addColorStop(0, "rgba(0, 0, 0, 0)");
    vig.addColorStop(1, "rgba(0, 0, 0, 0.48)");
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);

    if (grainPattern) {
      g.save();
      g.globalAlpha = 0.038;
      g.fillStyle = grainPattern;
      g.fillRect(0, 0, W, H);
      g.restore();
    }

    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
  }

  draw(0);
  function loop() {
    const now = (ctx.currentTime - t0) / S;
    draw(now < 0 ? 0 : now);
    if (now < 15.6) requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}