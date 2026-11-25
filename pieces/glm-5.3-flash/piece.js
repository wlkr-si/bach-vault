export const title = 'Fuga Illuminata';

export function start({ audioContext: ctx, canvas, duration = 15, random = Math.random }) {
  if (ctx.state === 'suspended') ctx.resume();
  const sr = ctx.sampleRate;
  const S = 100;                    // sixteenth-note slots across the whole piece
  const SLOT = duration / S;        // 0.15 s per slot at 15 s
  const t0 = ctx.currentTime + 0.08;
  const TAU = Math.PI * 2;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- the score (hand-written, D minor, 3 voices + bells) ----------
     0-15   subject (soprano) over a low drone, then the answer in the bass
     16-39  subject in the alto, then a falling cascade Gm-F-Eb-Dm
     40-55  dominant pedal, rising cadential line
     56-71  stretto: three entries pile up at half distance
     72-87  climax, peak D6, A major, then one breath of silence
     88-99  D major roll with a descending bell cascade - Picardy third      */
  const V1 = [ // soprano
    [0,74,2,.58],[2,77,1,.5],[3,79,1,.52],[4,81,2,.6],[6,77,1,.48],[7,74,1,.5],
    [8,76,2,.52],[10,74,1,.46],[11,72,1,.46],[12,71,2,.5],[14,69,1,.44],[15,72,1,.46],
    [16,77,2,.54],[18,81,1,.5],[19,79,1,.46],[20,76,2,.5],[22,77,1,.46],[23,76,1,.44],
    [24,79,1,.5],[25,82,1,.46],[26,86,1,.5],[27,82,1,.44],
    [28,77,1,.46],[29,81,1,.44],[30,84,1,.46],[31,81,1,.42],
    [32,75,1,.44],[33,79,1,.42],[34,82,1,.44],[35,79,1,.4],
    [36,74,1,.44],[37,77,1,.42],[38,81,1,.44],[39,77,1,.4],
    [44,76,2,.38],[46,81,2,.4],[50,77,2,.4],[52,79,1,.42],[54,80,1,.45],
    [64,74,2,.62],[66,77,1,.5],[67,79,1,.5],[68,81,2,.6],[70,77,1,.5],[71,74,1,.5],
    [72,81,2,.66],[74,77,1,.55],[75,79,1,.55],[76,86,2,.68],[78,82,1,.58],[79,81,1,.55],
    [80,79,2,.62],[82,82,1,.58],[83,81,1,.55],[84,85,2,.6],
    [92,78,8,.6],
  ];
  const V2 = [ // alto
    [0,62,2,.32],[4,69,2,.34],
    [16,62,2,.54],[18,65,1,.48],[19,67,1,.5],[20,69,2,.56],[22,65,1,.48],[23,62,1,.5],
    [24,74,4,.42],[28,72,4,.42],[32,70,4,.4],[36,69,4,.4],
    [40,64,2,.4],[42,69,2,.42],[44,72,2,.44],[46,76,2,.46],[48,74,2,.48],[50,77,2,.48],[52,76,2,.5],[54,80,1,.46],
    [60,57,2,.5],[62,60,1,.46],[63,62,1,.48],[64,64,2,.52],[66,60,1,.44],[67,57,1,.44],[68,61,2,.5],[70,64,2,.5],
    [72,74,2,.6],[74,69,1,.52],[75,70,1,.52],[76,65,2,.56],[78,74,1,.55],[79,72,1,.5],[80,74,2,.58],[82,70,1,.54],[83,69,1,.5],[84,64,2,.6],
    [90,62,10,.55],[92,69,8,.5],
  ];
  const V3 = [ // bass
    [8,45,2,.5],[10,48,1,.46],[11,50,1,.48],[12,52,2,.52],[14,48,1,.44],[15,45,1,.46],
    [16,50,2,.52],[18,53,2,.48],[20,45,2,.48],[22,50,2,.5],
    [24,43,4,.5],[26,55,1,.36],[28,41,4,.48],[30,53,1,.34],[32,39,4,.46],[34,51,1,.32],[36,38,4,.5],[38,50,1,.34],
    [40,45,2,.34],[42,45,2,.36],[44,45,2,.4],[46,45,2,.42],[48,45,2,.46],[50,45,2,.48],[52,45,2,.52],[54,45,2,.56],
    [56,50,2,.56],[58,53,1,.48],[59,55,1,.5],[60,57,2,.54],[62,53,1,.46],[63,50,1,.48],
    [64,50,2,.5],[66,46,2,.5],[68,45,2,.54],[70,45,2,.55],
    [72,38,4,.66],[74,50,1,.5],[76,46,4,.64],[78,53,1,.48],[80,43,4,.62],[82,50,1,.48],[84,45,2,.64],
    [88,38,12,.8],[89,45,11,.6],[90,54,10,.55],
  ];
  const BELLS = [ // section marks, then the final cascade
    [24,55,.16],[40,57,.18],[56,50,.18],[72,45,.22],
    [88,86,.38],[90,81,.32],[92,78,.3],[94,74,.26],
  ];

  /* ---------- master chain: tilt -> glue compressor -> out, + hall echo ---------- */
  const bus = ctx.createGain();
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9500;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 24; comp.ratio.value = 2.5;
  comp.attack.value = 0.004; comp.release.value = 0.25;
  const master = ctx.createGain(); master.gain.value = 1;
  bus.connect(lp); lp.connect(comp); comp.connect(master); master.connect(ctx.destination);
  const echo = ctx.createDelay(1); echo.delayTime.value = SLOT * 1.5; // dotted eighth
  const fb = ctx.createGain(); fb.gain.value = 0.34;
  const wet = ctx.createGain(); wet.gain.value = 0.16;
  bus.connect(echo); echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(lp);

  /* ---------- Karplus-Strong pluck, one cached buffer per pitch ---------- */
  const plucks = new Map();
  function pluckBuf(m) {
    if (plucks.has(m)) return plucks.get(m);
    const f = mtof(m);
    const len = Math.min(3.4, 1.15 + 1500 / f);
    const n = Math.ceil(sr * len);
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / f - 0.5));
    let lpv = 0, mean = 0;
    const br = Math.min(0.9, 0.05 + f / 3500); // brighter burst for higher strings
    for (let i = 0; i < N; i++) { lpv += br * ((random() * 2 - 1) - lpv); d[i] = lpv; mean += lpv; }
    mean /= N; for (let i = 0; i < N; i++) d[i] -= mean;
    const g = Math.exp(-4.8 / (len * f));
    for (let i = N; i < n; i++) d[i] = g * 0.5 * (d[i - N] + d[i - N + 1]);
    const F = Math.min(3000, n >> 2);
    for (let i = 1; i <= F; i++) d[n - i] *= i / F;
    plucks.set(m, buf); return buf;
  }

  function pluck(t, m, vel, pan, trim, ring) {
    const src = ctx.createBufferSource();
    src.buffer = pluckBuf(m);
    src.playbackRate.value = 1 + (random() - 0.5) * 0.004; // two strings, slightly apart
    const g = ctx.createGain();
    const peak = Math.min(1, vel * 0.6 * trim);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    const end = Math.min(src.buffer.duration - 0.02, ring);
    g.gain.setValueAtTime(peak, t + end - 0.02);
    g.gain.linearRampToValueAtTime(0.0001, t + end);
    src.connect(g);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(bus);
    } else g.connect(bus);
    src.start(t); src.stop(t + end + 0.05);
  }

  function bell(t, m, vel) {
    const f = mtof(m);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = 0.45; p.connect(bus); }
    for (const [r, a, dec] of [[1, 0.5, 2.6], [2.4, 0.16, 1.5], [3.9, 0.07, 0.9]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * r;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(a * vel, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g); g.connect(p || bus);
      o.start(t); o.stop(t + dec + 0.05);
    }
  }

  function drone() { // bare fifth under the opening subject, gone by the answer
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.9);
    g.gain.setValueAtTime(0.05, t0 + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.7);
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = mtof(38);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = mtof(50) * 1.004;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(bus);
    o1.start(t0); o2.start(t0); o1.stop(t0 + 2.8); o2.stop(t0 + 2.8);
  }

  /* ---------- schedule everything up front, with a human breath of jitter ---------- */
  const events = [];
  [{ ev: V1, pan: 0.35, trim: 1 }, { ev: V2, pan: -0.12, trim: 1.05 }, { ev: V3, pan: -0.32, trim: 1.3 }]
    .forEach((v, vi) => v.ev.forEach(([s, m, du, vel]) => {
      const t = t0 + s * SLOT + Math.max(0, (random() - 0.5) * 0.01);
      const velj = Math.min(1, vel * (1 + (random() - 0.5) * 0.12));
      pluck(t, m, velj, v.pan, v.trim, du * SLOT + (du >= 4 ? 1.1 : 0.3));
      events.push({ t, slot: s, m, vel: velj, v: vi });
    }));
  BELLS.forEach(([s, m, vel]) => {
    const t = t0 + s * SLOT;
    bell(t, m, vel * (1 + (random() - 0.5) * 0.1));
    events.push({ t, slot: s, m, vel, v: 3 });
  });
  drone();

  /* ---------- the astrolabe: each note lives at a fixed point on the clock ---------- */
  const c2 = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, CX = W / 2, CY = H / 2;
  const RING = [430, 315, 198, 500];                       // soprano, alto, bass, bells
  const SPAN = [[77.5, 8.5, 30], [66.5, 9.5, 28], [47.5, 9.5, 26], [0, 0, 0]];
  const COL = ['#ecb95e', '#cf7a48', '#71a89b', '#f4e8cd'];
  events.forEach(e => {
    e.ang = -Math.PI / 2 + TAU * e.slot / S;
    const [mid, half, dev] = SPAN[e.v];
    e.r = RING[e.v] + (half ? (e.m - mid) / half * dev : 0);
    e.col = COL[e.v];
    e.sz = 2.3 + e.vel * 3.6;
  });
  let breathe = 0;
  const pt = e => [CX + Math.cos(e.ang) * (e.r + breathe), CY + Math.sin(e.ang) * (e.r + breathe)];
  const dot = (e, r) => { const [x, y] = pt(e); c2.fillStyle = e.col; c2.beginPath(); c2.arc(x, y, r, 0, TAU); c2.fill(); };
  const line = (a, b) => { const [x1, y1] = pt(a), [x2, y2] = pt(b); c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke(); };

  let raf = 0;
  function frame() {
    const t = Math.max(0, ctx.currentTime - t0);
    breathe = 2.5 * Math.sin(TAU * t / 7.5);

    c2.globalCompositeOperation = 'source-over';
    const bg = c2.createRadialGradient(CX, CY, 40, CX, CY, 780);
    bg.addColorStop(0, '#191009'); bg.addColorStop(0.55, '#0d0906'); bg.addColorStop(1, '#070503');
    c2.globalAlpha = 1; c2.fillStyle = bg; c2.fillRect(0, 0, W, H);

    // blueprint: rings, bar ticks, a slowly turning outer ornament
    c2.strokeStyle = '#c9a25a'; c2.lineWidth = 1;
    for (const r of [RING[2], RING[1], RING[0]]) {
      c2.globalAlpha = 0.09; c2.beginPath(); c2.arc(CX, CY, r, 0, TAU); c2.stroke();
    }
    for (let s = 0; s <= S; s++) {
      const a = -Math.PI / 2 + TAU * s / S, bar = s % 8 === 0;
      const r1 = bar ? 466 : 472, r2 = bar ? 498 : 488;
      c2.globalAlpha = bar ? 0.2 : 0.07;
      c2.beginPath();
      c2.moveTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1);
      c2.lineTo(CX + Math.cos(a) * r2, CY + Math.sin(a) * r2);
      c2.stroke();
    }
    const rot = t * 0.05;
    c2.globalAlpha = 0.1;
    for (let k = 0; k < 72; k++) {
      const a = rot + k * TAU / 72;
      c2.beginPath();
      c2.moveTo(CX + Math.cos(a) * 512, CY + Math.sin(a) * 512);
      c2.lineTo(CX + Math.cos(a) * (k % 6 ? 520 : 527), CY + Math.sin(a) * (k % 6 ? 520 : 527));
      c2.stroke();
    }
    // the timeline ring draws itself once around
    c2.globalAlpha = 0.14; c2.lineWidth = 1.5; c2.strokeStyle = '#d9a854';
    c2.beginPath(); c2.arc(CX, CY, 505, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, t / duration)); c2.stroke();

    // notes: ghosts ahead, embers behind, flashes on the strike
    c2.globalCompositeOperation = 'lighter';
    let energy = 0;
    for (const e of events) {
      const age = t - e.t;
      if (age < -0.03) { c2.globalAlpha = 0.06; dot(e, 1.6); continue; }
      const flash = age < 0.15 ? 1 - age / 0.15 : 0;
      energy += flash * e.vel;
      if (flash > 0) { c2.globalAlpha = 0.5 * flash; dot(e, e.sz * (2.2 + 2.5 * flash)); }
      c2.globalAlpha = Math.min(0.85, 0.24 + 0.5 * flash + 0.3 * e.vel * Math.exp(-age * 1.4));
      dot(e, e.sz + flash * 2);
    }

    // counterpoint web: whatever is sounding right now, joined in gold
    const act = [];
    for (let v = 0; v < 4; v++) {
      let best = null;
      for (const e of events) {
        const age = t - e.t;
        if (e.v === v && age >= 0 && age < 0.55 && (!best || e.t > best.t)) best = e;
      }
      if (best) act.push(best);
    }
    if (act.length > 1) {
      const fade = 1 - Math.max(...act.map(e => (t - e.t) / 0.55));
      c2.strokeStyle = '#d9a854'; c2.lineWidth = 1.4;
      for (let i = 0; i < act.length; i++)
        for (let j = i + 1; j < act.length; j++) { c2.globalAlpha = 0.3 * fade; line(act[i], act[j]); }
      const bass = act.find(e => e.v === 2);
      if (bass) { c2.globalAlpha = 0.14 * fade; line(bass, { ang: bass.ang, r: 70 }); }
    }

    // the playing hand and its comet trail
    const a0 = -Math.PI / 2 + TAU * (t / duration);
    c2.strokeStyle = '#ecdfc2'; c2.lineWidth = 2; c2.globalAlpha = 0.45;
    c2.beginPath();
    c2.moveTo(CX + Math.cos(a0) * 92, CY + Math.sin(a0) * 92);
    c2.lineTo(CX + Math.cos(a0) * 462, CY + Math.sin(a0) * 462);
    c2.stroke();
    c2.lineWidth = 2.5;
    for (let k = 1; k <= 12; k++) {
      c2.globalAlpha = 0.28 * (1 - k / 12);
      c2.beginPath(); c2.arc(CX, CY, 486, a0 - k * 0.03, a0 - (k - 1) * 0.03); c2.stroke();
    }

    // the heart of the instrument, pulsing with the music
    c2.fillStyle = '#f2e6c8';
    c2.globalAlpha = 0.6; c2.beginPath(); c2.arc(CX, CY, 6 + energy * 12, 0, TAU); c2.fill();
    const ro = t * 0.09;
    c2.strokeStyle = '#d9a854'; c2.lineWidth = 1; c2.globalAlpha = 0.25;
    for (let k = 0; k < 12; k++) {
      const a = ro + k * TAU / 12;
      c2.beginPath();
      c2.moveTo(CX + Math.cos(a) * 24, CY + Math.sin(a) * 24);
      c2.lineTo(CX + Math.cos(a) * (k % 2 ? 44 : 56), CY + Math.sin(a) * (k % 2 ? 44 : 56));
      c2.stroke();
    }
    c2.globalAlpha = 0.15; c2.beginPath(); c2.arc(CX, CY, 66, 0, TAU); c2.stroke();

    // sunrise at the Picardy third
    const bt = t - 88 * SLOT;
    if (bt >= 0 && bt < 1.2) {
      c2.strokeStyle = '#f0c66e'; c2.globalAlpha = 0.4 * (1 - bt / 1.2); c2.lineWidth = 2.5;
      c2.beginPath(); c2.arc(CX, CY, 60 + bt * 620, 0, TAU); c2.stroke();
      c2.globalAlpha = 0.18 * (1 - bt / 1.2); c2.lineWidth = 14;
      c2.beginPath(); c2.arc(CX, CY, 60 + bt * 620, 0, TAU); c2.stroke();
    }

    // grain and the fades that frame the piece
    c2.globalCompositeOperation = 'source-over';
    c2.fillStyle = '#efe3c6'; c2.globalAlpha = 0.035;
    for (let k = 0; k < 90; k++) c2.fillRect(random() * W, random() * H, 1.4, 1.4);
    if (t < 0.5) { c2.globalAlpha = (1 - t / 0.5) * 0.9; c2.fillStyle = '#000'; c2.fillRect(0, 0, W, H); }
    if (t > duration - 0.4) {
      c2.globalAlpha = Math.min(0.55, (t - (duration - 0.4)) / 0.4 * 0.55);
      c2.fillStyle = '#000'; c2.fillRect(0, 0, W, H);
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return { stop: () => cancelAnimationFrame(raf) };
}
