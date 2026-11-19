export const title = "A Map of Rain That Never Fell";

export function start({ audioContext, canvas, duration, random }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const total = Math.min(15, duration || 15);
  const t0 = audioContext.currentTime + 0.045;
  const end = t0 + total;
  const tempo = 96;
  const beat = 60 / tempo;
  const bar = beat * 4;

  let seed = ((random() * 4294967296) ^ (random() * 0x9e3779b9)) >>> 0;
  const rnd = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };

  const mix = audioContext.createGain();
  const dry = audioContext.createGain();
  const wet = audioContext.createGain();
  const master = audioContext.createGain();
  const compressor = audioContext.createDynamicsCompressor();
  const reverb = audioContext.createConvolver();

  const impulseLength = Math.floor(audioContext.sampleRate * 2.6);
  const impulse = audioContext.createBuffer(2, impulseLength, audioContext.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      const x = i / data.length;
      data[i] =
        (rnd() * 2 - 1) *
        Math.pow(1 - x, 2.8) *
        (0.72 + 0.28 * Math.sin(i * (channel ? 0.0173 : 0.0191)));
    }
  }
  reverb.buffer = impulse;

  mix.connect(dry);
  mix.connect(reverb);
  dry.connect(master);
  reverb.connect(wet);
  wet.connect(master);
  master.connect(compressor);
  compressor.connect(audioContext.destination);

  dry.gain.value = 0.82;
  wet.gain.value = 0.27;
  compressor.threshold.value = -17;
  compressor.knee.value = 14;
  compressor.ratio.value = 3.2;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.28;

  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.88, t0 + 0.18);
  master.gain.setValueAtTime(0.88, Math.max(t0 + 0.2, end - 0.72));
  master.gain.exponentialRampToValueAtTime(0.0001, end);

  const noiseLength = Math.floor(audioContext.sampleRate * 0.8);
  const noiseBuffer = audioContext.createBuffer(1, noiseLength, audioContext.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  let lastNoise = 0;
  for (let i = 0; i < noiseLength; i++) {
    const white = rnd() * 2 - 1;
    lastNoise = lastNoise * 0.18 + white * 0.82;
    noiseData[i] = lastNoise;
  }

  const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
  const panNode = value => {
    if (audioContext.createStereoPanner) {
      const p = audioContext.createStereoPanner();
      p.pan.value = value;
      return p;
    }
    return audioContext.createGain();
  };

  const visualEvents = [];
  const bassEvents = [];
  const percussionEvents = [];

  function padNote(time, length, midi, pan, brightness = 1) {
    if (time >= end) return;

    const voice = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const stereo = panNode(pan);
    const f = hz(midi);

    filter.type = "lowpass";
    filter.Q.value = 0.75;
    filter.frequency.setValueAtTime(Math.min(5800, f * 8 * brightness), time);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(700, f * 3.2),
      Math.min(end, time + length)
    );

    voice.gain.setValueAtTime(0.0001, time);
    voice.gain.exponentialRampToValueAtTime(0.034, time + 0.34);
    voice.gain.setValueAtTime(0.034, Math.min(end, time + length * 0.7));
    voice.gain.exponentialRampToValueAtTime(0.0001, Math.min(end, time + length));

    voice.connect(filter);
    filter.connect(stereo);
    stereo.connect(mix);

    [
      [1, "sine", 0.78, -3],
      [2.003, "sine", 0.15, 4],
      [3.997, "triangle", 0.07, 8]
    ].forEach(([ratio, type, level, detune]) => {
      const osc = audioContext.createOscillator();
      const partial = audioContext.createGain();
      osc.type = type;
      osc.frequency.value = f * ratio;
      osc.detune.value = detune + (rnd() - 0.5) * 3;
      partial.gain.value = level;
      osc.connect(partial);
      partial.connect(voice);
      osc.start(time);
      osc.stop(Math.min(end, time + length + 0.05));
    });
  }

  function glass(time, midi, accent, pan, index) {
    if (time >= end) return;

    const f = hz(midi);
    const carrier = audioContext.createOscillator();
    const modulator = audioContext.createOscillator();
    const modDepth = audioContext.createGain();
    const overtone = audioContext.createOscillator();
    const overtoneGain = audioContext.createGain();
    const envelope = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const stereo = panNode(pan);
    const life = Math.min(1.5, end - time);

    carrier.type = "sine";
    carrier.frequency.value = f;
    modulator.type = "sine";
    modulator.frequency.value = f * (index % 3 === 0 ? 2.011 : 1.997);
    overtone.type = "sine";
    overtone.frequency.value = f * 3.006;

    modDepth.gain.setValueAtTime(f * 1.25 * accent, time);
    modDepth.gain.exponentialRampToValueAtTime(0.001, time + Math.min(0.68, life));
    modulator.connect(modDepth);
    modDepth.connect(carrier.frequency);

    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.11 * accent, time + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + life);

    overtoneGain.gain.setValueAtTime(0.0001, time);
    overtoneGain.gain.exponentialRampToValueAtTime(0.021 * accent, time + 0.006);
    overtoneGain.gain.exponentialRampToValueAtTime(
      0.0001,
      time + Math.min(0.38, life)
    );

    filter.type = "highpass";
    filter.frequency.value = 170;
    carrier.connect(envelope);
    overtone.connect(overtoneGain);
    overtoneGain.connect(envelope);
    envelope.connect(filter);
    filter.connect(stereo);
    stereo.connect(mix);

    carrier.start(time);
    modulator.start(time);
    overtone.start(time);
    carrier.stop(time + life);
    modulator.stop(time + life);
    overtone.stop(time + life);

    visualEvents.push({
      t: time - t0,
      midi,
      accent,
      pan,
      angle: -Math.PI / 2 + pan * 0.88 + (rnd() - 0.5) * 0.16,
      bend: rnd() * 2 - 1,
      shards: Array.from({ length: 5 }, () => ({
        a: (rnd() - 0.5) * 0.7,
        speed: 0.7 + rnd() * 1.3,
        size: 2 + rnd() * 7
      }))
    });
  }

  function bass(time, midi, accent = 1) {
    if (time >= end) return;

    const f = hz(midi);
    const envelope = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const life = Math.min(0.72, end - time);

    osc1.type = "triangle";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(f * 1.018, time);
    osc1.frequency.exponentialRampToValueAtTime(f, time + 0.09);
    osc2.frequency.value = f * 0.5;

    filter.type = "lowpass";
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(720, time);
    filter.frequency.exponentialRampToValueAtTime(150, time + life);

    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.16 * accent, time + 0.014);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + life);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(envelope);
    envelope.connect(mix);
    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + life);
    osc2.stop(time + life);

    bassEvents.push({ t: time - t0, accent });
  }

  function kick(time, accent = 1) {
    if (time >= end) return;

    const osc = audioContext.createOscillator();
    const click = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    const clickEnvelope = audioContext.createGain();
    const life = Math.min(0.42, end - time);

    osc.type = "sine";
    osc.frequency.setValueAtTime(132, time);
    osc.frequency.exponentialRampToValueAtTime(43, time + 0.13);
    click.type = "triangle";
    click.frequency.setValueAtTime(520, time);
    click.frequency.exponentialRampToValueAtTime(90, time + 0.035);

    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.22 * accent, time + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + life);
    clickEnvelope.gain.setValueAtTime(0.055 * accent, time);
    clickEnvelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);

    osc.connect(envelope);
    click.connect(clickEnvelope);
    envelope.connect(mix);
    clickEnvelope.connect(mix);
    osc.start(time);
    click.start(time);
    osc.stop(time + life);
    click.stop(time + 0.05);
  }

  function dust(time, accent, pan, low = false) {
    if (time >= end) return;

    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const envelope = audioContext.createGain();
    const stereo = panNode(pan);
    const life = low ? 0.15 : 0.07;

    source.buffer = noiseBuffer;
    source.playbackRate.value = 0.82 + rnd() * 0.36;
    filter.type = low ? "bandpass" : "highpass";
    filter.frequency.value = low ? 1500 : 6200 + rnd() * 2400;
    filter.Q.value = low ? 3.5 : 0.7;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(
      (low ? 0.032 : 0.014) * accent,
      time + 0.003
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + life);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(stereo);
    stereo.connect(mix);
    source.start(time, rnd() * 0.45);
    source.stop(time + life);

    if (accent > 0.85) {
      percussionEvents.push({
        t: time - t0,
        pan,
        low,
        seed: rnd()
      });
    }
  }

  function swell(time) {
    if (time >= end) return;

    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const envelope = audioContext.createGain();
    const length = Math.min(0.54, end - time);

    source.buffer = noiseBuffer;
    filter.type = "bandpass";
    filter.Q.value = 0.55;
    filter.frequency.setValueAtTime(700, time);
    filter.frequency.exponentialRampToValueAtTime(5200, time + length);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.032, time + length * 0.84);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + length);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(mix);
    source.start(time, rnd() * 0.18);
    source.stop(time + length);
  }

  const chords = [
    [50, 57, 60, 64, 65, 69],
    [46, 53, 57, 62, 64, 69],
    [48, 55, 57, 60, 64, 69],
    [45, 52, 55, 61, 64, 70],
    [43, 50, 53, 57, 60, 65],
    [38, 45, 50, 52, 57, 64]
  ];

  const melodies = [
    [74, 81, 76, 84, 79],
    [77, 86, 81, 88, 84],
    [76, 79, 84, 83, 88],
    [73, 82, 79, 85, 76],
    [74, 77, 81, 84, 86],
    [81, 88, 86, 93, 90]
  ];

  const roots = [38, 34, 36, 33, 31, 38];

  chords.forEach((chord, b) => {
    const time = t0 + b * bar;
    chord.forEach((note, i) => {
      padNote(
        time,
        Math.min(bar * 1.18, end - time),
        note,
        (i / (chord.length - 1)) * 1.5 - 0.75,
        0.82 + b * 0.045
      );
    });

    if (b > 0) swell(time - 0.48);

    melodies[b].forEach((note, i) => {
      const displacement = b % 2 ? [0, 0.03, -0.018, 0.024, -0.012][i] : 0;
      glass(
        time + i * (bar / 5) + displacement,
        note,
        i === 0 || (b === 5 && i > 2) ? 1.22 : 0.83 + i * 0.055,
        (i / 4) * 1.5 - 0.75 + (b % 2 ? 0.08 : -0.08),
        b * 5 + i
      );
    });

    const bassPattern = b === 5 ? [0, 1, 2, 3] : [0, 1.5, 2.5, 3.25];
    bassPattern.forEach((position, i) => {
      const note = roots[b] + (i === 2 && b !== 3 ? 12 : 0);
      bass(time + position * beat, note, i === 0 ? 1.15 : 0.78);
    });

    [0, 2].forEach((position, i) => kick(time + position * beat, i ? 0.72 : 1));
    if (b === 5) kick(time + 3 * beat, 0.62);

    for (let i = 0; i < 8; i++) {
      const accent = i % 4 === 2 ? 1 : i % 2 ? 0.62 : 0.42;
      if (!((b + i) % 7 === 3)) {
        dust(time + i * beat * 0.5, accent, i % 2 ? 0.62 : -0.62);
      }
    }

    if (b === 2 || b === 4) {
      dust(time + beat * 1.75, 1.1, -0.28, true);
      dust(time + beat * 3.5, 0.9, 0.34, true);
    }
  });

  glass(t0 + 14.22, 98, 1.05, 0.18, 31);
  glass(t0 + 14.46, 86, 0.82, -0.18, 32);

  const palettes = [
    ["#75E6FF", "#775CFF", "#FF82C8"],
    ["#FFB86B", "#FF5EA8", "#8B7CFF"],
    ["#71F6C5", "#55A7FF", "#D0FF78"],
    ["#FF665F", "#E858FF", "#FFC857"],
    ["#8DFFB7", "#5DD5FF", "#B88CFF"],
    ["#F7E6A7", "#8DFFF2", "#FFFFFF"]
  ];

  const stars = Array.from({ length: 150 }, () => ({
    x: rnd() * W,
    y: rnd() * H,
    size: 0.35 + rnd() * 2,
    phase: rnd() * Math.PI * 2,
    speed: 0.4 + rnd() * 1.5,
    drift: rnd() * 2 - 1
  }));

  const mapLines = Array.from({ length: 9 }, (_, i) => ({
    radius: 105 + i * 43,
    phase: rnd() * Math.PI * 2,
    lobes: 3 + Math.floor(rnd() * 6),
    distortion: 8 + rnd() * 24,
    speed: (rnd() * 2 - 1) * 0.055
  }));

  const rgba = (hex, alpha) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
  };

  function pathRing(line, t, color, energy) {
    ctx.beginPath();
    const points = 110;
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2;
      const ripple =
        Math.sin(a * line.lobes + line.phase + t * 0.7) * line.distortion +
        Math.sin(a * 2 - t * 0.36) * 6 +
        energy * Math.sin(a * 7 - t * 8) * 13;
      const r = line.radius + ripple;
      const x = Math.cos(a + t * line.speed) * r;
      const y = Math.sin(a + t * line.speed) * r * 1.07;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.7 + energy * 1.8;
    ctx.stroke();
  }

  let raf = 0;

  function draw() {
    const rawTime = audioContext.currentTime - t0;
    const t = Math.max(0, rawTime);
    const barIndex = Math.min(5, Math.floor(t / bar));
    const localBar = (t % bar) / bar;
    const palette = palettes[barIndex];

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#03040B";
    ctx.fillRect(0, 0, W, H);

    const background = ctx.createRadialGradient(
      W * 0.5,
      H * 0.49,
      40,
      W * 0.5,
      H * 0.5,
      H * 0.72
    );
    background.addColorStop(0, rgba(palette[1], 0.13));
    background.addColorStop(0.46, "rgba(10,12,28,0.78)");
    background.addColorStop(1, "#03040B");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "screen";
    stars.forEach(star => {
      const shimmer = 0.25 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(t * star.speed + star.phase), 3);
      const y = (star.y + t * star.drift * 2 + H) % H;
      ctx.fillStyle = rgba(
        star.phase % 2 > 1 ? palette[0] : "#FFFFFF",
        shimmer
      );
      ctx.beginPath();
      ctx.arc(star.x, y, star.size * (0.8 + shimmer * 0.4), 0, Math.PI * 2);
      ctx.fill();
    });

    let pulse = 0;
    bassEvents.forEach(event => {
      const age = t - event.t;
      if (age >= 0 && age < 0.9) {
        pulse = Math.max(pulse, event.accent * Math.exp(-age * 5.2));
      }
    });

    ctx.save();
    ctx.translate(W / 2, H * 0.495);
    ctx.rotate(Math.sin(t * 0.11) * 0.055);

    ctx.shadowBlur = 22 + pulse * 32;
    ctx.shadowColor = palette[1];
    mapLines.forEach((line, i) => {
      pathRing(
        line,
        t,
        rgba(palette[i % 3], 0.13 + (i % 3) * 0.045 + pulse * 0.11),
        pulse
      );
    });
    ctx.shadowBlur = 0;

    for (let spoke = 0; spoke < 12; spoke++) {
      const a = spoke * Math.PI / 6 + t * 0.018;
      const inner = 82 + Math.sin(t * 0.9 + spoke) * 8;
      const outer = 455 + Math.sin(t * 0.21 + spoke * 1.7) * 25;
      ctx.strokeStyle = rgba(palette[spoke % 3], 0.045);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer * 1.07);
      ctx.stroke();
    }

    const aperture = 67 + pulse * 24 + Math.sin(t * 1.4) * 3;
    const core = ctx.createRadialGradient(0, 0, 2, 0, 0, aperture * 1.7);
    core.addColorStop(0, rgba("#FFFFFF", 0.88));
    core.addColorStop(0.12, rgba(palette[0], 0.7));
    core.addColorStop(0.48, rgba(palette[1], 0.2));
    core.addColorStop(1, rgba(palette[2], 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, aperture * 1.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 - Math.PI / 2 + t * 0.08;
      const r = aperture * (i % 2 ? 0.64 : 0.9);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (!i) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = rgba("#02030A", 0.82);
    ctx.fill();
    ctx.strokeStyle = rgba(palette[0], 0.75);
    ctx.lineWidth = 1.4;
    ctx.stroke();

    const active = visualEvents
      .filter(event => t >= event.t && t - event.t < 3.1)
      .sort((a, b) => a.t - b.t);

    if (active.length > 1) {
      ctx.beginPath();
      active.forEach((event, i) => {
        const age = t - event.t;
        const a = event.angle + age * (0.15 + event.bend * 0.04);
        const r = 105 + age * 118;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r * 1.07;
        if (!i) ctx.moveTo(x, y);
        else ctx.quadraticCurveTo(x * 0.82, y * 0.82, x, y);
      });
      ctx.strokeStyle = rgba(palette[2], 0.22);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    active.forEach((event, eventIndex) => {
      const age = t - event.t;
      const life = 1 - age / 3.1;
      const a = event.angle + age * (0.15 + event.bend * 0.04);
      const r = 105 + age * 118;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * 1.07;
      const color = palette[(event.midi + eventIndex) % 3];

      ctx.shadowBlur = 16 * life;
      ctx.shadowColor = color;
      ctx.strokeStyle = rgba(color, life * 0.82);
      ctx.lineWidth = 1 + event.accent * life * 2.2;
      ctx.beginPath();
      ctx.arc(
        0,
        0,
        r,
        a - 0.11 - age * 0.04,
        a + 0.11 + age * 0.04
      );
      ctx.stroke();

      ctx.fillStyle = rgba("#FFFFFF", life * 0.85);
      ctx.beginPath();
      ctx.arc(x, y, 2.5 + event.accent * life * 4, 0, Math.PI * 2);
      ctx.fill();

      event.shards.forEach((shard, i) => {
        const sa = a + shard.a;
        const travel = age * 42 * shard.speed;
        const sx = x + Math.cos(sa) * travel;
        const sy = y + Math.sin(sa) * travel;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(sa + t + i);
        ctx.fillStyle = rgba(color, life * 0.46);
        ctx.fillRect(
          -shard.size * 0.5,
          -0.6,
          shard.size * (0.5 + life),
          1.2
        );
        ctx.restore();
      });
    });

    ctx.shadowBlur = 0;
    ctx.restore();

    percussionEvents.forEach(event => {
      const age = t - event.t;
      if (age < 0 || age > 0.28) return;
      const fade = 1 - age / 0.28;
      const x = W * (0.5 + event.pan * 0.42);
      const y = H * (0.49 + (event.seed - 0.5) * 0.55);
      ctx.strokeStyle = rgba(event.low ? palette[2] : "#FFFFFF", fade * 0.42);
      ctx.lineWidth = event.low ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 14 * fade);
      ctx.lineTo(x + event.pan * 35, y + 28 + age * 90);
      ctx.stroke();
    });

    ctx.globalCompositeOperation = "source-over";
    const horizonY = H * 0.91;
    const progress = Math.min(1, t / total);
    ctx.strokeStyle = rgba(palette[0], 0.14);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.15, horizonY);
    ctx.lineTo(W * 0.85, horizonY);
    ctx.stroke();

    for (let i = 0; i < 6; i++) {
      const x = W * 0.15 + (W * 0.7 * i) / 5;
      const reached = progress >= i / 6;
      ctx.fillStyle = rgba(reached ? palette[i % 3] : "#FFFFFF", reached ? 0.7 : 0.15);
      ctx.beginPath();
      ctx.arc(x, horizonY, reached ? 3.5 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    const markerX = W * 0.15 + W * 0.7 * progress;
    ctx.fillStyle = rgba("#FFFFFF", 0.86);
    ctx.beginPath();
    ctx.arc(markerX, horizonY, 3.2, 0, Math.PI * 2);
    ctx.fill();

    const vignette = ctx.createRadialGradient(
      W / 2,
      H / 2,
      H * 0.31,
      W / 2,
      H / 2,
      H * 0.78
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.64)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    if (rawTime < total + 0.1) raf = requestAnimationFrame(draw);
  }

  draw();

  return () => {
    cancelAnimationFrame(raf);
    master.gain.cancelScheduledValues(audioContext.currentTime);
    master.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.02);
  };
}