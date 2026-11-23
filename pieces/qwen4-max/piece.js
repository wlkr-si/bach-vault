export const title = "Epicycle";

export function start({ audioContext, canvas, duration, random }) {
  const T = 13.6;                                   // grand conjunction (s, rel. t0)
  const KS   = [1, 2, 3, 4, 5, 6, 8, 12];           // revolutions per cycle
  const FREQ = [73.42, 110, 146.83, 174.61, 220, 261.63, 329.63, 587.33]; // Dm9 spread
  const TAU  = [3.4, 2.6, 2.1, 1.8, 1.5, 1.2, 0.95, 0.75];
  const GAIN = [0.9, 0.7, 0.62, 0.55, 0.5, 0.45, 0.4, 0.34];
  const RGB  = ["#ffc46b","#ff9d5c","#ff7d7d","#e86fb4","#b07cff","#7a8cff","#54c8ff","#8affde"]
    .map(h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]);
  const N = KS.length;
  const t0 = audioContext.currentTime + 0.05;
  if (audioContext.state === "suspended") audioContext.resume();

  // ---------- score: every meridian crossing ----------
  const events = [];
  KS.forEach((k, i) => { for (let j = 1; j <= k; j++) events.push({ t: j * T / k, i }); });
  events.push({ t: 0.15, i: 0, opening: true });
  events.sort((a, b) => a.t - b.t);
  const counts = {};
  events.forEach(e => { const k = Math.round(e.t * 1000); counts[k] = (counts[k] || 0) + 1; });
  events.forEach(e => { e.n = counts[Math.round(e.t * 1000)]; });

  // ---------- glass bells: additive inharmonic partials, rendered to buffers ----------
  function makeBell(f, tau, i) {
    const sr = audioContext.sampleRate;
    const buf = audioContext.createBuffer(1, Math.ceil(Math.min(5.5, tau * 2.8) * sr), sr);
    const d = buf.getChannelData(0);
    const parts = [
      [1, 1, tau], [1.003, 0.55, tau * 0.92], [2.76, 0.4 + i * 0.02, tau * 0.42],
      [5.4, 0.18 + i * 0.015, tau * 0.2], [8.93, 0.07, tau * 0.09]
    ].map(([r, a, tt]) => ({ w: 2 * Math.PI * f * r / sr, a, dec: Math.exp(-1 / (sr * tt)), e: 1, p: 0 }));
    let se = 1; const sdec = Math.exp(-1 / (sr * 0.005));
    for (let n = 0; n < d.length; n++) {
      let s = 0;
      for (const q of parts) { s += q.a * q.e * Math.sin(q.p); q.p += q.w; q.e *= q.dec; }
      if (se > 1e-4) { s += (random() * 2 - 1) * 0.3 * se; se *= sdec; }
      d[n] = s;
    }
    let peak = 0;
    for (let n = 0; n < d.length; n++) peak = Math.max(peak, Math.abs(d[n]));
    const g = 0.85 / peak, fade = Math.floor(sr * 0.05);
    for (let n = 0; n < d.length; n++) {
      let v = d[n] * g; const k = d.length - 1 - n;
      if (k < fade) v *= k / fade;
      d[n] = v;
    }
    return buf;
  }
  const bells = FREQ.map((f, i) => makeBell(f, TAU[i], i));

  // ---------- graph ----------
  const master = audioContext.createGain();
  const comp = audioContext.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 3.5;
  comp.attack.value = 0.004; comp.release.value = 0.25;
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.8;
  master.connect(comp); comp.connect(analyser); analyser.connect(audioContext.destination);
  master.gain.setValueAtTime(1, t0);
  master.gain.setValueAtTime(1, t0 + 14.2);
  master.gain.linearRampToValueAtTime(0.0001, t0 + 14.88);

  const bellBus = audioContext.createGain(); bellBus.connect(master);
  const send = audioContext.createGain(); send.gain.value = 0.32;
  const delay = audioContext.createDelay(2); delay.delayTime.value = T / 24; // half the fastest orbit
  const lp = audioContext.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;
  const fb = audioContext.createGain(); fb.gain.value = 0.36;
  const wet = audioContext.createGain(); wet.gain.value = 0.5;
  send.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(wet); wet.connect(master);

  for (const e of events) {
    const src = audioContext.createBufferSource();
    src.buffer = bells[e.i];
    src.playbackRate.value = 1 + (random() - 0.5) * 0.004;
    const g = audioContext.createGain();
    g.gain.value = GAIN[e.i] * (0.9 + random() * 0.2) * (1 + 0.12 * (e.n - 1));
    const pan = audioContext.createStereoPanner();
    pan.pan.value = (e.i / (N - 1) - 0.5) * 1.3;
    src.connect(g); g.connect(pan); pan.connect(bellBus); pan.connect(send);
    src.start(t0 + e.t);
  }

  // ---------- drone, sub drop, air ----------
  const dlp = audioContext.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 520; dlp.Q.value = 0.5;
  const dg = audioContext.createGain();
  dg.gain.setValueAtTime(0.0001, t0);
  dg.gain.linearRampToValueAtTime(0.11, t0 + 2.2);
  dg.gain.setValueAtTime(0.11, t0 + 10.5);
  dg.gain.linearRampToValueAtTime(0.2, t0 + 13.6);
  dg.gain.linearRampToValueAtTime(0.0001, t0 + 14.85);
  dlp.connect(dg); dg.connect(master);
  for (const [f, type, a] of [[73.42,"sine",1],[73.9,"sine",0.5],[110,"sine",0.7],[146.83,"triangle",0.22]]) {
    const o = audioContext.createOscillator(); o.type = type; o.frequency.value = f;
    const g = audioContext.createGain(); g.gain.value = a;
    o.connect(g); g.connect(dlp); o.start(t0); o.stop(t0 + 15);
  }
  const lfo = audioContext.createOscillator(); lfo.frequency.value = 0.13;
  const lg = audioContext.createGain(); lg.gain.value = 180;
  lfo.connect(lg); lg.connect(dlp.frequency); lfo.start(t0); lfo.stop(t0 + 15);

  const sub = audioContext.createOscillator(); sub.frequency.value = 36.71;
  const sg = audioContext.createGain();
  sg.gain.setValueAtTime(0.0001, t0 + 13.58);
  sg.gain.linearRampToValueAtTime(0.4, t0 + 13.65);
  sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 14.8);
  sub.connect(sg); sg.connect(master); sub.start(t0 + 13.58); sub.stop(t0 + 15);

  const nb = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
  const nd = nb.getChannelData(0);
  for (let n = 0; n < nd.length; n++) nd[n] = random() * 2 - 1;
  const ns = audioContext.createBufferSource(); ns.buffer = nb; ns.loop = true;
  const bp = audioContext.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2800; bp.Q.value = 0.8;
  const ng = audioContext.createGain();
  ng.gain.setValueAtTime(0.0001, t0 + 10.8);
  ng.gain.linearRampToValueAtTime(0.045, t0 + 13.6);
  ng.gain.linearRampToValueAtTime(0.0001, t0 + 13.9);
  ns.connect(bp); bp.connect(ng); ng.connect(master); ns.start(t0 + 10.8); ns.stop(t0 + 14);

  // ---------- visual ----------
  const W = 1080, H = 1350, CX = 540, CY = 640;
  const R = [470, 420, 370, 320, 270, 220, 170, 120];
  const SIZE = [15, 13, 11.5, 10, 9, 8, 7, 6];
  const g2 = canvas.getContext("2d");
  const rgba = (i, a) => `rgba(${RGB[i][0]},${RGB[i][1]},${RGB[i][2]},${a})`;
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };

  const bg = document.createElement("canvas"); bg.width = W; bg.height = H;
  const twinkle = [];
  {
    const b = bg.getContext("2d");
    const grad = b.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#04050e"); grad.addColorStop(0.5, "#0a0d20"); grad.addColorStop(1, "#04050e");
    b.fillStyle = grad; b.fillRect(0, 0, W, H);
    const neb = (x, y, r, c) => {
      const rg = b.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, c); rg.addColorStop(1, "rgba(0,0,0,0)");
      b.fillStyle = rg; b.fillRect(0, 0, W, H);
    };
    neb(300, 420, 560, "rgba(64,52,140,0.20)");
    neb(820, 900, 620, "rgba(28,80,120,0.16)");
    neb(560, 180, 420, "rgba(120,48,110,0.12)");
    for (let s = 0; s < 170; s++) {
      const x = random() * W, y = random() * H, r = random() * 1.4 + 0.3;
      b.fillStyle = `rgba(220,230,255,${0.15 + random() * 0.5})`;
      b.beginPath(); b.arc(x, y, r, 0, 7); b.fill();
      if (s < 36) twinkle.push({ x, y, r, ph: random() * 6.28, sp: 0.5 + random() * 2 });
    }
    const v = b.createRadialGradient(CX, CY, 300, CX, CY, 900);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.55)");
    b.fillStyle = v; b.fillRect(0, 0, W, H);
  }

  const flash = new Float32Array(N), pulse = new Float32Array(N);
  let particles = [], ripples = [], waves = [], links = [], shocks = [], recent = [];
  let shake = 0, mer = 0, whiteFlash = 0, evIdx = 0, converged = false;
  const freqArr = new Uint8Array(analyser.frequencyBinCount);
  const timeArr = new Uint8Array(analyser.fftSize);

  function spawn(e) {
    const i = e.i;
    flash[i] = 1; mer = Math.min(1, mer + 0.3 + 0.08 * e.n);
    const x = CX, y = CY - R[i];
    ripples.push({ x, y, age: 0, dur: 0.8, r1: 70 + e.n * 14, i });
    waves.push({ i, age: 0, dur: 0.9 });
    const count = (e.n >= 6 ? 0 : e.n >= 3 ? 26 : e.n >= 2 ? 18 : 12) + (e.opening ? 24 : 0);
    for (let p = 0; p < count; p++) {
      const a = random() * 6.283, sp = 60 + random() * 260 * (1 + e.n * 0.1);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 0.5 + random() * 0.7, i, sz: 1 + random() * 2.4 });
    }
    for (const h of recent) if (h.i !== i && e.t - h.t < 0.13) links.push({ a: h.i, b: i, age: 0, dur: 0.7 });
    recent.push({ i, t: e.t }); if (recent.length > 12) recent.shift();
    shake = Math.min(9, shake + (e.n >= 4 ? 4 : 1));
    if (e.n >= 6 && !converged) {
      converged = true; whiteFlash = 1; shake = 9;
      shocks.push({ age: 0, dur: 1.2, r1: 820 });
      for (let p = 0; p < 130; p++) {
        const a = random() * 6.283, sp = 120 + random() * 560;
        particles.push({ x: CX, y: CY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 0.7 + random() * 0.9, i: 0, sz: 1.2 + random() * 2.6, gold: true });
      }
    }
  }

  function spaced(txt, x, y, sp) {
    const ws = []; let total = -sp;
    for (const ch of txt) { const w = g2.measureText(ch).width; ws.push(w); total += w + sp; }
    let cx = x - total / 2, k = 0;
    for (const ch of txt) { g2.fillText(ch, cx, y); cx += ws[k++] + sp; }
  }

  let last = performance.now();
  function frame(now) {
    const t = Math.max(0, audioContext.currentTime - t0);
    const dt = Math.min(0.05, (now - last) / 1000) || 0.016; last = now;
    g2.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    if (t >= duration) { g2.fillStyle = "#000"; g2.fillRect(0, 0, W, H); return; }
    while (evIdx < events.length && events[evIdx].t <= t) spawn(events[evIdx++]);

    analyser.getByteFrequencyData(freqArr);
    analyser.getByteTimeDomainData(timeArr);
    let bass = 0; for (let b = 1; b < 7; b++) bass += freqArr[b]; bass /= 6 * 255;
    for (let i = 0; i < N; i++) {
      const bin = Math.max(1, Math.round(FREQ[i] / (audioContext.sampleRate / 2) * freqArr.length));
      const v = (freqArr[bin] + freqArr[bin + 1]) / (2 * 255);
      pulse[i] += (v - pulse[i]) * Math.min(1, dt * 9);
      flash[i] = Math.max(0, flash[i] - dt * 2.4);
    }
    mer = Math.max(0, mer - dt * 2.2);
    shake = Math.max(0, shake - dt * 14);
    whiteFlash = Math.max(0, whiteFlash - dt * 1.6);

    g2.globalCompositeOperation = "source-over";
    g2.drawImage(bg, 0, 0);
    g2.translate((random() - 0.5) * shake, (random() - 0.5) * shake);
    g2.globalCompositeOperation = "lighter";

    for (const s of twinkle) {
      const a = 0.25 + 0.35 * Math.sin(t * s.sp + s.ph);
      if (a > 0) { g2.fillStyle = `rgba(210,225,255,${a})`; g2.beginPath(); g2.arc(s.x, s.y, s.r * 0.9, 0, 7); g2.fill(); }
    }

    const ang = [], rr = [], px = [], py = [];
    for (let i = 0; i < N; i++) {
      ang[i] = -Math.PI / 2 + (t / T) * KS[i] * 2 * Math.PI;
      rr[i] = R[i] + pulse[i] * 6;
      px[i] = CX + Math.cos(ang[i]) * rr[i];
      py[i] = CY + Math.sin(ang[i]) * rr[i];
    }

    g2.strokeStyle = `rgba(200,215,255,${0.08 + mer * 0.4})`;
    g2.lineWidth = 1 + mer * 2;
    g2.beginPath(); g2.moveTo(CX, CY - 90); g2.lineTo(CX, CY - R[0] - 40); g2.stroke();

    for (let i = 0; i < N; i++) {
      g2.strokeStyle = rgba(i, 0.10 + pulse[i] * 0.22 + flash[i] * 0.45);
      g2.lineWidth = 1 + flash[i] * 2.2 + pulse[i] * 1.5;
      g2.beginPath(); g2.arc(CX, CY, rr[i], 0, 7); g2.stroke();
    }

    waves = waves.filter(w => (w.age += dt) < w.dur);
    for (const w of waves) {
      const p = w.age / w.dur, spread = p * 2.6;
      g2.strokeStyle = rgba(w.i, 0.5 * (1 - p));
      g2.lineWidth = 2.5 * (1 - p) + 0.5;
      g2.beginPath(); g2.arc(CX, CY, rr[w.i], -Math.PI / 2 - spread, -Math.PI / 2); g2.stroke();
      g2.beginPath(); g2.arc(CX, CY, rr[w.i], -Math.PI / 2, -Math.PI / 2 + spread); g2.stroke();
    }

    links = links.filter(l => (l.age += dt) < l.dur);
    for (const l of links) {
      g2.strokeStyle = `rgba(235,240,255,${0.3 * (1 - l.age / l.dur)})`;
      g2.lineWidth = 1.2;
      g2.beginPath(); g2.moveTo(px[l.a], py[l.a]); g2.lineTo(px[l.b], py[l.b]); g2.stroke();
    }

    for (let i = 0; i < N; i++) {
      const span = Math.min(1.5, KS[i] * 2 * Math.PI / T * 0.45);
      for (let s = 0; s < 22; s++) {
        const a1 = ang[i] - span * s / 22, a2 = ang[i] - span * (s + 1) / 22;
        g2.strokeStyle = rgba(i, 0.30 * Math.pow(1 - s / 22, 2) * (0.55 + 0.45 * flash[i] + 0.3 * pulse[i]));
        g2.lineWidth = SIZE[i] * 0.5 * (1 - s / 22) + 0.4;
        g2.beginPath(); g2.arc(CX, CY, rr[i], a2, a1); g2.stroke();
      }
      const gr = g2.createRadialGradient(px[i], py[i], 0, px[i], py[i], SIZE[i] * 4.5);
      gr.addColorStop(0, rgba(i, 0.55 + flash[i] * 0.4)); gr.addColorStop(1, rgba(i, 0));
      g2.fillStyle = gr;
      g2.beginPath(); g2.arc(px[i], py[i], SIZE[i] * 4.5, 0, 7); g2.fill();
      g2.fillStyle = rgba(i, 0.95);
      g2.beginPath(); g2.arc(px[i], py[i], SIZE[i], 0, 7); g2.fill();
      g2.fillStyle = "rgba(255,255,255,0.9)";
      g2.beginPath(); g2.arc(px[i], py[i], SIZE[i] * 0.45, 0, 7); g2.fill();
    }

    const sr0 = 44 + bass * 26 + whiteFlash * 20;
    const sgr = g2.createRadialGradient(CX, CY, 0, CX, CY, sr0 * 2.6);
    sgr.addColorStop(0, "rgba(255,244,214,0.9)");
    sgr.addColorStop(0.35, "rgba(255,196,107,0.35)");
    sgr.addColorStop(1, "rgba(255,196,107,0)");
    g2.fillStyle = sgr;
    g2.beginPath(); g2.arc(CX, CY, sr0 * 2.6, 0, 7); g2.fill();
    g2.fillStyle = "rgba(255,250,235,0.95)";
    g2.beginPath(); g2.arc(CX, CY, sr0 * 0.55, 0, 7); g2.fill();
    g2.beginPath();
    for (let k = 0; k < 128; k++) {
      const v = (timeArr[k * 8] - 128) / 128;
      const r = 70 + v * 24 + bass * 6, a = k / 128 * 2 * Math.PI - Math.PI / 2;
      const x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r;
      k ? g2.lineTo(x, y) : g2.moveTo(x, y);
    }
    g2.closePath();
    g2.strokeStyle = "rgba(255,236,190,0.55)"; g2.lineWidth = 1.4; g2.stroke();

    ripples = ripples.filter(r => (r.age += dt) < r.dur);
    for (const r of ripples) {
      const p = r.age / r.dur;
      g2.strokeStyle = rgba(r.i, 0.45 * (1 - p));
      g2.lineWidth = 2 * (1 - p) + 0.4;
      g2.beginPath(); g2.arc(r.x, r.y, r.r1 * (1 - Math.pow(1 - p, 2)), 0, 7); g2.stroke();
    }

    shocks = shocks.filter(s => (s.age += dt) < s.dur);
    for (const s of shocks) {
      const p = s.age / s.dur;
      g2.strokeStyle = `rgba(255,220,150,${0.5 * (1 - p)})`;
      g2.lineWidth = 24 * (1 - p) + 1;
      g2.beginPath(); g2.arc(CX, CY, s.r1 * (1 - Math.pow(1 - p, 3)), 0, 7); g2.stroke();
    }

    particles = particles.filter(p => (p.age += dt) < p.life);
    for (const p of particles) {
      const drag = Math.max(0, 1 - 1.6 * dt);
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 0.8 * (1 - p.age / p.life);
      g2.fillStyle = p.gold ? `rgba(255,215,140,${a})` : rgba(p.i, a);
      g2.beginPath(); g2.arc(p.x, p.y, p.sz * (1 - p.age / p.life * 0.6), 0, 7); g2.fill();
    }

    if (whiteFlash > 0) {
      g2.fillStyle = `rgba(255,235,190,${whiteFlash * 0.22})`;
      g2.fillRect(-20, -20, W + 40, H + 40);
    }

    g2.globalCompositeOperation = "source-over";
    const ta = smooth(0.5, 1.8, t) * (1 - smooth(13.9, 14.6, t));
    if (ta > 0.01) {
      g2.textAlign = "left"; g2.textBaseline = "middle";
      g2.font = '500 34px "Avenir Next","Segoe UI",system-ui,sans-serif';
      g2.fillStyle = `rgba(226,232,255,${ta * 0.85})`;
      spaced("EPICYCLE", CX, 1246, 20);
      g2.fillStyle = `rgba(226,232,255,${ta * 0.3})`;
      g2.fillRect(CX - 70, 1206, 140, 1);
    }
    const fo = smooth(14.2, 14.88, t);
    if (fo > 0) { g2.fillStyle = `rgba(3,4,10,${fo})`; g2.fillRect(-20, -20, W + 40, H + 40); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
