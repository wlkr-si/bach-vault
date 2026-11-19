export const title = "Heliotrope Circuit (15s Bench Cut)";

export function start({ audioContext, canvas, duration = 15, random }) {
  const ac = audioContext;
  const rnd = typeof random === "function" ? random : Math.random;
  const D = Math.max(4, duration || 15);
  if (ac.state === "suspended" && ac.resume) ac.resume();

  const gx = canvas.getContext("2d");
  const W = canvas.width || 1080;
  const H = canvas.height || 1350;
  const TAU = Math.PI * 2;

  const t0 = ac.currentTime + 0.04;
  const tEnd = t0 + D;

  // ---------- utilities ----------
  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function makeCurve(amount = 2.5, n = 1024) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(amount * x);
    }
    return c;
  }

  function createImpulse(seconds = 2.3, decay = 2.8) {
    const len = Math.max(1, (seconds * ac.sampleRate) | 0);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = 1 - i / len;
        d[i] = (rnd() * 2 - 1) * Math.pow(t, decay) * (0.8 + 0.2 * rnd());
      }
    }
    return buf;
  }

  function createNoiseBuffer(seconds = 1.4) {
    const len = Math.max(1, (seconds * ac.sampleRate) | 0);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
    return buf;
  }

  // ---------- musical grid ----------
  const bars = 8;
  const beatsPerBar = 4;
  const totalBeats = bars * beatsPerBar; // 32 beats
  const beat = D / totalBeats;
  const stepDur = beat / 4;

  const scaleChoices = [
    [0, 2, 3, 7, 8, 10],
    [0, 1, 4, 6, 7, 10],
    [0, 2, 5, 7, 9, 10],
  ];
  const scale = scaleChoices[(rnd() * scaleChoices.length) | 0];
  function scaleFreq(rootMidi, degree, octave = 0) {
    const n = scale.length;
    let d = degree;
    let oct = octave;
    while (d < 0) {
      d += n;
      oct--;
    }
    oct += (d / n) | 0;
    const idx = d % n;
    return midiToFreq(rootMidi + scale[idx] + oct * 12);
  }

  const progressionBase = [0, -3, 5, 2, -5, 4, 1, -2];
  const transposeSet = [-2, 0, 1, 3];
  const transpose = transposeSet[(rnd() * transposeSet.length) | 0];
  const rotate = (rnd() * progressionBase.length) | 0;
  const progression = progressionBase.map(
    (_, i) => progressionBase[(i + rotate) % progressionBase.length] + transpose
  );

  // ---------- audio graph ----------
  const mix = ac.createGain();
  const drive = ac.createWaveShaper();
  const comp = ac.createDynamicsCompressor();
  const analyser = ac.createAnalyser();

  drive.curve = makeCurve(2.8);
  drive.oversample = "2x";

  comp.threshold.value = -17;
  comp.knee.value = 10;
  comp.ratio.value = 3;
  comp.attack.value = 0.003;
  comp.release.value = 0.16;

  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.84;

  mix.connect(drive);
  drive.connect(comp);
  comp.connect(analyser);
  analyser.connect(ac.destination);

  const convolver = ac.createConvolver();
  convolver.buffer = createImpulse(2.2, 2.9);
  const reverbLevel = ac.createGain();
  reverbLevel.gain.value = 0.22;
  convolver.connect(reverbLevel);
  reverbLevel.connect(mix);

  const delay = ac.createDelay(2.0);
  delay.delayTime.setValueAtTime(beat * 0.75, t0);
  const delayTone = ac.createBiquadFilter();
  delayTone.type = "lowpass";
  delayTone.frequency.value = 2300;
  const feedback = ac.createGain();
  feedback.gain.value = 0.34;
  const delayLevel = ac.createGain();
  delayLevel.gain.value = 0.18;

  delay.connect(delayTone);
  delayTone.connect(feedback);
  feedback.connect(delay);
  delay.connect(delayLevel);
  delayLevel.connect(mix);

  mix.gain.setValueAtTime(0.0001, t0);
  mix.gain.exponentialRampToValueAtTime(0.86, t0 + 0.55);
  mix.gain.setValueAtTime(0.86, Math.max(t0 + 0.6, tEnd - 0.8));
  mix.gain.exponentialRampToValueAtTime(0.0001, tEnd + 0.06);

  const hasPanner = typeof ac.createStereoPanner === "function";
  const noiseBuffer = createNoiseBuffer(1.5);
  const kickCurve = makeCurve(4.2);

  const events = [];
  function registerEvent(tAbs, freq, amp, hue, kind) {
    events.push({
      t: tAbs - t0,
      freq,
      amp,
      hue,
      kind,
      ang: rnd() * TAU,
      orbit: 85 + Math.log2(1 + Math.max(30, freq) / 28) * 78 + rnd() * 250,
      spin: rnd() < 0.5 ? -1 : 1,
    });
  }

  function connectOutput(node, pan = 0, rev = 0.15, del = 0.08) {
    let out = node;
    if (hasPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      out = p;
    }
    out.connect(mix);

    if (rev > 0) {
      const rg = ac.createGain();
      rg.gain.value = rev;
      out.connect(rg);
      rg.connect(convolver);
    }
    if (del > 0) {
      const dg = ac.createGain();
      dg.gain.value = del;
      out.connect(dg);
      dg.connect(delay);
    }
  }

  // ---------- instruments ----------
  function kick(t, vel = 1) {
    const osc = ac.createOscillator();
    const sh = ac.createWaveShaper();
    const g = ac.createGain();
    sh.curve = kickCurve;

    osc.type = "sine";
    osc.frequency.setValueAtTime(185, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.22);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.0 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);

    osc.connect(sh);
    sh.connect(g);
    connectOutput(g, 0, 0.03, 0.02);

    osc.start(t);
    osc.stop(t + 0.35);

    registerEvent(t, 55, vel, 28, 0);
  }

  function snare(t, vel = 0.85) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = 0.85 + rnd() * 0.35;

    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(1250, t);

    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(2150, t);
    bp.Q.value = 0.75;

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.72 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    src.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    connectOutput(g, rnd() * 0.3 - 0.15, 0.22, 0.07);

    src.start(t);
    src.stop(t + 0.24);

    const tone = ac.createOscillator();
    const tg = ac.createGain();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(245, t);
    tone.frequency.exponentialRampToValueAtTime(138, t + 0.12);

    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(0.24 * vel, t + 0.003);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

    tone.connect(tg);
    connectOutput(tg, 0, 0.09, 0.03);

    tone.start(t);
    tone.stop(t + 0.16);

    registerEvent(t, 180, vel, 348, 1);
  }

  function hat(t, vel = 0.45, open = false) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = 1.8 + rnd() * 0.7;

    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(open ? 5600 : 7800, t);

    const g = ac.createGain();
    const dur = open ? 0.24 : 0.07;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((open ? 0.32 : 0.22) * vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(hp);
    hp.connect(g);
    connectOutput(g, rnd() * 0.7 - 0.35, 0.04, 0.05);

    src.start(t);
    src.stop(t + dur + 0.02);

    registerEvent(t, 7000, vel, 65, 1);
  }

  function bass(t, d, f, vel = 0.7) {
    const o1 = ac.createOscillator();
    const o2 = ac.createOscillator();
    const filt = ac.createBiquadFilter();
    const g = ac.createGain();

    o1.type = "sawtooth";
    o2.type = "triangle";
    o1.frequency.setValueAtTime(f, t);
    o2.frequency.setValueAtTime(f * 0.5, t);

    filt.type = "lowpass";
    filt.Q.value = 1.4;
    filt.frequency.setValueAtTime(190, t);
    filt.frequency.exponentialRampToValueAtTime(1150, t + 0.03);
    filt.frequency.exponentialRampToValueAtTime(145, t + d + 0.05);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.66 * vel, t + 0.016);
    g.gain.exponentialRampToValueAtTime(0.18 * vel, t + d * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);

    o1.connect(filt);
    o2.connect(filt);
    filt.connect(g);
    connectOutput(g, -0.12, 0.04, 0.05);

    o1.start(t);
    o2.start(t);
    o1.stop(t + d + 0.22);
    o2.stop(t + d + 0.22);

    registerEvent(t, f, vel, 205, 2);
  }

  function pluck(t, d, f, vel = 0.3, pan = 0) {
    const osc = ac.createOscillator();
    const filt = ac.createBiquadFilter();
    const g = ac.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(f, t);

    filt.type = "lowpass";
    filt.Q.value = 5.8;
    filt.frequency.setValueAtTime(4300, t);
    filt.frequency.exponentialRampToValueAtTime(760, t + d);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.08);

    osc.connect(filt);
    filt.connect(g);
    connectOutput(g, pan, 0.18, 0.2);

    osc.start(t);
    osc.stop(t + d + 0.1);

    registerEvent(t, f, vel, 128, 3);
  }

  function lead(t, d, f, vel = 0.4, pan = 0) {
    const car = ac.createOscillator();
    const mod = ac.createOscillator();
    const modG = ac.createGain();
    const filt = ac.createBiquadFilter();
    const g = ac.createGain();

    car.type = "sine";
    mod.type = "triangle";

    car.frequency.setValueAtTime(f, t);
    mod.frequency.setValueAtTime(f * 2.01, t);

    modG.gain.setValueAtTime(f * 1.8, t);
    modG.gain.exponentialRampToValueAtTime(f * 0.22, t + d);
    mod.connect(modG);
    modG.connect(car.frequency);

    filt.type = "bandpass";
    filt.Q.value = 2.5;
    filt.frequency.setValueAtTime(f * 2.35, t);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);

    car.connect(filt);
    filt.connect(g);
    connectOutput(g, pan, 0.36, 0.28);

    car.start(t);
    mod.start(t);
    car.stop(t + d + 0.28);
    mod.stop(t + d + 0.28);

    registerEvent(t, f, vel, 282, 4);
  }

  function padChord(t, d, rootMidi) {
    const sum = ac.createGain();
    const filt = ac.createBiquadFilter();
    const g = ac.createGain();

    sum.gain.value = 0.24;
    filt.type = "lowpass";
    filt.Q.value = 0.85;
    filt.frequency.setValueAtTime(920, t);
    filt.frequency.linearRampToValueAtTime(2100, t + d * 0.45);
    filt.frequency.linearRampToValueAtTime(760, t + d);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.55);
    g.gain.setValueAtTime(0.18, t + d * 0.76);
    g.gain.linearRampToValueAtTime(0.0001, t + d + 0.95);

    sum.connect(filt);
    filt.connect(g);
    connectOutput(g, rnd() * 0.4 - 0.2, 0.5, 0.16);

    const iv = [-12, 0, 7, 10, 14];
    for (let i = 0; i < iv.length; i++) {
      const o = ac.createOscillator();
      o.type = i % 2 ? "sawtooth" : "triangle";
      o.frequency.setValueAtTime(midiToFreq(rootMidi + iv[i]), t);
      o.detune.value = (rnd() - 0.5) * 14;
      o.connect(sum);
      o.start(t);
      o.stop(t + d + 1.05);
    }

    registerEvent(t, midiToFreq(rootMidi), 0.45, 230, 5);
  }

  function bell(t, f, vel = 0.45) {
    const c = ac.createOscillator();
    const m = ac.createOscillator();
    const mg = ac.createGain();
    const hp = ac.createBiquadFilter();
    const g = ac.createGain();

    c.type = "sine";
    m.type = "sine";

    c.frequency.setValueAtTime(f, t);
    m.frequency.setValueAtTime(f * 3.01, t);

    mg.gain.setValueAtTime(f * 2.4, t);
    mg.gain.exponentialRampToValueAtTime(1.1, t + 1.2);
    m.connect(mg);
    mg.connect(c.frequency);

    hp.type = "highpass";
    hp.frequency.value = 500;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);

    c.connect(hp);
    hp.connect(g);
    connectOutput(g, rnd() * 0.8 - 0.4, 0.52, 0.34);

    c.start(t);
    m.start(t);
    c.stop(t + 1.9);
    m.stop(t + 1.9);

    registerEvent(t, f, vel, 45, 6);
  }

  function riser(t, d) {
    if (d <= 0.1) return;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.85;
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.exponentialRampToValueAtTime(9000, t + d);

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32, t + d * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + d);

    src.connect(bp);
    bp.connect(g);
    connectOutput(g, 0, 0.36, 0.22);

    src.start(t);
    src.stop(t + d + 0.05);

    registerEvent(t + d * 0.78, 1300, 0.8, 18, 7);
  }

  // ---------- compose ----------
  for (let bar = 0; bar < bars; bar++) {
    const bt = t0 + bar * beatsPerBar * beat;
    const rootMid = 45 + progression[bar];
    if (bar >= 1) padChord(bt, beat * 4.2, rootMid);
    if (bar % 2 === 0 || bar === bars - 1) {
      bell(
        bt + beat * 0.02,
        midiToFreq(rootMid + 19 + (bar >= 5 ? 12 : 0)),
        0.24 + bar * 0.05
      );
    }
  }

  const bassPattern = [0, null, 2, null, 3, 2, 0, null, -1, null, 2, null, 4, 3, 2, null];
  const arpSeq = [0, 2, 4, 1, 3, 5, 2, 4, 6, 3];

  for (let step = 0; step < bars * 16; step++) {
    const t = t0 + step * stepDur;
    const bar = (step / 16) | 0;
    const pos = step & 15;
    const sec = step / (bars * 16);
    const root = 33 + progression[bar];

    if (pos === 0) kick(t, 1 + sec * 0.15);
    if ((pos === 6 || pos === 10) && rnd() < 0.45 + sec * 0.45) kick(t, 0.72);
    if (bar >= 6 && (pos === 14 || pos === 15)) kick(t, 0.58);

    if (pos === 8) snare(t, 0.95);
    if ((bar >= 3 && pos === 12 && rnd() < 0.65) || (bar === 7 && (pos === 13 || pos === 15))) {
      snare(t, 0.56);
    }

    if (step > 6) {
      if (pos % 2 === 1 && rnd() < 0.86) hat(t, 0.3 + 0.45 * sec, false);
      if (pos === 14 && rnd() < 0.68) hat(t, 0.55, true);
    }

    const deg = bassPattern[pos];
    if (deg !== null) {
      const oct = bar >= 5 && pos === 12 ? 1 : 0;
      bass(t, stepDur * (pos === 0 ? 2.8 : 1.55), scaleFreq(root, deg, oct), 0.72 + (pos === 0 ? 0.18 : 0));
    }

    if (bar >= 1 && pos % 2 === 0) {
      const idx = (((step >> 1) + bar) % arpSeq.length) | 0;
      const degA = arpSeq[idx] + (bar >= 4 && idx % 3 === 0 ? 1 : 0);
      const f = scaleFreq(root + 12, degA, bar >= 5 ? 1 : 0);
      const pan = ((idx % 4) - 1.5) / 2.2;
      pluck(t, stepDur * 1.3, f, 0.22 + sec * 0.28, pan);
      if (bar >= 5 && rnd() < 0.15) pluck(t + stepDur * 0.5, stepDur * 0.8, f * 2, 0.16, -pan);
    }
  }

  let mDeg = 2 + ((rnd() * 3) | 0);
  const leaps = [1, -2, 2, 3, -1, 4, -3];
  for (let b = 10; b < totalBeats - 1; b++) {
    const bar = (b / 4) | 0;
    if (bar < 3) continue;
    if (rnd() < (bar >= 6 ? 0.95 : 0.78)) {
      mDeg += leaps[(rnd() * leaps.length) | 0];
      if (mDeg > 10) mDeg -= 6;
      if (mDeg < -3) mDeg += 5;

      const rt = 50 + progression[bar];
      const f = scaleFreq(rt, mDeg, bar >= 6 ? 1 : 0);
      const t = t0 + b * beat + (bar >= 6 && rnd() < 0.28 ? stepDur * 0.5 : 0);
      lead(t, beat * (bar >= 6 ? 0.48 : 0.72), f, 0.24 + bar * 0.055, rnd() * 0.8 - 0.4);
    }
  }

  if (D > 5) {
    const rStart = Math.max(t0 + 0.1, tEnd - 2.3);
    const rDur = Math.max(0.9, tEnd - rStart - 0.12);
    riser(rStart, rDur);
    bell(Math.max(t0 + 0.2, tEnd - 1.15), midiToFreq(79 + transpose), 0.66);
    kick(Math.max(t0 + 0.3, tEnd - 0.25), 1.25);
  }

  // ---------- visuals ----------
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const waveData = new Uint8Array(analyser.fftSize);

  gx.fillStyle = "rgb(6,8,14)";
  gx.fillRect(0, 0, W, H);

  let raf = 0;
  let stopped = false;
  let killTimer = 0;

  function avgBand(a, b) {
    let s = 0;
    const hi = Math.min(b, freqData.length);
    for (let i = a; i < hi; i++) s += freqData[i];
    return s / Math.max(1, hi - a) / 255;
  }

  function frame() {
    if (stopped) return;

    const rel = ac.currentTime - t0;
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(waveData);

    const low = avgBand(2, 28);
    const mid = avgBand(28, 150);
    const high = avgBand(150, 430);

    const hueBase = (220 + rel * 22 + high * 120) % 360;

    gx.globalCompositeOperation = "source-over";
    gx.fillStyle = `rgba(${(8 + low * 35) | 0}, ${(10 + mid * 32) | 0}, ${(18 + high * 55) | 0}, 0.18)`;
    gx.fillRect(0, 0, W, H);

    const cx = W * 0.5;
    const cy = H * 0.48;

    gx.save();
    gx.translate(cx, cy);

    for (let ring = 0; ring < 6; ring++) {
      const rot = rel * (0.12 + ring * 0.05) * (ring % 2 ? 1 : -1);
      const baseR = 120 + ring * 68 + low * 36;
      gx.beginPath();
      const seg = 72;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU + rot;
        const wob =
          Math.sin(a * 3 + rel * 2 + ring) * (8 + high * 22) +
          Math.cos(i * 0.27 + rel * 1.3) * (2 + mid * 6);
        const r = baseR + wob;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r * 0.82;
        if (i === 0) gx.moveTo(x, y);
        else gx.lineTo(x, y);
      }
      gx.strokeStyle = `hsla(${(hueBase + ring * 32) % 360}, 92%, ${38 + ring * 6}%, ${0.06 + ring * 0.025})`;
      gx.lineWidth = 1.2 + ring * 0.5;
      gx.stroke();
    }

    gx.beginPath();
    const pts = 220;
    for (let i = 0; i <= pts; i++) {
      const idx = ((i / pts) * waveData.length) | 0;
      const v = (waveData[idx] - 128) / 128;
      const a = (i / pts) * TAU + rel * 0.35;
      const r = 78 + v * (55 + high * 80) + mid * 85;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * 0.9;
      if (i === 0) gx.moveTo(x, y);
      else gx.lineTo(x, y);
    }
    gx.fillStyle = `hsla(${(hueBase + 40) % 360}, 95%, 62%, 0.14)`;
    gx.fill();

    gx.restore();

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const dt = rel - ev.t;
      if (dt < -0.12 || dt > 1.35) continue;

      const pre = dt < 0 ? 1 + dt / 0.12 : 1;
      const life = dt < 0 ? 0 : dt / 1.35;
      const alpha = (1 - life) * (0.2 + ev.amp * 0.6) * pre;

      const orbit = ev.orbit + Math.max(0, dt) * 110 * (0.6 + ev.amp);
      const a = ev.ang + rel * 0.07 + dt * ev.spin * (0.7 + ev.kind * 0.15);
      const x = cx + Math.cos(a) * orbit;
      const y = cy + Math.sin(a * 1.15) * orbit * 0.68;
      const size = 1.5 + ev.amp * 4 + (dt > 0 ? dt * 10 : 0);

      gx.beginPath();
      gx.strokeStyle = `hsla(${ev.hue}, 95%, ${55 + high * 25}%, ${alpha})`;
      gx.lineWidth = 1 + ev.amp * 1.8;
      gx.arc(x, y, size * 2.4 + (dt > 0 ? dt * 34 : 0), 0, TAU);
      gx.stroke();

      gx.beginPath();
      gx.fillStyle = `hsla(${(ev.hue + 30) % 360}, 100%, 70%, ${alpha * 0.8})`;
      gx.arc(x, y, size, 0, TAU);
      gx.fill();

      if (dt > 0 && dt < 0.22) {
        gx.beginPath();
        gx.moveTo(cx, cy);
        gx.lineTo(x, y);
        gx.strokeStyle = `hsla(${ev.hue}, 90%, 60%, ${(0.2 - dt) * 2.2 * alpha})`;
        gx.lineWidth = 0.6;
        gx.stroke();
      }
    }

    const barsVis = 56;
    const bw = W / barsVis;
    for (let i = 0; i < barsVis; i++) {
      const idx = ((i / barsVis) * 220) | 0;
      const v = freqData[idx] / 255;
      const hh = v * (120 + high * 220);
      gx.fillStyle = `hsla(${(hueBase + i * 2) % 360}, 90%, ${40 + v * 45}%, 0.45)`;
      gx.fillRect(i * bw, H - 8 - hh, bw * 0.8, hh);
    }

    if (rel < D + 0.2) raf = requestAnimationFrame(frame);
    else cleanup();
  }

  function cleanup() {
    if (stopped) return;
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    if (killTimer) clearTimeout(killTimer);
    try { analyser.disconnect(); } catch {}
    try { comp.disconnect(); } catch {}
    try { drive.disconnect(); } catch {}
    try { mix.disconnect(); } catch {}
    try { convolver.disconnect(); } catch {}
    try { delay.disconnect(); } catch {}
    try { feedback.disconnect(); } catch {}
    try { delayTone.disconnect(); } catch {}
    try { reverbLevel.disconnect(); } catch {}
    try { delayLevel.disconnect(); } catch {}
  }

  raf = requestAnimationFrame(frame);
  killTimer = setTimeout(cleanup, (D + 1.0) * 1000);

  return cleanup;
}
