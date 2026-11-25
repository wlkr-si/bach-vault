export const title = "Cipher in B♭ — Fugue on B·A·C·H";

export function start({ audioContext: ac, canvas, duration = 15, random = Math.random }) {
  /* ------------------------------------------------------------------
     Cipher in B♭ — a 15-second fugue whose subject IS the B-A-C-H
     cipher (B♭ A C B♮). Exposition with three entries and countersubjects,
     a stretto over a chromatic lament bass, cadence Eb–Cm–F, and a rolled
     B♭-major Picardie final chord with timpani bloom.
     Visual: a manuscript plate. Each voice entry ignites its cipher letter;
     ink ribbons draw each voice live; ghost engraving shows the score ahead;
     the playhead sweeps the 15-second plate; everything seeds from random().
  ------------------------------------------------------------------ */
  const G = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, S = H / 1350;
  const doc = canvas.ownerDocument || (typeof document !== "undefined" ? document : null);
  const mk = (w, h) => { const c = doc.createElement("canvas"); c.width = w; c.height = h; return c; };

  const BEATS = 25, B = duration / BEATS;      // 100-bpm quarter-note grid
  const t0 = ac.currentTime + 0.12;            // piece start on the audio clock
  const bt = b => t0 + b * B;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  /* ---------------- audio graph ---------------- */
  const master = ac.createGain(); master.gain.value = 0.0001;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 14; comp.ratio.value = 3.2;
  comp.attack.value = 0.006; comp.release.value = 0.25;
  master.connect(comp); comp.connect(ac.destination);
  const dry = ac.createGain(); dry.gain.value = 0.82; dry.connect(master);

  const IRL = Math.max(1, Math.floor(ac.sampleRate * 2.3));   // seeded hall reverb
  const ir = ac.createBuffer(2, IRL, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < IRL; i++) d[i] = (random() * 2 - 1) * Math.pow(1 - i / IRL, 2.6);
  }
  const conv = ac.createConvolver(); conv.buffer = ir;
  const wet = ac.createGain(); wet.gain.value = 0.5;
  conv.connect(wet); wet.connect(master);

  const NL = Math.max(1, Math.floor(ac.sampleRate * 2));      // shared noise
  const noiseBuf = ac.createBuffer(1, NL, ac.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < NL; i++) d[i] = random() * 2 - 1; }

  master.gain.setValueAtTime(0.0001, ac.currentTime);
  master.gain.linearRampToValueAtTime(0.9, t0 + 0.06);
  master.gain.setValueAtTime(0.9, t0 + duration - 0.55);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + duration - 0.02);

  /* ---------------- timbres ---------------- */
  const TIM = {
    celesta: { p: [[1, "sine", 1, -3], [2, "triangle", 0.16, 5], [3.01, "sine", 0.05, 0]], atk: 0.005, rel: d => d + 1.35, f0: 9000, f1: 2600, send: 0.35, noise: 0.09, drop: true },
    pluck:   { p: [[1, "sawtooth", 0.5, -4], [2.003, "square", 0.06, 7], [1, "triangle", 0.3, 4]], atk: 0.004, rel: d => d + 0.85, f0: 3600, f1: 950, send: 0.28, noise: 0.12, drop: true },
    flute:   { p: [[1, "triangle", 0.85, 2], [0.5, "sine", 0.3, 0], [2, "sine", 0.06, -6]], atk: 0.035, rel: d => d + 1.0, f0: 5200, f1: 1900, send: 0.32, noise: 0, drop: true },
    bass:    { p: [[1, "sine", 1, 0], [1, "triangle", 0.28, -3], [2, "sine", 0.07, 5]], atk: 0.012, rel: d => d + 1.5, f0: 1000, f1: 320, send: 0.12, noise: 0, drop: true },
    pad:     { p: [[1, "sawtooth", 0.4, -8], [1.002, "sawtooth", 0.4, 8], [2, "sine", 0.05, 0]], atk: 0.55, rel: d => d + 1.0, f0: 1700, f1: 950, send: 0.55, noise: 0, drop: false },
  };

  function synth(time, midi, durB, vel, timName, pan) {
    const T = TIM[timName], f = hz(midi), rel = T.rel(durB * B), stop = time + rel + 0.08;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(vel, 0.0002), time + T.atk);
    if (T.drop) g.gain.exponentialRampToValueAtTime(Math.max(vel * 0.3, 0.0002), time + T.atk + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, time + rel);
    const snd = ac.createGain(); snd.gain.value = T.send;
    let tail = g;
    if (ac.createStereoPanner) {
      const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
      g.connect(p); tail = p;
    }
    tail.connect(dry); tail.connect(snd); snd.connect(conv);
    const flt = ac.createBiquadFilter();
    flt.type = "lowpass"; flt.Q.value = 0.6;
    flt.frequency.setValueAtTime(T.f0, time);
    flt.frequency.exponentialRampToValueAtTime(T.f1, time + Math.min(rel, 0.6));
    flt.connect(g);
    for (const q of T.p) {
      const o = ac.createOscillator();
      o.type = q[1]; o.frequency.value = f * q[0];
      o.detune.value = q[3] + (random() * 7 - 3.5);
      const og = ac.createGain(); og.gain.value = q[2];
      o.connect(og); og.connect(flt);
      o.start(time); o.stop(stop);
    }
    if (T.noise) {                                             // key transient
      const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2400;
      const ng = ac.createGain();
      ng.gain.setValueAtTime(T.noise * vel * 1.6, time);
      ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      s.connect(hp); hp.connect(ng); ng.connect(flt);
      s.start(time, random() * 1.5); s.stop(time + 0.08);
    }
  }

  function thump(time, vel) {                                  // timpani
    const o = ac.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(116, time);
    o.frequency.exponentialRampToValueAtTime(58, time + 0.22);
    const g = ac.createGain();
    g.gain.setValueAtTime(vel, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.85);
    o.connect(g); g.connect(dry);
    const s = ac.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(conv);
    o.start(time); o.stop(time + 0.9);
    const s2 = ac.createBufferSource(); s2.buffer = noiseBuf; s2.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 170; bp.Q.value = 1;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(vel * 0.25, time);
    ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    s2.connect(bp); bp.connect(ng); ng.connect(dry);
    s2.start(time, random()); s2.stop(time + 0.15);
  }

  function shimmer(time, vel) {                                // airy noise bloom
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 5200; bp.Q.value = 0.6;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vel, time + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 1.8);
    const snd = ac.createGain(); snd.gain.value = 0.8;
    s.connect(bp); bp.connect(g); g.connect(dry); g.connect(snd); snd.connect(conv);
    s.start(time, random()); s.stop(time + 1.9);
  }

  /* ---------------- the score (beats, MIDI) ---------------- */
  const V1 = 0, V2 = 1, V3 = 2, VB = 3, PD = 4;
  const EV = [];
  const e = (b, d, m, v, vel, tim, pan) => EV.push({ b, d, m, v, vel, tim, pan });

  // Exposition: the subject is the cipher itself — B♭ A C B
  e(0, 1, 70, V1, 0.54); e(1, 1, 69, V1); e(2, 1, 72, V1); e(3, 1, 71, V1);
  e(0, 3.9, 82, PD, 0.05); e(0, 3.9, 94, PD, 0.028);           // halo over the lone entry
  // Answer in the alto (down a fourth), countersubject above
  e(4, 1, 65, V2); e(5, 1, 64, V2); e(6, 1, 67, V2); e(7, 1, 66, V2);
  e(4, 1, 74, V1); e(5, 1, 72, V1); e(6, 1, 70, V1); e(7, 1, 69, V1);
  e(4, 3.8, 41, VB);
  // Third entry in the tenor (down an octave), two counters stacked
  e(8, 1, 58, V3); e(9, 1, 57, V3); e(10, 1, 60, V3); e(11, 1, 59, V3);
  e(8, 1, 70, V2); e(9, 1, 69, V2); e(10, 1, 67, V2); e(11, 1, 66, V2);
  e(8, 1, 75, V1); e(9, 1, 74, V1); e(10, 1, 72, V1); e(11, 1, 71, V1);
  e(8, 1.9, 46, VB); e(10, 1.8, 39, VB); e(11, 0.9, 38, VB);
  // Stretto: cipher in the soprano, answer joining at beat 14,
  // over a chromatic lament bass B♭ A A♭ G F♯ F
  e(12, 1, 46, VB); e(13, 1, 45, VB); e(14, 1, 44, VB);
  e(15, 1, 43, VB); e(16, 1, 42, VB); e(17, 1, 41, VB);
  e(12, 1, 82, V1, 0.54); e(13, 1, 81, V1); e(14, 1, 84, V1, 0.56); e(15, 1, 83, V1);
  e(16, 1, 81, V1); e(17, 1, 79, V1);
  e(14, 1, 70, V2); e(15, 1, 69, V2); e(16, 1, 72, V2); e(17, 1, 71, V2);
  e(15, 0.5, 55, V3, 0.36); e(15.5, 0.5, 57, V3, 0.38); e(16, 0.5, 58, V3, 0.4);
  e(16.5, 0.5, 60, V3, 0.42); e(17, 0.5, 62, V3, 0.44); e(17.5, 0.5, 64, V3, 0.46);
  // Cadence: Eb — Cm — F. The cipher's B♮ resolves to B♭, its F♯ to E♭.
  e(18, 1, 39, VB, 0.55); e(18, 1, 63, V3); e(18, 1, 70, V2, 0.48); e(18, 1, 79, V1, 0.52);
  e(19, 1, 36, VB, 0.52); e(19, 1, 63, V3); e(19, 1, 67, V2); e(19, 1, 75, V1);
  e(20, 1.9, 41, VB, 0.55); e(20, 1.9, 60, V3); e(20, 1.9, 69, V2, 0.48); e(20, 1.9, 77, V1, 0.52);
  // Finale: rolled B♭-major Picardie, fanning across the stereo field
  const ROLL = [34, 46, 53, 58, 62, 65, 70, 74, 77, 82];
  ROLL.forEach((m, i) => {
    e(22 + i * 0.075, 2.6, m, m < 44 ? VB : m < 60 ? V3 : m < 67 ? V2 : V1,
      Math.min(0.62, 0.4 + i * 0.05),
      m < 44 ? "bass" : m < 60 ? "flute" : m < 67 ? "pluck" : "celesta",
      -0.3 + i * 0.066);
  });
  e(22, 2.7, 58, PD, 0.09); e(22, 2.7, 62, PD, 0.09);
  e(22, 2.7, 65, PD, 0.09); e(22, 2.7, 70, PD, 0.08);

  // normalize per-voice defaults, humanize, schedule everything up front
  const VT = ["celesta", "pluck", "flute", "bass", "pad"];
  const VP = [0.22, -0.26, 0.1, -0.04, 0];
  const VV = [0.5, 0.45, 0.45, 0.53, 0.09];
  for (const n of EV) {
    n.tim = n.tim || VT[n.v];
    n.vel = n.vel != null ? n.vel : VV[n.v];
    n.pan = n.pan != null ? n.pan : (n.v === PD ? random() * 0.5 - 0.25 : VP[n.v]);
    const jit = n.tim === "pad" ? 0 : random() * 0.01 - 0.005;
    synth(bt(n.b) + jit, n.m, n.d, n.vel * (0.94 + random() * 0.12), n.tim, n.pan);
  }
  thump(bt(22), 0.9);
  shimmer(bt(22), 0.13);
  shimmer(bt(18), 0.04);

  /* ---------------- the plate ---------------- */
  const COL = ["#ffd479", "#ff8fa3", "#79e6d4", "#a78bfa", "#fff3d8"];
  const PMIN = 33, PMAX = 86;
  const yFor = m => H * 0.93 - ((m - PMIN) / (PMAX - PMIN)) * H * 0.8;
  const xFor = t => W * 0.065 + (t / duration) * W * 0.87;
  const TF = 22 * B, LY = H * 0.27;
  const LET = [
    { ch: "B", beat: 0,  col: COL[0], cx: W / 2 - 1.5 * W * 0.185 },
    { ch: "A", beat: 4,  col: COL[1], cx: W / 2 - 0.5 * W * 0.185 },
    { ch: "C", beat: 8,  col: COL[2], cx: W / 2 + 0.5 * W * 0.185 },
    { ch: "H", beat: 12, col: COL[3], cx: W / 2 + 1.5 * W * 0.185 },
  ];

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function glowSprite(color) {
    const s = 128, c = mk(s, s), x = c.getContext("2d");
    const gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(255,255,255,0.9)");
    gr.addColorStop(0.28, hexA(color, 0.5));
    gr.addColorStop(1, hexA(color, 0));
    x.fillStyle = gr; x.fillRect(0, 0, s, s);
    return c;
  }
  const glow = COL.map(glowSprite);

  // pre-rendered background: night plate, pitch grid, watermark, grain, frame
  const bgC = mk(W, H);
  {
    const b = bgC.getContext("2d");
    const gr = b.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "#0c1024"); gr.addColorStop(0.5, "#111634"); gr.addColorStop(1, "#080a16");
    b.fillStyle = gr; b.fillRect(0, 0, W, H);
    const rg = b.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, W * 0.85);
    rg.addColorStop(0, "rgba(64,52,96,0.20)"); rg.addColorStop(1, "rgba(0,0,0,0)");
    b.fillStyle = rg; b.fillRect(0, 0, W, H);
    for (let m = 34; m <= 86; m += 2) {                        // B♭ rows burn brighter
      b.strokeStyle = m % 12 === 10 ? "rgba(255,222,168,0.075)" : "rgba(190,200,255,0.03)";
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(W * 0.055, yFor(m)); b.lineTo(W * 0.945, yFor(m)); b.stroke();
    }
    b.textAlign = "center"; b.textBaseline = "middle";
    b.font = `bold ${Math.round(W * 0.155)}px Georgia, 'Times New Roman', serif`;
    b.fillStyle = "rgba(235,225,200,0.055)";
    for (const L of LET) b.fillText(L.ch, L.cx, LY);
    for (let k = 0; k <= BEATS; k++) {                         // beat ticks
      const x = xFor(k * B), maj = k % 4 === 0;
      b.strokeStyle = maj ? "rgba(255,225,170,0.30)" : "rgba(255,225,170,0.13)";
      b.lineWidth = maj ? 2 * S : 1.2 * S;
      b.beginPath(); b.moveTo(x, H * 0.078); b.lineTo(x, H * 0.078 - (maj ? 15 : 8) * S); b.stroke();
    }
    b.strokeStyle = "rgba(255,225,170,0.18)"; b.lineWidth = 1.4 * S;
    b.beginPath(); b.moveTo(W * 0.065, H * 0.078); b.lineTo(W * 0.935, H * 0.078); b.stroke();
    const id = b.getImageData(0, 0, W, H), d0 = id.data;       // paper grain
    for (let i = 0; i < d0.length; i += 4) {
      const n = (random() * 2 - 1) * 7;
      d0[i] += n; d0[i + 1] += n; d0[i + 2] += n;
    }
    b.putImageData(id, 0, 0);
    const vg = b.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(2,3,8,0.6)");
    b.fillStyle = vg; b.fillRect(0, 0, W, H);
    b.strokeStyle = "rgba(255,215,150,0.14)"; b.lineWidth = 2 * S;
    b.strokeRect(16 * S, 16 * S, W - 32 * S, H - 32 * S);
    b.fillStyle = "rgba(240,230,205,0.42)";
    b.font = `${Math.round(W * 0.0235)}px Georgia, serif`;
    b.fillText("Cipher in B♭ — fugue on B♭ · A · C · B♮", W / 2, H * 0.968);
  }

  const DN = EV.filter(n => n.v !== PD).map(n => ({
    t: n.b * B, v: n.v, m: n.m, vel: n.vel,
    x0: xFor(n.b * B), x1: xFor(clamp((n.b + n.d) * B, 0, duration - 0.03)),
    y: yFor(n.m), col: COL[n.v],
  })).sort((a, b) => a.t - b.t);
  const RIB = [0, 1, 2, 3].map(v => DN.filter(n => n.v === v));

  const parts = [];
  let spawnI = 0, finDone = false, prevT = ac.currentTime;

  function burst(x, y, gi, count, power) {
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2, sp = (18 + random() * 85) * power * S;
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (30 + random() * 55) * S,
        life: 0.7 + random() * 1.2, age: 0, r: (1.2 + random() * 2.4) * S, gi,
      });
    }
  }
  function slug(n, fill, stroke) {
    const h = Math.max(6 * S, H * 0.0085), w = Math.max(2.5 * S, n.x1 - n.x0);
    G.beginPath();
    if (G.roundRect) G.roundRect(n.x0, n.y - h / 2, w, h, h / 2);
    else G.rect(n.x0, n.y - h / 2, w, h);
    if (fill) { G.fillStyle = fill; G.fill(); }
    if (stroke) { G.strokeStyle = stroke; G.lineWidth = 1.2 * S; G.stroke(); }
  }

  function render(now, dt) {
    G.globalCompositeOperation = "source-over";
    G.globalAlpha = 1; G.shadowBlur = 0; G.shadowColor = "transparent";
    G.drawImage(bgC, 0, 0);

    // cipher letters blaze as each entry lands, then settle to embers
    G.save();
    G.textAlign = "center"; G.textBaseline = "middle";
    G.font = `bold ${Math.round(W * 0.155)}px Georgia, 'Times New Roman', serif`;
    G.globalCompositeOperation = "lighter";
    for (const L of LET) {
      const age = now - L.beat * B;
      if (age < -0.02) continue;
      const a = Math.min(0.65, 0.55 * Math.exp(-Math.max(age, 0) / 1.5) + 0.07 + (now >= TF ? 0.3 : 0));
      G.shadowColor = L.col; G.shadowBlur = 55 * S;
      G.fillStyle = hexA(now >= TF ? COL[4] : L.col, a);
      G.fillText(L.ch, L.cx, LY);
    }
    G.restore();

    // ghost engraving of everything still to come
    for (const n of DN) if (n.t > now) slug(n, hexA(n.col, 0.05), hexA(n.col, 0.17));

    // ink ribbons: each voice writes its line in real time
    const px = xFor(clamp(now, 0, duration));
    for (let v = 0; v < 4; v++) {
      const list = RIB[v], pts = [];
      for (const n of list) { if (n.t > now) break; pts.push(n); }
      if (!pts.length) continue;
      const last = pts[pts.length - 1];
      const lastCx = (last.x0 + last.x1) / 2;
      const tipX = Math.max(lastCx, Math.min(px, xFor(clamp(last.t + 1.1 * B, 0, duration))));
      G.save();
      G.strokeStyle = hexA(COL[v], 0.5);
      G.lineWidth = 2 * S; G.lineJoin = "round"; G.lineCap = "round";
      G.shadowColor = COL[v]; G.shadowBlur = 8 * S;
      G.beginPath();
      G.moveTo((pts[0].x0 + pts[0].x1) / 2, pts[0].y);
      for (let i = 1; i < pts.length; i++) G.lineTo((pts[i].x0 + pts[i].x1) / 2, pts[i].y);
      if (tipX > lastCx) G.lineTo(tipX, last.y);
      G.stroke();
      G.restore();
      G.globalCompositeOperation = "lighter";
      G.globalAlpha = 0.5;
      G.drawImage(glow[v], tipX - 15 * S, last.y - 15 * S, 30 * S, 30 * S);
      G.globalAlpha = 1; G.globalCompositeOperation = "source-over";
    }

    // sounded notes: ink dries from blaze to matte, with attack bloom and ripple
    for (const n of DN) {
      const age = now - n.t;
      if (age < 0) continue;
      slug(n, hexA(n.col, age < 0.4 ? 0.95 : Math.max(0.28, 0.95 - (age - 0.4) * 0.1)), null);
      if (age < 0.55) {
        G.globalCompositeOperation = "lighter";
        const s = (16 + 44 * Math.exp(-age * 5)) * S;
        G.globalAlpha = 0.75 * Math.exp(-age * 3.4);
        G.drawImage(glow[n.v], n.x0 - s, n.y - s, 2 * s, 2 * s);
        G.globalAlpha = 1; G.globalCompositeOperation = "source-over";
      }
      if (age < 0.85) {
        const k = age / 0.85;
        G.beginPath();
        G.arc(n.x0, n.y, (8 + age * 230) * S, 0, Math.PI * 2);
        G.strokeStyle = hexA(n.col, (1 - k) * 0.28);
        G.lineWidth = (1.6 * (1 - k) + 0.4) * S;
        G.stroke();
      }
    }

    // gold dust: seeded sparks on every attack, a burst at the final chord
    while (spawnI < DN.length && DN[spawnI].t <= now) {
      const n = DN[spawnI++];
      burst(n.x0, n.y, n.v, Math.round(4 + n.vel * 9), 0.5 + n.vel * 0.9);
    }
    if (!finDone && now >= TF) {
      finDone = true;
      const cx = xFor(TF + 0.3 * B);
      for (let i = 0; i < 120; i++)
        burst(cx + (random() - 0.5) * W * 0.14, yFor(34 + random() * 50), i % 3 === 0 ? 4 : i % 4, 1, 1.6);
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      p.vy += 26 * S * dt; p.vx *= 1 - 0.7 * dt; p.vy *= 1 - 0.7 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    G.globalCompositeOperation = "lighter";
    for (const p of parts) {
      const k = 1 - p.age / p.life, s = p.r * (1 + (1 - k) * 2.2) * 3;
      G.globalAlpha = k * k * 0.8;
      G.drawImage(glow[p.gi], p.x - s, p.y - s, 2 * s, 2 * s);
    }
    G.globalAlpha = 1; G.globalCompositeOperation = "source-over";

    // the plate breathes on the beat
    if (now > 0 && now < duration) {
      const fr = (now / B) % 1, a = 0.03 * (1 - fr) * (1 - fr);
      G.globalCompositeOperation = "lighter";
      G.fillStyle = hexA("#ffd9a0", a);
      G.fillRect(0, 0, W, H);
      G.globalCompositeOperation = "source-over";
    }

    // finale bloom from the rolled B♭ major
    if (now >= TF) {
      const p = now - TF;
      const cx = xFor(Math.min(TF + 0.4 * B, duration)), cy = yFor(72);
      const R = Math.max(W, H) * (0.25 + p * 0.75);
      const a = 0.4 * Math.exp(-p / 1.1) + 0.06;
      G.globalCompositeOperation = "lighter";
      const gr = G.createRadialGradient(cx, cy, 0, cx, cy, R);
      gr.addColorStop(0, hexA("#fff6e0", a));
      gr.addColorStop(0.35, hexA(COL[0], a * 0.55));
      gr.addColorStop(1, hexA(COL[0], 0));
      G.fillStyle = gr; G.fillRect(0, 0, W, H);
      G.globalCompositeOperation = "source-over";
    }

    // playhead
    if (now < duration + 0.02) {
      G.globalCompositeOperation = "lighter";
      const lg = G.createLinearGradient(px - 46 * S, 0, px, 0);
      lg.addColorStop(0, hexA(COL[0], 0)); lg.addColorStop(1, hexA(COL[0], 0.07));
      G.fillStyle = lg; G.fillRect(px - 46 * S, H * 0.06, 46 * S, H * 0.885);
      G.globalCompositeOperation = "source-over";
      G.save();
      G.strokeStyle = hexA(COL[4], 0.55); G.lineWidth = 1.6 * S;
      G.shadowColor = COL[0]; G.shadowBlur = 14 * S;
      G.beginPath(); G.moveTo(px, H * 0.07); G.lineTo(px, H * 0.945); G.stroke();
      G.fillStyle = hexA(COL[4], 0.9);
      G.beginPath();
      G.moveTo(px, H * 0.052); G.lineTo(px + 7 * S, H * 0.065);
      G.lineTo(px, H * 0.078); G.lineTo(px - 7 * S, H * 0.065);
      G.closePath(); G.fill();
      G.restore();
    }

    // fade to black together with the audio
    const fo = (now - (duration - 0.55)) / 0.55;
    if (fo > 0) {
      G.fillStyle = hexA("#04050c", Math.min(1, fo) * 0.9);
      G.fillRect(0, 0, W, H);
    }
  }

  function frame() {
    const nowT = ac.currentTime, now = nowT - t0;
    const dt = clamp(nowT - prevT, 0.001, 0.05);
    prevT = nowT;
    render(now, dt);
    if (now < duration + 0.45) requestAnimationFrame(frame);
  }
  if (ac.state === "suspended" && ac.resume) ac.resume();
  requestAnimationFrame(frame);
}
