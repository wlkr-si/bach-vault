export const title = "Prolation — A Canon for Three Clocks";

export function start({ audioContext, canvas, duration, random }) {
  const ac = audioContext;
  const DUR = typeof duration === "number" && duration > 0 ? duration : 15;
  const rnd = typeof random === "function" ? random : Math.random;
  const ctx = canvas.getContext("2d");
  const W = 1080, H = 1350;
  const SX = canvas.width / W, SY = canvas.height / H;
  const TAU = Math.PI * 2;

  // ================= MUSIC DATA =================
  const U = (DUR * 0.87) / 128;       // one "sixteenth" of the fastest voice
  const TB = 128 * U;                 // the conjunction / final bloom
  const T0 = ac.currentTime + 0.15;
  const SCALE = [0, 2, 3, 5, 7, 8, 10];
  // subject: [scale degree, length in sixteenths, leading-tone flag] — 32 sixteenths
  const THEME = [
    [0, 4], [4, 2], [5, 1], [4, 1], [3, 2], [2, 2],
    [7, 2], [6, 1], [5, 1], [4, 2], [2, 2],
    [3, 1], [4, 1], [5, 2], [1, 2], [2, 1], [1, 1], [-1, 2, 1], [0, 2],
  ];
  const CH = {
    "0": { pcs: [2, 5, 9], rn: "i", nm: "D MINOR" },
    "1": { pcs: [4, 7, 10, 2], rn: "iiø⁷", nm: "E HALF-DIM" },
    "2": { pcs: [5, 9, 0], rn: "III", nm: "F MAJOR" },
    "3": { pcs: [7, 10, 2, 5], rn: "iv⁷", nm: "G MINOR 7" },
    "4": { pcs: [9, 1, 4, 7], rn: "V⁷", nm: "A DOM 7" },
    "5": { pcs: [10, 2, 5], rn: "VI", nm: "B♭ MAJOR" },
    "6": { pcs: [0, 4, 7], rn: "VII", nm: "C MAJOR" },
    lt: { pcs: [1, 4, 7, 10], rn: "vii°⁷", nm: "C♯ DIM 7" },
    fin: { pcs: [2, 6, 9], rn: "I", nm: "D MAJOR" },
  };
  const deg7 = (d) => ((d % 7) + 7) % 7;
  const deg2m = (base, d) => base + Math.floor(d / 7) * 12 + SCALE[deg7(d)];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Bass: subject in 4x augmentation — defines the harmony
  const bass = [];
  {
    let a = 0;
    THEME.forEach(([d, l, lt], i) => {
      const last = i === THEME.length - 1;
      const key = last ? "fin" : lt ? "lt" : String(deg7(d));
      const m = deg2m(38, d) + (lt ? 1 : 0);
      const on = a * 4 * U, len = l * 4 * U;
      bass.push({ v: 0, on, len, vEnd: on + len, m, p0: a / 32, p1: (a + l) / 32, rep: 0, key, g: a * 4 });
      a += l;
    });
  }
  const chordAt = (t) => {
    let c = bass[0];
    for (const n of bass) if (n.on <= t) c = n;
    return CH[c.key].pcs;
  };
  function snap(m, pcs, dir) {
    let best = m, bd = 99;
    for (let k = -6; k <= 6; k++) {
      const c = m + k;
      if (pcs.includes(((c % 12) + 12) % 12)) {
        const sc = Math.abs(k) - (Math.sign(k) === dir ? 0.1 : 0);
        if (sc < bd) { bd = sc; best = c; }
      }
    }
    return best;
  }
  function alter(m, pcs) {
    const pc = ((m % 12) + 12) % 12;
    if (pc === 0 && pcs.includes(1)) return m + 1;
    if (pc === 5 && pcs.includes(6)) return m + 1;
    return m;
  }
  function buildVoice(v, stretch, base, trans) {
    const out = [];
    trans.forEach((tr, r) => {
      let a = 0;
      THEME.forEach(([d, l], i) => {
        const g = r * 32 * stretch + a * stretch;
        const on = g * U;
        const nd = i < THEME.length - 1 ? THEME[i + 1][0] : d;
        const dir = Math.sign(nd - d);
        const pcs = chordAt(on + 1e-4);
        let m = deg2m(base, d + tr);
        const strong = l >= 2 || g % 4 === 0;
        m = strong ? snap(m, pcs, dir) : alter(m, pcs);
        const cres = 0.78 + 0.32 * (on / TB);
        const vel = (v === 2 ? (g % 4 === 0 ? 0.105 : 0.08) : g % 4 === 0 ? 0.1 : 0.085) * cres;
        const len = l * stretch * U;
        out.push({ v, on, len, vEnd: on + len, m, p0: a / 32, p1: (a + l) / 32, rep: r, vel, g });
        a += l;
      });
    });
    return out;
  }
  const med = buildVoice(1, 2, 50, [0, 4]);
  const fast = buildVoice(2, 1, 74, [0, 2, 4, 0]);
  const FIN = TB + 1.2;
  [bass, med, fast].forEach((arr) => { const n = arr[arr.length - 1]; n.len = FIN - n.on; });

  // ================= AUDIO ENGINE =================
  const master = ac.createGain();
  master.gain.value = 0.82;
  master.gain.setTargetAtTime(0, T0 + DUR - 1.05, 0.28);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3.5;
  comp.attack.value = 0.004; comp.release.value = 0.25;
  master.connect(comp); comp.connect(ac.destination);

  function makeIR(sec) {
    const sr = ac.sampleRate, len = Math.floor(sr * sec);
    const b = ac.createBuffer(2, len, sr);
    const pre = Math.floor(0.018 * sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr, x = Math.min(0.9999, t / sec);
        const a = 0.08 + 0.85 * x;
        lp += (1 - a) * ((rnd() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - x, 1.6) * Math.exp(-t * 1.5);
      }
      for (let k = 0; k < 10; k++) {
        const i = pre + Math.floor((0.004 + rnd() * 0.07) * sr);
        if (i < len) d[i] += (rnd() < 0.5 ? -1 : 1) * (0.5 - k * 0.035);
      }
    }
    return b;
  }
  const verb = ac.createConvolver();
  verb.buffer = makeIR(3.4);
  const verbIn = ac.createGain();
  const vhp = ac.createBiquadFilter(); vhp.type = "highpass"; vhp.frequency.value = 180;
  const verbOut = ac.createGain(); verbOut.gain.value = 0.42;
  verbIn.connect(vhp); vhp.connect(verb); verb.connect(verbOut); verbOut.connect(master);

  function out(node, pan, send) {
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p); p.connect(master);
    if (send > 0) { const s = ac.createGain(); s.gain.value = send; p.connect(s); s.connect(verbIn); }
  }
  const noise = (() => {
    const b = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    return b;
  })();
  function wave(fn, n) {
    const re = new Float32Array(n + 1), im = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) im[k] = fn(k);
    return ac.createPeriodicWave(re, im);
  }
  const harpW = wave((k) => (Math.abs(Math.sin(k * Math.PI * 0.137)) / Math.pow(k, 0.85)) * (k > 28 ? 0.5 : 1), 40);
  const reedW = wave((k) => ((k % 2 ? 1 : 0.5) / Math.pow(k, 1.1)) * (1 + 1.2 * Math.exp(-((k - 3.5) ** 2) / 2.5)), 30);
  const ORG = [0, 1, 0.6, 0.34, 0.24, 0.05, 0.13, 0.02, 0.08, 0, 0.03, 0, 0.03];
  const organW = wave((k) => ORG[k] || 0, 12);

  function pluck(t, m, len, vel, pan) {
    const f = mtof(m);
    const sum = ac.createGain();
    const g = ac.createGain();
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(Math.min(15000, f * 18), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(500, f * 3), t + 0.5);
    [0, 6 + rnd() * 4].forEach((dt) => {
      const o = ac.createOscillator(); o.setPeriodicWave(harpW);
      o.frequency.value = f; o.detune.value = dt;
      o.connect(lp); o.start(t); o.stop(t + len + 0.9);
    });
    lp.connect(g);
    const tc = 0.32 * Math.pow(440 / f, 0.35);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.003, tc);
    g.gain.setTargetAtTime(0, t + len, 0.07);
    g.connect(sum);
    const ns = ac.createBufferSource(); ns.buffer = noise;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = Math.min(9000, f * 5); bp.Q.value = 1.2;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(vel * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
    ns.connect(bp); bp.connect(ng); ng.connect(sum);
    ns.start(t, rnd() * 0.4); ns.stop(t + 0.03);
    out(sum, pan, 0.38);
  }
  function bowed(t, m, len, vel, pan) {
    const f = mtof(m);
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 1.1;
    lp.frequency.setValueAtTime(f * 2, t);
    lp.frequency.linearRampToValueAtTime(Math.min(9000, f * 7), t + 0.09);
    lp.frequency.setTargetAtTime(f * 4.5, t + 0.1, 0.3);
    const pk = ac.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 1150; pk.Q.value = 1.4; pk.gain.value = 5;
    const vib = ac.createOscillator(); vib.frequency.value = 5.1 + rnd() * 0.6;
    const vg = ac.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(14, t + 0.45);
    vib.connect(vg);
    [0, -7].forEach((dt) => {
      const o = ac.createOscillator(); o.setPeriodicWave(reedW);
      o.frequency.value = f; o.detune.value = dt;
      vg.connect(o.detune);
      o.connect(lp); o.start(t); o.stop(t + len + 0.5);
    });
    vib.start(t); vib.stop(t + len + 0.5);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.03);
    g.gain.setTargetAtTime(vel * 0.72, t + 0.03, 0.12);
    g.gain.setTargetAtTime(0, t + len, 0.06);
    lp.connect(pk); pk.connect(g);
    out(g, pan, 0.3);
  }
  function organ(t, m, len, vel) {
    const f = mtof(m);
    const sum = ac.createGain();
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.min(6000, f * 9);
    const o = ac.createOscillator(); o.setPeriodicWave(organW); o.frequency.value = f;
    const sub = ac.createOscillator(); sub.type = "sine"; sub.frequency.value = f / 2;
    const sg = ac.createGain(); sg.gain.value = 0.38;
    o.connect(lp); sub.connect(sg); sg.connect(lp);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.05);
    g.gain.setTargetAtTime(0, t + len, 0.12);
    lp.connect(g); g.connect(sum);
    o.start(t); sub.start(t); o.stop(t + len + 0.8); sub.stop(t + len + 0.8);
    const ns = ac.createBufferSource(); ns.buffer = noise;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * 6; bp.Q.value = 4;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(vel * 0.18, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    ns.connect(bp); bp.connect(ng); ng.connect(sum);
    ns.start(t, rnd() * 0.3); ns.stop(t + 0.08);
    out(sum, 0, 0.22);
  }
  function bell(t, m, vel, pan) {
    const f = mtof(m);
    const sum = ac.createGain();
    [[1, 1, 2.6], [2, 0.45, 1.5], [2.76, 0.3, 1.1], [4.07, 0.16, 0.7], [5.43, 0.1, 0.45]].forEach(([r, a, d]) => {
      if (f * r > 16000) return;
      const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = f * r;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel * a, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(sum); o.start(t); o.stop(t + d + 0.05);
    });
    out(sum, pan, 0.55);
  }
  function thump(t) {
    const o = ac.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(36.7, t + 0.3);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.006);
    g.gain.setTargetAtTime(0, t + 0.01, 0.5);
    o.connect(g); o.start(t); o.stop(t + 2.5);
    out(g, 0, 0.1);
  }
  function tick(t, hi) {
    const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = hi ? 3100 : 2350;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(hi ? 0.022 : 0.014, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); o.start(t); o.stop(t + 0.06);
    out(g, hi ? 0.35 : -0.35, 0.15);
  }

  // ---- schedule ----
  bass.forEach((n) => organ(T0 + n.on, n.m, n.len + 0.01, 0.15 * (0.85 + 0.25 * (n.on / TB))));
  med.forEach((n) => bowed(T0 + n.on + (rnd() - 0.5) * 0.008, n.m, n.len + 0.025, n.vel, -0.28 + 0.3 * Math.sin(TAU * n.p0)));
  fast.forEach((n) => pluck(T0 + n.on + (rnd() - 0.5) * 0.005, n.m, n.len, n.vel, 0.55 * Math.sin(TAU * n.p0)));
  for (let k = 0; k < 32; k++) tick(T0 + k * 4 * U, k % 4 === 0);
  {
    const tb = T0 + TB;
    thump(tb);
    [50, 57, 62, 66, 69, 74, 78, 81, 86, 90].forEach((m, i) => {
      const t = tb + i * 0.05;
      bell(t, m, 0.05 * (1 - i * 0.04), (i % 2 ? 0.4 : -0.4) * (i / 9));
      if (i >= 4) pluck(t, m, 0.6, 0.045, i % 2 ? -0.3 : 0.3);
    });
  }

  // ================= VISUALS =================
  const CX = 540, CY = 600;
  const R = [430, 285, 150], K = [5.0, 4.2, 3.6], CM = [43, 57, 82];
  const COL = [[255, 184, 88], [255, 104, 128], [118, 224, 255]];
  const STAT = [128 * U, 64 * U, 32 * U];
  const VOICES = [bass, med, fast];
  const all = bass.concat(med, fast);
  const reps = VOICES.map((arr) => { const r = []; arr.forEach((n) => (r[n.rep] = r[n.rep] || []).push(n)); return r; });
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rad = (v, m) => R[v] + (m - CM[v]) * K[v];
  const ang = (p) => -Math.PI / 2 + TAU * p;
  const SPAN = DUR - 0.15;
  const TL = { x0: 70, x1: 1010, y0: 1124, y1: 1292 };
  const tx = (t) => TL.x0 + (t / SPAN) * (TL.x1 - TL.x0);
  const ty = (m) => TL.y1 - ((m - 34) / 60) * (TL.y1 - TL.y0);
  const SERIF = "Georgia, 'Times New Roman', serif";

  let layer;
  if (typeof OffscreenCanvas !== "undefined") layer = new OffscreenCanvas(canvas.width, canvas.height);
  else { layer = document.createElement("canvas"); layer.width = canvas.width; layer.height = canvas.height; }
  const lctx = layer.getContext("2d");
  lctx.setTransform(SX, 0, 0, SY, 0, 0);
  lctx.globalCompositeOperation = "lighter";
  lctx.lineCap = "round";

  const tipR = R.slice();
  let lastNow = -1;
  const handFrac = (v, now) => (now <= 0 ? 0 : now >= TB ? 1 : (now % STAT[v]) / STAT[v]);
  function curNote(v, now) {
    if (now < 0) return null;
    const arr = VOICES[v];
    if (now >= TB) return arr[arr.length - 1];
    for (const n of arr) if (n.on <= now && now < n.vEnd) return n;
    return null;
  }
  function spaced(str, x, y, sp) {
    let w = 0;
    for (const ch of str) w += ctx.measureText(ch).width + sp;
    w -= sp;
    let xx = x - w / 2;
    ctx.textAlign = "left";
    for (const ch of str) { ctx.fillText(ch, xx, y); xx += ctx.measureText(ch).width + sp; }
  }

  function draw(now) {
    const dt = lastNow < 0 ? 1 / 60 : Math.max(0, Math.min(0.1, now - lastNow));
    lastNow = now;
    ctx.setTransform(SX, 0, 0, SY, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.fillStyle = "#07060c";
    ctx.fillRect(0, 0, W, H);

    const cb = curNote(0, now);
    const pulse = cb ? Math.exp(-(now - cb.on) * 2.2) : 0;
    const bloom = now >= TB ? now - TB : -1;
    const bl = bloom >= 0 ? Math.exp(-bloom * 1.6) : 0;
    const intro = Math.max(0, Math.min(1, (now + 0.15) / 0.8));

    let g = ctx.createRadialGradient(CX, CY, 0, CX, CY, 640);
    g.addColorStop(0, `rgba(60,40,92,${0.3 + 0.12 * pulse + 0.4 * bl})`);
    g.addColorStop(0.55, "rgba(24,17,44,0.2)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // title
    ctx.fillStyle = `rgba(245,232,210,${0.88 * intro})`;
    ctx.font = `600 28px ${SERIF}`;
    spaced("PROLATION", CX, 60, 11);
    ctx.font = `italic 16px ${SERIF}`;
    ctx.fillStyle = `rgba(245,232,210,${0.5 * intro})`;
    ctx.textAlign = "center";
    ctx.fillText("one subject, heard at three speeds at once — a mensuration canon in D", CX, 90);

    // clock faces
    for (let v = 0; v < 3; v++) {
      ctx.strokeStyle = rgba(COL[v], 0.07 + 0.4 * bl);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(CX, CY, R[v], 0, TAU); ctx.stroke();
      const hf = handFrac(v, now);
      const rt = R[v] + (v === 2 ? 44 : 50);
      for (let i = 0; i < 32; i++) {
        const p = i / 32;
        let d = hf - p; if (d < 0) d += 1;
        const act = now > 0 && now < TB ? Math.exp(-d * 10) : bl;
        const major = i % 4 === 0;
        const a = ang(p), l = major ? 11 : 5;
        ctx.strokeStyle = rgba(COL[v], 0.12 + (major ? 0.1 : 0) + 0.7 * act);
        ctx.lineWidth = major ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(CX + Math.cos(a) * rt, CY + Math.sin(a) * rt);
        ctx.lineTo(CX + Math.cos(a) * (rt + l), CY + Math.sin(a) * (rt + l));
        ctx.stroke();
      }
    }

    // accumulated string-art
    ctx.globalCompositeOperation = "lighter";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(layer, 0, 0);
    if (bl > 0) { ctx.globalAlpha = 0.6 * bl; ctx.drawImage(layer, 0, 0); }
    ctx.globalAlpha = 1;
    ctx.setTransform(SX, 0, 0, SY, 0, 0);

    // ghost previews of slower statements
    for (const v of [0, 1]) {
      const curRep = now >= TB ? reps[v].length - 1 : Math.floor(Math.max(0, now) / STAT[v]);
      const ns = reps[v][curRep];
      if (!ns || now >= TB) continue;
      ctx.setLineDash([2, 7]);
      ctx.beginPath();
      for (const n of ns) ctx.arc(CX, CY, rad(v, n.m), ang(n.p0), ang(n.p1));
      ctx.strokeStyle = rgba(COL[v], 0.09 * intro);
      ctx.lineWidth = 1.2; ctx.stroke();
      ctx.setLineDash([]);
    }

    // the drawn contours
    for (let v = 0; v < 3; v++) {
      const rv = reps[v];
      const curRep = now >= TB ? rv.length - 1 : Math.floor(Math.max(0, now) / STAT[v]);
      for (let r = 0; r < rv.length; r++) {
        const ns = rv[r];
        if (now < ns[0].on) continue;
        const age = curRep - r;
        const alpha = age === 0 ? 1 : Math.max(0.16, 0.44 - 0.08 * age);
        ctx.beginPath();
        for (const n of ns) {
          if (now < n.on) break;
          const p1 = Math.min(n.p1, n.p0 + (Math.min(now, n.vEnd) - n.on) / STAT[v]);
          ctx.arc(CX, CY, rad(v, n.m), ang(n.p0), ang(p1));
        }
        const lw = v === 0 ? 3.2 : v === 1 ? 2.6 : 2.0;
        const boost = 1 + 0.8 * bl;
        ctx.strokeStyle = rgba(COL[v], 0.07 * alpha * boost); ctx.lineWidth = lw * 6; ctx.stroke();
        ctx.strokeStyle = rgba(COL[v], 0.16 * alpha * boost); ctx.lineWidth = lw * 2.4; ctx.stroke();
        ctx.strokeStyle = rgba(mix(COL[v], [255, 255, 255], 0.35), 0.9 * alpha); ctx.lineWidth = lw; ctx.stroke();
      }
    }

    // hands & tips
    const tips = [];
    for (let v = 0; v < 3; v++) {
      const cn = curNote(v, now);
      const target = cn ? rad(v, cn.m) : R[v];
      tipR[v] += (target - tipR[v]) * Math.min(1, dt * 18);
      const a = ang(handFrac(v, now));
      const x = CX + Math.cos(a) * tipR[v], y = CY + Math.sin(a) * tipR[v];
      tips.push([x, y]);
      ctx.strokeStyle = rgba(COL[v], 0.26);
      ctx.lineWidth = v === 0 ? 1.8 : 1.3;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(a) * 30, CY + Math.sin(a) * 30);
      ctx.lineTo(x, y); ctx.stroke();
      const op = cn ? Math.exp(-(now - cn.on) * 6) : 0;
      const gr = 14 + 14 * op + (v === 0 ? 6 : 0);
      const tg = ctx.createRadialGradient(x, y, 0, x, y, gr);
      tg.addColorStop(0, rgba(mix(COL[v], [255, 255, 255], 0.6), 0.9 * intro));
      tg.addColorStop(0.3, rgba(COL[v], 0.45 * intro));
      tg.addColorStop(1, rgba(COL[v], 0));
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.arc(x, y, gr, 0, TAU); ctx.fill();
    }

    // harmony triangle
    if (now > 0) {
      ctx.beginPath();
      ctx.moveTo(tips[0][0], tips[0][1]); ctx.lineTo(tips[1][0], tips[1][1]); ctx.lineTo(tips[2][0], tips[2][1]);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,236,210,0.035)"; ctx.fill();
      ctx.strokeStyle = "rgba(255,240,225,0.22)"; ctx.lineWidth = 1; ctx.stroke();
      if (now < TB + 0.03) {
        const al = Math.min(0.12, 0.045 * dt * 60);
        for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
          const lg = lctx.createLinearGradient(tips[i][0], tips[i][1], tips[j][0], tips[j][1]);
          lg.addColorStop(0, rgba(COL[i], al));
          lg.addColorStop(1, rgba(COL[j], al));
          lctx.strokeStyle = lg; lctx.lineWidth = 1;
          lctx.beginPath(); lctx.moveTo(tips[i][0], tips[i][1]); lctx.lineTo(tips[j][0], tips[j][1]); lctx.stroke();
        }
      }
    }

    // onset ripples
    for (const n of all) {
      const k = (now - n.on) / 0.7;
      if (k < 0 || k > 1) continue;
      const a = ang(n.p0), r0 = rad(n.v, n.m);
      const x = CX + Math.cos(a) * r0, y = CY + Math.sin(a) * r0;
      const rr = [12, 8, 6][n.v] + k * [70, 46, 30][n.v];
      ctx.strokeStyle = rgba(COL[n.v], (1 - k) * (1 - k) * 0.7);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
    }

    // bloom
    if (bloom >= 0) {
      for (let i = 0; i < 4; i++) {
        const k = bloom - i * 0.13;
        if (k < 0) continue;
        const rr = 30 + k * 620;
        const a = Math.max(0, 1 - rr / 600);
        ctx.strokeStyle = `rgba(255,228,180,${a * 0.55})`;
        ctx.lineWidth = 2 + 6 * a;
        ctx.beginPath(); ctx.arc(CX, CY, rr, 0, TAU); ctx.stroke();
      }
      const gg = ctx.createRadialGradient(CX, CY, 0, CX, CY, 280);
      gg.addColorStop(0, `rgba(255,220,160,${0.07 + 0.28 * bl})`);
      gg.addColorStop(1, "rgba(255,220,160,0)");
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(CX, CY, 280, 0, TAU); ctx.fill();
    }

    // centre: chord function
    ctx.globalCompositeOperation = "source-over";
    if (cb) {
      const ch = CH[cb.key];
      const fa = Math.min(1, (now - cb.on) / 0.25);
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(255,240,220,${0.92 * fa})`;
      ctx.font = `italic 46px ${SERIF}`;
      ctx.fillText(ch.rn, CX, CY + 10);
      ctx.font = `12px ${SERIF}`;
      ctx.fillStyle = `rgba(255,240,220,${0.5 * fa})`;
      spaced(ch.nm, CX, CY + 38, 3);
      if (bloom > 0.7) {
        ctx.font = `italic 13px ${SERIF}`;
        ctx.fillStyle = `rgba(255,220,170,${Math.min(0.55, (bloom - 0.7) * 0.8)})`;
        spaced("S·D·G", CX, CY + 66, 4);
      }
    }

    // score timeline
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const x = tx(k * 32 * U);
      ctx.beginPath(); ctx.moveTo(x, TL.y0 - 6); ctx.lineTo(x, TL.y1 + 6); ctx.stroke();
    }
    for (const n of all) {
      const x0 = tx(n.on), x1 = tx(Math.min(n.on + n.len, SPAN)), y = ty(n.m);
      const h = n.v === 0 ? 4 : 3;
      ctx.fillStyle = rgba(COL[n.v], 0.11);
      ctx.fillRect(x0, y - h / 2, Math.max(1.5, x1 - x0 - 1), h);
      if (now >= n.on) {
        const xe = tx(Math.min(now, n.on + n.len, SPAN));
        ctx.fillStyle = rgba(COL[n.v], 0.9);
        ctx.fillRect(x0, y - h / 2, Math.max(1.5, xe - x0 - 1), h);
      }
    }
    const px = tx(Math.max(0, Math.min(now, SPAN)));
    ctx.strokeStyle = "rgba(255,245,230,0.5)";
    ctx.beginPath(); ctx.moveTo(px, TL.y0 - 8); ctx.lineTo(px, TL.y1 + 8); ctx.stroke();

    // legend
    ctx.font = `14px ${SERIF}`;
    const items = [[0, "×4  organ pedal"], [1, "×2  viol"], [2, "×1  harpsichord"]];
    const ws = items.map(([, s]) => ctx.measureText(s).width + 18);
    const total = ws.reduce((a, b) => a + b, 0) + 40 * 2;
    let lx = CX - total / 2;
    ctx.textAlign = "left";
    items.forEach(([v, s], i) => {
      ctx.fillStyle = rgba(COL[v], 0.9 * intro);
      ctx.beginPath(); ctx.arc(lx + 5, 1325, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(245,232,210,${0.55 * intro})`;
      ctx.fillText(s, lx + 18, 1330);
      lx += ws[i] + 40;
    });
  }

  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16);
  function frame() {
    const now = ac.currentTime - T0;
    draw(now);
    if (now < DUR + 1) raf(frame);
  }
  draw(-0.15);
  raf(frame);
}
