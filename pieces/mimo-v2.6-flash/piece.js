export const title = "Circularis";

export function start({ audioContext, canvas, duration, random }) {
  const AC = audioContext;
  const g2 = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const S = W / 1080;
  const DUR = duration;
  const E = DUR / 60;                 // one eighth: 12 bars x 5 eighths = 60
  const T0 = AC.currentTime;
  const LEAD = 0.05;
  const TAU = Math.PI * 2;
  const at = (e) => T0 + LEAD + e * E;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const cl = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ------------------------------------------------------------------ score */
  const CH  = ["Dm","Dm","Bb","Bb","Gm","Gm","A","A","Dm","Bb","A","D"];
  const OST = {
    Dm: [62, 69, 72, 69, 65],   // D  A  C  A  F
    Bb: [58, 65, 67, 65, 62],   // Bb F  G  F  D
    Gm: [55, 62, 64, 62, 58],   // G  D  E  D  Bb
    A:  [57, 64, 67, 64, 61],   // A  E  G  E  C#   (A7)
    D:  [62, 69, 71, 69, 66]
  };
  const COL = {
    Dm: [124, 176, 255], Bb: [255, 206, 132], Gm: [132, 226, 196],
    A:  [255, 152, 116], D:  [255, 238, 178]
  };
  // soprano: descends, then climbs in 3+2 hemiola to G5, cadences D5
  const MEL = [[10,74,5],[15,72,3],[18,70,2],[20,69,5],[25,74,5],[30,73,5],
               [35,76,5],[40,77,5],[45,77,3],[48,79,2],[50,76,3],[53,73,2],[55,74,5]];
  // answering voice, bar-aligned, mostly contrary motion
  const ALT = [[20,62,5],[25,58,5],[30,61,5],[35,57,5],[40,62,5],[45,58,5],[50,57,5],[55,66,5]];
  const BAS = [[20,31],[25,31],[30,33],[35,33],[40,38],[45,34],[48,34],[50,33],[53,40],[55,38]];
  const PAD = [[0,"Dm",10],[10,"Bb",10],[20,"Gm",10],[30,"A",10],[40,"Dm",10],[50,"A",5],[55,"D",7]];
  const PV  = { Dm:[50,57], Bb:[46,53], Gm:[43,50], A:[45,52], D:[50,57] };
  const barOf = (e) => CH[cl(Math.floor(e / 5), 0, 11)];
  const light = (c, k) => [
    Math.round(c[0] + (255 - c[0]) * k),
    Math.round(c[1] + (255 - c[1]) * k),
    Math.round(c[2] + (255 - c[2]) * k)
  ];

  /* ------------------------------------------------------------------ graph */
  const dry = AC.createGain(); dry.gain.value = 1;
  const mix = AC.createGain(); mix.gain.value = 0.92;

  const conv = AC.createConvolver();
  conv.normalize = false;
  conv.buffer = makeIR();
  const revHP = AC.createBiquadFilter(); revHP.type = "highpass"; revHP.frequency.value = 330;
  const revLP = AC.createBiquadFilter(); revLP.type = "lowpass";  revLP.frequency.value = 6000;
  const revG  = AC.createGain(); revG.gain.value = 0.55;
  const sendA = AC.createGain(); sendA.gain.value = 1.0;   // bright send
  const sendB = AC.createGain(); sendB.gain.value = 0.42;  // soft send
  conv.connect(revHP); revHP.connect(revLP); revLP.connect(revG); revG.connect(mix);
  sendA.connect(conv); sendB.connect(conv);
  dry.connect(mix);

  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -8; comp.knee.value = 18; comp.ratio.value = 2.6;
  comp.attack.value = 0.004; comp.release.value = 0.18;
  const outg = AC.createGain(); outg.gain.value = 1.3;
  mix.connect(comp); comp.connect(outg); outg.connect(AC.destination);

  const an = AC.createAnalyser();
  an.fftSize = 2048; an.smoothingTimeConstant = 0.7;
  mix.connect(an);

  outg.gain.setValueAtTime(1.3, T0);
  outg.gain.setValueAtTime(1.3, T0 + DUR - 0.28);
  outg.gain.linearRampToValueAtTime(0.0001, T0 + DUR - 0.02);

  /* ------------------------------------------------------------- instruments */
  function makeIR() {
    const sr = AC.sampleRate, sec = 2.3;
    const len = Math.floor(sr * sec);
    const buf = AC.createBuffer(2, len, sr);
    const er = [[0.013,0.55],[0.021,-0.42],[0.031,0.34],[0.043,-0.27],[0.058,0.21],[0.077,-0.16]];
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      const coef = ch === 0 ? 0.42 : 0.38;
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.pow(Math.max(0, 1 - t / sec), 2.1) * (t < 0.014 ? t / 0.014 : 1);
        lp += (random() * 2 - 1 - lp) * coef;
        d[i] = lp * env;
      }
      for (const [dt, a] of er) {
        const i = Math.floor((dt + (ch ? 0.0031 : 0)) * sr);
        if (i < len) d[i] += a * (random() * 2 - 1);
      }
      const tail = Math.floor(0.05 * sr);
      for (let i = len - tail; i < len; i++) d[i] *= (len - i) / tail;
    }
    return buf;
  }

  // Karplus-Strong, computed straight into a buffer (no feedback graph to leak)
  function ksBuf(midi, dur, bright, damp) {
    const sr = AC.sampleRate;
    const N = Math.max(3, Math.floor(sr / mtof(midi)));
    const len = Math.max(N + 16, Math.ceil(dur * sr));
    const buf = AC.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const line = new Float32Array(N);
    for (let i = 0; i < N; i++) line[i] = random() * 2 - 1;
    let p = 0;
    const c = 0.08 + 0.92 * bright;
    for (let i = 0; i < N; i++) { p += c * (line[i] - p); line[i] = p; }
    let mx = 0;
    for (let i = 0; i < N; i++) { const a = Math.abs(line[i]); if (a > mx) mx = a; }
    if (mx > 0) { const k = 0.9 / mx; for (let i = 0; i < N; i++) line[i] *= k; }
    let idx = 0;
    for (let s = 0; s < len; s++) {
      const y = line[idx];
      out[s] = y;
      line[idx] = damp * 0.5 * (y + line[(idx + 1) % N]);
      if (++idx >= N) idx = 0;
    }
    const atk = Math.max(2, Math.round(0.0012 * sr));
    for (let s = 0; s < len; s++) {
      let e = Math.exp(-4.6 * (s / len));
      if (s < atk) e *= s / atk;
      out[s] *= e;
    }
    const tail = Math.min(len, Math.round(0.004 * sr));
    for (let i = len - tail; i < len; i++) out[i] *= (len - i) / tail;
    return buf;
  }

  function pluck(time, midi, amp, dur, bright, damp, send) {
    const f = mtof(midi);
    const N = Math.max(3, Math.floor(AC.sampleRate / f));
    const src = AC.createBufferSource();
    src.buffer = ksBuf(midi, dur, bright, damp);
    src.playbackRate.value = f / (AC.sampleRate / N);   // correct the integer-period pitch error
    const g = AC.createGain(); g.gain.value = amp;
    src.connect(g); g.connect(dry); g.connect(send);
    src.start(time); src.stop(time + dur + 0.05);
    src.onended = () => { try { g.disconnect(); } catch (e) {} };
    return g;
  }

  const mkWave = (amps) => {
    const real = new Float32Array(amps.length + 1), imag = new Float32Array(amps.length + 1);
    for (let i = 0; i < amps.length; i++) imag[i + 1] = amps[i];
    return AC.createPeriodicWave(real, imag, { disableNormalization: false });
  };
  const waveGlass = mkWave([1, 0.42, 0, 0.26, 0, 0.15, 0, 0.10, 0, 0.06]);
  const waveWarm  = mkWave([1, 0.50, 0.22, 0.10, 0.05, 0.02]);

  function tone(time, midi, dur, amp, o) {
    const f = mtof(midi);
    const atk = cl(Math.min(o.atk, 0.3 * dur), 0.005, dur);
    const rel = cl(Math.min(o.rel, 0.5 * dur), 0.02, dur);
    const tHold = time + dur - rel;
    const lp = AC.createBiquadFilter();
    lp.type = "lowpass"; lp.Q.value = o.Q;
    lp.frequency.setValueAtTime(cl(o.lp * 0.45, 60, 18000), time);
    lp.frequency.linearRampToValueAtTime(cl(o.lp, 60, 18000), time + Math.min(0.35, dur * 0.5));
    lp.frequency.linearRampToValueAtTime(cl(o.lp * 0.5, 60, 18000), time + dur + rel);
    const g = AC.createGain();
    lp.connect(g);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(amp, time + atk);
    g.gain.exponentialRampToValueAtTime(amp * 0.8, tHold);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur + rel);
    g.connect(dry); g.connect(o.send);

    const lfo = AC.createOscillator(); lfo.type = "sine"; lfo.frequency.value = o.vibHz;
    const lg = AC.createGain();
    lg.gain.setValueAtTime(0.0001, time);
    lg.gain.linearRampToValueAtTime(o.vib, time + Math.min(0.6, dur * 0.5));
    lg.gain.linearRampToValueAtTime(0.0001, time + dur + rel);
    lfo.connect(lg); lfo.start(time); lfo.stop(time + dur + rel + 0.05);

    const oscs = [];
    for (const d of o.det) {
      const osc = AC.createOscillator();
      osc.setPeriodicWave(o.wave);
      osc.frequency.value = f; osc.detune.value = d;
      lg.connect(osc.detune); osc.connect(lp);
      osc.start(time); osc.stop(time + dur + rel + 0.05);
      oscs.push(osc);
    }
    oscs[oscs.length - 1].onended = () => {
      try { g.disconnect(); lp.disconnect(); lg.disconnect(); lfo.disconnect(); } catch (e) {}
    };
    return g;
  }

  const noiseBuf = AC.createBuffer(1, Math.floor(AC.sampleRate * 0.5), AC.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = random() * 2 - 1; }

  function shaker(time, amp, tight) {
    const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.1;
    bp.frequency.value = tight ? 9200 : 7200;
    const g = AC.createGain();
    const dur = tight ? 0.075 : 0.06;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(amp, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(bp); bp.connect(g); g.connect(dry);
    src.start(time, random() * 0.4); src.stop(time + dur + 0.02);
    src.onended = () => { try { g.disconnect(); bp.disconnect(); } catch (e) {} };
  }

  function drum(time, amp) {
    const o = AC.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(165, time);
    o.frequency.exponentialRampToValueAtTime(52, time + 0.1);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(amp, time + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);
    o.connect(g); g.connect(dry); g.connect(sendB);
    o.start(time); o.stop(time + 0.36);
    o.onended = () => { try { g.disconnect(); } catch (e) {} };

    const s = AC.createBufferSource(); s.buffer = noiseBuf;
    const hp = AC.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1800;
    const cg = AC.createGain();
    cg.gain.setValueAtTime(amp * 0.35, time);
    cg.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    s.connect(hp); hp.connect(cg); cg.connect(dry);
    s.start(time, random() * 0.4); s.stop(time + 0.05);
    s.onended = () => { try { cg.disconnect(); hp.disconnect(); } catch (e) {} };
  }

  function bell(time, midi, amp, decay) {
    const f = mtof(midi);
    const c = AC.createOscillator(); c.type = "sine"; c.frequency.value = f;
    const m = AC.createOscillator(); m.type = "sine"; m.frequency.value = f * 2.76;
    const mg = AC.createGain();
    mg.gain.setValueAtTime(f * 8, time);
    mg.gain.exponentialRampToValueAtTime(f * 0.06, time + decay * 0.5);
    m.connect(mg); mg.connect(c.frequency);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(amp, time + 0.005);
    g.gain.exponentialRampToValueAtTime(amp * 0.25, time + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    c.connect(g); g.connect(dry); g.connect(sendA);
    c.start(time); m.start(time);
    c.stop(time + decay + 0.05); m.stop(time + decay + 0.05);
    c.onended = () => { try { g.disconnect(); mg.disconnect(); } catch (e) {} };
  }

  function riser(tS, tE, amp) {
    const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 2.4;
    bp.frequency.setValueAtTime(420, tS);
    bp.frequency.exponentialRampToValueAtTime(7200, tE);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, tS);
    g.gain.exponentialRampToValueAtTime(amp, tE - 0.01);
    g.gain.setValueAtTime(amp, tE);
    g.gain.exponentialRampToValueAtTime(0.0001, tE + 0.18);
    s.connect(bp); bp.connect(g); g.connect(dry); g.connect(sendA);
    s.start(tS, random() * 0.4); s.stop(tE + 0.2);
    s.onended = () => { try { g.disconnect(); bp.disconnect(); } catch (e) {} };
  }

  /* ------------------------------------------------------- visual note list */
  const vis = [];
  const V = (e, midi, dE, amp, col, w, base) => vis.push({ e, midi, dE, amp, col, w, base });

  /* --------------------------------------------------------------- schedule */
  // ostinato: 5/8 (2+3), thin at the top, thickening, 16th weave at the climax
  for (let b = 0; b < 12; b++) {
    const set = OST[CH[b]], col = COL[CH[b]];
    const base = 0.165 + 0.155 * (b / 11);
    for (let i = 0; i < 5; i++) {
      const e = b * 5 + i;
      if (e > 54.99) continue;
      let show = true, a = base;
      if (b === 0)      { show = i === 0 || i === 3;            a = 0.16;  }
      else if (b === 1) { show = i === 0 || i === 2 || i === 3;  a = 0.185; }
      if (!show) continue;
      if (i === 0) a *= 1.22; else if (i === 2) a *= 1.07; else if (i === 4) a *= 0.88;
      pluck(at(e), set[i], a, 0.72, 0.74, 0.9992, sendB);
      V(e, set[i], 1, a, col, 5, 0.5);
      if ((b === 6 || b === 8 || b === 10) && i === 0) {
        pluck(at(e), set[i] + 12, a * 0.4, 0.6, 0.82, 0.999, sendA);
        V(e, set[i] + 12, 1, a * 0.4, col, 3, 0.36);
      }
    }
    if (b === 9 || b === 10) {
      for (const i of [1, 3]) {
        const e = b * 5 + i + 0.5, m = set[(i + 1) % 5], a = base * 0.45;
        pluck(at(e), m, a, 0.5, 0.78, 0.999, sendB);
        V(e, m, 0.5, a, col, 4, 0.4);
      }
    }
  }

  for (const [e, m, d] of MEL) {
    const a = 0.105 + 0.05 * cl((e - 10) / 40, 0, 1);
    tone(at(e), m, d * E, a, {
      wave: waveGlass, det: [-9, 0, 9], lp: 2700, Q: 1.9,
      atk: 0.085, rel: 0.42, vib: 7.5, vibHz: 5.4, send: sendA
    });
    V(e, m, d, a, light(COL[barOf(e)], 0.5), 9, 0.8);
  }

  for (const [e, m, d] of ALT) {
    tone(at(e), m, d * E, 0.072, {
      wave: waveWarm, det: [-6, 6], lp: 1500, Q: 1.1,
      atk: 0.13, rel: 0.5, vib: 5, vibHz: 4.7, send: sendB
    });
    V(e, m, d, 0.072, COL[barOf(e)], 6, 0.42);
  }

  for (const [e, m] of BAS) {
    pluck(at(e), m, 0.19, 1.3, 0.13, 0.9994, sendB);
    const o = AC.createOscillator(); o.type = "sine"; o.frequency.value = mtof(m);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, at(e));
    g.gain.exponentialRampToValueAtTime(0.15, at(e) + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, at(e) + 0.72);
    o.connect(g); g.connect(dry);
    o.start(at(e)); o.stop(at(e) + 0.78);
    o.onended = () => { try { g.disconnect(); } catch (err) {} };
    V(e, m, 5, 0.19, COL[barOf(e)], 7, 0.46);
  }

  for (const [e, ch, len] of PAD) {
    const a = 0.052 * cl((e + 8) / 16, 0.5, 1);
    for (const m of PV[ch]) {
      tone(at(e), m, len * E, a, {
        wave: waveWarm, det: [-5, 5], lp: 760, Q: 0.7,
        atk: 1.0, rel: 0.9, vib: 2.5, vibHz: 0.35, send: sendB
      });
    }
  }

  const BELLS = [
    [0, 69, 0.15, 5.0, 4], [20, 74, 0.14, 4.5, 4], [40, 81, 0.16, 4.5, 4],
    [55, 50, 0.15, 5.0, 3], [55, 74, 0.17, 5.0, 3],
    [55.09, 78, 0.14, 4.5, 2], [55.18, 81, 0.12, 4.5, 1.5]
  ];
  for (const [e, m, a, dec, dE] of BELLS) {
    bell(at(e), m, a, dec);
    V(e, m, dE, a, [255, 248, 232], 8, 0.62);
  }

  for (let e = 5; e <= 52; e++) {
    const pos = e % 5;
    let a = 0.032 + 0.072 * cl((e - 5) / 38, 0, 1);
    if (pos === 0 || pos === 2) a *= 1.6;
    if (e >= 50) a *= 1.2;
    shaker(at(e), a, false);
  }
  const FILL = [53, 53.5, 54, 54.5];
  for (let i = 0; i < FILL.length; i++) shaker(at(FILL[i]), 0.1 + i * 0.035, true);

  for (let e = 15; e <= 54; e++) {
    const pos = e % 5;
    if (pos === 0) drum(at(e), 0.26);
    else if (pos === 2 && e >= 20) drum(at(e), 0.155);
  }
  drum(at(55), 0.3);

  riser(at(8), at(10), 0.028);
  riser(at(49), at(55), 0.075);

  /* --------------------------------------------------------------- visuals */
  const CX = W / 2, CY = H * (620 / 1350);
  const R0 = 112 * S, R1 = 402 * S;
  const RHALO = 420 * S, RSCOPE = 500 * S;
  const PMIN = 28, PMAX = 82;
  const rOf = (m) => R0 + cl((m - PMIN) / (PMAX - PMIN), 0, 1) * (R1 - R0);
  const ang = (e) => -Math.PI / 2 + (e / 60) * TAU;

  for (const n of vis) { n.a0 = ang(n.e); n.a1 = ang(n.e + n.dE); n.r = rOf(n.midi); }

  const pads = PAD.map(([e, ch, len]) => {
    const ms = PV[ch];
    return { e, len, a0: ang(e), a1: ang(e + len),
             ra: rOf(Math.min(ms[0], ms[1])), rb: rOf(Math.max(ms[0], ms[1])), col: COL[ch] };
  });
  const pulses = [];
  for (let b = 0; b < 12; b++) pulses.push({ e: b * 5, col: COL[CH[b]] });

  const stars = [];
  for (let i = 0; i < 110; i++)
    stars.push({ x: random() * W, y: random() * H, r: (0.4 + random() * 1.5) * S,
                 ph: random() * TAU, sp: 0.4 + random() * 1.5 });

  const emberCols = [[255,214,150],[255,178,140],[172,192,255],[255,242,205],[214,180,255]];
  const embers = [];
  for (let i = 0; i < 85; i++)
    embers.push({ x: random() * W, y: random() * H, v: (5 + random() * 26) * S,
                  ph: random() * TAU, sp: 0.5 + random() * 1.8,
                  sz: (0.9 + random() * 2.4) * S,
                  c: emberCols[Math.floor(random() * emberCols.length)] });

  const bg = g2.createLinearGradient(0, 0, W * 0.3, H);
  bg.addColorStop(0, "#090b17"); bg.addColorStop(0.5, "#0c0a16"); bg.addColorStop(1, "#100a14");
  const vig = g2.createRadialGradient(CX, CY, 240 * S, CX, CY, 880 * S);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(0.62, "rgba(4,3,10,0.20)");
  vig.addColorStop(1, "rgba(3,2,8,0.70)");

  const td = new Uint8Array(an.fftSize);
  const fd = new Uint8Array(an.frequencyBinCount);
  const lsOn = ("letterSpacing" in g2);
  let lastT = T0;

  function frame() {
    const now = AC.currentTime;
    const ts = now - T0;
    const dt = cl(now - lastT, 0, 0.05); lastT = now;
    const p = cl((now - T0 - LEAD) / DUR, 0, 1);

    an.getByteTimeDomainData(td);
    an.getByteFrequencyData(fd);
    let sum = 0;
    for (let i = 0; i < td.length; i += 4) { const v = (td[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / (td.length / 4));

    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.globalCompositeOperation = "source-over";
    g2.globalAlpha = 1;
    g2.fillStyle = bg; g2.fillRect(0, 0, W, H);

    const bloom = g2.createRadialGradient(CX, CY, 0, CX, CY, 660 * S);
    bloom.addColorStop(0, `rgba(98,118,228,${(0.12 + rms * 0.55).toFixed(4)})`);
    bloom.addColorStop(0.5, `rgba(126,74,196,${(0.055 + rms * 0.28).toFixed(4)})`);
    bloom.addColorStop(1, "rgba(0,0,0,0)");
    g2.fillStyle = bloom; g2.fillRect(0, 0, W, H);

    for (const s of stars) {
      const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(ts * s.sp + s.ph));
      g2.fillStyle = `rgba(206,216,255,${(0.34 * tw).toFixed(3)})`;
      g2.beginPath(); g2.arc(s.x, s.y, s.r, 0, TAU); g2.fill();
    }

    g2.globalCompositeOperation = "lighter";
    for (const q of embers) {
      q.y -= q.v * dt;
      if (q.y < -24) q.y = H + 24;
      const x = q.x + Math.sin(ts * 0.45 + q.ph) * 20 * S;
      const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(ts * q.sp + q.ph));
      g2.fillStyle = `rgba(${q.c[0]},${q.c[1]},${q.c[2]},${((0.045 + rms * 0.5) * tw).toFixed(3)})`;
      g2.beginPath(); g2.arc(x, q.y, q.sz, 0, TAU); g2.fill();
    }

    /* ---- the wheel: everything below rotates with the form ---- */
    g2.save();
    g2.translate(CX, CY); g2.rotate(p * 0.45); g2.translate(-CX, -CY);

    g2.globalCompositeOperation = "source-over";
    g2.lineWidth = 1 * S;
    g2.strokeStyle = "rgba(150,166,255,0.085)";
    for (let b = 0; b <= 12; b++) {
      const a = ang(b * 5);
      g2.beginPath();
      g2.moveTo(CX + Math.cos(a) * R0 * 0.8, CY + Math.sin(a) * R0 * 0.8);
      g2.lineTo(CX + Math.cos(a) * R1 * 1.07, CY + Math.sin(a) * R1 * 1.07);
      g2.stroke();
    }
    g2.strokeStyle = "rgba(150,166,255,0.065)";
    for (let m = 36; m <= 84; m += 12) { g2.beginPath(); g2.arc(CX, CY, rOf(m), 0, TAU); g2.stroke(); }
    g2.strokeStyle = "rgba(150,166,255,0.14)"; g2.lineWidth = 1.4 * S;
    g2.beginPath(); g2.arc(CX, CY, R1 * 1.07, 0, TAU); g2.stroke();

    for (const pd of pads) {
      const age = ts - LEAD - pd.e * E;
      if (age < 0) continue;
      const life = pd.len * E;
      const a = age < 1 ? age : age < life ? 1 : cl(1 - (age - life) / 0.9, 0, 1);
      if (a <= 0.005) continue;
      g2.fillStyle = `rgba(${pd.col[0]},${pd.col[1]},${pd.col[2]},${(0.075 * a).toFixed(4)})`;
      g2.beginPath();
      g2.arc(CX, CY, pd.rb, pd.a0, pd.a1);
      g2.arc(CX, CY, pd.ra, pd.a1, pd.a0, true);
      g2.closePath(); g2.fill();
    }

    const live = [];
    for (const n of vis) {
      const age = ts - LEAD - n.e * E;
      if (age < 0) continue;
      live.push([n, age < 0.75 ? Math.exp(-age * 5.5) : 0]);
    }
    g2.lineCap = "round";
    g2.globalCompositeOperation = "source-over";
    for (const [n, fl] of live) {
      const c = n.col;
      g2.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${cl(n.base + fl * 0.7, 0, 1).toFixed(3)})`;
      g2.lineWidth = n.w * S * (1 + fl * 0.55);
      g2.beginPath(); g2.arc(CX, CY, n.r, n.a0, n.a1); g2.stroke();
    }
    g2.globalCompositeOperation = "lighter";
    for (const [n, fl] of live) {
      const c = n.col;
      g2.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${cl(n.base * 0.2 + fl * 0.4, 0, 1).toFixed(3)})`;
      g2.lineWidth = n.w * S * 3.4;
      g2.beginPath(); g2.arc(CX, CY, n.r, n.a0, n.a1); g2.stroke();
    }

    const NB = 80;
    g2.lineWidth = 3.4 * S;
    for (let i = 0; i < NB; i++) {
      const fr = i / NB;
      const idx = Math.min(fd.length - 1, 1 + Math.floor(Math.pow(fr, 1.8) * fd.length * 0.75));
      const v = fd[idx] / 255;
      const a = -Math.PI / 2 + fr * TAU;
      const r1 = RHALO + (4 + v * 70) * S;
      g2.strokeStyle = `rgba(255,224,188,${(0.05 + v * 0.55).toFixed(3)})`;
      g2.beginPath();
      g2.moveTo(CX + Math.cos(a) * RHALO, CY + Math.sin(a) * RHALO);
      g2.lineTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1);
      g2.stroke();
    }

    const NP = 240;
    g2.beginPath();
    for (let i = 0; i <= NP; i++) {
      const fr = i / NP;
      const a = -Math.PI / 2 + fr * TAU;
      const v = (td[Math.min(td.length - 1, Math.floor(fr * td.length))] - 128) / 128;
      const r = RSCOPE + v * 30 * S;
      const x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r;
      if (i === 0) g2.moveTo(x, y); else g2.lineTo(x, y);
    }
    g2.closePath();
    g2.lineWidth = 9 * S; g2.strokeStyle = "rgba(130,175,255,0.10)"; g2.stroke();
    g2.lineWidth = 2.4 * S; g2.strokeStyle = "rgba(205,225,255,0.55)"; g2.stroke();

    for (const pu of pulses) {
      const age = ts - LEAD - pu.e * E;
      if (age < 0 || age > 1.8) continue;
      const k = age / 1.8;
      g2.strokeStyle = `rgba(${pu.col[0]},${pu.col[1]},${pu.col[2]},${(Math.pow(1 - k, 2.3) * 0.4).toFixed(3)})`;
      g2.lineWidth = (2.4 + 5.5 * (1 - k)) * S;
      g2.beginPath(); g2.arc(CX, CY, (48 + k * 540) * S, 0, TAU); g2.stroke();
    }

    const sa = -Math.PI / 2 + p * TAU;
    const hx = CX + Math.cos(sa) * RSCOPE, hy = CY + Math.sin(sa) * RSCOPE;
    const grd = g2.createLinearGradient(CX, CY, hx, hy);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(1, "rgba(255,238,206,0.5)");
    g2.strokeStyle = grd; g2.lineWidth = 2.2 * S;
    g2.beginPath(); g2.moveTo(CX, CY); g2.lineTo(hx, hy); g2.stroke();
    g2.strokeStyle = "rgba(255,236,204,0.15)"; g2.lineWidth = 3.5 * S;
    g2.beginPath(); g2.arc(CX, CY, RSCOPE, sa - 0.32, sa); g2.stroke();
    g2.fillStyle = "rgba(255,246,228,0.95)";
    g2.beginPath(); g2.arc(hx, hy, 5.5 * S, 0, TAU); g2.fill();
    g2.fillStyle = "rgba(255,228,188,0.25)";
    g2.beginPath(); g2.arc(hx, hy, 22 * S, 0, TAU); g2.fill();

    g2.restore();

    g2.globalCompositeOperation = "source-over";
    g2.globalAlpha = 1;
    g2.fillStyle = vig; g2.fillRect(0, 0, W, H);

    const ta = cl((ts - 1.1) / 1.5, 0, 1);
    const te = ta * ta * (3 - 2 * ta);
    if (te > 0.002) {
      g2.globalAlpha = te;
      const fs = 46 * S;
      g2.textAlign = "center"; g2.textBaseline = "alphabetic";
      g2.fillStyle = "rgba(240,236,255,0.92)";
      g2.font = `400 ${fs}px Georgia, "Times New Roman", serif`;
      let L = 0;
      if (lsOn) { L = 0.34 * fs; g2.letterSpacing = L.toFixed(2) + "px"; }
      g2.fillText(title, W / 2 + L / 2, H - 76 * S);
      if (lsOn) g2.letterSpacing = "0px";
      g2.strokeStyle = "rgba(240,236,255,0.3)"; g2.lineWidth = 1.2 * S;
      g2.beginPath();
      g2.moveTo(W / 2 - 200 * S, H - 130 * S);
      g2.lineTo(W / 2 + 200 * S, H - 130 * S);
      g2.stroke();
      g2.globalAlpha = 1;
    }

    if (ts < DUR + 0.6) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
