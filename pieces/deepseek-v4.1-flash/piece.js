export const title = "Lumenweave";

export function start({ audioContext: ctx, canvas, duration, random }) {
  const W = 1080;
  const H = 1350;
  const TAU = Math.PI * 2;
  const D = Math.min(duration || 15, 15);

  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d", { alpha: false });
  g.lineCap = "round";
  g.lineJoin = "round";

  const cx = W * 0.5;
  const cy = H * 0.52;

  // ------------------------------------------------------------
  // Audio graph
  // ------------------------------------------------------------
  const master = ctx.createGain();
  master.gain.value = 0.0001;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.82;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 18;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.22;

  master.connect(analyser);
  analyser.connect(comp);
  comp.connect(ctx.destination);

  function makeImpulse(seconds, decay) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const x = i / len;
        d[i] = (random() * 2 - 1) * Math.pow(1 - x, decay);
      }
    }
    return buf;
  }

  function makeNoise(seconds) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = random() * 2 - 1;
    return buf;
  }

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(2.8, 2.5);
  const revGain = ctx.createGain();
  revGain.gain.value = 0.28;
  convolver.connect(revGain);
  revGain.connect(master);

  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.375;
  const fb = ctx.createGain();
  fb.gain.value = 0.26;
  const delayGain = ctx.createGain();
  delayGain.gain.value = 0.20;
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(master);

  const noiseBuffer = makeNoise(1.0);

  function route(node, pan, rev, dly) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan || 0));
    node.connect(p);
    p.connect(master);
    if (rev > 0) {
      const s = ctx.createGain();
      s.gain.value = rev;
      p.connect(s);
      s.connect(convolver);
    }
    if (dly > 0) {
      const s = ctx.createGain();
      s.gain.value = dly;
      p.connect(s);
      s.connect(delay);
    }
  }

  function playBell(time, freq, amp, pan, dur, rev, dly) {
    const bus = ctx.createGain();
    bus.gain.value = amp;
    route(bus, pan, rev, dly);

    const partials = [
      [1.00, 1.00],
      [2.01, 0.52],
      [3.98, 0.28],
      [5.43, 0.16],
      [7.10, 0.09],
      [9.20, 0.05]
    ];

    for (let i = 0; i < partials.length; i++) {
      const ratio = partials[i][0];
      const pamp = partials[i][1];
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * ratio;
      o.detune.value = (random() - 0.5) * 8;

      const eg = ctx.createGain();
      const decay = dur * (0.55 + i * 0.16);
      eg.gain.setValueAtTime(0.0001, time);
      eg.gain.exponentialRampToValueAtTime(pamp, time + 0.008);
      eg.gain.exponentialRampToValueAtTime(0.0001, time + decay);

      o.connect(eg);
      eg.connect(bus);
      o.start(time);
      o.stop(time + decay + 0.05);
    }
  }

  function playPluck(time, freq, amp, pan, dur, rev, dly) {
    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = freq;

    const o2 = ctx.createOscillator();
    o2.type = "sawtooth";
    o2.frequency.value = freq;
    o2.detune.value = 7;

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.Q.value = 1.5;
    filt.frequency.setValueAtTime(2200, time);
    filt.frequency.exponentialRampToValueAtTime(220, time + dur);

    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0.0001, time);
    eg.gain.exponentialRampToValueAtTime(amp, time + 0.006);
    eg.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    o1.connect(filt);
    o2.connect(filt);
    filt.connect(eg);
    route(eg, pan, rev, dly);

    o1.start(time);
    o2.start(time);
    o1.stop(time + dur + 0.05);
    o2.stop(time + dur + 0.05);
  }

  function playBass(time, freq, amp, pan) {
    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(freq * 1.8, time);
    o1.frequency.exponentialRampToValueAtTime(freq, time + 0.06);

    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = freq;

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 190;

    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0.0001, time);
    eg.gain.exponentialRampToValueAtTime(amp, time + 0.01);
    eg.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);

    o1.connect(eg);
    o2.connect(filt);
    filt.connect(eg);
    route(eg, pan, 0.05, 0);

    o1.start(time);
    o2.start(time);
    o1.stop(time + 0.4);
    o2.stop(time + 0.4);
  }

  function playKick(time, amp, pan) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(170, time);
    o.frequency.exponentialRampToValueAtTime(45, time + 0.12);

    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0.0001, time);
    eg.gain.exponentialRampToValueAtTime(amp, time + 0.005);
    eg.gain.exponentialRampToValueAtTime(0.0001, time + 0.30);

    o.connect(eg);
    route(eg, pan, 0.08, 0);
    o.start(time);
    o.stop(time + 0.32);

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1600;

    const cg = ctx.createGain();
    cg.gain.setValueAtTime(amp * 0.16, time);
    cg.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);

    src.connect(hp);
    hp.connect(cg);
    route(cg, pan * 0.4, 0, 0);
    src.start(time);
    src.stop(time + 0.05);
  }

  function playShaker(time, amp, pan) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 5500 + random() * 2500;
    bp.Q.value = 0.9;

    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0.0001, time);
    eg.gain.exponentialRampToValueAtTime(amp, time + 0.003);
    eg.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);

    src.connect(bp);
    bp.connect(eg);
    route(eg, pan, 0.06, 0.16);
    src.start(time);
    src.stop(time + 0.09);
  }

  function playNoiseSweep(time, dur, amp, from, to, pan, rev) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(from, time);
    bp.frequency.exponentialRampToValueAtTime(to, time + dur);

    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0.0001, time);
    eg.gain.exponentialRampToValueAtTime(amp, time + dur * 0.75);
    eg.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    src.connect(bp);
    bp.connect(eg);
    route(eg, pan, rev, 0.1);
    src.start(time);
    src.stop(time + dur + 0.05);
  }

  function createPad(time, endTime, chord, ampEach) {
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.Q.value = 1.4;
    filt.frequency.setValueAtTime(180, time);
    filt.frequency.linearRampToValueAtTime(900, time + 6);
    filt.frequency.linearRampToValueAtTime(1500, time + 10);
    filt.frequency.exponentialRampToValueAtTime(280, endTime);

    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0.0001, time);
    eg.gain.exponentialRampToValueAtTime(ampEach, time + 3);
    eg.gain.setValueAtTime(ampEach, time + 11.8);
    eg.gain.exponentialRampToValueAtTime(0.0001, endTime);

    const bus = ctx.createGain();
    bus.gain.value = 1;
    filt.connect(eg);
    eg.connect(bus);
    route(bus, 0, 0.55, 0.08);

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.06 + random() * 0.04;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(filt.frequency);
    lfo.start(time);
    lfo.stop(endTime);

    for (let i = 0; i < chord.length; i++) {
      for (let j = 0; j < 2; j++) {
        const o = ctx.createOscillator();
        o.type = j === 0 ? "sawtooth" : "triangle";
        o.frequency.value = chord[i];
        o.detune.value = (j === 0 ? -7 : 7) + (random() - 0.5) * 5;

        const og = ctx.createGain();
        og.gain.value = j === 0 ? 0.5 : 0.8;
        o.connect(og);
        og.connect(filt);
        o.start(time);
        o.stop(endTime + 0.05);
      }
    }
  }

  // ------------------------------------------------------------
  // Timing and composition
  // ------------------------------------------------------------
  const t0 = ctx.currentTime + 0.06;

  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.62, t0 + 0.12);
  master.gain.setValueAtTime(0.62, t0 + 13.4);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + 14.9);

  const N = {
    D1: 36.708, F1: 43.654, A1: 55.000, C2: 65.406,
    D2: 73.416, F2: 87.307, G2: 97.999, A2: 110.000,
    C3: 130.813, D3: 146.832, F3: 174.614, G3: 195.998, A3: 220.000,
    C4: 261.626, D4: 293.665, E4: 329.628, F4: 349.228, G4: 391.995, A4: 440.000,
    C5: 523.251, D5: 587.330, E5: 659.255, F5: 698.456, G5: 783.991, A5: 880.000,
    C6: 1046.502, D6: 1174.659
  };

  createPad(t0, t0 + 15.0, [73.416, 110.0, 174.614, 261.626, 329.628], 0.030);

  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 36.708;
  const subG = ctx.createGain();
  subG.gain.setValueAtTime(0.0001, t0);
  subG.gain.exponentialRampToValueAtTime(0.10, t0 + 2.0);
  subG.gain.setValueAtTime(0.10, t0 + 12.0);
  subG.gain.exponentialRampToValueAtTime(0.0001, t0 + 14.8);
  sub.connect(subG);
  subG.connect(master);
  sub.start(t0);
  sub.stop(t0 + 15.0);

  playNoiseSweep(t0 + 0.02, 2.7, 0.032, 180, 2800, 0, 0.7);

  playBell(t0 + 0.35, N.D5, 0.055, -0.35, 2.2, 0.70, 0.45);
  playBell(t0 + 0.95, N.A5, 0.040, 0.32, 2.0, 0.75, 0.50);
  playBell(t0 + 1.60, N.F5, 0.045, -0.18, 2.0, 0.70, 0.50);
  playBell(t0 + 2.20, N.D6, 0.030, 0.48, 1.8, 0.80, 0.55);

  for (let i = 0; i < 44; i++) {
    const tt = 2.5 + i * 0.25;
    if (tt > 13.0) break;
    const accent = i % 4 === 0;
    if (tt < 4.0 && !accent) continue;
    playShaker(t0 + tt, accent ? 0.026 : 0.013, (random() * 2 - 1) * 0.85);
  }

  const bassPattern = [
    N.D2, N.D2, N.F2, N.C2, N.A1, N.D2,
    N.F2, N.G2, N.D2, N.A1, N.C2, N.D2
  ];
  for (let i = 0; i < 22; i++) {
    const tt = 3.0 + i * 0.5;
    if (tt > 13.0) break;
    playBass(t0 + tt, bassPattern[i % bassPattern.length], 0.15, i % 2 ? 0.12 : -0.12);
  }

  const kickTimes = [4.0, 5.0, 6.0, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0, 10.5, 11.0, 11.5, 12.0, 12.5];
  for (let i = 0; i < kickTimes.length; i++) {
    playKick(t0 + kickTimes[i], i < 3 ? 0.30 : 0.40, i % 2 ? 0.13 : -0.13);
  }

  const arp = [
    N.D5, N.F5, N.G5, N.A5, N.C6, N.A5, N.G5, N.F5,
    N.D5, N.C5, N.A4, N.C5, N.D5, N.F5, N.A5, N.D6
  ];
  for (let i = 0; i < 34; i++) {
    const tt = 4.0 + i * 0.25;
    if (tt > 12.25) break;
    playPluck(
      t0 + tt,
      arp[i % arp.length],
      0.016 + (i % 4 === 0 ? 0.007 : 0),
      i % 2 ? 0.62 : -0.62,
      0.32,
      0.35,
      0.45
    );
  }

  const melody = [
    [4.0, N.D5, 0.052], [4.5, N.F5, 0.048], [5.0, N.E5, 0.048], [5.5, N.D5, 0.050],
    [6.0, N.C5, 0.045], [6.5, N.A4, 0.040], [7.0, N.D5, 0.055],
    [8.0, N.F5, 0.055], [8.5, N.E5, 0.050], [9.0, N.D5, 0.055], [9.5, N.C5, 0.050],
    [10.0, N.A4, 0.045], [10.5, N.D5, 0.055], [11.0, N.A5, 0.050], [11.5, N.D6, 0.045]
  ];
  for (let i = 0; i < melody.length; i++) {
    const m = melody[i];
    playBell(t0 + m[0], m[1], m[2], Math.sin(i * 1.7) * 0.4, 1.7, 0.65, 0.4);
  }

  playNoiseSweep(t0 + 6.8, 2.2, 0.045, 300, 7000, -0.2, 0.6);
  playNoiseSweep(t0 + 12.6, 1.8, 0.025, 1800, 240, 0.2, 0.7);

  const crash = ctx.createBufferSource();
  crash.buffer = noiseBuffer;
  crash.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 4500;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.0001, t0 + 8.88);
  cg.gain.exponentialRampToValueAtTime(0.055, t0 + 9.0);
  cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 10.6);
  crash.connect(hp);
  hp.connect(cg);
  route(cg, 0, 0.75, 0.25);
  crash.start(t0 + 8.88);
  crash.stop(t0 + 10.7);

  const finalNotes = [N.D4, N.A4, N.D5, N.F5, N.A5];
  for (let i = 0; i < finalNotes.length; i++) {
    playBell(t0 + 13.0 + i * 0.035, finalNotes[i], 0.035, (i - 2) * 0.22, 2.4, 0.8, 0.5);
  }
  playBell(t0 + 13.6, N.D6, 0.026, 0.2, 2.2, 0.9, 0.6);
  playBass(t0 + 13.0, N.D2, 0.12, 0);

  // ------------------------------------------------------------
  // Visuals
  // ------------------------------------------------------------
  function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function drawPetal(angle, len, wid, hue, alpha) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const px = -dy;
    const py = dx;

    const tipx = cx + dx * len;
    const tipy = cy + dy * len;

    const c1x = cx + dx * len * 0.22 + px * wid;
    const c1y = cy + dy * len * 0.22 + py * wid;
    const c2x = cx + dx * len * 0.68 + px * wid * 0.72;
    const c2y = cy + dy * len * 0.68 + py * wid * 0.72;
    const c3x = cx + dx * len * 0.68 - px * wid * 0.72;
    const c3y = cy + dy * len * 0.68 - py * wid * 0.72;
    const c4x = cx + dx * len * 0.22 - px * wid;
    const c4y = cy + dy * len * 0.22 - py * wid;

    g.beginPath();
    g.moveTo(cx, cy);
    g.bezierCurveTo(c1x, c1y, c2x, c2y, tipx, tipy);
    g.bezierCurveTo(c3x, c3y, c4x, c4y, cx, cy);
    g.closePath();

    const pg = g.createLinearGradient(cx, cy, tipx, tipy);
    pg.addColorStop(0, `hsla(${hue},100%,70%,${alpha * 0.15})`);
    pg.addColorStop(0.55, `hsla(${hue},100%,65%,${alpha})`);
    pg.addColorStop(1, `hsla(${hue + 40},100%,80%,${alpha * 1.4})`);
    g.fillStyle = pg;
    g.fill();

    g.strokeStyle = `hsla(${hue},100%,82%,${alpha * 2.2})`;
    g.lineWidth = 1.2;
    g.stroke();
  }

  const stars = [];
  for (let i = 0; i < 180; i++) {
    stars.push({
      x: random() * W,
      y: random() * H,
      speed: 0.08 + random() * 0.25,
      phase: random() * TAU,
      size: 0.4 + random() * 1.8,
      hue: 185 + random() * 120,
      z: 0.3 + random() * 0.7
    });
  }

  const sparks = [];
  for (let i = 0; i < 260; i++) {
    sparks.push({
      angle: random() * TAU,
      radius: 80 + random() * 620,
      speed: (random() - 0.5) * 0.45,
      phase: random() * TAU,
      size: 0.5 + random() * 2.6,
      hue: [185, 195, 305, 330, 45][Math.floor(random() * 5)],
      wobble: 0.25 + random() * 0.9
    });
  }

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.fftSize);

  function draw(t) {
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);

    let bass = 0;
    for (let i = 1; i <= 6; i++) bass += freqData[i];
    bass /= 6 * 255;

    const fadeIn = smoothstep(0, 1.1, t);
    const open = smoothstep(0.8, 6.3, t) * (1 - 0.26 * smoothstep(13.0, 15.0, t));
    const climax = Math.exp(-Math.pow((t - 9.0) / 1.6, 2));
    const release = 1 - smoothstep(13.2, 15.0, t);

    const beatPhase = (t % 0.5) / 0.5;
    const beatPulse = Math.exp(-beatPhase * 10) * (t > 3.5 ? 1 : 0.25);
    const pulse = Math.min(1.2, bass * 2.2 + beatPulse * 0.28);
    const energy = 0.35 + 0.65 * open + 0.45 * climax;

    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(1,4,12,0.18)";
    g.fillRect(0, 0, W, H);

    g.globalCompositeOperation = "lighter";

    const bg = g.createRadialGradient(cx, cy, 0, cx, cy, 820);
    bg.addColorStop(0, `rgba(30,110,150,${0.022 + 0.035 * open})`);
    bg.addColorStop(0.45, `rgba(80,30,120,${0.010 + 0.022 * open})`);
    bg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const x = s.x + Math.sin(t * s.speed + s.phase) * 14;
      const y = s.y + Math.cos(t * s.speed * 0.7 + s.phase) * 10;
      const a = (0.18 + 0.82 * Math.abs(Math.sin(t * 1.2 + s.phase))) * s.z * fadeIn;
      g.fillStyle = `hsla(${s.hue},90%,72%,${a * 0.55})`;
      g.beginPath();
      g.arc(x, y, s.size, 0, TAU);
      g.fill();
    }

    const bot = g.createLinearGradient(0, H, 0, cy);
    bot.addColorStop(0, `rgba(80,30,170,${0.06 * open + 0.04 * climax})`);
    bot.addColorStop(0.55, `rgba(20,90,130,${0.02 * open})`);
    bot.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = bot;
    g.fillRect(0, cy, W, H - cy);

    for (let p = 0; p < 2; p++) {
      const grad = g.createLinearGradient(cx, H, cx, cy);
      grad.addColorStop(0, `rgba(50,190,255,${p === 0 ? 0.03 : 0.20})`);
      grad.addColorStop(0.65, `rgba(150,70,255,${p === 0 ? 0.025 : 0.14})`);
      grad.addColorStop(1, `rgba(255,220,150,${p === 0 ? 0.02 : 0.28})`);
      g.strokeStyle = grad;
      g.lineWidth = p === 0 ? 18 : 2.4;

      g.beginPath();
      for (let i = 0; i <= 48; i++) {
        const v = i / 48;
        const y = H - (H - cy) * v;
        const sway = Math.sin(v * 7 + t * 1.8) * (8 + 30 * open) * Math.sin(v * Math.PI);
        const x = cx + sway + p * Math.sin(v * 13 + t * 2.2) * 3;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }

    if (open > 0.01) {
      for (let i = 0; i < 36; i++) {
        const a0 = (i / 36) * TAU + t * 0.06;
        const a1 = a0 + 0.22 + 0.08 * Math.sin(t * 0.6 + i);
        const r0 = 20 + 90 * open;
        const r1 = 220 + 380 * open + 80 * Math.sin(t * 0.7 + i * 0.9);
        const midA = (a0 + a1) / 2 + 0.18 * Math.sin(t * 0.4 + i);
        const midR = (r0 + r1) / 2 + 40 * Math.sin(t * 0.9 + i * 1.3);

        const sx = cx + Math.cos(a0) * r0;
        const sy = cy + Math.sin(a0) * r0;
        const ex = cx + Math.cos(a1) * r1;
        const ey = cy + Math.sin(a1) * r1;
        const mx = cx + Math.cos(midA) * midR;
        const my = cy + Math.sin(midA) * midR;

        g.beginPath();
        g.moveTo(sx, sy);
        g.quadraticCurveTo(mx, my, ex, ey);
        g.strokeStyle = `hsla(${190 + i * 4},100%,70%,${0.025 + 0.07 * open})`;
        g.lineWidth = 0.9;
        g.stroke();
      }
    }

    if (open > 0.005) {
      const petals = 12;
      const baseLen = [340, 250, 170];
      const baseWid = [118, 82, 50];
      const baseHue = [185, 305, 48];

      for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < petals; i++) {
          const angle =
            (i / petals) * TAU +
            t * (0.05 + layer * 0.025) +
            Math.sin(t * 0.3 + i * 1.7) * 0.05;

          const localOpen = Math.max(
            0,
            Math.min(1, open * 1.2 - layer * 0.03 + 0.1 * Math.sin(t * 0.7 + i))
          );

          const len =
            baseLen[layer] * (0.12 + 0.88 * localOpen) +
            (layer === 0 ? 90 * climax : 30 * climax) +
            pulse * 22;

          const wid = baseWid[layer] * (0.15 + 0.85 * localOpen);
          const hue = baseHue[layer] + i * 6 + 20 * Math.sin(t * 0.8 + i * 0.5);
          const alpha =
            (0.016 + 0.032 * localOpen) *
            (layer === 2 ? 1.35 : 1) *
            (0.6 + 0.4 * energy);

          drawPetal(angle, len, wid, hue, alpha);
        }
      }
    }

    for (let k = 0; k < 5; k++) {
      const r = (45 + k * 38) * (0.6 + 0.9 * open) + pulse * 18 + k * 3;
      const a0 = t * (0.2 + k * 0.03) + k * 0.9;
      const a1 = a0 + Math.PI * (0.8 + 0.3 * Math.sin(t * 0.6 + k));

      g.beginPath();
      g.arc(cx, cy, r, a0, a1);
      g.strokeStyle = `hsla(${185 + k * 38},100%,78%,${0.10 + 0.16 * open})`;
      g.lineWidth = 1.2 + k * 0.4;
      g.stroke();

      g.beginPath();
      g.arc(cx, cy, r * 0.92, a0 + Math.PI, a1 + Math.PI);
      g.strokeStyle = `hsla(${310 + k * 20},100%,78%,${0.06 + 0.10 * open})`;
      g.stroke();
    }

    const bins = 160;
    const step = Math.floor(timeData.length / bins);
    g.beginPath();
    for (let i = 0; i < bins; i++) {
      const v = (timeData[i * step] - 128) / 128;
      const a = (i / bins) * TAU + t * 0.08;
      const r = 150 + 250 * open + v * 70 * (0.3 + open) + pulse * 20;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.strokeStyle = `rgba(255,220,150,${0.10 + 0.18 * open})`;
    g.lineWidth = 1.8;
    g.stroke();

    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      const ang = s.angle + t * s.speed + Math.sin(t * s.wobble + s.phase) * 0.35;
      const rad =
        s.radius * (0.45 + 0.85 * open) +
        Math.sin(t * 1.3 + s.phase) * 25 +
        pulse * 30;

      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad * 0.92;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.7 + s.phase));
      const alpha = tw * (0.16 + 0.5 * open) * fadeIn;

      g.fillStyle = `hsla(${s.hue},100%,72%,${alpha * 0.25})`;
      g.beginPath();
      g.arc(x, y, s.size * (2.2 + open * 1.5), 0, TAU);
      g.fill();

      g.fillStyle = `hsla(${s.hue},100%,80%,${alpha})`;
      g.beginPath();
      g.arc(x, y, s.size * (0.5 + 0.7 * open), 0, TAU);
      g.fill();
    }

    const coreR =
      (14 + 62 * open + 26 * climax + 10 * pulse) *
      (0.7 + 0.3 * fadeIn) *
      (0.75 + 0.25 * release);

    const cgrd = g.createRadialGradient(cx, cy, 0, cx, cy, coreR * 4);
    cgrd.addColorStop(0, `rgba(255,255,255,${0.7 + 0.2 * pulse})`);
    cgrd.addColorStop(0.12, "rgba(180,255,255,0.55)");
    cgrd.addColorStop(0.35, "rgba(90,140,255,0.28)");
    cgrd.addColorStop(0.65, "rgba(255,90,220,0.10)");
    cgrd.addColorStop(1, "rgba(0,0,0,0)");

    g.fillStyle = cgrd;
    g.beginPath();
    g.arc(cx, cy, coreR * 4, 0, TAU);
    g.fill();

    g.fillStyle = `rgba(255,255,255,${0.85 * fadeIn})`;
    g.beginPath();
    g.arc(cx, cy, coreR * 0.28, 0, TAU);
    g.fill();
  }

  const raf =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (cb) => setTimeout(() => cb(performance.now()), 16);

  function frame() {
    const elapsed = ctx.currentTime - t0;
    if (elapsed > D + 0.35) return;
    draw(Math.max(0, elapsed));
    raf(frame);
  }

  raf(frame);
}
