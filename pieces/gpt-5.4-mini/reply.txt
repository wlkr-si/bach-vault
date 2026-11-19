export const title = "Pentachromic Loom";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (h) => ((h % 360) + 360) % 360;
const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const hsla = (h, s, l, a = 1) => `hsla(${wrap(h)},${s}%,${l}%,${a})`;

function makeNoiseBuffer(ctx, rnd, seconds = 1.2) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let s = rnd() * 2 - 1;
    for (let i = 0; i < len; i++) {
      s = s * 0.98 + (rnd() * 2 - 1) * 0.25;
      const env = Math.pow(1 - i / len, 0.35 + ch * 0.04);
      data[i] = s * env * 0.85;
    }
  }
  return buffer;
}

function makeImpulse(ctx, rnd, seconds = 1.8, decay = 3.1) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const x = 1 - i / len;
      data[i] = (rnd() * 2 - 1) * Math.pow(x, decay + ch * 0.08);
    }
  }
  return buffer;
}

const raf =
  globalThis.requestAnimationFrame
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : (fn) => setTimeout(fn, 16);

export function start({ audioContext, canvas, duration = 15, random = Math.random }) {
  const rnd = typeof random === "function" ? random : Math.random;
  const gc = canvas.getContext("2d");
  if (!gc) return;
  if (canvas.__pentachromicLoomActive) return;
  canvas.__pentachromicLoomActive = true;

  const W = canvas.width || 1080;
  const H = canvas.height || 1350;
  const cx = W * 0.5;
  const cy = H * 0.48;
  const minDim = Math.min(W, H);

  gc.lineCap = "round";
  gc.lineJoin = "round";
  gc.imageSmoothingEnabled = true;

  const baseHue = 195 + rnd() * 70;
  const barHues = [
    wrap(baseHue),
    wrap(baseHue + 42),
    wrap(baseHue + 88),
    wrap(baseHue + 145),
    wrap(baseHue + 216),
  ];
  const accentHue = wrap(baseHue + 110 + rnd() * 25);
  const sparkHue = wrap(baseHue + 188);
  const warmHue = wrap(baseHue + 325);
  const armOffset = Math.floor(rnd() * 5);
  const ribbonSeed = rnd() * TAU;

  const t0 = audioContext.currentTime + 0.12;
  const beatDur = duration / 25;
  const barDur = beatDur * 5;
  const outerR = minDim * 0.39;

  const mix = audioContext.createGain();
  const comp = audioContext.createDynamicsCompressor();
  const analyser = audioContext.createAnalyser();
  const wetReturn = audioContext.createGain();
  const convolver = audioContext.createConvolver();

  mix.gain.value = 0.86;
  wetReturn.gain.value = 0.25;

  comp.threshold.value = -20;
  comp.knee.value = 22;
  comp.ratio.value = 6.5;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.85;

  convolver.buffer = makeImpulse(audioContext, rnd, 1.7, 3.2);

  mix.connect(comp);
  comp.connect(analyser);
  analyser.connect(audioContext.destination);
  convolver.connect(wetReturn);
  wetReturn.connect(mix);

  const noiseBuffer = makeNoiseBuffer(audioContext, rnd, 1.15);

  const makePan = (v) => {
    if (audioContext.createStereoPanner) {
      const p = audioContext.createStereoPanner();
      p.pan.value = clamp(v, -1, 1);
      return p;
    }
    const p = audioContext.createGain();
    p.gain.value = 1;
    return p;
  };

  const connectVoice = (node, dry = 1, wet = 0.2, pan = 0) => {
    const p = makePan(pan);
    const d = audioContext.createGain();
    const w = audioContext.createGain();
    d.gain.value = dry;
    w.gain.value = wet;
    node.connect(p);
    p.connect(d);
    p.connect(w);
    d.connect(mix);
    w.connect(convolver);
  };

  function leadVoice(time, dur, midi, vel, bar, arm, pan) {
    const f = midiToFreq(midi);
    const filter = audioContext.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(f * 1.55, time);
    filter.frequency.exponentialRampToValueAtTime(f * 1.1, time + Math.max(0.03, dur * 0.7));
    filter.Q.value = 7 + bar * 0.7;

    const env = audioContext.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(vel, time + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.18);

    const o1 = audioContext.createOscillator();
    const o2 = audioContext.createOscillator();
    o1.type = "sine";
    o2.type = "sine";
    o1.frequency.setValueAtTime(f, time);
    o2.frequency.setValueAtTime(f * 2.01, time);

    const g1 = audioContext.createGain();
    const g2 = audioContext.createGain();
    g1.gain.value = 0.9;
    g2.gain.value = bar >= 2 ? 0.34 : 0.26;

    o1.connect(g1);
    o2.connect(g2);
    g1.connect(filter);
    g2.connect(filter);

    if (bar >= 2) {
      const o3 = audioContext.createOscillator();
      const g3 = audioContext.createGain();
      o3.type = "sine";
      o3.frequency.setValueAtTime(f * 3.03, time);
      g3.gain.value = 0.08 + bar * 0.018;
      o3.connect(g3);
      g3.connect(filter);
      o3.start(time);
      o3.stop(time + dur + 0.35);
    }

    filter.connect(env);
    connectVoice(env, 0.96, 0.19, pan);

    o1.start(time);
    o2.start(time);
    o1.stop(time + dur + 0.35);
    o2.stop(time + dur + 0.35);
  }

  function padChord(time, dur, midis, bar) {
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(720 + bar * 220, time);
    filter.frequency.exponentialRampToValueAtTime(2700 + bar * 330, time + dur * 0.72);
    filter.Q.value = 0.8;

    const env = audioContext.createGain();
    const peak = 0.11 + bar * 0.012;
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(peak, time + 0.28);
    env.gain.setValueAtTime(peak, time + dur * 0.68);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.52);

    midis.forEach((m, i) => {
      const f = midiToFreq(m);
      const o1 = audioContext.createOscillator();
      const o2 = audioContext.createOscillator();
      o1.type = "sine";
      o2.type = "triangle";
      o1.frequency.setValueAtTime(f, time + i * 0.02);
      o2.frequency.setValueAtTime(f * (1 + (i - 2) * 0.002), time + i * 0.02);
      const g1 = audioContext.createGain();
      const g2 = audioContext.createGain();
      g1.gain.value = 0.76;
      g2.gain.value = 0.22 + i * 0.015;
      o1.connect(g1);
      o2.connect(g2);
      g1.connect(filter);
      g2.connect(filter);
      o1.start(time + i * 0.02);
      o2.start(time + i * 0.02);
      o1.stop(time + dur + 0.55);
      o2.stop(time + dur + 0.55);
    });

    filter.connect(env);
    connectVoice(env, 0.9, 0.26, (bar - 2) * 0.11);
  }

  function bassNote(time, dur, midi, bar, pan = 0) {
    const f = midiToFreq(midi);
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(220, time);
    filter.frequency.exponentialRampToValueAtTime(150, time + dur * 0.6);
    filter.Q.value = 0.9;

    const env = audioContext.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(0.2 + bar * 0.02, time + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.18);

    const o1 = audioContext.createOscillator();
    const o2 = audioContext.createOscillator();
    o1.type = "triangle";
    o2.type = "sine";
    o1.frequency.setValueAtTime(f * 1.28, time);
    o1.frequency.exponentialRampToValueAtTime(f, time + 0.08);
    o2.frequency.setValueAtTime(f * 0.5, time);

    const g1 = audioContext.createGain();
    const g2 = audioContext.createGain();
    g1.gain.value = 0.9;
    g2.gain.value = 0.28;
    o1.connect(g1);
    o2.connect(g2);
    g1.connect(filter);
    g2.connect(filter);
    filter.connect(env);
    connectVoice(env, 0.95, 0.07, pan);

    o1.start(time);
    o2.start(time);
    o1.stop(time + dur + 0.4);
    o2.stop(time + dur + 0.4);
  }

  function kick(time, peak, pan = 0) {
    const osc = audioContext.createOscillator();
    const env = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(145, time);
    osc.frequency.exponentialRampToValueAtTime(46, time + 0.09);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(peak, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    osc.connect(env);
    connectVoice(env, 1, 0.04, pan);
    osc.start(time);
    osc.stop(time + 0.24);
  }

  function noiseBurst(kind, time, dur, peak, pan, freq, q, dry, wet, rate) {
    const src = audioContext.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = rate;

    const filter = audioContext.createBiquadFilter();
    filter.type = kind === "hat" ? "highpass" : "bandpass";
    filter.frequency.setValueAtTime(freq, time);
    filter.Q.value = q;

    const env = audioContext.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(peak, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    src.connect(filter);
    filter.connect(env);
    connectVoice(env, dry, wet, pan);

    src.start(time);
    src.stop(time + dur + 0.05);
  }

  const score = [
    {
      pad: [62, 65, 69, 72, 76],
      bass: [[38, 0, 0.95], [45, 2.5, 0.82]],
      lead: [
        [74, 0, 0.40],
        [76, 1, 0.40],
        [77, 2, 0.40],
        [81, 3, 0.40],
        [84, 4, 0.72],
      ],
      snare: [3],
      kick: [0, 2.5],
      leadGain: 0.10,
      padGain: 0.11,
      bassGain: 0.18,
      kickGain: 0.24,
      snareGain: 0.08,
      hatGain: 0.034,
    },
    {
      pad: [67, 71, 74, 76, 81],
      bass: [[43, 0, 0.95], [50, 2.5, 0.82]],
      lead: [
        [71, 0, 0.40],
        [74, 1, 0.40],
        [76, 2, 0.40],
        [79, 3, 0.40],
        [81, 4, 0.72],
      ],
      snare: [1.5, 3],
      kick: [0, 2.5],
      leadGain: 0.11,
      padGain: 0.105,
      bassGain: 0.19,
      kickGain: 0.25,
      snareGain: 0.085,
      hatGain: 0.038,
    },
    {
      pad: [60, 64, 67, 71, 74],
      bass: [[36, 0, 0.95], [43, 2.5, 0.82]],
      lead: [
        [72, 0, 0.24],
        [71, 0.5, 0.24],
        [69, 1, 0.24],
        [67, 1.5, 0.24],
        [64, 2, 0.24],
        [67, 2.5, 0.24],
        [69, 3, 0.24],
        [71, 3.5, 0.24],
        [74, 4, 0.32],
        [76, 4.5, 0.32],
      ],
      snare: [2, 4],
      kick: [0, 2.5],
      leadGain: 0.12,
      padGain: 0.12,
      bassGain: 0.21,
      kickGain: 0.27,
      snareGain: 0.095,
      hatGain: 0.042,
    },
    {
      pad: [57, 62, 64, 67, 71],
      bass: [[33, 0, 0.95], [40, 2.5, 0.82]],
      lead: [
        [69, 0, 0.24],
        [71, 0.5, 0.24],
        [74, 1, 0.24],
        [76, 1.5, 0.24],
        [79, 2, 0.24],
        [77, 2.5, 0.24],
        [76, 3, 0.24],
        [74, 3.5, 0.24],
        [71, 4, 0.32],
        [69, 4.5, 0.32],
      ],
      snare: [1.5, 3, 4.5],
      kick: [0, 2.5],
      leadGain: 0.13,
      padGain: 0.125,
      bassGain: 0.22,
      kickGain: 0.29,
      snareGain: 0.1,
      hatGain: 0.047,
    },
    {
      pad: [62, 65, 69, 71, 76],
      bass: [[38, 0, 0.95], [45, 2.5, 0.82], [38, 4.5, 0.70]],
      lead: [
        [74, 0, 0.62],
        [77, 1, 0.62],
        [81, 2, 0.82],
        [83, 3, 0.82],
        [88, 4, 1.10],
      ],
      snare: [2, 4],
      kick: [0, 2.5, 4],
      leadGain: 0.17,
      padGain: 0.14,
      bassGain: 0.24,
      kickGain: 0.33,
      snareGain: 0.11,
      hatGain: 0.055,
    },
  ];

  const events = [];
  for (let bar = 0; bar < score.length; bar++) {
    const s = score[bar];
    const barTime = t0 + bar * barDur;
    events.push({ time: barTime, kind: "halo", bar });

    padChord(barTime, barDur * 1.05, s.pad, bar);

    s.bass.forEach(([midi, beat, bd]) => {
      const t = barTime + beat * beatDur;
      bassNote(t, bd * beatDur, midi, bar, 0);
      events.push({ time: t, kind: "bass", bar, beat, midi });
    });

    s.lead.forEach((n, idx) => {
      const [midi, beat, ld] = n;
      const t = barTime + beat * beatDur;
      const arm = (idx + armOffset) % 5;
      const pan = ((arm - 2) / 2) * 0.68;
      leadVoice(t, ld * beatDur, midi, s.leadGain * (1 - idx * 0.01), bar, arm, pan);
      events.push({ time: t, kind: "lead", bar, beat, midi, arm });
    });

    s.kick.forEach((beat, kIdx) => {
      const t = barTime + beat * beatDur;
      kick(t, s.kickGain * (kIdx === 2 ? 1.12 : 1), 0);
      events.push({ time: t, kind: "kick", bar, beat });
    });

    s.snare.forEach((beat, i) => {
      const t = barTime + beat * beatDur;
      noiseBurst("snare", t, 0.12, s.snareGain, ((bar % 2) ? 0.08 : -0.08), 1850, 0.9, 0.88, 0.08, 0.95);
      events.push({ time: t, kind: "snare", bar, beat });
    });

    for (let hb = 0; hb < 5; hb += 0.5) {
      const t = barTime + hb * beatDur;
      const hatPan = (((Math.round(hb * 2) + bar) % 5) - 2) * 0.1;
      const hatPeak = s.hatGain * (hb % 1 === 0 ? 1 : 0.8);
      noiseBurst("hat", t, 0.055, hatPeak, hatPan, 7600, 0.7, 0.75, 0.045, 1.45);
      events.push({ time: t, kind: "hat", bar, beat: hb });
    }
  }

  events.sort((a, b) => a.time - b.time);

  const orbs = [];
  const rings = [];
  const sparks = [];
  const halos = [];
  const bassGlows = [];
  let spawnIndex = 0;
  const timeData = new Uint8Array(analyser.fftSize);

  function spawn(ev) {
    const barHue = barHues[ev.bar] || barHues[4];
    if (ev.kind === "halo") {
      halos.push({
        t: ev.time,
        bar: ev.bar,
        hue: barHue,
        life: barDur * 1.08,
        r0: outerR * 0.26 + ev.bar * 8,
        spin: 0.12 + ev.bar * 0.03,
      });
    } else if (ev.kind === "lead") {
      const arm = (ev.arm + armOffset) % 5;
      orbs.push({
        t: ev.time,
        bar: ev.bar,
        hue: wrap(barHue + (ev.midi - 60) * 4 + arm * 6),
        arm,
        seed: ev.midi * 0.17 + ev.bar * 0.9,
        spin: (arm % 2 ? -1 : 1) * (0.48 + (ev.midi % 7) * 0.04),
        life: 1.85 + ev.bar * 0.08,
        r0: outerR * 0.16 + ev.bar * 5,
        vr: outerR * 0.18 + ev.bar * 6,
        lastX: null,
        lastY: null,
      });
    } else if (ev.kind === "kick") {
      rings.push({
        t: ev.time,
        bar: ev.bar,
        hue: wrap(barHue + 20),
        life: 0.86,
        r0: 12,
        speed: outerR * 0.92 / 0.86,
        beat: ev.beat,
      });
    } else if (ev.kind === "bass") {
      bassGlows.push({
        t: ev.time,
        bar: ev.bar,
        hue: wrap(barHue - 20),
        life: 0.95,
        r0: 26,
        speed: 100,
      });
    } else if (ev.kind === "snare" || ev.kind === "hat") {
      const count = ev.kind === "snare" ? 14 : 7;
      const baseHue = ev.kind === "snare" ? sparkHue : warmHue;
      for (let i = 0; i < count; i++) {
        const k = i / count;
        const a = -Math.PI / 2 + k * TAU + ev.bar * 0.27 + (ev.beat || 0) * 0.13;
        const startR = ev.kind === "hat" ? outerR * 0.69 : outerR * 0.08;
        const x0 = cx + Math.cos(a) * startR;
        const y0 = cy + Math.sin(a) * startR * 0.88;
        const spd = ev.kind === "hat" ? 140 + i * 14 : 220 + i * 18;
        sparks.push({
          t: ev.time,
          x0,
          y0,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd * 0.92 - (ev.kind === "hat" ? 35 : 15),
          g: ev.kind === "hat" ? 55 : 90,
          life: ev.kind === "hat" ? 0.68 : 0.84,
          hue: wrap(baseHue + i * 6 + ev.bar * 7),
          size: ev.kind === "hat" ? 1.2 : 1.9,
        });
      }
    }
  }

  function drawRibbon(tt, amp, barHue) {
    const t = Math.max(0, tt);
    const phaseA = ribbonSeed + t * 0.54;
    const phaseB = ribbonSeed * 1.7 - t * 0.36 + 0.9;

    const path = (phase, wobble) => {
      gc.beginPath();
      for (let i = 0; i <= 120; i++) {
        const n = i / 120;
        const y = H * 0.06 + n * H * 0.88;
        const w = Math.sin(n * TAU * 4.8 + phase + Math.sin(n * TAU * 1.7 + t * 0.16) * 0.45);
        const w2 = Math.sin(n * TAU * 12.0 - t * 0.31 + phase * 0.85);
        const x =
          cx +
          w * (72 + 20 * Math.sin(t * 0.22 + n * TAU * 2.6)) +
          w2 * 22 * wobble +
          Math.sin(n * TAU * 2.2 - t * 0.13) * 10;
        if (i === 0) gc.moveTo(x, y);
        else gc.lineTo(x, y);
      }
    };

    gc.save();
    gc.globalCompositeOperation = "lighter";
    const grad = gc.createLinearGradient(0, H * 0.04, 0, H * 0.96);
    grad.addColorStop(0, hsla(barHues[0], 78, 64, 0.0));
    grad.addColorStop(0.15, hsla(barHues[0], 82, 62, 0.08 + amp * 0.06));
    grad.addColorStop(0.34, hsla(barHues[1], 88, 61, 0.14 + amp * 0.10));
    grad.addColorStop(0.52, hsla(barHues[2], 90, 65, 0.18 + amp * 0.15));
    grad.addColorStop(0.70, hsla(barHues[3], 94, 66, 0.17 + amp * 0.13));
    grad.addColorStop(0.88, hsla(barHues[4], 90, 70, 0.09 + amp * 0.10));
    grad.addColorStop(1, hsla(barHues[4], 90, 70, 0.0));

    gc.strokeStyle = grad;
    gc.lineWidth = 34 + amp * 26;
    path(phaseA, 1);
    gc.stroke();

    gc.lineWidth = 10 + amp * 8;
    gc.strokeStyle = hsla(wrap(barHue + 28), 92, 72, 0.13 + amp * 0.12);
    path(phaseB, 1);
    gc.stroke();

    gc.restore();
  }

  function drawPetals(tt, amp, barIndex) {
    const t = Math.max(0, tt);
    const beatPos = t / beatDur;
    const localBeat = beatPos % 5;
    const baseRot = t * 0.16;
    const ringR = outerR * 0.36 + amp * 10;
    const polyR = outerR * 0.22 + amp * 8;

    gc.save();
    gc.globalCompositeOperation = "lighter";

    gc.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * TAU / 5 + baseRot * 0.2;
      const x = cx + Math.cos(a) * polyR;
      const y = cy + Math.sin(a) * polyR * 0.86;
      if (i === 0) gc.moveTo(x, y);
      else gc.lineTo(x, y);
    }
    gc.closePath();
    gc.strokeStyle = hsla(barHues[barIndex], 82, 68, 0.08 + amp * 0.06);
    gc.lineWidth = 1.5 + amp * 1.8;
    gc.stroke();

    for (let i = 0; i < 5; i++) {
      let d = Math.abs(localBeat - i);
      d = Math.min(d, 5 - d);
      const pulse = Math.pow(Math.max(0, Math.cos(d * Math.PI / 2)), 2.2);
      const a = -Math.PI / 2 + i * TAU / 5 + baseRot;
      const x = cx + Math.cos(a) * ringR;
      const y = cy + Math.sin(a) * ringR * 0.86;
      gc.save();
      gc.translate(x, y);
      gc.rotate(a);
      gc.scale(1, 0.42 + pulse * 0.14);
      gc.beginPath();
      gc.arc(0, 0, 72 + pulse * 16 + amp * 8, 0, TAU);
      gc.fillStyle = hsla(barHues[i], 80, 58, 0.03 + pulse * 0.11 + amp * 0.02);
      gc.strokeStyle = hsla(barHues[i], 95, 70, 0.06 + pulse * 0.16);
      gc.lineWidth = 1.2 + pulse * 1.8;
      gc.fill();
      gc.stroke();

      gc.beginPath();
      gc.arc(0, 0, 30 + pulse * 7, 0, TAU);
      gc.fillStyle = hsla(barHues[i], 95, 72, 0.06 + pulse * 0.15);
      gc.fill();
      gc.restore();
    }

    gc.restore();
  }

  function drawCore(tt, amp, barIndex) {
    const t = Math.max(0, tt);
    const beatPulse = Math.pow(Math.max(0, Math.cos((t / beatDur) % 1 * Math.PI)), 2);

    const coreR = 46 + amp * 20 + beatPulse * 10;
    const glowR = coreR * 3.6;

    gc.save();
    gc.globalCompositeOperation = "lighter";

    const glow = gc.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    glow.addColorStop(0, hsla(warmHue, 95, 82, 0.95));
    glow.addColorStop(0.14, hsla(accentHue, 90, 62, 0.55));
    glow.addColorStop(0.38, hsla(barHues[barIndex], 75, 34, 0.18));
    glow.addColorStop(1, hsla(barHues[barIndex], 75, 34, 0.0));
    gc.fillStyle = glow;
    gc.beginPath();
    gc.arc(cx, cy, glowR, 0, TAU);
    gc.fill();

    const inner = gc.createRadialGradient(cx, cy, 0, cx, cy, coreR * 1.4);
    inner.addColorStop(0, hsla(warmHue, 95, 88, 0.95));
    inner.addColorStop(0.4, hsla(barHues[barIndex], 90, 65, 0.55));
    inner.addColorStop(1, hsla(barHues[barIndex], 90, 45, 0.0));
    gc.fillStyle = inner;
    gc.beginPath();
    gc.arc(cx, cy, coreR * 1.4, 0, TAU);
    gc.fill();

    gc.strokeStyle = hsla(barHues[barIndex], 92, 72, 0.16 + amp * 0.14);
    gc.lineWidth = 2 + amp * 2;
    gc.beginPath();
    gc.arc(cx, cy, coreR, 0, TAU);
    gc.stroke();

    gc.save();
    gc.translate(cx, cy);
    gc.rotate(t * 0.18);
    gc.strokeStyle = hsla(accentHue, 90, 70, 0.08 + amp * 0.09);
    gc.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * TAU / 5;
      gc.beginPath();
      gc.moveTo(0, 0);
      gc.lineTo(Math.cos(a) * coreR * 2.2, Math.sin(a) * coreR * 2.2 * 0.9);
      gc.stroke();
    }
    gc.restore();

    gc.restore();
  }

  function drawObjects(tt, amp, barIndex) {
    const t = Math.max(0, tt);

    gc.save();
    gc.globalCompositeOperation = "lighter";

    for (let i = halos.length - 1; i >= 0; i--) {
      const o = halos[i];
      const age = t - (o.t - t0);
      if (age < 0) continue;
      if (age > o.life) {
        halos.splice(i, 1);
        continue;
      }
      const p = 1 - age / o.life;
      const r = o.r0 + age * (24 + o.bar * 2);
      const rot = o.spin + age * 0.2;
      gc.save();
      gc.translate(cx, cy);
      gc.rotate(rot);
      gc.scale(1, 0.86);
      gc.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + k * TAU / 5;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (k === 0) gc.moveTo(x, y);
        else gc.lineTo(x, y);
      }
      gc.closePath();
      gc.fillStyle = hsla(o.hue, 80, 58, 0.025 * p);
      gc.strokeStyle = hsla(o.hue, 95, 72, 0.10 * p + 0.03);
      gc.lineWidth = 2 + 4 * p;
      gc.fill();
      gc.stroke();
      gc.restore();
    }

    for (let i = bassGlows.length - 1; i >= 0; i--) {
      const o = bassGlows[i];
      const age = t - (o.t - t0);
      if (age < 0) continue;
      if (age > o.life) {
        bassGlows.splice(i, 1);
        continue;
      }
      const p = 1 - age / o.life;
      const r = o.r0 + age * (o.speed * 0.35);
      gc.save();
      gc.translate(cx, cy + outerR * 0.36);
      gc.scale(1, 0.45);
      gc.beginPath();
      gc.arc(0, 0, r, 0, TAU);
      gc.fillStyle = hsla(o.hue, 85, 58, 0.035 * p);
      gc.strokeStyle = hsla(o.hue, 95, 75, 0.10 * p + 0.02);
      gc.lineWidth = 2 + 4 * p;
      gc.fill();
      gc.stroke();
      gc.restore();
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const o = rings[i];
      const age = t - (o.t - t0);
      if (age < 0) continue;
      if (age > o.life) {
        rings.splice(i, 1);
        continue;
      }
      const p = 1 - age / o.life;
      const r = o.r0 + age * o.speed;
      gc.strokeStyle = hsla(o.hue, 95, 70, 0.26 * p);
      gc.lineWidth = 1.5 + 6 * p;
      gc.beginPath();
      gc.arc(cx, cy, r, 0, TAU);
      gc.stroke();

      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + k * TAU / 5 + age * 0.15;
        gc.beginPath();
        gc.moveTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
        gc.lineTo(cx + Math.cos(a) * r * 1.06, cy + Math.sin(a) * r * 1.06);
        gc.stroke();
      }
    }

    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      const age = t - (o.t - t0);
      if (age < 0) continue;
      if (age > o.life) {
        orbs.splice(i, 1);
        continue;
      }
      const p = 1 - age / o.life;
      const a = -Math.PI / 2 + o.arm * TAU / 5 + o.spin * age * 1.55 + Math.sin(age * 4 + o.seed) * 0.12;
      const r = o.r0 + age * o.vr + Math.sin(age * 5 + o.seed) * 10;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.72 - age * 18;

      if (o.lastX !== null) {
        gc.strokeStyle = hsla(o.hue, 95, 72, 0.10 + 0.26 * p);
        gc.lineWidth = 1.2 + 2.8 * p;
        gc.beginPath();
        gc.moveTo(o.lastX, o.lastY);
        gc.lineTo(x, y);
        gc.stroke();
      }

      gc.save();
      gc.translate(x, y);
      gc.beginPath();
      gc.arc(0, 0, 3 + p * 4, 0, TAU);
      gc.fillStyle = hsla(o.hue, 95, 75, 0.35 + p * 0.25);
      gc.fill();
      gc.restore();

      o.lastX = x;
      o.lastY = y;
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const o = sparks[i];
      const age = t - (o.t - t0);
      if (age < 0) continue;
      if (age > o.life) {
        sparks.splice(i, 1);
        continue;
      }
      const p = 1 - age / o.life;
      const x = o.x0 + o.vx * age;
      const y = o.y0 + o.vy * age + o.g * age * age * 0.5;
      const px = x - o.vx * 0.02;
      const py = y - o.vy * 0.02;

      gc.strokeStyle = hsla(o.hue, 95, 72, 0.12 + 0.5 * p);
      gc.lineWidth = o.size * (0.8 + 1.8 * p);
      gc.beginPath();
      gc.moveTo(px, py);
      gc.lineTo(x, y);
      gc.stroke();

      gc.fillStyle = hsla(o.hue, 95, 76, 0.16 + 0.45 * p);
      gc.beginPath();
      gc.arc(x, y, o.size * (0.7 + p * 1.2), 0, TAU);
      gc.fill();
    }

    gc.restore();
  }

  function frame() {
    const now = audioContext.currentTime;
    const tt = now - t0;

    while (spawnIndex < events.length && events[spawnIndex].time <= now) {
      spawn(events[spawnIndex++]);
    }

    analyser.getByteTimeDomainData(timeData);
    let rms = 0;
    for (let i = 0; i < timeData.length; i++) {
      const x = (timeData[i] - 128) / 128;
      rms += x * x;
    }
    rms = Math.sqrt(rms / timeData.length);
    const amp = clamp(rms * 5.2, 0, 1);

    const barIndex = clamp(Math.floor(Math.max(0, tt) / barDur), 0, 4);
    const barHue = barHues[barIndex];

    gc.setTransform(1, 0, 0, 1, 0, 0);
    gc.globalCompositeOperation = "source-over";

    const back = gc.createLinearGradient(0, 0, 0, H);
    back.addColorStop(0, hsla(barHue, 34, 10 + amp * 2, 0.18));
    back.addColorStop(0.55, hsla(wrap(barHue + 18), 28, 6, 0.14));
    back.addColorStop(1, hsla(wrap(barHue + 170), 34, 4, 0.18));
    gc.fillStyle = back;
    gc.fillRect(0, 0, W, H);

    const fog = gc.createRadialGradient(cx, cy, outerR * 0.1, cx, cy, outerR * 1.45);
    fog.addColorStop(0, hsla(barHue, 60, 18, 0.22 + amp * 0.08));
    fog.addColorStop(0.4, hsla(barHue, 48, 10, 0.12 + amp * 0.04));
    fog.addColorStop(1, "rgba(0,0,0,0)");
    gc.fillStyle = fog;
    gc.fillRect(0, 0, W, H);

    gc.save();
    gc.globalCompositeOperation = "lighter";
    const phase = Math.max(0, tt) / beatDur;
    const currentTick = Math.max(0, phase);
    const tickArc = clamp(currentTick / 25, 0, 1);

    gc.strokeStyle = hsla(barHue, 88, 74, 0.11 + amp * 0.08);
    gc.lineWidth = 2.1;
    gc.beginPath();
    gc.arc(cx, cy, outerR * 0.98, -Math.PI / 2, -Math.PI / 2 + tickArc * TAU);
    gc.stroke();

    for (let i = 0; i < 25; i++) {
      let d = Math.abs(currentTick - i);
      d = Math.min(d, 25 - d);
      const pulse = Math.pow(Math.max(0, 1 - d / 1.2), 2.2);
      const a = -Math.PI / 2 + i * TAU / 25;
      const r1 = outerR * 0.93;
      const r2 = outerR * (0.95 + pulse * 0.08);
      const x1 = cx + Math.cos(a) * r1;
      const y1 = cy + Math.sin(a) * r1 * 0.88;
      const x2 = cx + Math.cos(a) * r2;
      const y2 = cy + Math.sin(a) * r2 * 0.88;
      gc.strokeStyle = hsla(barHues[Math.floor(i / 5)], 88, 72, 0.04 + pulse * 0.36);
      gc.lineWidth = 1.1 + pulse * 4.4 + (i % 5 === 0 ? 1.2 : 0);
      gc.beginPath();
      gc.moveTo(x1, y1);
      gc.lineTo(x2, y2);
      gc.stroke();

      gc.fillStyle = hsla(barHues[Math.floor(i / 5)], 92, 76, 0.05 + pulse * 0.3);
      gc.beginPath();
      gc.arc(x2, y2, 2 + pulse * 4 + (i % 5 === 0 ? 1.5 : 0), 0, TAU);
      gc.fill();
    }
    gc.restore();

    drawRibbon(tt, amp, barHue);
    drawPetals(tt, amp, barIndex);
    drawCore(tt, amp, barIndex);
    drawObjects(tt, amp, barIndex);

    gc.save();
    gc.globalCompositeOperation = "source-over";
    const vign = gc.createRadialGradient(cx, cy, outerR * 0.18, cx, cy, Math.max(W, H) * 0.72);
    vign.addColorStop(0, "rgba(0,0,0,0)");
    vign.addColorStop(0.82, "rgba(0,0,0,0.18)");
    vign.addColorStop(1, "rgba(0,0,0,0.68)");
    gc.fillStyle = vign;
    gc.fillRect(0, 0, W, H);
    gc.restore();

    if (tt < duration + 0.85) raf(frame);
  }

  void audioContext.resume();
  mix.gain.setValueAtTime(0.0001, t0);
  mix.gain.exponentialRampToValueAtTime(0.86, t0 + 0.16);
  const fadeStart = t0 + Math.max(0.25, duration - 0.82);
  mix.gain.setValueAtTime(0.86, fadeStart);
  mix.gain.exponentialRampToValueAtTime(0.0001, t0 + duration - 0.01);

  raf(frame);
}