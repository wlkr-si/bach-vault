export const title = "Tideglass Murmuration";

export function start({ audioContext, canvas, duration, random }) {
  const W = 1080, H = 1350;
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d");
  const T0 = audioContext.currentTime + 0.06;
  const DUR = duration || 15;
  if (audioContext.state === "suspended") audioContext.resume();

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- AUDIO GRAPH ----------
  const master = audioContext.createGain(); master.gain.value = 0.9;
  const comp = audioContext.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.24;
  const analyser = audioContext.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.82;
  master.connect(analyser); analyser.connect(comp); comp.connect(audioContext.destination);

  // reverb
  const verb = audioContext.createConvolver();
  {
    const len = Math.floor(audioContext.sampleRate * 2.6);
    const ir = audioContext.createBuffer(2, len, audioContext.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (random() * 2 - 1) * Math.pow(1 - t, 2.6) * (1 - Math.exp(-i / 200));
      }
    }
    verb.buffer = ir;
  }
  const verbGain = audioContext.createGain(); verbGain.gain.value = 0.42;
  verb.connect(verbGain); verbGain.connect(master);

  // delay (dotted 8th at 120bpm)
  const dly = audioContext.createDelay(1); dly.delayTime.value = 0.375;
  const dlyFb = audioContext.createGain(); dlyFb.gain.value = 0.38;
  const dlyFilt = audioContext.createBiquadFilter(); dlyFilt.type = "lowpass"; dlyFilt.frequency.value = 2400;
  const dlyWet = audioContext.createGain(); dlyWet.gain.value = 0.24;
  dly.connect(dlyFilt); dlyFilt.connect(dlyFb); dlyFb.connect(dly);
  dly.connect(dlyWet); dlyWet.connect(master); dlyWet.connect(verb);

  const padBus = audioContext.createGain(); padBus.gain.value = 0.5; padBus.connect(master); padBus.connect(verb);
  const musBus = audioContext.createGain(); musBus.gain.value = 1.0; musBus.connect(master);
  const drumBus = audioContext.createGain(); drumBus.gain.value = 0.9; drumBus.connect(master);

  // noise buffer
  const noiseBuf = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const noiseSrc = (t, dur) => { const s = audioContext.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t); s.stop(t + dur + 0.1); return s; };

  // ---------- COMPOSITION ----------
  const prog = [
    { t: 0.0, d: 2.0, root: 38, pad: [50, 53, 57, 60, 64, 69], hue: 212 },
    { t: 2.0, d: 2.0, root: 34, pad: [46, 53, 57, 62, 65, 69], hue: 268 },
    { t: 4.0, d: 2.0, root: 29, pad: [41, 48, 53, 57, 60, 65], hue: 168 },
    { t: 6.0, d: 2.0, root: 31, pad: [43, 50, 55, 59, 62, 67], hue: 42 },
    { t: 8.0, d: 2.0, root: 27, pad: [39, 51, 55, 58, 62, 67], hue: 322 },
    { t: 10.0, d: 1.9, root: 33, pad: [45, 56, 60, 61, 64, 68], hue: 4 },
    { t: 11.9, d: 3.1, root: 38, pad: [38, 50, 53, 57, 62, 65, 69, 72], hue: 198 },
  ];

  function padChord(t, d, midis, vel) {
    const lp = audioContext.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(2400, t + d * 0.6);
    lp.frequency.linearRampToValueAtTime(700, t + d + 0.8);
    const gg = audioContext.createGain();
    gg.gain.setValueAtTime(0.0001, t); gg.gain.linearRampToValueAtTime(vel, t + 0.55);
    gg.gain.setValueAtTime(vel, t + d - 0.4); gg.gain.linearRampToValueAtTime(0.0001, t + d + 1.0);
    lp.connect(gg); gg.connect(padBus); gg.connect(verb);
    midis.forEach((m, i) => {
      const f = mtof(m);
      [-6, 6].forEach((c) => {
        const o = audioContext.createOscillator(); o.type = i % 2 ? "sawtooth" : "triangle";
        o.frequency.value = f; o.detune.value = c + (random() - 0.5) * 6;
        const ng = audioContext.createGain(); ng.gain.value = 0.05 / midis.length * 8;
        o.connect(ng); ng.connect(lp); o.start(t); o.stop(t + d + 1.1);
      });
    });
  }
  function bassNote(t, d, midi) {
    const f = mtof(midi);
    const o1 = audioContext.createOscillator(); o1.type = "sine"; o1.frequency.value = f;
    const o2 = audioContext.createOscillator(); o2.type = "triangle"; o2.frequency.value = f; o2.detune.value = 4;
    const fl = audioContext.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 320;
    const gn = audioContext.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(0.5, t + 0.12);
    gn.gain.setValueAtTime(0.5, t + d - 0.3); gn.gain.linearRampToValueAtTime(0.0001, t + d + 0.3);
    o1.connect(fl); o2.connect(fl); fl.connect(gn); gn.connect(musBus);
    o1.start(t); o2.start(t); o1.stop(t + d + 0.4); o2.stop(t + d + 0.4);
  }
  function pluck(t, midi, vel) {
    const f = mtof(midi);
    const o = audioContext.createOscillator(); o.type = "triangle"; o.frequency.value = f;
    const o2 = audioContext.createOscillator(); o2.type = "sine"; o2.frequency.value = f * 2;
    const gn = audioContext.createGain();
    gn.gain.setValueAtTime(vel, t); gn.gain.exponentialRampToValueAtTime(0.0008, t + 0.42);
    const g2 = audioContext.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(gn);
    o.connect(gn); gn.connect(musBus); gn.connect(dly); gn.connect(verb);
    o.start(t); o2.start(t); o.stop(t + 0.5); o2.stop(t + 0.5);
  }
  function lead(t, d, midi, vel) {
    const f = mtof(midi);
    const o = audioContext.createOscillator(); o.type = "sine"; o.frequency.value = f;
    const h = audioContext.createOscillator(); h.type = "triangle"; h.frequency.value = f * 2;
    const hg = audioContext.createGain(); hg.gain.value = 0.12; h.connect(hg);
    const lfo = audioContext.createOscillator(); lfo.frequency.value = 5.4 + random() * 0.8;
    const lg = audioContext.createGain(); lg.gain.value = 9; lfo.connect(lg); lg.connect(o.detune); lg.connect(h.detune);
    const gn = audioContext.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(vel, t + 0.09);
    gn.gain.setValueAtTime(vel, t + d - 0.12); gn.gain.linearRampToValueAtTime(0.0001, t + d + 0.35);
    o.connect(gn); hg.connect(gn); gn.connect(musBus); gn.connect(verb); gn.connect(dly);
    o.start(t); h.start(t); lfo.start(t); o.stop(t + d + 0.5); h.stop(t + d + 0.5); lfo.stop(t + d + 0.5);
  }
  function bell(t, midi, vel) {
    const f = mtof(midi);
    const car = audioContext.createOscillator(); car.type = "sine"; car.frequency.value = f;
    const mod = audioContext.createOscillator(); mod.type = "sine"; mod.frequency.value = f * 2.01;
    const mg = audioContext.createGain(); mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.9);
    mod.connect(mg); mg.connect(car.frequency);
    const gn = audioContext.createGain(); gn.gain.setValueAtTime(vel, t); gn.gain.exponentialRampToValueAtTime(0.0006, t + 1.4);
    car.connect(gn); gn.connect(musBus); gn.connect(verb); gn.connect(dly);
    car.start(t); mod.start(t); car.stop(t + 1.5); mod.stop(t + 1.5);
  }
  function kick(t, v) {
    const o = audioContext.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(41, t + 0.11);
    const gn = audioContext.createGain(); gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.0008, t + 0.3);
    o.connect(gn); gn.connect(drumBus); o.start(t); o.stop(t + 0.35);
  }
  function snare(t, v) {
    const n = noiseSrc(t, 0.25);
    const bp = audioContext.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 0.9;
    const gn = audioContext.createGain(); gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.0008, t + 0.2);
    n.connect(bp); bp.connect(gn); gn.connect(drumBus); gn.connect(verb);
    const o = audioContext.createOscillator(); o.type = "triangle"; o.frequency.value = 192;
    const g2 = audioContext.createGain(); g2.gain.setValueAtTime(v * 0.7, t); g2.gain.exponentialRampToValueAtTime(0.0008, t + 0.12);
    o.connect(g2); g2.connect(drumBus); o.start(t); o.stop(t + 0.15);
  }
  function hat(t, open, v) {
    const n = noiseSrc(t, open ? 0.4 : 0.08);
    const hp = audioContext.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7800;
    const gn = audioContext.createGain(); gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.0008, t + (open ? 0.32 : 0.05));
    n.connect(hp); hp.connect(gn); gn.connect(drumBus); gn.connect(dly);
  }

  // schedule harmony
  prog.forEach((ch) => { padChord(T0 + ch.t, ch.d, ch.pad, 0.16); bassNote(T0 + ch.t, ch.d, ch.root); });

  // arps
  prog.forEach((ch) => {
    const steps = Math.floor(ch.d / 0.25);
    for (let i = 0; i < steps; i++) {
      const t = T0 + ch.t + i * 0.25;
      if (t > T0 + DUR - 0.2) break;
      const idx = (i * 2 + (i % 3)) % ch.pad.length;
      const oct = (i % 8 === 6) ? 12 : ((random() < 0.18) ? 12 : 0);
      pluck(t + (random() - 0.5) * 0.006, ch.pad[idx] + 12 + oct, 0.10 + random() * 0.07);
    }
  });

  // lead melody (dream-phrygian lyric)
  const mel = [
    [0.25, 0.65, 69, 0.20], [1.05, 0.55, 72, 0.20], [1.70, 0.85, 76, 0.22],
    [2.35, 0.42, 74, 0.22], [2.80, 0.42, 72, 0.20], [3.25, 0.65, 70, 0.22],
    [4.20, 0.5, 69, 0.20], [4.75, 0.5, 72, 0.21], [5.30, 0.95, 77, 0.24],
    [6.15, 0.36, 76, 0.20], [6.53, 0.36, 74, 0.20], [6.92, 0.7, 72, 0.22], [7.65, 0.32, 71, 0.18],
    [8.05, 0.55, 75, 0.24], [8.65, 0.55, 79, 0.24], [9.25, 0.75, 82, 0.22],
    [10.10, 0.34, 68, 0.18], [10.48, 0.34, 71, 0.20], [10.86, 0.75, 76, 0.22],
    [12.00, 0.9, 86, 0.22], [12.95, 0.5, 84, 0.20], [13.50, 0.5, 81, 0.20], [14.05, 0.75, 77, 0.20],
  ];
  mel.forEach(([t, d, m, v]) => lead(T0 + t, d, m, v));
  // bells sparkle
  [2.5, 4.5, 6.5, 8.5, 10.5, 12.5, 13.5, 14.3].forEach((t, i) => {
    const pool = [84, 86, 88, 91, 86, 84, 81, 79];
    bell(T0 + t, pool[i % pool.length], 0.07);
    bell(T0 + t + 0.18, pool[(i + 3) % pool.length] - 12, 0.05);
  });
  // drums
  for (let b = 0; b * 0.5 < DUR; b++) {
    const t = T0 + b * 0.5;
    const bar = t - T0;
    if (bar < 1.95) { if (b % 2 === 0) hat(t, false, 0.05); continue; }
    const beatInBar = b % 4;
    kick(t, beatInBar === 0 ? 0.85 : 0.7);
    if (beatInBar === 1 || beatInBar === 3) snare(t, 0.4);
    hat(t, false, 0.08 + random() * 0.06);
    if (random() < 0.4) hat(t + 0.25, false, 0.05);
    if (bar > 11.4 && bar < 12.0) { snare(t + 0.25, 0.25); kick(t + 0.125, 0.4); }
  }
  // ocean swell + riser
  {
    const n = noiseSrc(T0, DUR);
    const bp = audioContext.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(240, T0); bp.frequency.linearRampToValueAtTime(3800, T0 + 10); bp.frequency.linearRampToValueAtTime(500, T0 + DUR);
    const gn = audioContext.createGain(); gn.gain.setValueAtTime(0.0001, T0);
    gn.gain.linearRampToValueAtTime(0.10, T0 + 5); gn.gain.linearRampToValueAtTime(0.14, T0 + 10); gn.gain.linearRampToValueAtTime(0.0001, T0 + DUR);
    n.connect(bp); bp.connect(gn); gn.connect(master); gn.connect(verb);
    const o = audioContext.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(55, T0 + 10); o.frequency.linearRampToValueAtTime(220, T0 + 11.9);
    const og = audioContext.createGain(); og.gain.setValueAtTime(0.0001, T0 + 10); og.gain.linearRampToValueAtTime(0.08, T0 + 11.9); og.gain.linearRampToValueAtTime(0.0001, T0 + 12.15);
    const of = audioContext.createBiquadFilter(); of.type = "lowpass"; of.frequency.value = 3000;
    o.connect(of); of.connect(og); og.connect(master); o.start(T0 + 10); o.stop(T0 + 12.3);
  }
  // sub drop at finale
  {
    const t = T0 + 11.9;
    const o = audioContext.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.9);
    const gn = audioContext.createGain(); gn.gain.setValueAtTime(0.5, t); gn.gain.exponentialRampToValueAtTime(0.0008, t + 1.2);
    o.connect(gn); gn.connect(musBus); o.start(t); o.stop(t + 1.3);
  }

  // ---------- VISUALS ----------
  const motes = [];
  for (let i = 0; i < 300; i++) motes.push({ x: random() * W, y: random() * H, r: 0.7 + random() * 2.6, ph: random() * 6.28, sp: 12 + random() * 55, dr: (random() - 0.5) * 22, tw: 1 + random() * 3 });
  const shards = [];
  for (let i = 0; i < 14; i++) shards.push({ a: random() * 6.28, rad: 200 + random() * 260, sz: 26 + random() * 90, spin: (random() - 0.5) * 0.7, sides: 3 + Math.floor(random() * 3), hueOff: (random() - 0.5) * 60 });
  const blobs = [];
  for (let i = 0; i < 5; i++) blobs.push({ x: random(), y: random(), r: 0.25 + random() * 0.4, sp: 0.05 + random() * 0.12, ph: random() * 6.28 });
  const freq = new Uint8Array(analyser.frequencyBinCount);
  const wave = new Uint8Array(analyser.fftSize);
  const v0 = performance.now();

  function hueAt(el) {
    for (let i = 0; i < prog.length; i++) {
      const c = prog[i], n = prog[i + 1];
      if (el < c.t + c.d || !n) return c.hue;
      if (n && el >= c.t + c.d && el < n.t) return c.hue;
      if (n && el >= n.t - 0.4 && el < n.t) { const k = (el - (n.t - 0.4)) / 0.4; return c.hue + (n.hue - c.hue) * k; }
      if (el >= c.t && el < c.t + c.d) return c.hue;
    }
    return 198;
  }
  function draw(now) {
    const el = (now - v0) / 1000;
    const at = audioContext.currentTime - T0;
    if (el > DUR + 0.4) return;
    const e = Math.max(0, Math.min(DUR, at > 0 ? at : el));
    analyser.getByteFrequencyData(freq); analyser.getByteTimeDomainData(wave);
    let bass = 0, mid = 0, high = 0;
    for (let i = 2; i < 24; i++) bass += freq[i];
    for (let i = 24; i < 160; i++) mid += freq[i];
    for (let i = 160; i < 600; i++) high += freq[i];
    bass /= 22 * 255; mid /= 136 * 255; high /= 440 * 255;
    const beatPh = (e * 2) % 1;
    const kickP = Math.pow(1 - beatPh, 3.2) * (e > 1.9 ? 1 : 0.25);
    const snrPh = ((e * 2 + 0.5) % 1);
    const snrP = Math.pow(1 - snrPh, 5) * (e > 1.9 ? 0.8 : 0);
    const hue = hueAt(e);
    const hue2 = (hue + 55) % 360;

    // bg
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `hsl(${hue},48%,7%)`); bg.addColorStop(0.45, `hsl(${(hue + 20) % 360},52%,13%)`); bg.addColorStop(1, `hsl(${hue2},55%,6%)`);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // nebulas
    g.globalCompositeOperation = "lighter";
    blobs.forEach((b, i) => {
      const bx = (b.x + Math.sin(e * b.sp + b.ph) * 0.12) * W;
      const by = (b.y + Math.cos(e * b.sp * 0.8 + b.ph) * 0.1) * H;
      const br = b.r * W * (1 + kickP * 0.08);
      const rg = g.createRadialGradient(bx, by, 0, bx, by, br);
      const hh = (hue + i * 34) % 360;
      rg.addColorStop(0, `hsla(${hh},80%,55%,${0.16 + mid * 0.12})`); rg.addColorStop(1, "hsla(0,0%,0%,0)");
      g.fillStyle = rg; g.fillRect(bx - br, by - br, br * 2, br * 2);
    });
    // light rays
    g.save(); g.translate(W / 2, H * 0.44); g.rotate(-0.25 + Math.sin(e * 0.1) * 0.06);
    for (let i = -4; i <= 4; i++) {
      g.save(); g.rotate(i * 0.13 + e * 0.02);
      const lg = g.createLinearGradient(0, 0, 0, -H);
      lg.addColorStop(0, `hsla(${hue2},90%,75%,${0.05 + high * 0.08})`); lg.addColorStop(1, "hsla(0,0%,0%,0)");
      g.fillStyle = lg;
      g.fillRect(i * 26 - 9, -H * 0.9, 18, H * 0.9);
      g.restore();
    }
    g.restore();

    // glass shards ring
    const cx = W / 2, cy = H * 0.44;
    shards.forEach((s, i) => {
      const ang = s.a + e * 0.12 * s.spin + i * 0.02;
      const rr = s.rad * (1 + kickP * 0.07 + Math.sin(e * 1.4 + i) * 0.02);
      const x = cx + Math.cos(ang) * rr * 1.05, y = cy + Math.sin(ang) * rr * 1.25;
      g.save(); g.translate(x, y); g.rotate(ang + e * 0.15 * s.spin);
      const sc = s.sz * (1 + snrP * 0.35 + bass * 0.3);
      g.beginPath();
      for (let k = 0; k < s.sides; k++) { const a2 = (k / s.sides) * 6.283; const px = Math.cos(a2) * sc, py = Math.sin(a2) * sc * 0.72; k ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.closePath();
      const hh = (hue + s.hueOff + 360) % 360;
      g.fillStyle = `hsla(${hh},65%,62%,${0.10 + snrP * 0.12})`;
      g.strokeStyle = `hsla(${hh},95%,82%,${0.35 + high * 0.4})`; g.lineWidth = 1.6;
      g.fill(); g.stroke();
      g.fillStyle = `hsla(0,0%,100%,${0.10 + kickP * 0.12})`;
      g.beginPath(); g.arc(-sc * 0.2, -sc * 0.15, sc * 0.12, 0, 6.283); g.fill();
      g.restore();
    });

    // central orb
    const orbR = 128 + kickP * 46 + bass * 60 + Math.sin(e * 2.2) * 8;
    let og = g.createRadialGradient(cx, cy, 0, cx, cy, orbR * 2.4);
    og.addColorStop(0, `hsla(0,0%,100%,${0.85})`); og.addColorStop(0.18, `hsla(${hue2},95%,72%,${0.75})`);
    og.addColorStop(0.5, `hsla(${hue},85%,55%,${0.32})`); og.addColorStop(1, "hsla(0,0%,0%,0)");
    g.fillStyle = og; g.beginPath(); g.arc(cx, cy, orbR * 2.4, 0, 6.283); g.fill();
    // orbiting rings
    for (let r = 0; r < 3; r++) {
      g.save(); g.translate(cx, cy); g.rotate(e * (0.25 + r * 0.14) * (r % 2 ? -1 : 1));
      g.strokeStyle = `hsla(${(hue + r * 30) % 360},90%,78%,${0.35 - r * 0.08})`; g.lineWidth = 2.2 - r * 0.5;
      g.setLineDash([14 + high * 60, 22]); g.lineDashOffset = -e * 60;
      g.beginPath(); g.ellipse(0, 0, orbR + 44 + r * 44, (orbR + 44 + r * 44) * 1.28, 0, 0, 6.283); g.stroke();
      g.restore();
    }
    g.setLineDash([]);

    // flowing ribbons (tideglass waves)
    for (let r = 0; r < 6; r++) {
      const yBase = cy - 190 + r * 78 + Math.sin(e * 0.7 + r) * 14;
      g.beginPath(); g.moveTo(-20, yBase);
      for (let x = -20; x <= W + 20; x += 18) {
        const wi = Math.floor((x / W) * wave.length * 0.5) % wave.length;
        const wv = (wave[wi] - 128) / 128;
        const y = yBase + Math.sin(x * 0.008 + e * (1.1 + r * 0.22) + r * 2.1) * (26 + r * 10 + bass * 70 + kickP * 30) + wv * (30 + mid * 80);
        g.lineTo(x, y);
      }
      for (let x = W + 20; x >= -20; x -= 18) {
        const y = yBase + 26 + Math.sin(x * 0.008 + e * (1.1 + r * 0.22) + r * 2.1 + 0.6) * 14;
        g.lineTo(x, y + 22);
      }
      g.closePath();
      const hh = (hue + r * 18) % 360;
      const fg = g.createLinearGradient(0, yBase - 80, 0, yBase + 80);
      fg.addColorStop(0, `hsla(${hh},85%,68%,${0.20 + high * 0.12})`); fg.addColorStop(1, `hsla(${hh},85%,45%,0.06)`);
      g.fillStyle = fg; g.fill();
      g.strokeStyle = `hsla(${hh},100%,85%,${0.30 + snrP * 0.3})`; g.lineWidth = 1.4; g.stroke();
    }

    // motes (plankton)
    motes.forEach((m) => {
      m.y -= m.sp * 0.016 * (1 + bass * 2.2); m.x += Math.sin(e * 0.8 + m.ph) * 0.4 + m.dr * 0.008;
      if (m.y < -10) { m.y = H + 10; m.x = ((m.x % W) + W) % W; }
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(e * m.tw + m.ph));
      const sz = m.r * (1 + kickP * 0.9 + high * 0.8);
      g.fillStyle = `hsla(${(hue + m.ph * 20) % 360},90%,${70 + tw * 20}%,${0.25 + tw * 0.6})`;
      g.beginPath(); g.arc(m.x, m.y, sz, 0, 6.283); g.fill();
    });
    g.globalCompositeOperation = "source-over";

    // vignette
    const vg = g.createRadialGradient(cx, cy, H * 0.2, cx, cy, H * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // grain
    g.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 130; i++) g.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4);
    // progress + title
    const p = Math.min(1, e / DUR);
    g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(80, H - 120, W - 160, 2);
    g.fillStyle = `hsl(${hue2},90%,75%)`; g.fillRect(80, H - 120, (W - 160) * p, 2);
    g.textAlign = "center";
    g.fillStyle = "rgba(255,255,255,0.92)"; g.font = "600 34px Georgia,serif";
    g.fillText("Tideglass Murmuration", W / 2, H - 72);
    g.fillStyle = "rgba(255,255,255,0.55)"; g.font = "400 20px Georgia,serif";
    g.fillText("a tide of glass, breathing in 7 colours", W / 2, H - 42);

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}
