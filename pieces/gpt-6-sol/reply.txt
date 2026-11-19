export const title = "Tide Engine";

export function start({ audioContext, canvas, duration, random }) {
  const ctx = canvas.getContext("2d");
  const beat = duration / 32;
  const origin = audioContext.currentTime + 0.02;
  const at = (b) => origin + b * beat;
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);

  const bus = audioContext.createGain();
  const compressor = audioContext.createDynamicsCompressor();
  const master = audioContext.createGain();
  compressor.threshold.value = -17;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.19;
  master.gain.value = 0.78;
  bus.connect(compressor);

  const impulse = audioContext.createBuffer(
    2,
    Math.floor(audioContext.sampleRate * 1.8),
    audioContext.sampleRate
  );
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      const fade = (1 - i / data.length) ** 3;
      data[i] = (random() * 2 - 1) * fade;
    }
  }
  const reverb = audioContext.createConvolver();
  const wet = audioContext.createGain();
  wet.gain.value = 0.16;
  reverb.buffer = impulse;
  bus.connect(reverb);
  reverb.connect(wet);
  wet.connect(compressor);
  compressor.connect(master);
  master.connect(audioContext.destination);

  function output(pan = 0) {
    const panner = audioContext.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(bus);
    return panner;
  }

  function pluck(b, note, length, velocity = 1, pan = 0) {
    const t = at(b);
    const seconds = length * beat;
    const envelope = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const fundamental = audioContext.createOscillator();
    const overtone = audioContext.createOscillator();
    const overtoneGain = audioContext.createGain();

    fundamental.type = "triangle";
    overtone.type = "sine";
    fundamental.frequency.setValueAtTime(hz(note) * 1.009, t);
    fundamental.frequency.exponentialRampToValueAtTime(hz(note), t + 0.035);
    overtone.frequency.value = hz(note) * 2;
    overtoneGain.gain.value = 0.23;
    filter.type = "lowpass";
    filter.frequency.value = Math.min(6200, 1600 + note * 32);
    filter.Q.value = 0.6;

    fundamental.connect(filter);
    overtone.connect(overtoneGain);
    overtoneGain.connect(filter);
    filter.connect(envelope);
    envelope.connect(output(pan));

    const peak = 0.15 * velocity;
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(peak, t + 0.009);
    envelope.gain.exponentialRampToValueAtTime(peak * 0.32, t + 0.16);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, peak * 0.13),
      t + seconds
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.22);

    fundamental.start(t);
    overtone.start(t);
    fundamental.stop(t + seconds + 0.25);
    overtone.stop(t + seconds + 0.25);
  }

  function bell(b, note, velocity = 1, pan = 0) {
    const t = at(b);
    const envelope = audioContext.createGain();
    envelope.connect(output(pan));
    const partials = [
      [1, 0.07, 1.3],
      [2.01, 0.025, 0.75],
      [3.91, 0.012, 0.42]
    ];
    for (const [ratio, level, decay] of partials) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = hz(note) * ratio;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level * velocity, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      oscillator.connect(gain);
      gain.connect(envelope);
      oscillator.start(t);
      oscillator.stop(t + decay + 0.02);
    }
  }

  function pad(b, notes, length, velocity = 1) {
    const t = at(b);
    const end = at(b + length);
    const filter = audioContext.createBiquadFilter();
    const envelope = audioContext.createGain();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(740, t);
    filter.frequency.linearRampToValueAtTime(1350, t + 0.7);
    filter.Q.value = 0.45;
    filter.connect(envelope);
    envelope.connect(output(-0.12));

    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.linearRampToValueAtTime(0.062 * velocity, t + 0.2);
    envelope.gain.setValueAtTime(0.062 * velocity, Math.max(t + 0.21, end - 0.28));
    envelope.gain.linearRampToValueAtTime(0.0001, end + 0.2);

    for (let i = 0; i < notes.length; i++) {
      const oscillator = audioContext.createOscillator();
      oscillator.type = "sawtooth";
      oscillator.frequency.value = hz(notes[i]);
      oscillator.detune.value = i % 2 ? 4 : -4;
      const level = audioContext.createGain();
      level.gain.value = 0.18;
      oscillator.connect(level);
      level.connect(filter);
      oscillator.start(t);
      oscillator.stop(end + 0.23);
    }
  }

  function bass(b, note, length, velocity = 1) {
    const t = at(b);
    const end = t + length * beat;
    const envelope = audioContext.createGain();
    const oscillator = audioContext.createOscillator();
    const harmonic = audioContext.createOscillator();
    const harmonicGain = audioContext.createGain();
    oscillator.type = "sine";
    harmonic.type = "triangle";
    oscillator.frequency.setValueAtTime(hz(note) * 1.05, t);
    oscillator.frequency.exponentialRampToValueAtTime(hz(note), t + 0.07);
    harmonic.frequency.value = hz(note + 12);
    harmonicGain.gain.value = 0.22;
    oscillator.connect(envelope);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(envelope);
    envelope.connect(output(0));

    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(0.29 * velocity, t + 0.016);
    envelope.gain.exponentialRampToValueAtTime(0.12 * velocity, t + 0.19);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end + 0.16);
    oscillator.start(t);
    harmonic.start(t);
    oscillator.stop(end + 0.18);
    harmonic.stop(end + 0.18);
  }

  const noise = audioContext.createBuffer(
    1,
    Math.floor(audioContext.sampleRate * 0.35),
    audioContext.sampleRate
  );
  const noiseData = noise.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = random() * 2 - 1;

  function noiseHit(b, kind, velocity = 1, pan = 0) {
    const t = at(b);
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const envelope = audioContext.createGain();
    source.buffer = noise;
    filter.type = kind === "snare" ? "bandpass" : "highpass";
    filter.frequency.value = kind === "snare" ? 1700 : 7600;
    filter.Q.value = kind === "snare" ? 0.8 : 0.5;
    const length = kind === "snare" ? 0.19 : 0.065;
    const level = (kind === "snare" ? 0.16 : 0.055) * velocity;
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(level, t + 0.003);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + length);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output(pan));
    source.start(t);
    source.stop(t + length + 0.01);
  }

  function kick(b, velocity = 1) {
    const t = at(b);
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(155, t);
    oscillator.frequency.exponentialRampToValueAtTime(46, t + 0.15);
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(0.34 * velocity, t + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + 0.29);
    oscillator.connect(envelope);
    envelope.connect(bus);
    oscillator.start(t);
    oscillator.stop(t + 0.3);
  }

  const chords = [
    [0, [50, 57, 60, 64, 65], 38],
    [4, [46, 53, 57, 62, 64], 34],
    [8, [43, 50, 53, 57, 58], 31],
    [12, [45, 52, 55, 58, 61], 33],
    [16, [50, 57, 60, 64, 65], 38],
    [20, [45, 52, 57, 59, 64], 33],
    [24, [46, 53, 57, 60, 62], 34],
    [28, [45, 52, 55, 58, 61], 33],
    [30, [50, 57, 61, 64, 66], 38]
  ];

  for (const [b, notes] of chords) {
    pad(b, notes, b === 28 || b === 30 ? 2 : 4, b === 30 ? 1.45 : 1);
  }

  const melody = [
    [0, 74, 0.65], [0.75, 77, 0.55], [1.5, 76, 0.42],
    [2, 81, 0.58], [2.75, 84, 0.65], [3.5, 81, 0.42],
    [4, 77, 0.4], [4.5, 76, 0.8], [5.5, 74, 0.4],
    [6, 72, 0.4], [6.5, 69, 0.55], [7.25, 74, 0.65],
    [8, 70, 0.4], [8.5, 74, 0.4], [9, 77, 0.55],
    [9.75, 81, 0.55], [10.5, 79, 0.55], [11.25, 77, 0.65],
    [12, 76, 0.4], [12.5, 73, 0.4], [13, 79, 0.4],
    [13.5, 82, 0.8], [14.5, 81, 0.55], [15.25, 76, 0.55],
    [16, 74, 0.65], [16.75, 81, 0.4], [17.25, 84, 0.55],
    [18, 88, 0.6], [18.75, 89, 0.55], [19.5, 88, 0.4],
    [20, 84, 0.4], [20.5, 83, 0.55], [21.25, 81, 0.55],
    [22, 79, 0.4], [22.5, 76, 0.75], [23.5, 72, 0.42],
    [24, 74, 0.55], [24.75, 77, 0.55], [25.5, 81, 0.4],
    [26, 84, 0.4], [26.5, 82, 0.55], [27.25, 79, 0.65],
    [28, 85, 0.4], [28.5, 81, 0.4], [29, 88, 0.4],
    [29.5, 86, 0.4], [30, 90, 0.4], [30.5, 88, 0.4],
    [31, 86, 0.9]
  ];

  melody.forEach(([b, note, length], i) => {
    const rise = b >= 16 && b < 20 ? 1.13 : 1;
    pluck(b, note, length, rise * (i % 4 === 0 ? 1.12 : 0.93), i % 2 ? 0.19 : -0.19);
    if ([4, 15, 21, 28, 34, 42, 48].includes(i)) {
      bell(b, note + 12, 0.68, i % 2 ? -0.42 : 0.42);
    }
  });

  for (let bar = 0; bar < 8; bar++) {
    const [start, notes, root] = chords[bar];
    bass(start, root, 1.25, bar < 2 ? 0.72 : 1);
    bass(start + 1.5, root + 7, 0.72, 0.63);
    bass(start + 2.5, root, 0.75, 0.84);
    if (bar < 7) bass(start + 3.5, root + 2, 0.38, 0.4);

    if (bar > 0 && bar < 7) {
      const pattern = [1, 3, 2, 4, 1, 3, 0, 2];
      for (let step = 0; step < 8; step++) {
        if ((bar === 3 || bar === 5) && step === 6) continue;
        pluck(
          start + step * 0.5,
          notes[pattern[step]] + 12,
          0.22,
          step % 3 === 0 ? 0.26 : 0.18,
          step % 2 ? 0.58 : -0.58
        );
      }
    }

    kick(start, bar < 2 ? 0.65 : 1);
    if (bar > 0) kick(start + 1.5, 0.56);
    if (bar > 1 && bar < 7) kick(start + 3, 0.72);
    if (bar < 7) {
      noiseHit(start + 1, "snare", bar < 2 ? 0.35 : 0.74, -0.12);
      noiseHit(start + 3, "snare", bar < 2 ? 0.42 : 0.9, 0.12);
    }
    for (let step = 0; step < 8; step++) {
      if (bar === 0 && step % 2) continue;
      if (bar === 7 && step >= 4) continue;
      noiseHit(
        start + step * 0.5,
        "hat",
        (step % 2 ? 0.55 : 0.85) * (bar < 2 ? 0.48 : 1),
        step % 2 ? 0.48 : -0.48
      );
    }
  }
  bass(30, 38, 1.8, 1.25);
  bell(30, 86, 0.5, -0.5);
  bell(31, 98, 0.45, 0.5);

  const flecks = Array.from({ length: 160 }, () => ({
    x: random() * 1080,
    y: random() * 1350,
    r: 0.4 + random() * 1.3,
    a: 0.08 + random() * 0.2
  }));
  const colors = [
    "#79d9d1", "#e9b46c", "#c6a7e9", "#e87f79",
    "#73e4d7", "#b2d8a2", "#e5aa84", "#eadb9b"
  ];

  let frame;
  let stopped = false;

  function render() {
    if (stopped) return;
    const elapsed = Math.max(0, audioContext.currentTime - origin);
    const position = Math.min(32, elapsed / beat);
    const bar = Math.min(7, Math.floor(position / 4));
    const color = colors[bar];
    const pulse = melody.reduce((sum, [b]) => {
      const delta = position - b;
      return sum + (delta >= 0 && delta < 2 ? Math.exp(-delta * 4) : 0);
    }, 0);
    const breath = Math.sin(elapsed * 1.8) * 0.5 + 0.5;
    const w = canvas.width;
    const h = canvas.height;

    ctx.setTransform(w / 1080, 0, 0, h / 1350, 0, 0);
    ctx.fillStyle = "#0b1420";
    ctx.fillRect(0, 0, 1080, 1350);

    const glow = ctx.createRadialGradient(540, 665, 30, 540, 665, 530);
    glow.addColorStop(0, color + "2b");
    glow.addColorStop(0.55, color + "0c");
    glow.addColorStop(1, "#0b142000");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 120, 1080, 1050);

    for (const fleck of flecks) {
      ctx.globalAlpha = fleck.a;
      ctx.fillStyle = "#e9f2ec";
      ctx.beginPath();
      ctx.arc(fleck.x, fleck.y, fleck.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#f2eee2";
    ctx.font = "bold 76px Georgia, serif";
    ctx.fillText("Tide Engine", 84, 166);
    ctx.fillStyle = color;
    ctx.fillRect(85, 192, 115 + pulse * 15, 3);

    const cx = 540;
    const cy = 650;
    const phase = elapsed * 0.52;

    ctx.lineWidth = 1;
    for (let ring = 0; ring < 5; ring++) {
      ctx.strokeStyle = ring % 2 ? "#d9e6dc18" : "#d9e6dc2b";
      ctx.beginPath();
      ctx.arc(cx, cy, 110 + ring * 55, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (let i = 0; i < 32; i++) {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / 32;
      const inner = i % 4 === 0 ? 318 : 329;
      ctx.strokeStyle = i <= position ? color : "#e5eee738";
      ctx.lineWidth = i % 4 === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * 346, cy + Math.sin(angle) * 346);
      ctx.stroke();
    }

    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      for (let i = 0; i <= 360; i++) {
        const a = i * Math.PI * 2 / 360;
        const r =
          223 + layer * 17 +
          Math.sin(a * (7 + layer * 2) - phase * (2 + layer)) * (13 + pulse * 7) +
          Math.sin(a * 13 + phase * 1.7) * (7 + breath * 5);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = layer === 0 ? color : layer === 1 ? "#f2eee28a" : color + "75";
      ctx.lineWidth = layer === 0 ? 3.5 : 1.5;
      ctx.stroke();
    }

    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + phase * 0.35;
      const radius = 84 + pulse * 9;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34);
      ctx.quadraticCurveTo(
        cx + Math.cos(a - 0.22) * radius,
        cy + Math.sin(a - 0.22) * radius,
        cx + Math.cos(a) * (143 + breath * 12),
        cy + Math.sin(a) * (143 + breath * 12)
      );
      ctx.quadraticCurveTo(
        cx + Math.cos(a + 0.22) * radius,
        cy + Math.sin(a + 0.22) * radius,
        cx + Math.cos(a) * 34,
        cy + Math.sin(a) * 34
      );
      ctx.fillStyle = color + (i % 2 ? "12" : "22");
      ctx.strokeStyle = color + "80";
      ctx.lineWidth = 1.3;
      ctx.fill();
      ctx.stroke();
    }

    const core = ctx.createRadialGradient(cx - 24, cy - 30, 8, cx, cy, 96);
    core.addColorStop(0, "#fff9de");
    core.addColorStop(0.18, color);
    core.addColorStop(0.6, color + "aa");
    core.addColorStop(1, color + "00");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, 96 + pulse * 13, 0, Math.PI * 2);
    ctx.fill();

    const startX = 85;
    const width = 910;
    const top = 1082;
    const bottom = 1250;
    ctx.strokeStyle = "#d9e6dc25";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const x = startX + i * width / 8;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
    for (let i = 0; i <= 7; i++) {
      const y = top + i * (bottom - top) / 7;
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + width, y);
      ctx.stroke();
    }

    for (const [b, note, length] of melody) {
      const x = startX + b / 32 * width;
      const y = bottom - 18 - (note - 69) / 21 * (bottom - top - 36);
      const active = position >= b && position < b + length;
      ctx.fillStyle = active ? "#fff9e9" : colors[Math.min(7, Math.floor(b / 4))];
      ctx.globalAlpha = b <= position ? 0.95 : 0.48;
      ctx.beginPath();
      ctx.roundRect(x, y - (active ? 5 : 3), Math.max(8, length / 32 * width), active ? 10 : 6, 4);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const playhead = startX + position / 32 * width;
    ctx.strokeStyle = "#fff9e9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playhead, top - 8);
    ctx.lineTo(playhead, bottom + 8);
    ctx.stroke();

    if (elapsed < duration + 0.3) frame = requestAnimationFrame(render);
  }

  render();
  return () => {
    stopped = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
  };
}