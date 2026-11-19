export const title = "Five Currents for a Descending Sky";

export function start({ audioContext: ctx, canvas, duration = 15, random = Math.random }) {
  const TAU = Math.PI * 2;
  const W = canvas.width;
  const H = canvas.height;
  const g = canvas.getContext("2d");

  const seedA = Math.floor(random() * 4294967295) || 1;
  const seedB = Math.floor(random() * 4294967295) || 987654321;
  const arand = mulberry32(seedA);
  const vrand = mulberry32(seedB);

  const t0 = ctx.currentTime + 0.035;
  const endAt = t0 + duration - 0.035;

  const barHues = [188, 207, 232, 270, 318];
  const roots = [38, 37, 35, 33, 38];
  const rootNames = ["D", "C♯", "B", "A", "D"];

  const chords = [
    [62, 66, 69, 73, 76],
    [61, 64, 68, 71, 76],
    [59, 62, 66, 69, 76],
    [57, 61, 64, 71, 74],
    [62, 66, 69, 73, 76]
  ];

  const byKind = {
    pad: [],
    bass: [],
    melody: [],
    arp: [],
    sparkle: [],
    kick: [],
    snap: [],
    hat: [],
    swell: []
  };
  const visualEvents = [];
  const melodyEvents = [];

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mtof(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function clamp(x, lo = 0, hi = 1) {
    return Math.max(lo, Math.min(hi, x));
  }

  function smooth(x) {
    x = clamp(x);
    return x * x * (3 - 2 * x);
  }

  function hsl(h, s, l, a) {
    return `hsla(${h}, ${s}%, ${l}%, ${a})`;
  }

  function midiHue(m) {
    const pc = ((m % 12) + 12) % 12;
    return (184 + pc * 13 + Math.floor(m / 12) * 7) % 360;
  }

  function addV(kind, time, data = {}) {
    const ev = {
      kind,
      time,
      life: 1,
      vel: 1,
      pan: 0,
      seed: vrand(),
      ...data
    };
    visualEvents.push(ev);
    if (byKind[kind]) byKind[kind].push(ev);
    if (kind === "melody") melodyEvents.push(ev);
    return ev;
  }

  ctx.resume().catch(() => {});

  const bus = ctx.createGain();
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();

  comp.threshold.value = -18;
  comp.knee.value = 18;
  comp.ratio.value = 4.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;

  bus.connect(master);
  master.connect(comp);
  comp.connect(ctx.destination);

  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.9, t0 + 0.025);
  master.gain.setValueAtTime(0.9, t0 + duration - 0.3);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + duration - 0.04);

  function makeImpulse(seconds, decay) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = arand() * 2 - 1;
        last = last * 0.28 + white * 0.72;
        data[i] = last * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(2.35, 2.8);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.42;
  reverb.connect(reverbGain);
  reverbGain.connect(master);

  const echoIn = ctx.createGain();
  const echoDelay = ctx.createDelay(1);
  const echoFilter = ctx.createBiquadFilter();
  const echoOut = ctx.createGain();
  const echoFeedback = ctx.createGain();

  echoDelay.delayTime.value = 0.45;
  echoFilter.type = "bandpass";
  echoFilter.frequency.value = 1550;
  echoFilter.Q.value = 0.65;
  echoOut.gain.value = 0.2;
  echoFeedback.gain.value = 0.24;

  echoIn.connect(echoDelay);
  echoDelay.connect(echoFilter);
  echoFilter.connect(echoOut);
  echoOut.connect(bus);
  echoFilter.connect(echoFeedback);
  echoFeedback.connect(echoDelay);

  function route(node, { pan = 0, wet = 0, echo = 0 } = {}) {
    let out = node;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      node.connect(p);
      out = p;
    }

    out.connect(bus);

    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      out.connect(send);
      send.connect(reverb);
    }

    if (echo > 0) {
      const send = ctx.createGain();
      send.gain.value = echo;
      out.connect(send);
      send.connect(echoIn);
    }
  }

  const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.2), ctx.sampleRate);
  {
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = arand() * 2 - 1;
  }

  function noiseHit(at, freq, dur, vel, type = "bandpass", pan = 0, q = 0.8) {
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    src.buffer = noiseBuffer;
    src.playbackRate.setValueAtTime(0.85 + arand() * 0.35, at);

    filter.type = type;
    filter.frequency.setValueAtTime(freq, at);
    if (type === "bandpass") filter.Q.value = q;

    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, vel), at + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    src.connect(filter);
    filter.connect(env);
    route(env, { pan, wet: 0.14, echo: 0.03 });
    src.start(at, arand() * 0.55, dur + 0.04);
    src.stop(at + dur + 0.08);
  }

  function pad(at, notes, dur, bar) {
    addV("pad", at, {
      notes: notes.slice(),
      dur,
      life: dur,
      vel: 0.75,
      hue: barHues[bar]
    });

    notes.forEach((m, i) => {
      const f = mtof(m);
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      const mix = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const env = ctx.createGain();

      oscA.type = i % 2 ? "triangle" : "sawtooth";
      oscB.type = i % 2 ? "sawtooth" : "triangle";
      oscA.frequency.setValueAtTime(f, at);
      oscB.frequency.setValueAtTime(f, at);
      oscA.detune.setValueAtTime(-5 + i * 1.5, at);
      oscB.detune.setValueAtTime(6 - i * 1.2, at);

      mix.gain.value = 0.58;
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(320 + bar * 70, at);
      filter.frequency.linearRampToValueAtTime(1050 + bar * 210, at + dur * 0.43);
      filter.frequency.linearRampToValueAtTime(430, at + dur);
      filter.Q.value = 0.55;

      const peak = 0.09 / notes.length;
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(peak, at + 0.72);
      env.gain.setValueAtTime(peak, at + Math.max(0.73, dur - 0.78));
      env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

      oscA.connect(mix);
      oscB.connect(mix);
      mix.connect(filter);
      filter.connect(env);
      route(env, {
        pan: (i - (notes.length - 1) / 2) * 0.21,
        wet: 0.38,
        echo: 0.025
      });

      oscA.start(at);
      oscB.start(at);
      oscA.stop(at + dur + 0.12);
      oscB.stop(at + dur + 0.12);
    });
  }

  function bass(at, midi, dur, vel = 0.45) {
    const f = mtof(midi);
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const mix = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    oscA.type = "sine";
    oscB.type = "triangle";
    oscA.frequency.setValueAtTime(f, at);
    oscB.frequency.setValueAtTime(f * 2, at);
    oscB.detune.setValueAtTime(3, at);

    mix.gain.value = 0.75;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(460, at);
    filter.frequency.exponentialRampToValueAtTime(180, at + dur);
    filter.Q.value = 0.7;

    const peak = vel * 0.46;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(peak, at + 0.022);
    env.gain.exponentialRampToValueAtTime(Math.max(0.001, peak * 0.55), at + dur * 0.62);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    oscA.connect(mix);
    oscB.connect(mix);
    mix.connect(filter);
    filter.connect(env);
    route(env, { wet: 0.12 });

    oscA.start(at);
    oscB.start(at);
    oscA.stop(at + dur + 0.08);
    oscB.stop(at + dur + 0.08);

    addV("bass", at, {
      midi,
      vel,
      life: 1.45
    });
  }

  function bell(at, midi, vel = 0.34, pan = 0, kind = "melody") {
    const f = mtof(midi);
    const high = ctx.createBiquadFilter();
    const low = ctx.createBiquadFilter();
    const out = ctx.createGain();

    high.type = "highpass";
    high.frequency.value = 150;
    low.type = "lowpass";
    low.frequency.value = 8500;
    out.gain.value = 1;

    high.connect(low);
    low.connect(out);
    route(out, { pan, wet: 0.46, echo: 0.14 });

    const partials = [
      [1, 0.42, 1],
      [2.003, 0.16, 0.62],
      [2.991, 0.075, 0.45],
      [4.173, 0.032, 0.32]
    ];
    const baseLife = clamp(1.48 - (midi - 74) * 0.006, 0.78, 1.5);

    partials.forEach(([ratio, gain, lifeScale], idx) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const life = baseLife * lifeScale;

      osc.type = "sine";
      osc.frequency.setValueAtTime(f * ratio, at);
      osc.detune.setValueAtTime((arand() - 0.5) * 5, at);

      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, vel * gain), at + 0.005 + idx * 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, at + life);

      osc.connect(env);
      env.connect(high);
      osc.start(at);
      osc.stop(at + life + 0.06);
    });

    noiseHit(at, clamp(f * 2.1, 500, 9000), 0.035, vel * 0.045, "bandpass", pan, 1.8);

    addV(kind, at, {
      midi,
      vel,
      pan,
      life: kind === "melody" ? 1.5 : 1.1
    });
  }

  function pluck(at, midi, vel = 0.1, pan = 0) {
    const f = mtof(midi);
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const mix = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    const dur = 0.24;

    oscA.type = "triangle";
    oscB.type = "sine";
    oscA.frequency.setValueAtTime(f, at);
    oscB.frequency.setValueAtTime(f * 2.01, at);
    oscA.detune.setValueAtTime((arand() - 0.5) * 5, at);

    mix.gain.value = 0.78;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3100, at);
    filter.frequency.exponentialRampToValueAtTime(520, at + dur);
    filter.Q.value = 0.8;

    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(vel, at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    oscA.connect(mix);
    oscB.connect(mix);
    mix.connect(filter);
    filter.connect(env);
    route(env, { pan, wet: 0.2, echo: 0.15 });

    oscA.start(at);
    oscB.start(at);
    oscA.stop(at + dur + 0.05);
    oscB.stop(at + dur + 0.05);

    addV("arp", at, {
      midi,
      vel,
      pan,
      life: 0.68
    });
  }

  function kick(at, vel = 0.7) {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(145, at);
    osc.frequency.exponentialRampToValueAtTime(42, at + 0.105);

    filter.type = "lowpass";
    filter.frequency.value = 210;
    filter.Q.value = 0.6;

    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(vel * 0.72, at + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);

    osc.connect(filter);
    filter.connect(env);
    route(env, { wet: 0.04 });

    osc.start(at);
    osc.stop(at + 0.27);
    noiseHit(at, 5200, 0.025, vel * 0.035, "highpass", 0);

    addV("kick", at, {
      vel,
      life: 0.95
    });
  }

  function snap(at, vel = 0.22, pan = 0) {
    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();

    body.type = "triangle";
    body.frequency.setValueAtTime(205, at);
    body.frequency.exponentialRampToValueAtTime(118, at + 0.12);

    bodyGain.gain.setValueAtTime(0.0001, at);
    bodyGain.gain.exponentialRampToValueAtTime(vel * 0.35, at + 0.005);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);

    body.connect(bodyGain);
    route(bodyGain, { pan, wet: 0.18 });
    body.start(at);
    body.stop(at + 0.2);

    noiseHit(at, 1750, 0.15, vel, "bandpass", pan, 0.75);

    addV("snap", at, {
      vel,
      pan,
      life: 0.72
    });
  }

  function hat(at, vel = 0.06, open = false, pan = 0) {
    const dur = open ? 0.22 : 0.055;
    noiseHit(at, open ? 6100 : 7200, dur, vel, "highpass", pan, 1);
    addV("hat", at, {
      vel,
      pan,
      life: open ? 0.5 : 0.28
    });
  }

  function swell(at, dur = 0.7, bar = 0) {
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    const pan = (arand() - 0.5) * 0.5;

    src.buffer = noiseBuffer;
    src.playbackRate.setValueAtTime(0.65 + arand() * 0.3, at);

    filter.type = "bandpass";
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(280 + bar * 80, at);
    filter.frequency.exponentialRampToValueAtTime(3600 + bar * 250, at + dur * 0.58);
    filter.frequency.exponentialRampToValueAtTime(700, at + dur);

    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(0.05 + bar * 0.008, at + dur * 0.48);
    env.gain.linearRampToValueAtTime(0.0001, at + dur);

    src.connect(filter);
    filter.connect(env);
    route(env, { pan, wet: 0.48, echo: 0.06 });
    src.start(at, arand() * 0.4, dur + 0.08);
    src.stop(at + dur + 0.1);

    addV("swell", at, {
      vel: 0.5,
      life: 1.25,
      hue: barHues[bar]
    });
  }

  function scheduleMusic() {
    for (let b = 0; b < 5; b++) {
      pad(b * 3, chords[b], b === 4 ? 2.98 : 3.18, b);
    }

    for (let b = 0; b < 4; b++) {
      const start = b * 3;
      bass(start, roots[b], 1.62, 0.5);
      bass(start + 1.8, roots[b] + 7, 0.68, 0.31);
      if (b > 0) bass(start + 2.58, roots[b] + 12, 0.32, 0.17);
    }
    bass(12, 38, 1.55, 0.5);
    bass(13.8, 45, 0.46, 0.25);
    bass(14.4, 38, 0.52, 0.48);

    const kickPatterns = [
      [0, 3],
      [0, 3],
      [0, 2, 3],
      [0, 3, 4],
      [0, 2, 3, 4]
    ];

    kickPatterns.forEach((pattern, b) => {
      pattern.forEach(slot => {
        const accent = slot === 0 ? 0.82 : 0.58;
        kick(b * 3 + slot * 0.6, accent * (0.82 + b * 0.045));
      });
    });

    const snapPatterns = [
      [2],
      [2, 4],
      [2],
      [2, 4],
      [2, 4]
    ];

    snapPatterns.forEach((pattern, b) => {
      pattern.forEach((slot, i) => {
        snap(b * 3 + slot * 0.6, 0.14 + b * 0.018 + i * 0.012, (i ? -1 : 1) * 0.18);
      });
    });

    for (let b = 0; b < 5; b++) {
      for (let s = 0; s < 10; s++) {
        if (b === 0 && s % 2 === 1) continue;
        if (b === 1 && s % 4 === 1) continue;
        if (b === 4 && s > 8) continue;

        const open = b >= 2 && s === 7;
        const vel = 0.028 + b * 0.006 + (s % 2 === 0 ? 0.013 : 0);
        hat(b * 3 + s * 0.3, vel, open, ((s % 5) - 2) * 0.17);
      }
    }

    const arpPatterns = [
      [0, 8, 12, 16],
      [0, 4, 8, 12, 16],
      [0, 3, 6, 10, 13, 16],
      [0, 2, 5, 8, 11, 14, 17],
      [0, 2, 4, 6, 8, 10, 12, 14, 16]
    ];

    arpPatterns.forEach((pattern, b) => {
      pattern.forEach((slot, i) => {
        const chord = chords[b];
        const note = chord[(i * 2 + b) % chord.length] + 12;
        const accent = i === 0 || slot === 16 ? 0.035 : 0;
        pluck(
          b * 3 + slot * 0.15,
          note,
          0.068 + b * 0.009 + accent,
          (((note * 7 + i) % 5) - 2) * 0.17
        );
      });
    });

    const melodyPatterns = [
      [0, 4, 8, 12, 16],
      [0, 3, 6, 12, 16],
      [0, 4, 7, 10, 16],
      [0, 4, 8, 11, 16],
      [0, 3, 6, 10, 16]
    ];

    const melodyNotes = [
      [74, 78, 81, 83, 81],
      [76, 80, 83, 85, 83],
      [78, 83, 86, 88, 86],
      [81, 85, 88, 90, 88],
      [81, 86, 90, 93, 86]
    ];

    melodyPatterns.forEach((pattern, b) => {
      pattern.forEach((slot, i) => {
        const isFinal = b === 4 && i === pattern.length - 1;
        const vel = 0.29 + b * 0.018 + (i === 0 ? 0.035 : 0) + (isFinal ? 0.12 : 0);
        bell(
          b * 3 + slot * 0.15,
          melodyNotes[b][i],
          vel,
          (((melodyNotes[b][i] + b) % 5) - 2) * 0.14,
          "melody"
        );
      });
    });

    [2.5, 5.5, 8.5, 11.5].forEach((at, i) => swell(at, 0.72, i + 1));

    [2.72, 5.72, 8.72, 11.72].forEach((at, b) => {
      const chord = chords[b + 1];
      for (let i = 0; i < 5; i++) {
        bell(at + i * 0.043, chord[i % chord.length] + 12, 0.045 + i * 0.006, (i - 2) * 0.18, "sparkle");
      }
    });

    [62, 66, 69, 74, 78].forEach((note, i) => {
      bell(14.4 + i * 0.035, note, 0.095 - i * 0.006, (i - 2) * 0.2, "sparkle");
    });

    const air = ctx.createBufferSource();
    const airFilter = ctx.createBiquadFilter();
    const airGain = ctx.createGain();

    air.buffer = noiseBuffer;
    air.loop = true;
    air.playbackRate.value = 0.42;

    airFilter.type = "bandpass";
    airFilter.Q.value = 0.55;
    airFilter.frequency.setValueAtTime(240, t0);
    airFilter.frequency.linearRampToValueAtTime(920, t0 + 4);
    airFilter.frequency.linearRampToValueAtTime(2350, t0 + 10.5);
    airFilter.frequency.linearRampToValueAtTime(520, endAt);

    airGain.gain.setValueAtTime(0.0001, t0);
    airGain.gain.linearRampToValueAtTime(0.018, t0 + 2.2);
    airGain.gain.linearRampToValueAtTime(0.035, t0 + 12.6);
    airGain.gain.linearRampToValueAtTime(0.0001, endAt);

    air.connect(airFilter);
    airFilter.connect(airGain);
    route(airGain, { wet: 0.55 });
    air.start(t0);
    air.stop(endAt);
  }

  scheduleMusic();

  Object.values(byKind).forEach(list => list.sort((a, b) => a.time - b.time));
  melodyEvents.sort((a, b) => a.time - b.time);
  visualEvents.sort((a, b) => a.time - b.time);

  const cx = W / 2;
  const cy = H * 0.515;
  const ringR = Math.min(W * 0.455, H * 0.365);
  const tonalR = ringR - 26;

  const dust = Array.from({ length: 170 }, (_, i) => {
    const a = i * 2.39996323 + vrand() * 0.08;
    const r = 22 + Math.sqrt((i + 1) / 170) * ringR * 0.94;
    return {
      a,
      r,
      phase: vrand() * TAU,
      speed: 0.35 + vrand() * 0.85,
      size: 0.7 + vrand() * 1.8,
      hue: 180 + vrand() * 140
    };
  });

  function tonalPoint(midi, rot = 0, extraR = 0, angleOffset = 0) {
    const pc = ((midi % 12) + 12) % 12;
    const angle = -Math.PI / 2 + rot + pc * TAU / 12 + angleOffset;
    const radius = 54 + (midi - 30) * (tonalR - 54) / 63 + extraR;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      angle,
      radius
    };
  }

  function collectEnergy(t) {
    const raw = {
      pad: 0,
      bass: 0,
      melody: 0,
      arp: 0,
      sparkle: 0,
      kick: 0,
      snap: 0,
      hat: 0,
      swell: 0
    };

    for (const ev of visualEvents) {
      const age = t - ev.time;
      if (age < 0 || age > ev.life) continue;

      let a;
      if (ev.kind === "pad") {
        a = Math.min(smooth(age / 0.72), smooth((ev.dur - age) / 0.82));
      } else {
        const rate =
          ev.kind === "melody" ? 2.25 :
          ev.kind === "arp" ? 4.2 :
          ev.kind === "hat" ? 7.5 :
          ev.kind === "swell" ? 1.8 : 3.0;
        a = Math.exp(-age * rate);
      }
      raw[ev.kind] += ev.vel * a;
    }

    return {
      pad: clamp(raw.pad * 1.1, 0, 1.2),
      bass: clamp(raw.bass * 1.8, 0, 1),
      melody: clamp(raw.melody * 2.35, 0, 1),
      arp: clamp(raw.arp * 4.2, 0, 1),
      sparkle: clamp(raw.sparkle * 5, 0, 1),
      kick: clamp(raw.kick * 1.45, 0, 1),
      snap: clamp(raw.snap * 3.2, 0, 1),
      hat: clamp(raw.hat * 5, 0, 1),
      swell: clamp(raw.swell * 1.7, 0, 1)
    };
  }

  function drawBackground(t, e, bar) {
    const hue = barHues[bar];
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, hsl(hue + 28, 55, 5, 1));
    bg.addColorStop(0.43, hsl(226, 64, 7, 1));
    bg.addColorStop(1, hsl(hue - 30, 58, 4, 1));
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, ringR * (1.15 + e.kick * 0.12));
    glow.addColorStop(0, hsl(hue, 88, 58, 0.15 + e.pad * 0.05));
    glow.addColorStop(0.45, hsl(hue + 20, 78, 34, 0.07));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
  }

  function drawCurrents(t, e, bar) {
    g.save();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";

    for (let k = 0; k < 5; k++) {
      const active = k === bar;
      const baseX = W * (0.16 + k * 0.17);
      const hue = barHues[k];
      const alpha = active ? 0.12 + e.pad * 0.08 : 0.045;

      g.beginPath();
      for (let y = -20; y <= H + 20; y += 24) {
        const n = y / H;
        const x =
          baseX +
          Math.sin(y * 0.006 + t * (0.55 + k * 0.07) + k * 2.1) * (24 + 42 * e.bass + (active ? 24 : 0)) +
          Math.sin(y * 0.017 - t * 0.8 + k) * 8;
        if (y === -20) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokeStyle = hsl(hue, 92, 62, alpha);
      g.lineWidth = active ? 2.6 : 1.25;
      g.stroke();
    }
    g.restore();
  }

  function drawDust(t, e) {
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const p of dust) {
      const a = p.a + t * 0.018 * p.speed;
      const r = p.r + Math.sin(t * p.speed + p.phase) * 7;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.985;
      const twinkle = 0.45 + 0.55 * Math.sin(t * (1.2 + p.speed) + p.phase);
      g.fillStyle = hsl(p.hue, 88, 70, (0.025 + e.sparkle * 0.035) * twinkle);
      g.beginPath();
      g.arc(x, y, p.size, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  function drawBarRing(t, bar) {
    g.save();
    g.lineCap = "round";

    for (let b = 0; b < 5; b++) {
      const a0 = -Math.PI / 2 + b * TAU / 5 + 0.025;
      const a1 = -Math.PI / 2 + (b + 1) * TAU / 5 - 0.025;
      g.beginPath();
      g.arc(cx, cy, ringR, a0, a1);
      g.strokeStyle = hsl(barHues[b], 82, 58, 0.14);
      g.lineWidth = 12;
      g.stroke();
    }

    const progress = clamp((t - bar * 3) / 3);
    const a0 = -Math.PI / 2 + bar * TAU / 5 + 0.025;
    const a1 = -Math.PI / 2 + (bar + 1) * TAU / 5 - 0.025;

    g.globalCompositeOperation = "lighter";
    g.shadowColor = hsl(barHues[bar], 100, 68, 0.8);
    g.shadowBlur = 20;
    g.beginPath();
    g.arc(cx, cy, ringR, a0, a1);
    g.strokeStyle = hsl(barHues[bar], 96, 62, 0.27);
    g.lineWidth = 19;
    g.stroke();

    g.beginPath();
    g.arc(cx, cy, ringR, a0, a0 + (a1 - a0) * progress);
    g.strokeStyle = hsl(barHues[bar], 100, 72, 0.78);
    g.lineWidth = 7;
    g.stroke();
    g.restore();
  }

  function drawTonalGrid(t) {
    const rot = t * 0.028;
    g.save();

    g.setLineDash([1, 9]);
    for (let pc = 0; pc < 12; pc++) {
      const a = -Math.PI / 2 + rot + pc * TAU / 12;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 58, cy + Math.sin(a) * 58);
      g.lineTo(cx + Math.cos(a) * tonalR, cy + Math.sin(a) * tonalR);
      g.strokeStyle = hsl(190 + pc * 13, 85, 68, pc % 3 === 0 ? 0.14 : 0.065);
      g.lineWidth = pc % 3 === 0 ? 1.4 : 0.8;
      g.stroke();
    }
    g.setLineDash([]);

    [31, 43, 55, 67, 79, 91].forEach((m, i) => {
      const r = tonalPoint(m, rot).radius;
      g.beginPath();
      g.arc(cx, cy, r, 0, TAU);
      g.strokeStyle = `rgba(190, 225, 255, ${i === 5 ? 0.15 : 0.065})`;
      g.lineWidth = i === 5 ? 1.4 : 0.8;
      g.stroke();
    });

    g.restore();
  }

  function drawPads(t, rot) {
    g.save();
    g.globalCompositeOperation = "lighter";

    for (const ev of byKind.pad) {
      const age = t - ev.time;
      if (age < 0 || age > ev.dur) continue;

      const env = Math.min(smooth(age / 0.7), smooth((ev.dur - age) / 0.82));
      const pts = ev.notes
        .map(m => ({ ...tonalPoint(m, rot), midi: m }))
        .sort((a, b) => a.angle - b.angle);

      if (pts.length < 3) continue;

      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.fillStyle = hsl(ev.hue, 92, 58, 0.036 * env);
      g.strokeStyle = hsl(ev.hue, 96, 70, 0.22 * env);
      g.lineWidth = 1.8;
      g.fill();
      g.stroke();

      for (const p of pts) {
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(p.x, p.y);
        g.strokeStyle = hsl(midiHue(p.midi), 95, 66, 0.045 * env);
        g.lineWidth = 1;
        g.stroke();

        g.fillStyle = hsl(midiHue(p.midi), 100, 73, 0.32 * env);
        g.beginPath();
        g.arc(p.x, p.y, 4.5 + env * 2, 0, TAU);
        g.fill();
      }
    }

    g.restore();
  }

  function drawBloom(t, e, bar) {
    const hue = barHues[bar];
    g.save();
    g.globalCompositeOperation = "lighter";

    for (let layer = 0; layer < 2; layer++) {
      g.beginPath();
      for (let i = 0; i <= 240; i++) {
        const th = i / 240 * TAU;
        const r =
          (layer ? 138 : 91) +
          Math.sin(th * 5 - t * (1.25 + layer * 0.24)) * (16 + layer * 8) +
          e.pad * 22 +
          e.bass * 16 +
          Math.sin(th * 10 + t * 2.1) * e.arp * 9;
        const x = cx + Math.cos(th) * r;
        const y = cy + Math.sin(th) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = hsl(hue + layer * 18, 92, 58, layer ? 0.025 : 0.045);
      g.strokeStyle = hsl(hue + layer * 22, 96, 70, layer ? 0.14 : 0.22);
      g.lineWidth = layer ? 1 : 1.6;
      g.fill();
      g.stroke();
    }

    const orbR = 38 + Math.sin(t * 2.2) * 3 + e.kick * 28 + e.bass * 12;
    const orb = g.createRadialGradient(cx, cy, 0, cx, cy, orbR * 1.9);
    orb.addColorStop(0, `rgba(255,255,245,${0.5 + e.kick * 0.22})`);
    orb.addColorStop(0.22, hsl(hue, 100, 66, 0.25));
    orb.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = orb;
    g.beginPath();
    g.arc(cx, cy, orbR * 1.9, 0, TAU);
    g.fill();

    g.restore();
  }

  function drawMelodyTrail(t, rot) {
    const recent = melodyEvents.filter(ev => ev.time <= t + 0.02 && t - ev.time < 3.7);
    if (recent.length < 2) return;

    g.save();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    g.lineJoin = "round";

    for (let i = 1; i < recent.length; i++) {
      const a = tonalPoint(recent[i - 1].midi, rot);
      const b = tonalPoint(recent[i].midi, rot);
      const age = t - recent[i].time;
      const alpha = 0.3 * Math.exp(-age * 0.42);
      const hue = midiHue(recent[i].midi);

      g.shadowColor = hsl(hue, 100, 70, alpha);
      g.shadowBlur = 12;
      g.beginPath();
      g.moveTo(a.x, a.y);
      const mx = (a.x + b.x) / 2 + (cy - (a.y + b.y) / 2) * 0.08;
      const my = (a.y + b.y) / 2 - (cx - (a.x + b.x) / 2) * 0.08;
      g.quadraticCurveTo(mx, my, b.x, b.y);
      g.strokeStyle = hsl(hue, 96, 70, alpha);
      g.lineWidth = 2.4 + Math.exp(-age) * 3.2;
      g.stroke();
    }

    g.restore();
  }

  function drawBass(t, rot) {
    g.save();
    g.globalCompositeOperation = "lighter";

    for (const ev of byKind.bass) {
      const age = t - ev.time;
      if (age < 0 || age > ev.life) continue;
      const e = Math.exp(-age * 2.7);
      const hue = midiHue(ev.midi);

      for (let k = 0; k < 2; k++) {
        const r = 34 + age * (275 + k * 75);
        g.beginPath();
        g.arc(cx, cy, r, 0, TAU);
        g.strokeStyle = hsl(hue, 92, 62, (0.25 - k * 0.08) * e);
        g.lineWidth = (8 - k * 3) * e + 0.5;
        g.stroke();
      }

      const p = tonalPoint(ev.midi, rot);
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(p.x, p.y);
      g.strokeStyle = hsl(hue, 92, 66, 0.11 * e);
      g.lineWidth = 3;
      g.stroke();
    }

    g.restore();
  }

  function drawKicks(t) {
    g.save();
    g.globalCompositeOperation = "lighter";

    for (const ev of byKind.kick) {
      const age = t - ev.time;
      if (age < 0 || age > ev.life) continue;
      const e = Math.exp(-age * 3.3);
      const r = 18 + age * ringR * 1.05;

      g.beginPath();
      g.arc(cx, cy, r, 0, TAU);
      g.strokeStyle = `rgba(255, 224, 150, ${0.42 * e})`;
      g.lineWidth = 12 * e + 0.4;
      g.stroke();

      g.beginPath();
      g.arc(cx, cy, 12 + e * 24, 0, TAU);
      g.fillStyle = `rgba(255, 250, 225, ${0.38 * e})`;
      g.fill();
    }

    g.restore();
  }

  function drawArps(t, rot) {
    g.save();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";

    for (const kind of ["arp", "sparkle"]) {
      for (const ev of byKind[kind]) {
        const age = t - ev.time;
        if (age < 0 || age > ev.life) continue;

        const e = Math.exp(-age * (kind === "arp" ? 4.1 : 2.4));
        const p0 = tonalPoint(ev.midi, rot, age * 22, age * 0.05);
        const p1 = tonalPoint(ev.midi, rot, age * 22 + (kind === "arp" ? 18 : 34), age * 0.05 + 0.05);
        const hue = midiHue(ev.midi);

        g.beginPath();
        g.moveTo(p0.x, p0.y);
        g.lineTo(p1.x, p1.y);
        g.strokeStyle = hsl(hue, 100, 72, (kind === "arp" ? 0.38 : 0.48) * e);
        g.lineWidth = kind === "arp" ? 2.2 : 2.8;
        g.stroke();

        g.fillStyle = hsl(hue, 100, 76, 0.72 * e);
        g.beginPath();
        g.arc(p1.x, p1.y, (kind === "arp" ? 3.5 : 5) + 5 * e, 0, TAU);
        g.fill();
      }
    }

    g.restore();
  }

  function drawMelody(t, rot) {
    g.save();
    g.globalCompositeOperation = "lighter";

    for (const ev of byKind.melody) {
      const age = t - ev.time;
      if (age < 0 || age > ev.life) continue;

      const e = Math.exp(-age * 2.25);
      const hue = midiHue(ev.midi);
      const base = tonalPoint(ev.midi, rot);
      const p = tonalPoint(ev.midi, rot, age * 52, age * 0.1);

      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(base.x, base.y);
      g.strokeStyle = hsl(hue, 95, 70, 0.07 * e);
      g.lineWidth = 2;
      g.stroke();

      g.beginPath();
      g.moveTo(base.x, base.y);
      g.lineTo(p.x, p.y);
      g.strokeStyle = hsl(hue, 100, 74, 0.38 * e);
      g.lineWidth = 2.6 + 2 * e;
      g.stroke();

      const r = 16 + (1 - e) * 38;
      const glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.9);
      glow.addColorStop(0, `rgba(255,255,255,${0.82 * e})`);
      glow.addColorStop(0.22, hsl(hue, 100, 69, 0.48 * e));
      glow.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = glow;
      g.beginPath();
      g.arc(p.x, p.y, r * 1.9, 0, TAU);
      g.fill();

      g.fillStyle = `rgba(255,255,255,${0.86 * e})`;
      g.beginPath();
      g.arc(p.x, p.y, 3.2 + 2.8 * e, 0, TAU);
      g.fill();
    }

    g.restore();
  }

  function drawPercussion(t) {
    g.save();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";

    for (const ev of byKind.hat) {
      const age = t - ev.time;
      if (age < 0 || age > ev.life) continue;
      const e = Math.exp(-age * 7);
      const a = ev.seed * TAU + t * 0.16;
      const r = ringR - 10 + Math.sin(ev.seed * 20) * 16;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      const tx = Math.cos(a + Math.PI / 2);
      const ty = Math.sin(a + Math.PI / 2);

      g.beginPath();
      g.moveTo(x - tx * 11 * e, y - ty * 11 * e);
      g.lineTo(x + tx * 11 * e, y + ty * 11 * e);
      g.strokeStyle = `rgba(210,245,255,${0.48 * e})`;
      g.lineWidth = 2;
      g.stroke();
    }

    for (const ev of byKind.snap) {
      const age = t - ev.time;
      if (age < 0 || age > ev.life) continue;
      const e = Math.exp(-age * 3.7);
      const a = ev.seed * TAU - t * 0.08;
      const r = 175 + ev.seed * 230 + age * 90;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      const s = 8 + 25 * e;

      g.beginPath();
      g.moveTo(x - s, y);
      g.lineTo(x + s, y);
      g.moveTo(x, y - s);
      g.lineTo(x, y + s);
      g.strokeStyle = `rgba(255,190,135,${0.44 * e})`;
      g.lineWidth = 2.4;
      g.stroke();
    }

    for (const ev of byKind.swell) {
      const age = t - ev.time;
      if (age < 0 || age > ev.life) continue;
      const a = Math.sin(Math.PI * clamp(age / ev.life));
      const r = 150 + age * 300;

      g.beginPath();
      g.arc(cx, cy, r, -Math.PI * 0.82 + age, Math.PI * 0.82 + age);
      g.strokeStyle = hsl(ev.hue || 220, 95, 68, 0.18 * a);
      g.lineWidth = 16 * a;
      g.stroke();
    }

    g.restore();
  }

  function drawWaves(t, e) {
    const voices = [
      [H * 0.89, barHues[0], e.bass, 0.0],
      [H * 0.91, 285, e.melody, 1.8],
      [H * 0.93, 42, e.arp + e.hat * 0.35, 3.4]
    ];

    g.save();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";

    voices.forEach(([y0, hue, amp, phase], idx) => {
      g.beginPath();
      for (let x = 0; x <= W; x += 9) {
        const y =
          y0 +
          Math.sin(x * 0.014 + t * (3.6 + idx) + phase) * (4 + amp * 25) +
          Math.sin(x * 0.033 - t * (5.4 + idx * 0.7)) * (2 + amp * 10);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokeStyle = hsl(hue, 94, 67, 0.12 + amp * 0.34);
      g.lineWidth = 1.4 + amp * 2.2;
      g.stroke();
    });

    g.restore();
  }

  function drawSpacedText(text, x, y, spacing) {
    const chars = [...text];
    const widths = chars.map(ch => g.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let px = x - total / 2;
    const oldAlign = g.textAlign;
    g.textAlign = "left";
    chars.forEach((ch, i) => {
      g.fillText(ch, px, y);
      px += widths[i] + spacing;
    });
    g.textAlign = oldAlign;
  }

  function drawText(t, bar) {
    g.save();
    g.textAlign = "center";
    g.textBaseline = "middle";

    g.font = `600 ${Math.round(W * 0.029)}px Georgia, "Times New Roman", serif`;
    g.fillStyle = "rgba(238,246,255,0.82)";
    drawSpacedText("FIVE CURRENTS", cx, H * 0.058, W * 0.012);

    g.font = `400 ${Math.round(W * 0.012)}px Georgia, serif`;
    g.fillStyle = "rgba(200,220,242,0.5)";
    g.fillText("a descent in five-four", cx, H * 0.086);

    const py = H * 0.024;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(W * 0.12, py);
    g.lineTo(W * 0.88, py);
    g.strokeStyle = "rgba(210,230,255,0.12)";
    g.lineWidth = 2;
    g.stroke();

    g.beginPath();
    g.moveTo(W * 0.12, py);
    g.lineTo(W * (0.12 + 0.76 * clamp(t / duration)), py);
    g.strokeStyle = hsl(barHues[bar], 100, 70, 0.7);
    g.lineWidth = 3;
    g.stroke();

    const y = H * 0.963;
    const xs = [0.14, 0.32, 0.5, 0.68, 0.86].map(v => v * W);

    g.beginPath();
    g.moveTo(xs[0] + 28, y);
    g.lineTo(xs[4] - 28, y);
    g.strokeStyle = "rgba(210,225,255,0.12)";
    g.lineWidth = 1;
    g.stroke();

    g.font = `600 ${Math.round(W * 0.021)}px Georgia, serif`;
    for (let i = 0; i < 5; i++) {
      const active = i === bar;
      if (active) {
        g.shadowColor = hsl(barHues[i], 100, 70, 0.8);
        g.shadowBlur = 16;
      } else {
        g.shadowBlur = 0;
      }
      g.fillStyle = active
        ? hsl(barHues[i], 100, 75, 0.95)
        : "rgba(210,224,245,0.34)";
      g.fillText(rootNames[i], xs[i], y);
    }

    g.restore();
  }

  function drawVignette() {
    const v = g.createRadialGradient(cx, cy, ringR * 0.28, cx, cy, H * 0.72);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(0.72, "rgba(0,0,0,0.1)");
    v.addColorStop(1, "rgba(0,0,0,0.58)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  }

  function draw(t) {
    t = clamp(t, 0, duration);
    const bar = Math.min(4, Math.floor(t / 3));
    const e = collectEnergy(t);
    const rot = t * 0.028;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.shadowBlur = 0;

    drawBackground(t, e, bar);
    drawCurrents(t, e, bar);
    drawDust(t, e);
    drawBarRing(t, bar);
    drawTonalGrid(t);
    drawPads(t, rot);
    drawBloom(t, e, bar);
    drawMelodyTrail(t, rot);
    drawBass(t, rot);
    drawKicks(t);
    drawArps(t, rot);
    drawMelody(t, rot);
    drawPercussion(t);
    drawWaves(t, e);
    drawVignette();
    drawText(t, bar);
  }

  let stopped = false;
  let raf = 0;

  function frame() {
    if (stopped) return;
    const raw = ctx.currentTime - t0;
    draw(Math.max(0, raw));
    if (raw < duration) raf = requestAnimationFrame(frame);
  }

  draw(0);
  raf = requestAnimationFrame(frame);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      try {
        master.disconnect();
      } catch (_) {}
    }
  };
}