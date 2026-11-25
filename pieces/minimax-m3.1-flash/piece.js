/* ESCAPEMENT — a 15-second clockwork baroque miniature */

export const title = "Escapement";

export function start({ audioContext, canvas, duration = 15, random = Math.random }) {
  const A = audioContext;
  if (!A || !canvas) return { stop() {} };
  const g = canvas.getContext("2d");
  if (!g) return { stop() {} };

  const W = canvas.width || 1080;
  const H = canvas.height || 1350;
  const DUR = Math.max(1, Math.min(duration || 15, 15));

  /* ---------- deterministic randomness ---------- */
  const seed = typeof random === "function" ? random() : Math.random();
  let _s = (Math.floor(seed * 4294967295) >>> 0) || 1;
  const rnd = () => {
    _s = (_s + 0x6D2B79F5) | 0;
    let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rr = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[(rnd() * arr.length) | 0];

  /* ================= AUDIO ================= */
  if (A.state === "suspended" && A.resume) A.resume().catch(() => {});

  const BEAT = 0.6, BAR = 4 * BEAT;              // 100 bpm, 4/4
  const SC = Math.max(0.4, Math.min(1, (DUR - 0.25) / 14.4));
  const t0 = A.currentTime + 0.12;
  const mt = (sec) => t0 + sec * SC;              // musical -> absolute
  const md = (sec) => sec * SC;                   // musical -> real duration

  const master = A.createGain(); master.gain.value = 0.82;
  const comp = A.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 24; comp.ratio.value = 3.2;
  comp.attack.value = 0.005; comp.release.value = 0.22;
  const analyser = A.createAnalyser();
  analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.72;
  master.connect(comp); comp.connect(analyser); analyser.connect(A.destination);

  const dry = A.createGain(); dry.gain.value = 1; dry.connect(master);

  // convolution hall
  const irLen = Math.floor(A.sampleRate * 2.9);
  const ir = A.createBuffer(2, irLen, A.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) {
      const x = i / irLen;
      d[i] = (rnd() * 2 - 1) * Math.pow(1 - x, 2.4) * 0.62;
    }
    [0.009, 0.017, 0.029, 0.043, 0.061, 0.083].forEach((tt, k) => {
      const idx = Math.floor(tt * A.sampleRate * (ch ? 1.09 : 1));
      if (idx < irLen) d[idx] += (0.46 - k * 0.06) * (ch ? -1 : 1);
    });
  }
  const conv = A.createConvolver(); conv.buffer = ir;
  const revRet = A.createGain(); revRet.gain.value = 0.85;
  const revSend = A.createGain(); revSend.gain.value = 1;
  revSend.connect(conv); conv.connect(revRet); revRet.connect(master);

  // dotted-eighth delay for the flute
  const dIn = A.createGain(); dIn.gain.value = 1;
  const delay = A.createDelay(1.5); delay.delayTime.value = 0.46875;
  const dFb = A.createGain(); dFb.gain.value = 0.34;
  const dFilt = A.createBiquadFilter(); dFilt.type = "lowpass"; dFilt.frequency.value = 2300;
  const dOut = A.createGain(); dOut.gain.value = 0.30;
  dIn.connect(delay); delay.connect(dFilt); dFilt.connect(dFb); dFb.connect(delay);
  delay.connect(dOut); dOut.connect(master); dOut.connect(revSend);

  const noiseBuf = A.createBuffer(1, A.sampleRate * 2, A.sampleRate);
  {
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const events = []; // {mt, kind, midi, vel} for the visuals

  /* ---------- voices ---------- */
  function pluck(vt, midi, amp, dur, o) {
    o = o || {};
    const t = mt(vt), d = md(dur), f = mtof(midi);
    const env = A.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(amp, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const filt = A.createBiquadFilter();
    filt.type = "lowpass"; filt.Q.value = 0.8;
    const bright = o.bright || 3200;
    filt.frequency.setValueAtTime(bright, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(380, bright * 0.2), t + Math.min(0.4, d));
    const o1 = A.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = f;
    const o2 = A.createOscillator(); o2.type = "square"; o2.frequency.value = f; o2.detune.value = 7;
    const g2 = A.createGain(); g2.gain.value = 0.22;
    const o3 = A.createOscillator(); o3.type = "triangle"; o3.frequency.value = f * 2;
    const g3 = A.createGain(); g3.gain.value = 0.18;
    o1.connect(filt); o2.connect(g2); g2.connect(filt); o3.connect(g3); g3.connect(filt);
    filt.connect(env);
    const ns = A.createBufferSource(); ns.buffer = noiseBuf;
    const nf = A.createBiquadFilter(); nf.type = "bandpass";
    nf.frequency.value = Math.min(9200, f * 4); nf.Q.value = 1.1;
    const ng = A.createGain();
    ng.gain.setValueAtTime(amp * (o.click || 0.55), t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    ns.connect(nf); nf.connect(ng); ng.connect(env);
    env.connect(dry);
    const s = A.createGain(); s.gain.value = o.rev != null ? o.rev : 0.32;
    env.connect(s); s.connect(revSend);
    const st = t + d + 0.08;
    o1.start(t); o2.start(t); o3.start(t); ns.start(t);
    o1.stop(st); o2.stop(st); o3.stop(st); ns.stop(t + 0.12);
  }

  function flute(vt, midi, dur, amp) {
    const t = mt(vt), d = md(dur), f = mtof(midi);
    const amp2 = amp || 0.15;
    const env = A.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(amp2, t + 0.075);
    env.gain.setValueAtTime(amp2, t + d * 0.85);
    env.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
    const lp = A.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 4600; lp.Q.value = 0.5;
    const o = A.createOscillator(); o.type = "sine"; o.frequency.value = f;
    const o2 = A.createOscillator(); o2.type = "sine"; o2.frequency.value = f * 2;
    const g2 = A.createGain(); g2.gain.value = 0.15;
    const o3 = A.createOscillator(); o3.type = "triangle"; o3.frequency.value = f * 3;
    const g3 = A.createGain(); g3.gain.value = 0.045;
    const lfo = A.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 5.2;
    const lg = A.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(9, t + Math.min(1.0, d * 0.6));
    lfo.connect(lg); lg.connect(o.detune); lg.connect(o2.detune);
    const ns = A.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
    const nf = A.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = f * 1.7; nf.Q.value = 0.8;
    const ng = A.createGain(); ng.gain.value = 0.05;
    ns.connect(nf); nf.connect(ng); ng.connect(env);
    o.connect(env); o2.connect(g2); g2.connect(env); o3.connect(g3); g3.connect(env);
    env.connect(lp); lp.connect(dry);
    const s = A.createGain(); s.gain.value = 0.30; lp.connect(s); s.connect(revSend);
    const dd = A.createGain(); dd.gain.value = 0.22; lp.connect(dd); dd.connect(dIn);
    const st = t + d + 0.25;
    o.start(t); o2.start(t); o3.start(t); lfo.start(t); ns.start(t);
    o.stop(st); o2.stop(st); o3.stop(st); lfo.stop(st); ns.stop(st);
  }

  function bow(vt, midi, dur, amp) {
    const t = mt(vt), d = md(dur), f = mtof(midi);
    const env = A.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(amp, t + 0.13);
    env.gain.setValueAtTime(amp, t + d * 0.8);
    env.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.12);
    const lp = A.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1500; lp.Q.value = 0.6;
    const lfo = A.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 4.6;
    const lg = A.createGain(); lg.gain.value = 7;
    lfo.connect(lg);
    for (const det of [-6, 6]) {
      const o = A.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = det;
      lg.connect(o.detune);
      const og = A.createGain(); og.gain.value = 0.3;
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + d + 0.2);
    }
    lp.connect(env); env.connect(dry);
    const s = A.createGain(); s.gain.value = 0.5; env.connect(s); s.connect(revSend);
    lfo.start(t); lfo.stop(t + d + 0.2);
  }

  function pad(vt, midis, dur, amp, cut) {
    const t = mt(vt), d = md(dur);
    const env = A.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(amp, t + Math.min(1.5, d * 0.45));
    env.gain.setValueAtTime(amp, t + d * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const lp = A.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cut || 1000; lp.Q.value = 0.4;
    lp.connect(env); env.connect(dry);
    const s = A.createGain(); s.gain.value = 0.55; env.connect(s); s.connect(revSend);
    for (const m of midis) {
      for (const det of [-8, 0, 8]) {
        const o = A.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = det;
        const og = A.createGain(); og.gain.value = 0.14;
        o.connect(og); og.connect(lp); o.start(t); o.stop(t + d + 0.2);
      }
    }
  }

  function timp(vt, midi, amp) {
    const t = mt(vt), f = mtof(midi);
    const env = A.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(amp, t + 0.018);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    const o = A.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(f * 1.55, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.2);
    o.connect(env);
    const ns = A.createBufferSource(); ns.buffer = noiseBuf;
    const nf = A.createBiquadFilter(); nf.type = "lowpass"; nf.frequency.value = 420;
    const ng = A.createGain();
    ng.gain.setValueAtTime(amp * 0.45, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    ns.connect(nf); nf.connect(ng); ng.connect(env);
    env.connect(dry);
    const s = A.createGain(); s.gain.value = 0.28; env.connect(s); s.connect(revSend);
    o.start(t); o.stop(t + 1.7); ns.start(t); ns.stop(t + 0.25);
  }

  function bell(vt, midi, amp, dur) {
    const t = mt(vt), f = mtof(midi);
    const car = A.createOscillator(); car.type = "sine"; car.frequency.value = f;
    const mod = A.createOscillator(); mod.type = "sine"; mod.frequency.value = f * 3.01;
    const mg = A.createGain();
    mg.gain.setValueAtTime(f * 3.4, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.04, t + 1.1);
    mod.connect(mg); mg.connect(car.frequency);
    const env = A.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(amp, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(env); env.connect(dry);
    const s = A.createGain(); s.gain.value = 0.6; env.connect(s); s.connect(revSend);
    car.start(t); mod.start(t); car.stop(t + dur + 0.1); mod.stop(t + dur + 0.1);
  }

  function tick(vt, amp) {
    const t = mt(vt);
    const ns = A.createBufferSource(); ns.buffer = noiseBuf;
    const f = A.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2700; f.Q.value = 3.2;
    const env = A.createGain();
    env.gain.setValueAtTime(amp, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    ns.connect(f); f.connect(env); env.connect(dry);
    const s = A.createGain(); s.gain.value = 0.25; env.connect(s); s.connect(revSend);
    const o = A.createOscillator(); o.type = "triangle"; o.frequency.value = 1450;
    const og = A.createGain();
    og.gain.setValueAtTime(amp * 0.32, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(og); og.connect(dry);
    ns.start(t); ns.stop(t + 0.06); o.start(t); o.stop(t + 0.05);
  }

  /* ---------- the score ---------- */
  const OST = {
    Am: [57, 64, 69, 72, 76, 72, 69, 64],
    AmHi: [57, 64, 69, 72, 76, 81, 76, 72],
    Dm: [50, 57, 62, 65, 69, 65, 62, 57],
    DmHi: [62, 69, 74, 77, 81, 77, 74, 69],
    DmEnd: [50, 57, 62, 65, 69, 77, 74, 69],
    Gm: [55, 62, 67, 70, 74, 70, 67, 62],
  };
  const BARS = ["Am", "Dm", "Gm", "DmHi", "AmHi", "DmEnd"];
  const MEL = [
    [1, 2, 69, 2], [2, 0, 67, 1], [2, 1, 65, 1], [2, 2, 74, 1], [2, 3, 76, 1],
    [3, 0, 77, 2], [3, 2, 76, 1], [3, 3, 74, 1],
    [4, 0, 74, 1], [4, 1, 77, 1], [4, 2, 81, 1], [4, 3, 79, 1],
    [5, 0, 77, 2], [5, 2, 76, 1], [5, 3, 74, 1],
  ];
  const CNT = [[3, 3, 71, 1], [4, 0, 69, 3], [4, 3, 67, 1], [5, 0, 64, 2], [5, 2, 62, 2]];
  const BASS = [
    [1, 0, 38, 1.4], [1, 2, 45, 1.4], [2, 0, 43, 1.4], [2, 2, 46, 1.4],
    [3, 0, 38, 1.4], [3, 2, 45, 1.4], [4, 0, 45, 1.4], [4, 2, 52, 1.4], [5, 0, 38, 3.6],
  ];
  const TIMP = [[3, 0, 73, 0.20], [4, 0, 73, 0.26], [4, 2, 73, 0.17], [5, 0, 73, 0.30]];
  const BELLS = [[3, 2, 81, 0.075, 2.8], [4, 2, 86, 0.062, 2.4], [5, 0, 86, 0.055, 2.6]];
  const T = (bar, beat) => bar * BAR + beat * BEAT;

  // bars of harpsichord
  for (let b = 0; b < 6; b++) {
    const pat = OST[BARS[b]];
    for (let i = 0; i < 8; i++) {
      const t = T(b, i * 0.5);
      const accent = i === 0 ? 1.18 : i === 4 ? 1.06 : 1;
      pluck(t, pat[i], 0.105 * accent * (b < 2 ? 0.85 : 1), 0.62, {
        bright: 3400 + b * 120, click: 0.6, rev: 0.3,
      });
      events.push({ mt: t, kind: "harp", midi: pat[i], vel: 0.5 * accent });
    }
  }
  // melody
  for (const [b, be, m, du] of MEL) {
    flute(T(b, be), m, du * BEAT, 0.155);
    events.push({ mt: T(b, be), kind: "flute", midi: m, vel: 1, dur: du * BEAT });
  }
  // counter-line
  for (const [b, be, m, du] of CNT) bow(T(b, be), m, du * BEAT, 0.055);
  // bass
  for (const [b, be, m, du] of BASS) {
    pluck(T(b, be), m, 0.13, du * BEAT * 0.92, { bright: 1500, click: 0.35, rev: 0.22 });
    events.push({ mt: T(b, be), kind: "bass", midi: m, vel: 0.9 });
  }
  // timpani
  for (const [b, be, m, a] of TIMP) timp(T(b, be), m, a);
  // bells
  for (const [b, be, m, a, d] of BELLS) { bell(T(b, be), m, a, d); events.push({ mt: T(b, be), kind: "bell", midi: m, vel: 1 }); }
  // string pad
  pad(T(2, 0), [50, 57, 62, 65], 4.9, 0.052, 880);
  pad(T(4, 0), [45, 52, 57, 60], 2.5, 0.058, 1000);
  pad(T(5, 0), [50, 57, 62, 65], 2.6, 0.05, 760);
  // escapement ticks
  for (let b = 0; b < 6; b++) {
    for (let k = 0; k < 4; k++) {
      const t = T(b, k);
      tick(t, b < 2 ? 0.055 : 0.036);
      events.push({ mt: t, kind: "tick", vel: 1 });
      if (b >= 3) { tick(t + BEAT * 0.5, 0.016); events.push({ mt: t + BEAT * 0.5, kind: "tick", vel: 0.4 }); }
    }
  }

  /* ================= VISUALS ================= */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixc = (a, b, k) => {
    const x = hx(a), y = hx(b);
    return "rgb(" + Math.round(lerp(x[0], y[0], k)) + "," + Math.round(lerp(x[1], y[1], k)) + "," + Math.round(lerp(x[2], y[2], k)) + ")";
  };
  const KEYS = [
    { p: 0.0, bg0: "#04060c", bg1: "#0a0d16", glow: "#16283f", brass: "#6b5730", hi: "#c9a45f", accent: "#9fb6d6", line: "#26344a" },
    { p: 0.34, bg0: "#060810", bg1: "#12100f", glow: "#2a3247", brass: "#8a6c37", hi: "#e0bb78", accent: "#d8c49b", line: "#3a3a44" },
    { p: 0.70, bg0: "#0a0910", bg1: "#1d1510", glow: "#6b4520", brass: "#b08540", hi: "#f6d79b", accent: "#ffd79a", line: "#5a4630" },
    { p: 0.88, bg0: "#0b0a10", bg1: "#241a10", glow: "#8a5a24", brass: "#c1904a", hi: "#ffe6ae", accent: "#fff0c4", line: "#6b5334" },
    { p: 1.0, bg0: "#04060c", bg1: "#080b12", glow: "#243449", brass: "#6d5932", hi: "#c9a45f", accent: "#a8bcd8", line: "#2e3b4f" },
  ];
  function palette(p) {
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const k = clamp((p - a.p) / (b.p - a.p), 0, 1);
    const o = {};
    for (const key of ["bg0", "bg1", "glow", "brass", "hi", "accent", "line"]) o[key] = mixc(a[key], b[key], k);
    return o;
  }

  const SECTIONS = ["I. TICK", "II. OSTINATO", "III. FLUTE", "IV. TUTTI", "V. CRESCENDO", "VI. LONTANZA"];

  /* --- gear geometry --- */
  function gearPath(r, teeth, depth) {
    const p = new Path2D();
    const step = (Math.PI * 2) / teeth, rb = r - depth;
    const P = (ang, rad) => [Math.cos(ang) * rad, Math.sin(ang) * rad];
    for (let i = 0; i < teeth; i++) {
      const a0 = i * step - step * 0.5, a1 = i * step - step * 0.22;
      const a2 = i * step - step * 0.11, a3 = i * step + step * 0.11, a4 = i * step + step * 0.22;
      if (i === 0) p.moveTo(P(a0, rb)[0], P(a0, rb)[1]);
      p.lineTo(P(a1, rb)[0], P(a1, rb)[1]);
      p.lineTo(P(a2, r)[0], P(a2, r)[1]);
      p.lineTo(P(a3, r)[0], P(a3, r)[1]);
      p.lineTo(P(a4, rb)[0], P(a4, rb)[1]);
      p.lineTo(P(a0 + step * 0.5, rb)[0], P(a0 + step * 0.5, rb)[1]);
    }
    p.closePath();
    return p;
  }
  function spokePath(r, spokes, ri) {
    const p = new Path2D(), hr = r * 0.235;
    const step = (Math.PI * 2) / spokes;
    for (let i = 0; i < spokes; i++) {
      const th = i * step + step * 0.25;
      const w1 = step * 0.17, w2 = step * 0.075;
      const pt = (ang, rad) => [Math.cos(ang) * rad, Math.sin(ang) * rad];
      const A1 = pt(th - w1, hr), A2 = pt(th + w1, hr);
      const B1 = pt(th - w2, ri * 1.03), B2 = pt(th + w2, ri * 1.03);
      p.moveTo(A1[0], A1[1]); p.lineTo(B1[0], B1[1]);
      p.lineTo(B2[0], B2[1]); p.lineTo(A2[0], A2[1]); p.closePath();
    }
    return p;
  }
  function buildGear(spec) {
    const depth = spec.r * 0.13;
    const rim = gearPath(spec.r, spec.teeth, depth);
    const inner = spec.r * 0.73;
    const p = new Path2D(); p.addPath(rim);
    p.moveTo(inner, 0); p.arc(0, 0, inner, 0, Math.PI * 2);
    return { rim, spokes: spokePath(spec.r, spec.spokes, inner), hub: spec.r * 0.25, bore: spec.r * 0.085, inner };
  }
  const GEARS = [
    { id: "main", x: 540, y: 700, r: 235, teeth: 36, spokes: 6, dir: 1, rate: 1, hub: 0.24 },
    { id: "harp", x: 730, y: 390, r: 125, teeth: 20, spokes: 6, dir: -1, rate: 1.8, hub: 0.22 },
    { id: "flute", x: 270, y: 500, r: 95, teeth: 16, spokes: 5, dir: -1, rate: 2.25, hub: 0.24 },
    { id: "esc", x: 610, y: 242, r: 62, teeth: 10, spokes: 4, dir: 1, rate: 0, hub: 0.22 },
  ];
  for (const gs of GEARS) gs.paths = buildGear(gs);

  const STRINGS = [
    { y: 470, midi: 74 }, { y: 585, midi: 69 }, { y: 700, midi: 65 }, { y: 815, midi: 62 }, { y: 900, midi: 50 },
  ];
  for (const s of STRINGS) s.energy = 0;

  /* --- particles --- */
  const dust = [];
  for (let i = 0; i < 170; i++) {
    dust.push({
      x: rr(120, 960), y: rr(60, 1000), z: rr(0.35, 1),
      ph: rnd() * 6.283, sp: rr(0.15, 0.7), sz: rr(0.7, 2.4),
    });
  }
  const motes = [];
  const rings = [];
  const HUB = { harp: GEARS[1], flute: GEARS[2], main: GEARS[0], esc: GEARS[3], bass: GEARS[0], bell: GEARS[3], timp: GEARS[0] };

  function spawnMote(ev, vt) {
    const gear = HUB[ev.kind] || GEARS[0];
    const col = ev.kind === "flute" ? "pale" : ev.kind === "harp" ? "amber" : ev.kind === "bell" ? "white" : "bronze";
    motes.push({
      x: gear.x + rr(-8, 8), y: gear.y + rr(-8, 8),
      vx: rr(-7, 7), vy: rr(-34, -16), life: 0, max: rr(1.6, 2.8), col, sz: rr(4, 11) * (ev.kind === "bell" ? 1.3 : 1),
      ph: rnd() * 6.283,
    });
    if (ev.kind === "bell") {
      rings.push({ x: gear.x, y: gear.y, life: 0, max: 1.1, r0: 10, r1: 150 });
    }
  }

  /* --- grain tile --- */
  const grainTile = document.createElement("canvas");
  grainTile.width = 240; grainTile.height = 240;
  {
    const gg = grainTile.getContext("2d");
    const img = gg.createImageData(240, 240);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 118 + (rnd() - 0.5) * 150;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 26;
    }
    gg.putImageData(img, 0, 0);
  }
  let grainPat = null;
  try { grainPat = g.createPattern(grainTile, "repeat"); } catch (e) { grainPat = null; }

  /* --- text helper --- */
  function tracked(text, x, y, spacing, align) {
    const chars = Array.from(text);
    let total = 0;
    for (const c of chars) total += g.measureText(c).width + spacing;
    total -= spacing;
    let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    const prev = g.textAlign; g.textAlign = "left";
    for (const c of chars) { g.fillText(c, cx, y); cx += g.measureText(c).width + spacing; }
    g.textAlign = prev;
  }

  /* --- audio reactivity --- */
  const freq = new Uint8Array(analyser.frequencyBinCount);
  const wave = new Uint8Array(analyser.fftSize);
  let level = 0, bright = 0;

  /* --- event cursor --- */
  let cursor = 0;
  let lastTickT = -9;

  function drawGearNow(gs, ang, pal, e) {
    const p = gs.paths;
    g.save();
    g.translate(gs.x, gs.y);
    g.rotate(ang);

    // body fill (conic sheen, locked to world light)
    let fill = null;
    if (g.createConicGradient) {
      const cg = g.createConicGradient(-Math.PI * 0.75 - ang, 0, 0);
      cg.addColorStop(0.0, pal.hi);
      cg.addColorStop(0.16, pal.brass);
      cg.addColorStop(0.4, "#1b1409");
      cg.addColorStop(0.62, pal.brass);
      cg.addColorStop(0.84, pal.hi);
      cg.addColorStop(1.0, pal.brass);
      fill = cg;
    } else {
      const lg = g.createLinearGradient(-gs.r, -gs.r, gs.r, gs.r);
      lg.addColorStop(0, pal.hi); lg.addColorStop(0.5, pal.brass); lg.addColorStop(1, "#241a0d");
      fill = lg;
    }

    g.save();
    g.shadowColor = "rgba(0,0,0,0.65)"; g.shadowBlur = 26; g.shadowOffsetY = 10;
    g.fillStyle = fill;
    g.fill(p.rim, "evenodd");
    g.restore();

    g.fillStyle = fill;
    g.fill(p.spokes);
    g.strokeStyle = "rgba(0,0,0,0.55)"; g.lineWidth = Math.max(1, gs.r * 0.012);
    g.stroke(p.spokes);

    // rim edge light
    g.strokeStyle = pal.hi; g.globalAlpha = 0.42; g.lineWidth = Math.max(0.8, gs.r * 0.009);
    g.stroke(p.rim); g.globalAlpha = 1;

    // hub
    const hg = g.createRadialGradient(-gs.hub * 0.3, -gs.hub * 0.3, gs.hub * 0.05, 0, 0, gs.hub);
    hg.addColorStop(0, pal.hi); hg.addColorStop(0.55, pal.brass); hg.addColorStop(1, "#241a0d");
    g.fillStyle = hg;
    g.beginPath(); g.arc(0, 0, gs.hub, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(0,0,0,0.85)";
    g.beginPath(); g.arc(0, 0, gs.bore, 0, Math.PI * 2); g.fill();
    g.fillStyle = pal.hi; g.globalAlpha = 0.9;
    g.beginPath(); g.arc(0, 0, gs.bore * 0.45, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;

    // energy rim glow
    if (e > 0.01) {
      g.save();
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = pal.accent; g.globalAlpha = e * 0.5;
      g.lineWidth = gs.r * 0.02;
      g.beginPath(); g.arc(0, 0, gs.r * 0.93, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    g.restore();
  }

  function drawAnchor(vt, pal, e) {
    const gs = GEARS[3];
    const beatPhase = (vt / BEAT) % 1;
    const f = clamp((beatPhase - 0.52) / 0.34, 0, 1);
    const kick = Math.pow(f, 0.6);
    const angle = (-0.13 + kick * 0.26) + Math.sin(vt * 31) * 0.006 * e;
    const px = gs.x, py = gs.y - 96;
    g.save();
    g.translate(px, py);
    g.rotate(angle);
    // yoke
    g.strokeStyle = pal.brass; g.lineWidth = 9; g.lineCap = "round";
    g.beginPath(); g.moveTo(0, 6); g.lineTo(0, 34); g.stroke();
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(0, 32); g.lineTo(-30, 76); g.stroke();
    g.beginPath(); g.moveTo(0, 32); g.lineTo(30, 76); g.stroke();
    // pallet stones
    g.fillStyle = pal.hi;
    g.beginPath(); g.arc(-30, 76, 6.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(30, 76, 6.5, 0, Math.PI * 2); g.fill();
    // boss
    const bg = g.createRadialGradient(-3, -3, 1, 0, 0, 13);
    bg.addColorStop(0, pal.hi); bg.addColorStop(1, "#2a1e0e");
    g.fillStyle = bg;
    g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fill();
    g.restore();
    // tick flash
    const since = vt - lastTickT;
    if (since >= 0 && since < 0.3) {
      const k = since / 0.3;
      g.save();
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = (1 - k) * 0.75;
      g.strokeStyle = pal.accent; g.lineWidth = 2.2;
      g.beginPath(); g.arc(gs.x, gs.y - 30, 6 + k * 60, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
  }

  const FL_TOP = 1030, HR_TOP = 1150, BASS_Y = 1285, PLAYHEAD = 902, PPS = 96;
  const staffY = (m, top) => top + (77 - m) * (60 / 13);

  function drawScore(nowMt, pal) {
    g.save();
    // separators
    g.strokeStyle = "rgba(255,255,255,0.055)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(56, 998); g.lineTo(W - 56, 998); g.stroke();
    g.beginPath(); g.moveTo(56, 1322); g.lineTo(W - 56, 1322); g.stroke();

    // staves
    g.strokeStyle = "rgba(255,255,255,0.10)"; g.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      const y1 = FL_TOP + i * 15, y2 = HR_TOP + i * 15;
      g.beginPath(); g.moveTo(64, y1); g.lineTo(W - 64, y1); g.stroke();
      g.beginPath(); g.moveTo(64, y2); g.lineTo(W - 64, y2); g.stroke();
    }
    // bass line
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.beginPath(); g.moveTo(64, BASS_Y); g.lineTo(W - 64, BASS_Y); g.stroke();

    // playhead
    const pg = g.createLinearGradient(PLAYHEAD - 40, 0, PLAYHEAD + 26, 0);
    pg.addColorStop(0, "rgba(255,220,150,0)");
    pg.addColorStop(0.8, "rgba(255,225,165,0.16)");
    pg.addColorStop(1, "rgba(255,235,190,0.42)");
    g.fillStyle = pg;
    g.fillRect(PLAYHEAD - 40, FL_TOP - 26, 66, BASS_Y - FL_TOP + 44);

    // notes
    for (const ev of events) {
      if (ev.kind === "tick") continue;
      const age = nowMt - ev.mt;
      if (age < 0) continue;
      const x = PLAYHEAD - age * PPS;
      if (x < 60 || x > W - 60) continue;
      const fade = clamp(1 - age / 8.5, 0.06, 1);
      const near = clamp(1 - age / 0.32, 0, 1);
      if (ev.kind === "flute") {
        const y = staffY(ev.midi, FL_TOP);
        g.save();
        g.globalAlpha = fade * 0.95;
        g.fillStyle = near > 0 ? "#fff0cf" : pal.accent;
        if (near > 0) { g.shadowColor = "rgba(255,225,170,0.9)"; g.shadowBlur = 16 * near; }
        g.beginPath();
        g.ellipse(x, y, 9.5, 6.4, -0.22, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = pal.accent; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x + 9, y - 1); g.lineTo(x + 9, y - 42); g.stroke();
        g.restore();
      } else if (ev.kind === "harp") {
        const y = staffY(ev.midi, HR_TOP);
        g.save();
        g.globalAlpha = fade * 0.6;
        g.fillStyle = near > 0 ? "#ffc98a" : "#c9975a";
        g.beginPath(); g.arc(x, y, near > 0 ? 4.6 : 3.4, 0, Math.PI * 2); g.fill();
        g.restore();
      } else if (ev.kind === "bass") {
        const y = clamp(BASS_Y + (ev.midi - 45) * 3.4, BASS_Y - 26, BASS_Y + 22);
        g.save();
        g.globalAlpha = fade * 0.9;
        g.fillStyle = near > 0 ? "#e0a76a" : "#9d6b3f";
        g.beginPath(); g.arc(x, y, 7.4, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }

    // escapement ruler
    g.strokeStyle = "rgba(255,255,255,0.09)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(64, 1315); g.lineTo(W - 64, 1315); g.stroke();
    for (const ev of events) {
      if (ev.kind !== "tick") continue;
      const age = nowMt - ev.mt;
      if (age < 0) continue;
      const x = PLAYHEAD - age * PPS;
      if (x < 60 || x > W - 60) continue;
      g.globalAlpha = clamp(1 - age / 7, 0.08, 1) * (ev.vel > 0.6 ? 0.55 : 0.28);
      g.strokeStyle = pal.accent; g.lineWidth = ev.vel > 0.6 ? 2 : 1;
      g.beginPath(); g.moveTo(x, 1315); g.lineTo(x, 1315 + (ev.vel > 0.6 ? 9 : 5)); g.stroke();
    }
    g.globalAlpha = 1;

    // labels
    g.font = '500 17px "Helvetica Neue", Helvetica, Arial, sans-serif';
    g.fillStyle = "rgba(255,255,255,0.34)";
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    g.fillText("FLUTE", 64, FL_TOP - 12);
    g.fillText("HARPSICHORD", 64, HR_TOP - 12);
    g.fillText("CONTINUO", 64, BASS_Y - 30);
    g.restore();
  }

  function drawFrame(vt, pal, p) {
    // border
    g.save();
    g.strokeStyle = "rgba(255,255,255,0.10)"; g.lineWidth = 1;
    g.strokeRect(40.5, 40.5, W - 81, H - 81);
    g.strokeStyle = pal.brass; g.globalAlpha = 0.55; g.lineWidth = 2;
    const cl = 26;
    const corners = [[40, 40, 1, 1], [W - 40, 40, -1, 1], [40, H - 40, 1, -1], [W - 40, H - 40, -1, -1]];
    for (const [cx, cy, sx, sy] of corners) {
      g.beginPath(); g.moveTo(cx + sx * cl, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * cl); g.stroke();
    }
    g.restore();
  }

  function drawDial(pal, p) {
    g.save();
    const cx = 540, cy = 590, R = 396;
    g.strokeStyle = pal.line; g.globalAlpha = 0.5; g.lineWidth = 1.2;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.32;
    g.beginPath(); g.arc(cx, cy, R - 22, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.42;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const major = i % 5 === 0;
      const r0 = R - (major ? 26 : 12), r1 = R - 2;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.stroke();
    }
    g.globalAlpha = 0.2;
    g.beginPath(); g.arc(cx, cy, 248, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  function drawStrings(vt, pal) {
    g.save();
    for (const s of STRINGS) {
      const x0 = 118, x1 = W - 118;
      g.globalAlpha = 0.5 + s.energy * 0.5;
      g.strokeStyle = s.energy > 0.05 ? pal.hi : pal.line;
      g.lineWidth = 1.1 + s.energy * 1.1;
      g.beginPath();
      const amp = (1.5 + s.energy * 12) * Math.sin(Math.PI * clamp((vt % 1.4) / 1.4 + 0.2, 0, 1));
      for (let x = x0; x <= x1; x += 8) {
        const u = (x - x0) / (x1 - x0);
        const env = Math.sin(Math.PI * u);
        const y = s.y + Math.sin(x * 0.075 + vt * 42) * amp * env * 0.5;
        if (x === x0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      // pins
      g.globalAlpha = 0.75;
      g.fillStyle = pal.brass;
      g.beginPath(); g.arc(x0, s.y, 4, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(x1, s.y, 4, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    g.restore();
  }

  /* ================= LOOP ================= */
  let raf = 0, running = true, last = 0;
  const tData = new Uint8Array(analyser.fftSize);

  function frame() {
    if (!running) return;
    const vt = A.currentTime - t0;
    const nowMt = vt / SC;
    const p = clamp(vt / (14.4 * SC), 0, 1);
    const pal = palette(p);
    const dt = Math.min(0.05, last ? vt - last : 0.016);
    last = vt;

    // --- consume events ---
    while (cursor < events.length && events[cursor].mt <= nowMt) {
      const ev = events[cursor++];
      if (ev.kind === "tick") {
        lastTickT = nowMt;
      } else {
        spawnMote(ev, nowMt);
        for (const s of STRINGS) if (s.midi === ev.midi) s.energy = 1;
        if (ev.kind === "harp") for (const s of STRINGS) if (Math.abs(s.midi - ev.midi) < 9) s.energy = Math.max(s.energy, 0.55);
      }
    }
    for (const s of STRINGS) s.energy *= Math.exp(-dt * 1.7);

    // --- levels ---
    analyser.getByteTimeDomainData(tData);
    let sum = 0;
    for (let i = 0; i < tData.length; i += 4) { const v = (tData[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / (tData.length / 4));
    level = level * 0.72 + clamp(rms * 3.2, 0, 1) * 0.28;
    analyser.getByteFrequencyData(freq);
    let hi = 0;
    for (let i = 8; i < 90; i++) hi += freq[i];
    bright = bright * 0.8 + clamp((hi / (82 * 255)) * 1.6, 0, 1) * 0.2;

    // ================= DRAW =================
    g.setTransform(1, 0, 0, 1, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, pal.bg0); bg.addColorStop(0.62, pal.bg1); bg.addColorStop(1, pal.bg0);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    // atmosphere glow
    g.save();
    g.globalCompositeOperation = "lighter";
    const rg = g.createRadialGradient(540, 600, 40, 540, 600, 700);
    rg.addColorStop(0, pal.glow); rg.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = 0.30 + level * 0.28;
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    g.restore();

    drawDial(pal, p);

    // light beam
    g.save();
    g.globalCompositeOperation = "lighter";
    const beam = g.createLinearGradient(0, 0, 0, 1000);
    beam.addColorStop(0, "rgba(255,236,200,0.10)");
    beam.addColorStop(1, "rgba(255,236,200,0)");
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(430, 0); g.lineTo(660, 0); g.lineTo(880, 1010); g.lineTo(220, 1010);
    g.closePath(); g.fill();
    g.restore();

    drawStrings(vt, pal);

    // --- gears ---
    const esc = GEARS[3];
    const beatIdx = Math.floor(nowMt / BEAT);
    const frac = (nowMt / BEAT) % 1;
    const kick = clamp((frac - 0.52) / 0.34, 0, 1);
    const escAng = (beatIdx * (Math.PI * 2) / 10) + Math.pow(kick, 0.55) * (Math.PI * 2 / 10) - Math.PI / 20;
    const jit = Math.sin(vt * 27.3) * 0.0016 * (0.4 + level);

    const energies = { main: level * 0.8, harp: 0, flute: 0, esc: 0 };
    for (const ev of events) {
      if (ev.mt > nowMt || nowMt - ev.mt > 0.4) continue;
      const a = 1 - (nowMt - ev.mt) / 0.4;
      if (ev.kind === "harp") energies.harp = Math.max(energies.harp, a);
      if (ev.kind === "flute") energies.flute = Math.max(energies.flute, a);
    }
    energies.esc = Math.pow(kick, 0.6);

    for (const gs of GEARS) {
      let ang;
      if (gs.id === "esc") ang = escAng;
      else ang = gs.dir * gs.rate * (Math.PI * 2) * (vt / 15) + jit * gs.rate;
      drawGearNow(gs, ang, pal, energies[gs.id] || 0);
    }
    drawAnchor(nowMt, pal, energies.esc);

    // --- motes ---
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.life += dt;
      if (m.life > m.max) { motes.splice(i, 1); continue; }
      m.x += (m.vx + Math.sin(m.life * 2.4 + m.ph) * 11) * dt;
      m.y += m.vy * dt;
      const k = 1 - m.life / m.max;
      const a = k * k;
      const col = m.col === "pale" ? "255,240,205" : m.col === "amber" ? "255,180,95" : m.col === "white" ? "255,255,255" : "200,130,70";
      const gr = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.sz * 3.2);
      gr.addColorStop(0, "rgba(" + col + "," + (a * 0.95) + ")");
      gr.addColorStop(0.35, "rgba(" + col + "," + (a * 0.32) + ")");
      gr.addColorStop(1, "rgba(" + col + ",0)");
      g.fillStyle = gr;
      g.beginPath(); g.arc(m.x, m.y, m.sz * 3.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(" + col + "," + (a * 0.9) + ")";
      g.beginPath(); g.arc(m.x, m.y, m.sz * 0.42, 0, Math.PI * 2); g.fill();
    }
    // bell rings
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life += dt;
      if (r.life > r.max) { rings.splice(i, 1); continue; }
      const k = r.life / r.max;
      g.globalAlpha = (1 - k) * 0.4;
      g.strokeStyle = "rgba(255,245,220,1)"; g.lineWidth = 1.6;
      g.beginPath(); g.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, Math.PI * 2); g.stroke();
    }
    g.restore();

    // --- dust ---
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const d of dust) {
      d.y -= d.sp * 9 * dt;
      d.ph += dt * 0.6;
      if (d.y < 20) { d.y = 1020; d.x = rr(120, 960); }
      const beamT = clamp(1 - Math.abs(d.x - (540 - d.y * 0.22)) / 420, 0, 1);
      const a = (0.05 + beamT * 0.30) * (0.6 + 0.4 * Math.sin(d.ph * 2.2));
      g.globalAlpha = a * d.z;
      g.fillStyle = "#ffe7c2";
      g.beginPath(); g.arc(d.x + Math.sin(d.ph) * 7, d.y, d.sz * d.z, 0, Math.PI * 2); g.fill();
    }
    g.restore();

    // --- score ---
    drawScore(nowMt, pal);

    // --- titles ---
    g.save();
    g.textBaseline = "alphabetic";
    g.fillStyle = pal.hi;
    g.font = '400 44px "Times New Roman", Georgia, serif';
    g.globalAlpha = 0.92;
    tracked("ESCAPEMENT", W / 2, 104, 13, "center");
    g.globalAlpha = 0.5;
    g.font = 'italic 20px "Times New Roman", Georgia, serif';
    tracked("flute, harpsichord and clockwork", W / 2, 134, 2, "center");
    // section marker
    const sec = clamp(Math.floor(nowMt / BAR), 0, 5);
    g.globalAlpha = 0.62;
    g.fillStyle = pal.accent;
    g.font = '500 20px "Helvetica Neue", Helvetica, Arial, sans-serif';
    g.textAlign = "right";
    g.fillText(SECTIONS[sec], W - 62, 100);
    g.textAlign = "left";
    g.globalAlpha = 0.42;
    g.fillText("♩ = 100", 62, 100);
    g.restore();

    drawFrame(vt, pal, p);

    // --- vignette + grain ---
    g.save();
    const vg = g.createRadialGradient(W / 2, H * 0.46, H * 0.24, W / 2, H * 0.5, H * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.72)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if (grainPat) {
      g.globalAlpha = 0.16;
      g.save();
      g.translate(-Math.floor(rnd() * 200), -Math.floor(rnd() * 200));
      g.fillStyle = grainPat;
      g.fillRect(0, 0, W + 220, H + 220);
      g.restore();
    }
    // gentle close
    const fadeStart = 14.3 * SC;
    if (vt > fadeStart) {
      g.fillStyle = "rgba(2,3,7," + clamp((vt - fadeStart) / (0.7 * SC), 0, 0.62) + ")";
      g.fillRect(0, 0, W, H);
    }
    g.restore();

    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      try { master.disconnect(); revSend.disconnect(); dIn.disconnect(); } catch (e) {}
    },
  };
}
