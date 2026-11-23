export const title = "Aubade for a Falling Star";

const TAU = Math.PI * 2;

export function start({ audioContext, canvas, duration, random }) {
  const ctx = audioContext;
  const rnd = random;
  const startAt = ctx.currentTime + 0.04;
  const endAt = startAt + duration;
  const BEAT = 60 / 96;
  const beatTime = (b) => startAt + b * BEAT;
  const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const events = [];
  const pushEv = (t, type, midi, vel, pan) => {
    if (t >= -0.01 && t < duration - 0.04) {
      events.push({ t: Math.max(0, t), type, midi, vel, pan });
    }
  };

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;

  const impulse = (dur, decay) => {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * dur);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  };

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.85, ctx.currentTime);
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18;
  glue.knee.value = 18;
  glue.ratio.value = 5;
  glue.attack.value = 0.004;
  glue.release.value = 0.22;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.12;
  master.connect(glue);
  glue.connect(limiter);
  limiter.connect(ctx.destination);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  master.connect(analyser);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(2.6, 2.4);
  const revGain = ctx.createGain();
  revGain.gain.value = 0.34;
  reverb.connect(revGain);
  revGain.connect(master);

  const delay = ctx.createDelay(1);
  delay.delayTime.value = BEAT * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.33;
  const fbf = ctx.createBiquadFilter();
  fbf.type = "lowpass";
  fbf.frequency.value = 2300;
  delay.connect(fbf);
  fbf.connect(fb);
  fb.connect(delay);
  const dlyGain = ctx.createGain();
  dlyGain.gain.value = 0.18;
  delay.connect(dlyGain);
  dlyGain.connect(master);
  const dlyRev = ctx.createGain();
  dlyRev.gain.value = 0.22;
  delay.connect(dlyRev);
  dlyRev.connect(reverb);

  const env = (g, t, a, hold, r, peak) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.setValueAtTime(Math.max(peak, 0.0002), t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  };

  const bus = (node, pan = 0, rev = 0, dly = 0) => {
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (p.pan) p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p);
    p.connect(master);
    if (rev > 0) {
      const g = ctx.createGain();
      g.gain.value = rev;
      p.connect(g);
      g.connect(reverb);
    }
    if (dly > 0) {
      const g = ctx.createGain();
      g.gain.value = dly;
      p.connect(g);
      g.connect(delay);
    }
  };

  const noiseSrc = () => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
  };

  function kick(t, v = 1, pan = 0) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(43, t + 0.12);
    const g = ctx.createGain();
    env(g, t, 0.001, 0.015, 0.34, 0.85 * v);
    o.connect(g);
    bus(g, pan, 0.04, 0);
    o.start(t);
    o.stop(t + 0.5);
    const n = noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1400;
    const ng = ctx.createGain();
    env(ng, t, 0.001, 0, 0.03, 0.14 * v);
    n.connect(hp);
    hp.connect(ng);
    bus(ng, pan, 0.02, 0);
    n.start(t);
    n.stop(t + 0.08);
    pushEv(t - startAt, "kick", 38, v, pan);
  }

  function clap(t, v = 1, pan = 0) {
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1700;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.018;
      g.gain.linearRampToValueAtTime(0.42 * v, tt + 0.004);
      g.gain.exponentialRampToValueAtTime(0.06 * v, tt + 0.03);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    n.connect(bp);
    bp.connect(g);
    bus(g, pan, 0.28, 0.1);
    n.start(t);
    n.stop(t + 0.35);
    pushEv(t - startAt, "clap", 72, v, pan);
  }

  function hat(t, v = 0.4, open = false, pan = 0) {
    const n = noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7600;
    const g = ctx.createGain();
    env(g, t, 0.001, 0, open ? 0.16 : 0.035, 0.11 * v);
    n.connect(hp);
    hp.connect(g);
    bus(g, pan, 0.08, 0);
    n.start(t);
    n.stop(t + 0.25);
    pushEv(t - startAt, "hat", 84, v, pan);
  }

  function bass(t, m, v = 0.7, dur = 0.2, pan = 0) {
    const f = mf(m);
    const o1 = ctx.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = f / 2;
    const o3 = ctx.createOscillator();
    o3.type = "square";
    o3.frequency.value = f;
    const flt = ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.Q.value = 3.5;
    flt.frequency.setValueAtTime(Math.min(f * 6, 1200), t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(f * 1.3, 80), t + dur);
    const g3 = ctx.createGain();
    g3.gain.value = 0.16;
    const g = ctx.createGain();
    env(g, t, 0.006, 0.015, dur, 0.3 * v);
    o1.connect(flt);
    o3.connect(g3);
    g3.connect(flt);
    flt.connect(g);
    o2.connect(g);
    bus(g, pan, 0.02, 0);
    o1.start(t);
    o2.start(t);
    o3.start(t);
    o1.stop(t + dur + 0.15);
    o2.stop(t + dur + 0.15);
    o3.stop(t + dur + 0.15);
    pushEv(t - startAt, "bass", m, v, pan);
  }

  function pluck(t, m, v = 0.5, pan = 0, dur = 0.34, bright = 1, kind = "note") {
    const f = mf(m);
    const o1 = ctx.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = f;
    o1.detune.value = (rnd() - 0.5) * 9;
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = f * 2;
    const flt = ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.Q.value = 5;
    flt.frequency.setValueAtTime(Math.min(f * 8 * bright, 9000), t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(f * 1.2, 120), t + dur);
    const g2 = ctx.createGain();
    g2.gain.value = 0.2;
    const g = ctx.createGain();
    env(g, t, 0.004, 0.012, dur, 0.25 * v);
    o1.connect(flt);
    o2.connect(g2);
    g2.connect(flt);
    flt.connect(g);
    bus(g, pan, 0.16, 0.2);
    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.1);
    o2.stop(t + dur + 0.1);
    const n = noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3200;
    const ng = ctx.createGain();
    env(ng, t, 0.001, 0, 0.02, 0.05 * v);
    n.connect(hp);
    hp.connect(ng);
    bus(ng, pan, 0.04, 0);
    n.start(t);
    n.stop(t + 0.05);
    pushEv(t - startAt, kind, m, v, pan);
  }

  function bell(t, m, v = 0.5, pan = 0, dur = 1.4) {
    const f = mf(m);
    const car = ctx.createOscillator();
    car.type = "sine";
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = f * 3.007;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 2.3, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(f * 0.05, 1), t + dur * 0.55);
    mod.connect(mg);
    mg.connect(car.frequency);
    const bf = ctx.createBiquadFilter();
    bf.type = "lowpass";
    bf.frequency.value = 6800;
    const g = ctx.createGain();
    env(g, t, 0.003, 0.03, dur, 0.2 * v);
    car.connect(bf);
    bf.connect(g);
    bus(g, pan, 0.3, 0.16);
    const p = ctx.createOscillator();
    p.type = "sine";
    p.frequency.value = f * 2.01;
    const pg = ctx.createGain();
    env(pg, t, 0.003, 0.02, dur * 0.4, 0.08 * v);
    p.connect(pg);
    bus(pg, pan, 0.22, 0.1);
    car.start(t);
    mod.start(t);
    p.start(t);
    car.stop(t + dur + 0.1);
    mod.stop(t + dur + 0.1);
    p.stop(t + dur + 0.1);
    pushEv(t - startAt, "bell", m, v, pan);
  }

  function pad(t, midis, dur, v = 0.5, pan = 0) {
    const g = ctx.createGain();
    const hold = Math.max(0.05, dur - 1.7);
    env(g, t, 0.8, hold, 0.9, 0.15 * v);
    const flt = ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.Q.value = 0.7;
    flt.frequency.setValueAtTime(900, t);
    flt.frequency.linearRampToValueAtTime(1250, t + dur * 0.6);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = ctx.createGain();
    lg.gain.value = 160;
    lfo.connect(lg);
    lg.connect(flt.frequency);
    flt.connect(g);
    bus(g, pan, 0.26, 0.04);
    midis.forEach((m) => {
      const f = mf(m);
      const a = ctx.createOscillator();
      a.type = "sawtooth";
      a.frequency.value = f;
      a.detune.value = -6;
      const b = ctx.createOscillator();
      b.type = "sawtooth";
      b.frequency.value = f;
      b.detune.value = 6;
      const og = ctx.createGain();
      og.gain.value = 0.5;
      a.connect(og);
      b.connect(og);
      og.connect(flt);
      a.start(t);
      b.start(t);
      a.stop(t + dur + 1.2);
      b.stop(t + dur + 1.2);
    });
    lfo.start(t);
    lfo.stop(t + dur + 1.2);
    pushEv(t - startAt, "pad", midis[0], v, pan);
  }

  function riser(t, dur, v = 0.5) {
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(6500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * v, t + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp);
    bp.connect(g);
    bus(g, 0, 0.3, 0.1);
    n.start(t);
    n.stop(t + dur + 0.05);
    pushEv(t - startAt, "riser", 60, v, 0);
  }

  function impact(t, v = 1) {
    kick(t, v);
    const n = noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(9000, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    const g = ctx.createGain();
    env(g, t, 0.005, 0.1, 1.3, 0.3 * v);
    n.connect(lp);
    lp.connect(g);
    bus(g, 0, 0.5, 0.2);
    n.start(t);
    n.stop(t + 1.5);
    bell(t, 86, 0.7 * v, 0, 2.2);
    pushEv(t - startAt, "impact", 86, v, 0);
  }

  const chords = [
    { root: 38, quality: "min", pad: [57, 62, 65] },
    { root: 34, quality: "maj", pad: [58, 62, 65] },
    { root: 41, quality: "maj", pad: [57, 60, 65] },
    { root: 36, quality: "maj", pad: [55, 60, 64] },
    { root: 38, quality: "min", pad: [57, 62, 65] },
    { root: 38, quality: "min", pad: [57, 62, 65] },
  ];
  const chordTones = chords.map((c) => {
    const iv = c.quality === "min" ? [0, 3, 7, 12] : [0, 4, 7, 12];
    return iv.map((i) => c.root + 12 + i);
  });

  for (let bar = 0; bar < 6; bar++) {
    pad(beatTime(bar * 4), chords[bar].pad, BEAT * 4 + 0.4, bar === 0 ? 0.55 : 0.42, bar % 2 ? 0.06 : -0.06);
  }

  const patIntro = [[0, 0, 0.7, 0.5], [2, 12, 0.35, 0.4]];
  const patGroove = [[0, 0, 0.85, 0.22], [0.5, 12, 0.55, 0.12], [1, 0, 0.8, 0.16], [1.5, 7, 0.6, 0.12], [2, 0, 0.85, 0.18], [2.5, 10, 0.5, 0.12], [3, 0, 0.8, 0.15], [3.5, 12, 0.6, 0.14]];
  const patPeak = [[0, 0, 0.9, 0.2], [0.5, 12, 0.58, 0.1], [0.75, 0, 0.45, 0.09], [1, 7, 0.7, 0.14], [1.5, 12, 0.58, 0.1], [2, 0, 0.9, 0.18], [2.5, 10, 0.55, 0.1], [2.75, 0, 0.45, 0.09], [3, 0, 0.8, 0.15], [3.5, 7, 0.6, 0.12], [3.75, 12, 0.55, 0.1]];
  const patCalm = [[0, 0, 0.45, 0.9], [2, 12, 0.3, 0.6]];
  const patOut = [[0, 0, 0.75, 1.2], [2, 12, 0.35, 0.5]];
  const barBass = [patIntro, patGroove, patPeak, patCalm, patPeak, patOut];
  for (let bar = 0; bar < 6; bar++) {
    for (const [off, semi, v, d] of barBass[bar]) {
      bass(beatTime(bar * 4 + off), chords[bar].root + semi, v, d, off % 1 ? 0.18 : -0.1);
    }
  }

  const drumBar = (bar, style) => {
    const b = bar * 4;
    const K = (o, v = 1, p = 0) => kick(beatTime(b + o), v, p);
    const C = (o, v = 1, p = 0) => clap(beatTime(b + o), v, p);
    const H = (o, v = 0.4, open = false, p = 0) => hat(beatTime(b + o), v, open, p);
    if (style === "intro") {
      K(0, 0.55); K(2, 0.32); H(2.5, 0.22, true, 0.2);
    } else if (style === "groove") {
      [0, 1, 2, 3].forEach((o) => K(o, 0.88));
      C(1, 0.7); C(3, 0.8);
      H(0.5, 0.4, false, -0.3); H(1.5, 0.35, false, 0.3); H(2.5, 0.42, false, -0.3); H(3.5, 0.35, false, 0.3); H(3.75, 0.25, false, 0.1);
    } else if (style === "peak") {
      [0, 1, 2, 3].forEach((o) => K(o, 0.95));
      K(2.75, 0.45);
      C(1, 0.8); C(3, 0.9);
      [0.5, 0.75, 1.5, 1.75, 2.5, 2.75, 3.5, 3.75].forEach((o, i) => H(o, i % 2 ? 0.3 : 0.38, false, i % 2 ? 0.3 : -0.3));
    } else if (style === "break") {
      K(0, 0.32); K(2, 0.24);
      [0.5, 1.5, 2.5, 3.5].forEach((o) => H(o, 0.16, false, o % 1 ? 0.2 : -0.2));
    } else if (style === "peak2") {
      [0, 1, 2, 3].forEach((o) => K(o, 1));
      K(1.75, 0.42); K(3.75, 0.5);
      C(1, 0.85); C(3, 0.9); C(3.5, 0.45);
      [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75].forEach((o, i) => H(o, i % 2 ? 0.26 : 0.34, false, i % 2 ? 0.35 : -0.35));
      [0.5, 1.5, 2.5, 3.5].forEach((o) => H(o, 0.3, true, o % 1 ? 0.4 : -0.4));
    } else if (style === "out") {
      K(0, 0.45); K(2, 0.28);
      H(0.5, 0.18, false, -0.2); H(1.5, 0.16, false, 0.2); H(2.5, 0.22, true, 0);
    }
  };
  ["intro", "groove", "peak", "break", "peak2", "out"].forEach((s, i) => drumBar(i, s));

  for (const bar of [1, 2, 4]) {
    const tones = chordTones[bar];
    const steps = bar === 1 ? 8 : 16;
    const inc = bar === 1 ? 0.5 : 0.25;
    for (let e = 0; e < steps; e++) {
      const off = e * inc;
      const idx = [0, 2, 1, 3, 2, 3, 1, 2][e % 8];
      const m = tones[idx] + (e % 8 >= 4 ? 12 : 0);
      const v = e % 4 === 0 ? 0.4 : e % 2 === 0 ? 0.3 : 0.2;
      pluck(beatTime(bar * 4 + off), m, v, e % 2 ? 0.32 : -0.32, 0.16, bar === 4 ? 1.1 : 0.85, "spark");
    }
  }

  const hook = [
    [1.0, 74, 0.5, -0.18],
    [2.0, 77, 0.46, 0.12],
    [3.0, 81, 0.5, 0.24],
    [3.5, 86, 0.4, 0.3],
  ];
  for (const [b, m, v, p] of hook) bell(beatTime(b), m, v, p, 1.5);

  const lead1 = [
    [4.0, 74, 0.55, 0.3, -0.15], [4.5, 77, 0.5, 0.28, 0.05], [5.0, 81, 0.55, 0.28, 0.2], [5.5, 86, 0.6, 0.42, 0.3],
    [6.0, 84, 0.5, 0.3, -0.2], [6.5, 81, 0.5, 0.3, 0], [7.0, 77, 0.55, 0.34, 0.15], [7.5, 79, 0.45, 0.26, -0.25],
    [8.0, 81, 0.6, 0.36, 0.25], [8.5, 84, 0.52, 0.3, -0.1], [9.0, 86, 0.6, 0.4, 0.15], [9.5, 84, 0.5, 0.28, -0.05],
    [10.0, 81, 0.55, 0.32, 0.1], [10.5, 79, 0.45, 0.26, -0.15], [11.0, 77, 0.58, 0.36, 0.05], [11.5, 76, 0.45, 0.28, -0.2],
  ];
  for (const [b, m, v, d, p] of lead1) pluck(beatTime(b), m, v, p, d, 1, "note");

  const lead2 = [
    [16.0, 86, 0.6, 0.3, 0.2], [16.5, 84, 0.52, 0.26, -0.1], [17.0, 81, 0.58, 0.3, 0.05], [17.5, 84, 0.5, 0.26, 0.2],
    [18.0, 86, 0.62, 0.38, -0.2], [18.5, 84, 0.5, 0.24, 0.1], [19.0, 81, 0.56, 0.3, -0.05], [19.5, 79, 0.48, 0.26, -0.2], [19.75, 77, 0.42, 0.22, 0.15],
  ];
  for (const [b, m, v, d, p] of lead2) pluck(beatTime(b), m, v, p, d, 1.1, "note");

  const breakBells = [
    [12.5, 74, 0.5, -0.2],
    [13.5, 77, 0.45, 0.1],
    [14.5, 81, 0.5, 0.25],
    [15.5, 84, 0.42, -0.1],
  ];
  for (const [b, m, v, p] of breakBells) bell(beatTime(b), m, v, p, 1.4);

  const outBells = [
    [20.5, 74, 0.4, -0.15],
    [21.0, 81, 0.44, 0.15],
  ];
  for (const [b, m, v, p] of outBells) bell(beatTime(b), m, v, p, 1.8);

  riser(beatTime(3.0), BEAT * 1.5, 0.3);
  riser(beatTime(14.0), BEAT * 2.5, 0.8);
  impact(beatTime(22), 1);

  master.gain.setValueAtTime(0.85, endAt - 0.55);
  master.gain.exponentialRampToValueAtTime(0.0001, endAt - 0.03);
  events.sort((a, b) => a.t - b.t);

  const g2d = canvas.getContext("2d");
  const W = 1080;
  const H = 1350;
  const cx = W / 2;
  const cy = H * 0.47;
  canvas.width = W;
  canvas.height = H;
  g2d.lineCap = "round";
  g2d.lineJoin = "round";

  const stars = [];
  for (let i = 0; i < 150; i++) {
    stars.push({ x: rnd(), y: rnd(), r: 0.4 + rnd() * 1.5, p: rnd() * TAU, s: 0.4 + rnd() * 1.2 });
  }

  const hueStops = [[0, 224], [2.5, 190], [5, 288], [7.5, 214], [10, 42], [12.5, 226], [15, 224]];
  const hueAt = (t) => {
    if (t <= 0) return hueStops[0][1];
    for (let i = 1; i < hueStops.length; i++) {
      if (t <= hueStops[i][0]) {
        const [t0, h0] = hueStops[i - 1];
        const [t1, h1] = hueStops[i];
        return h0 + (h1 - h0) * ((t - t0) / (t1 - t0));
      }
    }
    return hueStops[hueStops.length - 1][1];
  };

  const notePos = (m, t) => ({
    x: 145 + (t / duration) * 790,
    y: 830 - (m - 48) * 7.2,
  });

  const activePCs = (now) => {
    const bar = Math.min(5, Math.floor(now / (BEAT * 4)));
    const set = new Set(chordTones[bar].map((m) => ((m % 12) + 12) % 12));
    for (const p of trail) {
      if (now - p.t < 1.6) set.add(((p.midi % 12) + 12) % 12);
    }
    return set;
  };

  const parts = [];
  const rings = [];
  const trail = [];
  let evIdx = 0;
  let lastKick = -10;
  let flash = 0;
  let prevNow = 0;
  let first = true;
  let raf = 0;

  const fdata = new Uint8Array(analyser.frequencyBinCount);
  const tdata = new Uint8Array(analyser.fftSize);

  function spawn(e) {
    const t = e.t;
    const h = hueAt(t);
    const hue = (h + (e.midi % 12) * 8) % 360;
    if (e.type === "kick") {
      lastKick = t;
      rings.push({ t, r: 90, vr: 360, w: 6, hue: h + 18, alpha: 0.8 });
    } else if (e.type === "clap") {
      for (let i = 0; i < 12; i++) {
        parts.push({ kind: "ray", t, ang: rnd() * TAU, spd: 0.6 + rnd() * 1.4, rad: 250 + rnd() * 80, life: 0.5 + rnd() * 0.3, hue: h + 40 });
      }
    } else if (e.type === "hat") {
      for (let i = 0; i < 3; i++) {
        parts.push({ kind: "dot", t, x: cx + (rnd() - 0.5) * 520, y: H * 0.28 + rnd() * 220, vx: (rnd() - 0.5) * 30, vy: -20 - rnd() * 30, life: 0.4 + rnd() * 0.3, hue: h + 80, size: 1.5 + rnd() * 2 });
      }
    } else if (e.type === "bass") {
      parts.push({ kind: "orb", t, midi: e.midi, vel: e.vel, life: 1.1, hue: h - 20 });
    } else if (e.type === "pad") {
      rings.push({ t, r: 120, vr: 120, w: 3, hue: h, alpha: 0.25, soft: true });
    } else if (e.type === "riser") {
      for (let i = 0; i < 26; i++) {
        parts.push({ kind: "dot", t: t + i * 0.09, x: W * 0.2 + rnd() * W * 0.6, y: H * 0.75 - rnd() * H * 0.45, vx: (rnd() - 0.5) * 20, vy: -40 - rnd() * 60, life: 0.9 + rnd() * 0.5, hue: h + 60, size: 1.5 + rnd() * 2.5 });
      }
    } else if (e.type === "impact") {
      lastKick = t;
      flash = 1;
      rings.push({ t, r: 120, vr: 640, w: 12, hue: 45, alpha: 1 });
      rings.push({ t, r: 60, vr: 420, w: 6, hue: 18, alpha: 0.9 });
    } else if (e.type === "note" || e.type === "bell") {
      const p = notePos(e.midi, t);
      trail.push({ t, x: p.x, y: p.y, midi: e.midi, hue, size: 3 + e.vel * 7 });
      parts.push({ kind: "note", t, x: p.x, y: p.y, vx: (e.pan || 0) * 40, vy: -24, life: 1.35, hue, size: 3 + e.vel * 7 });
      rings.push({ t, r: 18, vr: 120, w: 2.5, hue, alpha: 0.35 });
    } else if (e.type === "spark") {
      const pc = ((e.midi % 12) + 12) % 12;
      parts.push({ kind: "spark", t, ang: (pc / 12) * TAU, rad: 320 + pc * 7, spd: 0.8 + rnd() * 0.8, life: 0.7, hue: (h + pc * 20) % 360, size: 1.5 + e.vel * 3 });
    }
  }

  function frame() {
    const now = Math.min(duration, Math.max(0, ctx.currentTime - startAt));
    const dt = Math.min(0.05, Math.max(0, now - prevNow));
    prevNow = now;

    while (evIdx < events.length && events[evIdx].t <= now) spawn(events[evIdx++]);

    analyser.getByteFrequencyData(fdata);
    analyser.getByteTimeDomainData(tdata);
    let low = 0;
    for (let i = 1; i < 24; i++) low += fdata[i];
    low /= 23 * 255;
    let sum = 0;
    for (let i = 0; i < fdata.length; i++) sum += fdata[i];
    const avg = sum / (fdata.length * 255);
    let rms = 0;
    for (let i = 0; i < tdata.length; i++) {
      const v = (tdata[i] - 128) / 128;
      rms += v * v;
    }
    rms = Math.sqrt(rms / tdata.length);
    const level = Math.min(1, Math.max(0.05, rms * 2.4));
    const h = hueAt(now);
    const pulse = Math.exp(-Math.max(0, now - lastKick) * 4.5);
    flash = Math.max(0, flash - dt * 1.8);

    g2d.globalCompositeOperation = "source-over";
    if (first) {
      g2d.fillStyle = "#04060e";
      g2d.fillRect(0, 0, W, H);
      first = false;
    }
    g2d.fillStyle = "rgba(4,6,14,0.32)";
    g2d.fillRect(0, 0, W, H);

    const bg = g2d.createRadialGradient(cx, cy, 60, cx, cy, 880);
    bg.addColorStop(0, `hsla(${h},80%,16%,0.5)`);
    bg.addColorStop(0.55, `hsla(${(h + 24) % 360},75%,8%,0.22)`);
    bg.addColorStop(1, "rgba(2,3,8,0)");
    g2d.fillStyle = bg;
    g2d.fillRect(0, 0, W, H);

    g2d.save();
    g2d.translate(Math.sin(now * 93) * 7 * pulse, Math.cos(now * 71) * 6 * pulse);

    for (const s of stars) {
      const a = 0.12 + 0.22 * (0.5 + 0.5 * Math.sin(now * s.s + s.p));
      g2d.fillStyle = `hsla(${(h + 180) % 360},70%,82%,${a})`;
      g2d.beginPath();
      g2d.arc(s.x * W, s.y * H, s.r, 0, TAU);
      g2d.fill();
    }

    g2d.save();
    g2d.translate(cx, cy);
    g2d.rotate(now * 0.05);
    for (let r = 210; r <= 390; r += 90) {
      g2d.strokeStyle = `hsla(${h},70%,70%,${r === 300 ? 0.16 : 0.09})`;
      g2d.lineWidth = 1;
      g2d.beginPath();
      g2d.arc(0, 0, r, 0, TAU);
      g2d.stroke();
    }
    const active = activePCs(now);
    for (let pc = 0; pc < 12; pc++) {
      const on = active.has(pc);
      const a0 = (pc / 12) * TAU - TAU / 4;
      const a1 = a0 + (TAU / 12) * 0.72;
      g2d.strokeStyle = on ? `hsla(${(pc * 30 + h) % 360},95%,66%,0.85)` : `hsla(${h},45%,60%,0.12)`;
      g2d.lineWidth = on ? 9 : 3;
      g2d.beginPath();
      g2d.arc(0, 0, 300, a0, a1);
      g2d.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU - TAU / 4;
      g2d.strokeStyle = `hsla(${h},60%,80%,0.08)`;
      g2d.lineWidth = 1;
      g2d.beginPath();
      g2d.moveTo(Math.cos(a) * 210, Math.sin(a) * 210);
      g2d.lineTo(Math.cos(a) * 390, Math.sin(a) * 390);
      g2d.stroke();
    }
    g2d.restore();

    g2d.save();
    g2d.translate(cx, cy);
    g2d.globalCompositeOperation = "lighter";
    const N = 120;
    const R0 = 248;
    for (let i = 0; i < N; i++) {
      const idx = 1 + Math.floor(Math.pow(i / N, 1.65) * fdata.length * 0.7);
      const v = fdata[idx] / 255;
      const ang = (i / N) * TAU - TAU / 4 + now * 0.04;
      const len = v * (150 + 90 * level);
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      g2d.strokeStyle = `hsla(${(h + i * 2.4) % 360},95%,${42 + v * 32}%,${0.16 + v * 0.55})`;
      g2d.lineWidth = 2.3;
      g2d.beginPath();
      g2d.moveTo(c * R0, s * R0);
      g2d.lineTo(c * (R0 + len), s * (R0 + len));
      g2d.stroke();
    }
    g2d.restore();

    g2d.globalCompositeOperation = "lighter";
    for (let layer = 0; layer < 3; layer++) {
      g2d.beginPath();
      const yB = H * 0.82 + layer * 26;
      for (let x = 0; x <= W; x += 7) {
        const i = Math.floor((x / W) * (tdata.length - 1));
        const vv = (tdata[i] - 128) / 128;
        const amp = (24 + 80 * level) * (1 - layer * 0.18);
        const y = yB + vv * amp + Math.sin(x * 0.014 + now * (1.2 + layer * 0.35) + layer * 2) * 7;
        if (x === 0) g2d.moveTo(x, y);
        else g2d.lineTo(x, y);
      }
      g2d.strokeStyle = `hsla(${(h + layer * 42) % 360},95%,${62 - layer * 6}%,${0.42 - layer * 0.1})`;
      g2d.lineWidth = 2.6 - layer * 0.5;
      g2d.stroke();
    }

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      const age = now - p.t;
      if (age > p.life || age < 0) {
        parts.splice(i, 1);
        continue;
      }
      const k = age / p.life;
      const al = 1 - k;
      if (p.kind === "dot") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        g2d.fillStyle = `hsla(${p.hue},95%,70%,${al * 0.8})`;
        g2d.beginPath();
        g2d.arc(p.x, p.y, p.size, 0, TAU);
        g2d.fill();
      } else if (p.kind === "ray") {
        p.ang += p.spd * dt;
        p.rad += 180 * dt;
        const x = cx + Math.cos(p.ang) * p.rad;
        const y = cy + Math.sin(p.ang) * p.rad;
        g2d.strokeStyle = `hsla(${p.hue},95%,70%,${al * 0.7})`;
        g2d.lineWidth = 1.5;
        g2d.beginPath();
        g2d.moveTo(x, y);
        g2d.lineTo(cx + Math.cos(p.ang) * (p.rad + 16), cy + Math.sin(p.ang) * (p.rad + 16));
        g2d.stroke();
      } else if (p.kind === "orb") {
        const pc = ((p.midi % 12) + 12) % 12;
        const ang = (pc / 12) * TAU + now * 0.25;
        const rad = 330 + (p.midi % 12) * 6;
        const x = cx + Math.cos(ang) * rad;
        const y = cy + Math.sin(ang) * rad;
        const r = 3 + p.vel * 10 * (1 - k * 0.5);
        g2d.fillStyle = `hsla(${p.hue},95%,62%,${al * 0.5})`;
        g2d.beginPath();
        g2d.arc(x, y, r, 0, TAU);
        g2d.fill();
      } else if (p.kind === "note") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy *= Math.pow(0.25, dt);
        g2d.fillStyle = `hsla(${p.hue},100%,74%,${al})`;
        g2d.beginPath();
        g2d.arc(p.x, p.y, p.size * (1 - k * 0.4), 0, TAU);
        g2d.fill();
        g2d.strokeStyle = `hsla(${p.hue},100%,70%,${al * 0.5})`;
        g2d.lineWidth = 1.5;
        g2d.beginPath();
        g2d.moveTo(p.x, p.y);
        g2d.lineTo(p.x - p.vx * 0.12, p.y - p.vy * 0.12);
        g2d.stroke();
      } else if (p.kind === "spark") {
        p.ang += p.spd * dt;
        p.rad += 40 * dt;
        const x = cx + Math.cos(p.ang) * p.rad;
        const y = cy + Math.sin(p.ang) * p.rad;
        g2d.fillStyle = `hsla(${p.hue},95%,72%,${al * 0.75})`;
        g2d.beginPath();
        g2d.arc(x, y, p.size, 0, TAU);
        g2d.fill();
      }
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      const age = now - r.t;
      const life = r.soft ? 1.8 : 1.1;
      if (age > life || age < 0) {
        rings.splice(i, 1);
        continue;
      }
      r.r += r.vr * dt;
      const al = (1 - age / life) * (r.alpha ?? 0.5);
      g2d.strokeStyle = `hsla(${r.hue},95%,68%,${al})`;
      g2d.lineWidth = Math.max(0.5, r.w * (1 - (age / life) * 0.6));
      g2d.beginPath();
      g2d.arc(cx, cy, r.r, 0, TAU);
      g2d.stroke();
    }

    const liveTrail = trail.filter((p) => now - p.t < 2.3);
    for (let i = 1; i < liveTrail.length; i++) {
      const p0 = liveTrail[i - 1];
      const p1 = liveTrail[i];
      const al = Math.max(0, 1 - (now - p1.t) / 2.3);
      g2d.strokeStyle = `hsla(${p1.hue},95%,68%,${al * 0.75})`;
      g2d.lineWidth = 2 + (p1.size || 4) * 0.3;
      g2d.beginPath();
      g2d.moveTo(p0.x, p0.y);
      g2d.lineTo(p1.x, p1.y);
      g2d.stroke();
    }
    for (const p of liveTrail) {
      const al = Math.max(0, 1 - (now - p.t) / 2.3);
      g2d.fillStyle = `hsla(${p.hue},100%,74%,${al})`;
      g2d.beginPath();
      g2d.arc(p.x, p.y, 2.4, 0, TAU);
      g2d.fill();
    }

    if (flash > 0) {
      g2d.fillStyle = `hsla(45,100%,85%,${flash * 0.28})`;
      g2d.fillRect(-20, -20, W + 40, H + 40);
    }

    const vg = g2d.createRadialGradient(cx, H * 0.5, H * 0.28, cx, H * 0.5, H * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g2d.fillStyle = vg;
    g2d.fillRect(0, 0, W, H);

    g2d.restore();

    g2d.globalCompositeOperation = "source-over";
    g2d.fillStyle = "hsla(0,0%,100%,0.5)";
    g2d.font = "500 19px ui-sans-serif, system-ui, sans-serif";
    g2d.textAlign = "center";
    g2d.fillText(title.toUpperCase(), cx, 56);

    const py = H - 46;
    g2d.strokeStyle = "hsla(0,0%,100%,0.14)";
    g2d.lineWidth = 1;
    g2d.beginPath();
    g2d.moveTo(120, py);
    g2d.lineTo(960, py);
    g2d.stroke();
    g2d.strokeStyle = `hsla(${h},90%,65%,0.8)`;
    g2d.beginPath();
    g2d.moveTo(120, py);
    g2d.lineTo(120 + (now / duration) * 840, py);
    g2d.stroke();
    for (let s = 0; s <= 6; s++) {
      const x = 120 + (s / 6) * 840;
      g2d.fillStyle = "hsla(0,0%,100%,0.22)";
      g2d.fillRect(x - 0.5, py - 3, 1, 6);
    }

    if (now < duration + 0.08) raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);
}
