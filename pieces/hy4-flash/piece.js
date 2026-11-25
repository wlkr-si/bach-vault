export const title = "Vitrail";

export function start({ audioContext, canvas, duration, random }) {
  const ctx = audioContext;
  const t0 = ctx.currentTime + 0.06;
  const beat = 0.375 * (duration / 15);
  const T = (b) => t0 + b * beat;
  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- Audio graph ----------
  const bus = ctx.createGain();
  bus.gain.value = 0.82;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 22;
  comp.ratio.value = 4;
  comp.attack.value = 0.006;
  comp.release.value = 0.28;
  bus.connect(comp);
  comp.connect(ctx.destination);

  const mix = ctx.createGain();
  mix.connect(bus);

  // Procedural impulse response (stained-glass reverb)
  const irLen = Math.floor(ctx.sampleRate * 2.4);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) {
      const u = i / irLen;
      d[i] = (random() * 2 - 1) * Math.pow(1 - u, 2.6) * (u < 0.01 ? u * 100 : 1);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  mix.connect(conv);
  conv.connect(wet);
  wet.connect(bus);

  const mkPan = (v) => {
    const p = ctx.createStereoPanner();
    p.pan.value = v;
    p.connect(mix);
    return p;
  };
  const pans = [mkPan(-0.38), mkPan(0.38), mkPan(0)];

  // Bell / glass-pluck spectrum
  const real = new Float32Array(9);
  const imag = new Float32Array(9);
  const amps = [0, 1, 0.55, 0.32, 0.2, 0.12, 0.07, 0.04, 0.02];
  for (let i = 1; i < 9; i++) imag[i] = amps[i];
  const wave = ctx.createPeriodicWave(real, imag);

  function playNote(t, midi, dur, vel, voice) {
    const f = midiToFreq(midi);
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.setValueAtTime(f, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vel), t + 0.009);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(Math.min(10000, f * 9), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(280, f * 2), t + dur);
    osc.connect(g);
    g.connect(lp);
    lp.connect(pans[voice] || pans[2]);

    // inharmonic glass shimmer
    const sh = ctx.createOscillator();
    sh.type = "sine";
    sh.frequency.setValueAtTime(f * 2.006, t);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(Math.max(0.0005, vel * 0.24), t + 0.005);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.55);
    sh.connect(sg);
    sg.connect(lp);

    osc.start(t);
    osc.stop(t + dur + 0.06);
    sh.start(t);
    sh.stop(t + dur * 0.55 + 0.06);
  }

  function bass(t, f, dur, vel) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.06);
  }

  const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.16), ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = random() * 2 - 1;
  function tick(t, vel, bright) {
    const s = ctx.createBufferSource();
    s.buffer = nb;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = bright ? 5400 : 2200;
    f.Q.value = 1.1;
    const g = ctx.createGain();
    const len = bright ? 0.05 : 0.095;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f);
    f.connect(g);
    g.connect(mix);
    s.start(t);
    s.stop(t + 0.17);
  }

  // Sustained harmonic bed
  const padGain = ctx.createGain();
  padGain.gain.setValueAtTime(0, t0);
  padGain.gain.linearRampToValueAtTime(0.055, T(1.4));
  padGain.gain.setValueAtTime(0.055, T(29));
  padGain.gain.linearRampToValueAtTime(0.0001, T(39));
  const padFilt = ctx.createBiquadFilter();
  padFilt.type = "lowpass";
  padFilt.frequency.value = 760;
  padGain.connect(padFilt);
  padFilt.connect(mix);
  [110, 164.81, 55].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i === 2 ? "sine" : "sawtooth";
    o.frequency.value = f;
    o.detune.value = (i - 1) * 5;
    const g = ctx.createGain();
    g.gain.value = i === 2 ? 0.5 : 0.24;
    o.connect(g);
    g.connect(padGain);
    o.start(t0);
    o.stop(t0 + 14.95);
  });

  // ---------- Score ----------
  const events = [];
  function line(base, durBeats, gain, notes, voice) {
    for (const [off, midi, vel] of notes) {
      const t = T(base + off) + (random() - 0.5) * 0.012;
      const v = vel * gain * (0.92 + random() * 0.16);
      playNote(t, midi, durBeats * beat, v, voice);
      events.push({ t, midi, voice, vel: v });
    }
  }
  function chord(base, midis, durBeats, gain) {
    midis.forEach((m, i) => {
      const t = T(base) + (i % 2 ? 0.01 : 0);
      const v = gain * (0.88 + random() * 0.24);
      playNote(t, m, durBeats * beat, v, 2);
      events.push({ t, midi: m, voice: 2, vel: v });
    });
  }

  // Bar 1: the subject, alone
  line(0, 1.15, 0.34, [
    [0, 69, 1], [.5, 76, .95], [1, 72, .9], [1.5, 77, .95],
    [2, 76, .95], [2.5, 74, .9], [3, 72, .9], [3.5, 71, .85], [4, 69, 1]
  ], 0);

  // Bar 2: answer in the dominant, countersubject in contrary motion
  line(4, 1.15, 0.30, [
    [0, 64, 1], [.5, 71, .9], [1, 67, .85], [1.5, 72, .9],
    [2, 71, .95], [2.5, 69, .9], [3, 67, .85], [3.5, 66, .85], [4, 64, .9]
  ], 1);
  line(4, 1.15, 0.25, [
    [0, 69, .9], [.5, 71, .9], [1, 72, .9], [1.5, 74, .9],
    [2, 76, .95], [2.5, 77, .95], [3, 76, .9], [3.5, 74, .85], [4, 72, .9]
  ], 0);

  // Bar 3: diatonic inversion
  line(8, 1.05, 0.30, [
    [0, 69, .95], [.5, 74, .9], [1, 77, .95], [1.5, 72, .85],
    [2, 74, .9], [2.5, 76, .9], [3, 77, .95], [3.5, 80, .9], [4, 81, 1]
  ], 0);
  line(8, 0.95, 0.23, [
    [0, 64, .9], [.5, 64, .8], [1, 65, .85], [1.5, 65, .8],
    [2, 68, .9], [2.5, 68, .8], [3, 69, .9], [3.5, 71, .85], [4, 72, .9]
  ], 1);

  // Bar 4: stretto
  line(12, 1.05, 0.30, [
    [0, 69, 1], [.5, 76, .95], [1, 72, .9], [1.5, 77, .95],
    [2, 76, .95], [2.5, 74, .9], [3, 72, .9], [3.5, 71, .85], [4, 69, .9]
  ], 1);
  line(14, 0.95, 0.24, [
    [0, 81, .95], [.5, 80, .9], [1, 77, .9], [1.5, 76, .9],
    [2, 74, .9], [2.5, 72, .85], [3, 71, .85], [3.5, 69, .85]
  ], 0);

  // Bar 5: ascending sequence, pulse enters
  line(16, 0.85, 0.29, [
    [0, 76, .9], [.5, 77, .9], [1, 80, .95], [1.5, 81, 1],
    [2, 83, 1], [2.5, 84, 1], [3, 86, 1], [3.5, 88, 1]
  ], 0);
  line(16, 0.85, 0.23, [
    [0, 69, .85], [.5, 72, .85], [1, 76, .9], [1.5, 81, .95],
    [2, 80, .9], [2.5, 76, .85], [3, 72, .85], [3.5, 69, .8]
  ], 1);

  // Bar 6: climax in octaves
  line(20, 1.05, 0.33, [
    [0, 81, 1], [.5, 76, .95], [1, 72, .9], [1.5, 77, .95],
    [2, 76, 1], [2.5, 74, .9], [3, 72, .95], [3.5, 71, .9], [4, 81, 1]
  ], 0);
  line(20, 1.05, 0.29, [
    [0, 69, .95], [.5, 64, .9], [1, 60, .9], [1.5, 65, .9],
    [2, 64, .95], [2.5, 62, .9], [3, 60, .9], [3.5, 59, .85], [4, 69, .95]
  ], 1);
  chord(20, [45, 57, 60, 64, 69], 2.4, 0.055);
  chord(22, [45, 57, 61, 64, 69], 2.4, 0.055);

  // Bar 7: peak, sustained radiance
  line(24, 1.45, 0.30, [
    [0, 88, 1], [1, 84, .95], [2, 81, .95], [2.5, 83, .9],
    [3, 84, .95], [3.5, 86, .9], [4, 88, 1]
  ], 0);
  line(24, 2.0, 0.16, [[0, 69, .9], [2, 76, .9], [4, 81, .9]], 1);
  chord(24, [45, 57, 61, 64, 69, 76], 3.6, 0.05);

  // Bar 8: falling fragments
  line(28, 0.95, 0.27, [
    [0, 81, .95], [.5, 80, .9], [1, 77, .9], [1.5, 76, .9],
    [2, 74, .85], [2.5, 72, .85], [3, 71, .8], [3.5, 69, .8]
  ], 0);
  line(28, 1.25, 0.19, [
    [0, 72, .85], [1, 69, .8], [2, 65, .8], [3, 62, .75], [4, 57, .75]
  ], 1);

  // Bar 9: Picardy cadence
  chord(32, [45, 57, 61, 64, 69, 73, 76], 7.0, 0.085);
  playNote(T(33), 88, 3.2, 0.10, 2);
  playNote(T(35), 81, 2.6, 0.075, 2);
  events.push({ t: T(33), midi: 88, voice: 2, vel: 0.10 });
  events.push({ t: T(35), midi: 81, voice: 2, vel: 0.075 });

  // Bar 10: final bass and fading shimmer
  bass(T(36), 55, 2.8, 0.22);
  events.push({ t: T(36), midi: 33, voice: 3, vel: 0.22 });
  playNote(T(37.2), 93, 2.2, 0.055, 2);
  events.push({ t: T(37.2), midi: 93, voice: 2, vel: 0.055 });

  // Bass pulse and percussion
  const roots = [33, 40, 33, 38, 40, 33, 33, 38, 33, 33];
  for (let b = 0; b < 40; b += 2) {
    const r = roots[Math.floor(b / 4)];
    bass(T(b), midiToFreq(r), 0.55 * beat, b % 4 === 0 ? 0.26 : 0.18);
    events.push({ t: T(b), midi: r, voice: 3, vel: 0.2 });
  }
  for (let b = 16; b < 32; b += 0.5) {
    const acc = b % 2 === 0;
    tick(T(b), acc ? 0.05 : 0.022, acc);
  }
  for (let b = 32; b < 38; b += 1) tick(T(b), 0.016, false);

  events.sort((a, b) => a.t - b.t);

  // ---------- Visuals ----------
  const g = canvas.getContext("2d");
  const W = canvas.width || 1080;
  const H = canvas.height || 1350;
  const cx = W / 2;
  const cy = H / 2;

  g.fillStyle = "#04050c";
  g.fillRect(0, 0, W, H);
  const fade = g.createRadialGradient(cx, cy, 40, cx, cy, H * 0.8);
  fade.addColorStop(0, "rgba(9,11,24,0.15)");
  fade.addColorStop(1, "rgba(3,4,10,0.31)");

  let idx = 0;
  let prev = 0;
  let energy = 0;
  const pc = new Float32Array(12);
  const particles = [];
  const rings = [];
  const vAng = [0.3, -1.15];

  const palette = {
    0: [85, 230, 212],
    1: [255, 180, 95],
    2: [185, 140, 255],
    3: [255, 105, 175]
  };

  function spawn(ev) {
    const { midi, voice, vel, t } = ev;
    pc[midi % 12] = Math.min(1.5, pc[midi % 12] + 0.85);
    energy = Math.min(1.25, energy + vel * 0.55);
    const col = palette[voice] || palette[2];
    const ang = (midi % 12) / 12 * Math.PI * 2 - Math.PI / 2 + (random() - 0.5) * 0.35;
    const rad = 120 + (midi - 57) * 3.1 + voice * 16;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    const n = voice === 3 ? 12 : 5;
    for (let i = 0; i < n; i++) {
      const a = random() * Math.PI * 2;
      const sp = 18 + random() * 78;
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.55 + random() * 0.95, max: 1.5,
        size: 1.4 + random() * 3.6, col
      });
    }
    if (voice === 3) rings.push({ t0: t - t0 });
  }

  function frame() {
    const el = ctx.currentTime - t0;
    const dt = Math.min(0.05, Math.max(0, el - prev));
    prev = el;

    g.fillStyle = fade;
    g.fillRect(0, 0, W, H);

    while (idx < events.length && events[idx].t <= el) {
      spawn(events[idx]);
      idx++;
    }
    for (let i = 0; i < 12; i++) pc[i] *= 0.93;
    energy *= 0.965;

    // Pitch-class stained-glass wheel
    g.save();
    g.translate(cx, cy);
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2 - Math.PI / 2 - 0.128;
      const a1 = a0 + 0.256;
      const val = pc[k];
      const hue = (k * 30 + 188) % 360;
      g.strokeStyle = `hsla(${hue},92%,${56 + val * 22}%,${0.055 + val * 0.72})`;
      g.lineWidth = 6 + val * 9;
      g.shadowColor = `hsla(${hue},95%,65%,0.85)`;
      g.shadowBlur = 8 + val * 24;
      g.beginPath();
      g.arc(0, 0, 212, a0, a1);
      g.stroke();
    }
    g.restore();
    g.shadowBlur = 0;

    // Counter-rotating geometric lattices
    const pulse = 1 + energy * 0.09;
    for (let p = 0; p < 3; p++) {
      g.save();
      g.translate(cx, cy);
      g.rotate(el * (p % 2 ? -0.045 : 0.062) + p * 0.4);
      const n = 3 + p;
      const rad = (88 + p * 46) * pulse;
      g.strokeStyle = `hsla(${182 + p * 46},85%,62%,${0.10 + energy * 0.20})`;
      g.lineWidth = 1.3;
      g.shadowColor = p % 2 ? "#ffb45e" : "#4fe0d0";
      g.shadowBlur = 7;
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
      g.restore();
    }
    g.shadowBlur = 0;

    // Particles
    g.globalCompositeOperation = "lighter";
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
      const a = Math.min(1, p.life / p.max);
      g.fillStyle = `rgba(${p.col[0]},${p.col[1]},${p.col[2]},${a * 0.55})`;
      g.beginPath();
      g.arc(p.x, p.y, p.size * a + 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = "source-over";

    // Bass shockwaves
    for (let i = rings.length - 1; i >= 0; i--) {
      const age = el - rings[i].t0;
      if (age > 1.5 || age < 0) {
        if (age > 1.5) rings.splice(i, 1);
        continue;
      }
      g.strokeStyle = `rgba(255,110,175,${0.16 * (1 - age / 1.5)})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, age * 350, 0, Math.PI * 2);
      g.stroke();
    }

    // The two voices as orbiting luminaries
    vAng[0] += dt * 0.55;
    vAng[1] -= dt * 0.43;
    const vp = [];
    for (let v = 0; v < 2; v++) {
      const a = vAng[v];
      const r = 152 + 38 * Math.sin(el * 0.7 + v * 2) + energy * 28;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 1.12;
      vp.push([x, y]);
      const c = palette[v];
      g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.92)`;
      g.shadowColor = v ? "#ffb45e" : "#4fe0d0";
      g.shadowBlur = 26 + energy * 16;
      g.beginPath();
      g.arc(x, y, 4 + energy * 5, 0, Math.PI * 2);
      g.fill();
    }
    g.shadowBlur = 0;
    g.strokeStyle = `rgba(205,225,255,${0.05 + energy * 0.16})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(vp[0][0], vp[0][1]);
    g.lineTo(vp[1][0], vp[1][1]);
    g.stroke();

    if (el < duration + 3) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
