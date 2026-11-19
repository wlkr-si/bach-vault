export const title = "Eigenform";

export function start({ audioContext, canvas, duration, random }) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const CX = W * 0.5, CY = H * 0.5;
  const AC = audioContext;
  const t0 = AC.currentTime;
  const startMs = performance.now();

  // ── Helpers ──────────────────────────────────────────────
  const easeOut = t => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
  const ss = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

  // ── AUDIO ────────────────────────────────────────────────

  const master = AC.createGain();
  master.gain.setValueAtTime(0, t0);
  master.gain.linearRampToValueAtTime(0.78, t0 + 0.4);
  master.gain.setValueAtTime(0.78, t0 + 13.2);
  master.gain.linearRampToValueAtTime(0, t0 + 15.0);
  master.connect(AC.destination);

  // Convolution reverb with early reflections
  const revSend = AC.createGain(); revSend.gain.value = 0.4;
  const conv = AC.createConvolver();
  revSend.connect(conv); conv.connect(master);
  {
    const sr = AC.sampleRate, len = Math.floor(sr * 2.8);
    const ib = AC.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ib.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const env = (1 - i / len) ** 1.8;
        lp = lp * 0.55 + (random() * 2 - 1) * 0.45;
        d[i] = lp * env;
      }
      [0.019, 0.037, 0.063, 0.098].forEach((tR, j) => {
        const idx = Math.floor(tR * sr);
        if (idx < len) d[idx] += (0.6 - j * 0.1) * (ch ? -1 : 1);
      });
    }
    conv.buffer = ib;
  }

  const dryBus = AC.createGain(); dryBus.gain.value = 0.6; dryBus.connect(master);

  // D Lydian – just intonation
  const D4 = 293.66;
  const F = {
    D3: D4*.5, A3: D4*.75,
    D4, E4: D4*9/8, Fs4: D4*5/4,
    Gs4: D4*45/32,            // ★ Lydian tritone
    A4: D4*3/2, B4: D4*5/3,
    D5: D4*2, E5: D4*9/4, Fs5: D4*5/2,
  };

  function bell(freq, t, dur, amp = 0.3) {
    const car = AC.createOscillator(), mod = AC.createOscillator();
    const mEnv = AC.createGain(), aEnv = AC.createGain();
    car.type = mod.type = 'sine';
    car.frequency.value = freq; mod.frequency.value = freq * 3.5;
    mEnv.gain.setValueAtTime(freq * 7, t);
    mEnv.gain.exponentialRampToValueAtTime(freq * 0.008, t + dur * 0.4);
    aEnv.gain.setValueAtTime(0, t);
    aEnv.gain.linearRampToValueAtTime(amp, t + 0.006);
    aEnv.gain.exponentialRampToValueAtTime(amp * 0.25, t + 0.12);
    aEnv.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    mod.connect(mEnv); mEnv.connect(car.frequency);
    car.connect(aEnv); aEnv.connect(dryBus); aEnv.connect(revSend);
    mod.start(t); mod.stop(t + dur + .05);
    car.start(t); car.stop(t + dur + .05);
  }

  function pad(freq, t, dur, amp = 0.12) {
    const env = AC.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(amp, t + dur * .28);
    env.gain.setValueAtTime(amp, t + dur * .65);
    env.gain.linearRampToValueAtTime(0, t + dur);
    env.connect(revSend); env.connect(dryBus);
    const vibO = AC.createOscillator(), vibG = AC.createGain();
    vibO.frequency.value = 4.2;
    vibG.gain.setValueAtTime(0, t);
    vibG.gain.linearRampToValueAtTime(freq * .004, t + dur * .5);
    vibO.connect(vibG); vibO.start(t); vibO.stop(t + dur + .05);
    [1, 2, 3, 4, 5].forEach((h, i) => {
      const osc = AC.createOscillator(), g = AC.createGain();
      osc.type = 'sine'; osc.frequency.value = freq * h;
      osc.detune.value = (i % 2 ? 1 : -1) * 2.8;
      g.gain.value = [1, .45, .22, .13, .07][i] / 5;
      if (h === 1) vibG.connect(osc.frequency);
      osc.connect(g); g.connect(env);
      osc.start(t); osc.stop(t + dur + .05);
    });
  }

  function sub(freq, t, dur, amp = 0.38) {
    const osc = AC.createOscillator(), env = AC.createGain();
    const lp = AC.createBiquadFilter();
    osc.type = 'sine'; osc.frequency.value = freq / 4;
    lp.type = 'lowpass'; lp.frequency.value = 220;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(amp, t + .015);
    env.gain.exponentialRampToValueAtTime(amp * .4, t + .3);
    env.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    osc.connect(lp); lp.connect(env); env.connect(master);
    osc.start(t); osc.stop(t + dur + .05);
  }

  function spark(freq, t, amp = 0.09) {
    const osc = AC.createOscillator(), env = AC.createGain();
    osc.type = 'sine'; osc.frequency.value = freq * 4;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(amp, t + .004);
    env.gain.exponentialRampToValueAtTime(1e-4, t + 1.8);
    osc.connect(env); env.connect(revSend);
    osc.start(t); osc.stop(t + 2.0);
  }

  // ── Composition: D Lydian arch D→F#→A→G#★→B→E5→F#5→D5→B→A→D ──
  bell(F.D4,  t0+.10,  4.2, .36); spark(F.D4,  t0+.10,  .09);
  bell(F.Fs4, t0+1.65, 3.2, .29);
  bell(F.A4,  t0+3.05, 3.0, .31); spark(F.A4,  t0+3.05, .08);
  pad( F.D3,  t0+4.0, 11.0, .14);
  pad( F.A3,  t0+4.5, 10.5, .10);
  bell(F.Gs4, t0+4.90, 2.8, .31); spark(F.Gs4, t0+4.90, .10); // ★ Golden Lydian
  bell(F.B4,  t0+6.10, 2.5, .28);
  bell(F.E5,  t0+7.30, 2.5, .30); spark(F.E5,  t0+7.30, .09);
  sub( F.D4,  t0+7.05, 1.6, .38);
  bell(F.Fs5, t0+9.10, 2.5, .32); spark(F.Fs5, t0+9.10, .10);
  sub( F.A3,  t0+9.05, 1.6, .32);
  bell(F.D5,  t0+10.6, 2.5, .30);
  sub( F.D4,  t0+10.55,1.6, .36);
  bell(F.B4,  t0+11.6, 2.0, .26);
  bell(F.A4,  t0+12.6, 3.0, .23);
  bell(F.D4,  t0+13.6, 2.4, .26); spark(F.D4,  t0+13.6, .07);

  // ── VISUALS ──────────────────────────────────────────────

  // Musical events drive visual ripples; hue encodes the note colour
  const events = [
    {t:.10,  hue:210, intense:1.0, type:'bell'},
    {t:1.65, hue:170, intense:.80, type:'bell'},
    {t:3.05, hue:195, intense:.90, type:'bell'},
    {t:4.0,  hue:210, intense:.50, type:'pad' },
    {t:4.90, hue:46,  intense:1.0, type:'bell'}, // ★ golden Lydian flash
    {t:6.10, hue:255, intense:.80, type:'bell'},
    {t:7.05, hue:280, intense:1.0, type:'bass'},
    {t:7.30, hue:180, intense:.90, type:'bell'},
    {t:9.05, hue:285, intense:.90, type:'bass'},
    {t:9.10, hue:160, intense:1.0, type:'bell'},
    {t:10.55,hue:280, intense:1.0, type:'bass'},
    {t:10.6, hue:210, intense:.90, type:'bell'},
    {t:11.6, hue:250, intense:.75, type:'bell'},
    {t:12.6, hue:195, intense:.70, type:'bell'},
    {t:13.6, hue:210, intense:.80, type:'bell'},
  ];
  let evIdx = 0;
  const ripples = [];

  // Particle cloud
  const NP = 480;
  const P = Array.from({length: NP}, () => ({
    a:  random() * Math.PI * 2,
    bR: 110 + random() * 410,
    spd:(random() * .5 + .15) * (random() < .5 ? 1 : -1),
    ph: random() * Math.PI * 2,
    sz: random() * 2.0 + .4,
    hue:160 + random() * 90,
    op: random() * .5 + .3,
  }));

  // Lissajous morph schedule
  const LS = [
    {t:0, a:1,b:1,d:0},
    {t:3, a:2,b:1,d:Math.PI/4},
    {t:7, a:3,b:2,d:Math.PI/2},
    {t:11,a:5,b:4,d:Math.PI/3},
    {t:14,a:3,b:2,d:Math.PI/4},
  ];
  function getLiss(t) {
    let i = 0;
    while (i < LS.length-1 && LS[i+1].t <= t) i++;
    if (i >= LS.length-1) return LS[LS.length-1];
    const s0=LS[i], s1=LS[i+1], f=ss((t-s0.t)/(s1.t-s0.t));
    return {a:s0.a+(s1.a-s0.a)*f, b:s0.b+(s1.b-s0.b)*f, d:s0.d+(s1.d-s0.d)*f};
  }

  let lastTs = startMs;

  function render(ts) {
    const el = (ts - startMs) / 1000;
    const dt = Math.min((ts - lastTs) / 1000, .05);
    lastTs = ts;
    if (el > duration + .6) return;
    const pg = Math.min(el / duration, 1);

    // Fire musical events → spawn ripples
    while (evIdx < events.length && events[evIdx].t <= el) {
      const ev = events[evIdx++];
      const ang = (ev.hue / 360) * Math.PI * 2;
      const dist = ev.type === 'bass' ? 0 : 150 + 80 * ev.intense;
      ripples.push({
        x: CX + Math.cos(ang) * dist,
        y: CY + Math.sin(ang) * dist,
        maxR: ev.type==='bass' ? 370 : 170 + 130 * ev.intense,
        hue: ev.hue, alpha: ev.intense,
        t0: el, dur: ev.type==='bass' ? 1.3 : 2.0,
      });
    }
    for (let i = ripples.length-1; i >= 0; i--)
      if (el - ripples[i].t0 > ripples[i].dur) ripples.splice(i, 1);

    // ── Background (slow trail for motion blur feel) ──────
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(3,2,18,${.13 + pg*.05})`;
    ctx.fillRect(0, 0, W, H);

    const bgH = 220 + Math.sin(el * .6) * 25;
    const bgG = ctx.createRadialGradient(CX, CY, 80, CX, CY, 790);
    bgG.addColorStop(0, `hsla(${bgH},58%,${3+pg*7}%,.42)`);
    bgG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bgG; ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(CX, CY);

    // ── Concentric sacred geometry rings ─────────────────
    const nR = Math.min(1 + Math.floor(pg * 14), 14);
    for (let r = 0; r < nR; r++) {
      const rp  = easeOut(Math.max(0, (pg - r*.065) / (1 - r*.065 + 1e-4)));
      const rad = rp * (52 + r * 48);
      const rH  = 185 + r * 11 + el * 7;
      ctx.beginPath();
      ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${rH},70%,65%,${rp * (.40 - r*.024)})`;
      ctx.lineWidth = 1; ctx.stroke();
    }

    // ── Mandala: 5 counter-rotating petal layers ─────────
    for (let ly = 0; ly < 5; ly++) {
      const lp = easeOut(Math.max(0, (pg - ly*.12) / (1 - ly*.12 + 1e-4)));
      if (lp < .002) continue;
      const nP  = 6 + ly * 2;
      const sz  = lp * (43 + ly * 30);
      const hue = 165 + ly * 22 + el * 9;
      const rot = el * .32 * (ly % 2 ? -1 : 1) * (1 + ly * .18);
      for (let p = 0; p < nP; p++) {
        const a0 = (p/nP)*Math.PI*2+rot, a1 = ((p+1)/nP)*Math.PI*2+rot, am = (a0+a1)/2;
        const c = sz * .62;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.bezierCurveTo(Math.cos(a0)*c, Math.sin(a0)*c,
                          Math.cos(am)*sz, Math.sin(am)*sz,
                          Math.cos(am)*sz, Math.sin(am)*sz);
        ctx.bezierCurveTo(Math.cos(am)*sz, Math.sin(am)*sz,
                          Math.cos(a1)*c, Math.sin(a1)*c, 0, 0);
        ctx.fillStyle   = `hsla(${hue+p*5},78%,65%,${lp*(.11+.07*Math.sin(el*2.4+p+ly))})`;
        ctx.fill();
        ctx.strokeStyle = `hsla(${hue+p*7+20},68%,72%,${lp*(.28+.12*Math.sin(el*2+p))})`;
        ctx.lineWidth = .75; ctx.stroke();
      }
    }

    // ── Lissajous figure (morphing ratio over time) ───────
    if (pg > .04) {
      const la = easeOut(Math.min((pg-.04)/.35, 1));
      const {a, b, d} = getLiss(el);
      const lsz = (72 + pg * 72) * la;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const nSeg = 40, pSeg = 15;
      for (let s = 0; s < nSeg; s++) {
        const hue = 170 + (s/nSeg)*75 + el*9;
        ctx.beginPath();
        for (let i = 0; i <= pSeg; i++) {
          const t = ((s*pSeg+i)/(nSeg*pSeg)) * Math.PI * 2;
          const lx = Math.cos(a*t+d)*lsz, ly = Math.sin(b*t)*lsz;
          i === 0 ? ctx.moveTo(lx,ly) : ctx.lineTo(lx,ly);
        }
        ctx.strokeStyle = `hsla(${hue},88%,68%,${la*.65})`;
        ctx.lineWidth = 1.4; ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore(); // end translate(CX,CY)

    // ── Particle cloud (orbiting, spirals inward at end) ──
    for (let i = 0; i < NP; i++) {
      const p = P[i];
      p.a += p.spd * dt * (.8 + pg * 2.0);
      const sp = pg > .78 ? 1 - (pg-.78)/.22 * .45 : 1;
      const r  = p.bR * (1 + .14*Math.sin(el*1.7+p.ph)) * easeOut(pg) * sp;
      const px = CX + Math.cos(p.a)*r, py = CY + Math.sin(p.a)*r;
      if (px < -5 || px > W+5 || py < -5 || py > H+5) continue;
      const alpha = p.op * easeOut(Math.min(pg*4,1)) * (.35 + .65*Math.abs(Math.sin(el*1.8+p.ph)));
      ctx.beginPath();
      ctx.arc(px, py, p.sz * easeOut(pg), 0, Math.PI*2);
      ctx.fillStyle = `hsla(${p.hue + el*12},78%,70%,${alpha})`;
      ctx.fill();
    }

    // ── Event ripples (note-triggered glow circles) ───────
    ctx.globalCompositeOperation = 'screen';
    for (const rip of ripples) {
      const age = el - rip.t0, frac = age / rip.dur;
      const r  = rip.maxR * easeOut(frac);
      const al = rip.alpha * (1-frac) * (1-frac);
      if (al < .005) continue;
      const g = ctx.createRadialGradient(rip.x,rip.y,0, rip.x,rip.y,r);
      g.addColorStop(0,   `hsla(${rip.hue},85%,88%,${al*.7})`);
      g.addColorStop(.35, `hsla(${rip.hue+15},75%,65%,${al*.3})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(rip.x, rip.y, r, 0, Math.PI*2);
      ctx.fillStyle = g; ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // ── Oscillating waveform ring ─────────────────────────
    if (pg > .08) {
      const wp = easeOut(Math.min((pg-.08)/.35, 1));
      ctx.save(); ctx.translate(CX, CY);
      const wR = 252 + pg * 100;
      ctx.beginPath();
      const nWP = 220;
      for (let i = 0; i <= nWP; i++) {
        const t = i/nWP, ang = t * Math.PI * 2;
        const w = Math.sin(ang*4+el*5.0)*22 + Math.sin(ang*9-el*3.6)*12 + Math.sin(ang*17+el*2.1)*5;
        const r = wR + w * wp;
        const x = Math.cos(ang)*r, y = Math.sin(ang)*r;
        i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      }
      ctx.closePath();
      ctx.strokeStyle = `hsla(${175+el*9},72%,63%,${wp*.42})`;
      ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
    }

    // ── Radial light rays ─────────────────────────────────
    if (pg > .32) {
      const rp = easeOut(Math.min((pg-.32)/.38, 1));
      ctx.save(); ctx.translate(CX, CY);
      ctx.globalCompositeOperation = 'screen';
      const nRays = 18;
      for (let r = 0; r < nRays; r++) {
        const ang = (r/nRays)*Math.PI*2 + el*.17;
        const len = 310*rp + 70*Math.sin(el*2.4+r*.65)*rp;
        const al  = .065*rp*(0.5 + .5*Math.sin(el*1.7+r*.72));
        const hue = 185 + r*10 + el*5;
        const g   = ctx.createLinearGradient(0,0, Math.cos(ang)*len, Math.sin(ang)*len);
        g.addColorStop(0,  `hsla(${hue},88%,78%,${al*4})`);
        g.addColorStop(.4, `hsla(${hue},88%,78%,${al*1.5})`);
        g.addColorStop(1,  'rgba(0,0,0,0)');
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang)*len, Math.sin(ang)*len);
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.5 + 1.8*Math.sin(el*1.4+r*.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Central glow core (pulsing with harmonic rhythm) ──
    ctx.save(); ctx.translate(CX, CY);
    ctx.globalCompositeOperation = 'screen';
    const pulse = .5 + .5 * Math.pow(Math.max(0, Math.sin(el * Math.PI * 2.3)), 2);
    const cr  = 18 + pg*30 + pulse*12;
    const gH  = 192 + Math.sin(el*1.4)*28;
    const gg  = ctx.createRadialGradient(0,0,0, 0,0,cr*4.5);
    const a0  = .88 * Math.min(pg*4, 1);
    gg.addColorStop(0,   `hsla(${gH},100%,100%,${a0})`);
    gg.addColorStop(.18, `hsla(${gH},90%,80%,${a0*.55})`);
    gg.addColorStop(.55, `hsla(${gH+18},80%,60%,${a0*.18})`);
    gg.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(0, 0, cr*4.5, 0, Math.PI*2);
    ctx.fillStyle = gg; ctx.fill();
    ctx.restore();

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}
