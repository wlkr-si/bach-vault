export const title = "The Shape of a Returning Light";

export function start({ audioContext, canvas, duration, random }) {
  const ctx = canvas.getContext("2d");
  const now = audioContext.currentTime;
  const end = Math.min(duration, 15);
  const beat = 60 / 112;
  const W = canvas.width;
  const H = canvas.height;

  const master = audioContext.createGain();
  master.gain.setValueAtTime(0.72, now);
  master.gain.setValueAtTime(0.72, now + Math.max(0, end - 0.8));
  master.gain.linearRampToValueAtTime(0.0001, now + end);
  master.connect(audioContext.destination);

  const dry = audioContext.createGain();
  dry.gain.value = 0.8;
  dry.connect(master);

  const delay = audioContext.createDelay(1);
  const feedback = audioContext.createGain();
  const delayFilter = audioContext.createBiquadFilter();
  const wet = audioContext.createGain();
  delay.delayTime.value = beat * 0.75;
  feedback.gain.value = 0.25;
  delayFilter.type = "lowpass";
  delayFilter.frequency.value = 2800;
  wet.gain.value = 0.24;
  delay.connect(delayFilter);
  delayFilter.connect(feedback);
  feedback.connect(delay);
  delayFilter.connect(wet);
  wet.connect(master);

  const notes = [];
  const pulses = [];

  function frequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function addNote(time, midi, length, strength, kind = "glass") {
    if (time >= end - 0.08) return;
    notes.push({ time, midi, strength, kind });

    const t = now + time;
    const stop = Math.min(now + end, t + length + 0.8);
    const f = frequency(midi);
    const envelope = audioContext.createGain();
    const tone = audioContext.createBiquadFilter();

    tone.type = "lowpass";
    tone.frequency.setValueAtTime(kind === "bass" ? 550 : 4400, t);
    tone.frequency.exponentialRampToValueAtTime(
      kind === "bass" ? 180 : 1100,
      Math.min(stop, t + Math.max(0.12, length))
    );

    const peak = strength * (kind === "bass" ? 0.19 : 0.11);
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    envelope.gain.exponentialRampToValueAtTime(
      peak * (kind === "bass" ? 0.45 : 0.24),
      Math.min(stop, t + Math.max(0.05, length * 0.55))
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, stop);

    tone.connect(envelope);
    envelope.connect(dry);
    if (kind !== "bass") envelope.connect(delay);

    const oscillator = audioContext.createOscillator();
    oscillator.type = kind === "bass" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(f, t);
    oscillator.connect(tone);
    oscillator.start(t);
    oscillator.stop(stop);

    if (kind !== "bass") {
      const overtone = audioContext.createOscillator();
      const overtoneGain = audioContext.createGain();
      overtone.type = "sine";
      overtone.frequency.setValueAtTime(f * (kind === "bell" ? 2.997 : 2.004), t);
      overtoneGain.gain.setValueAtTime(kind === "bell" ? 0.25 : 0.13, t);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(stop, t + 0.3));
      overtone.connect(overtoneGain);
      overtoneGain.connect(tone);
      overtone.start(t);
      overtone.stop(stop);
    }
  }

  function strike(time, weight = 1, high = false) {
    if (time >= end - 0.08) return;
    pulses.push({ time, weight, high });
    const t = now + time;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(high ? 750 : 115, t);
    osc.frequency.exponentialRampToValueAtTime(high ? 360 : 42, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime((high ? 0.025 : 0.11) * weight, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (high ? 0.07 : 0.24));
    osc.connect(gain);
    gain.connect(dry);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  // Seven measures: a small melody changes its last thought each time it returns.
  const roots = [38, 34, 41, 36, 38, 34, 38];
  const voicings = [
    [62, 65, 69, 72],
    [58, 62, 65, 69],
    [60, 65, 69, 72],
    [60, 64, 67, 71],
    [62, 65, 69, 74],
    [58, 62, 67, 72],
    [62, 65, 69, 74]
  ];
  const melody = [
    [74, 77, 81, 79, 74, 72],
    [74, 77, 81, 84, 81, 77],
    [76, 77, 81, 79, 76, 72],
    [74, 79, 83, 81, 79, 76],
    [74, 77, 81, 86, 84, 81],
    [79, 77, 74, 72, 74, 77],
    [81, 77, 74, 72, 69, 74]
  ];
  const offsets = [0, 0.75, 1.5, 2, 2.75, 3.5];

  for (let bar = 0; bar < 7; bar++) {
    const base = bar * 4 * beat;
    addNote(base, roots[bar], beat * 2.8, 0.9, "bass");
    addNote(base + beat * 2, roots[bar] + 12, beat * 1.5, 0.48, "bass");
    strike(base, 0.9);
    strike(base + beat * 2, 0.55);
    strike(base + beat * 1.5, 0.65, true);
    strike(base + beat * 3.5, 0.48, true);

    for (let j = 0; j < 4; j++) {
      addNote(base + (j * 0.5 + 0.25) * beat, voicings[bar][j], beat * 1.3, 0.45, "glass");
      addNote(base + (j * 0.5 + 2.25) * beat, voicings[bar][3 - j], beat * 1.1, 0.32, "glass");
    }
    for (let j = 0; j < offsets.length; j++) {
      addNote(
        base + offsets[j] * beat,
        melody[bar][j],
        beat * (j === 5 ? 0.9 : 0.65),
        j === 0 ? 0.85 : 0.58,
        "bell"
      );
    }
  }

  // A final open fifth leaves the last image ringing.
  addNote(14.15, 50, 0.8, 0.65, "bass");
  addNote(14.15, 74, 0.8, 0.58, "bell");
  addNote(14.15, 81, 0.8, 0.4, "glass");
  strike(14.15, 0.7);

  const stars = Array.from({ length: 90 }, () => ({
    x: random() * W,
    y: random() * H,
    r: 0.5 + random() * 1.8,
    phase: random() * Math.PI * 2,
    speed: 0.3 + random() * 0.8
  }));

  function glow(x, y, radius, inner, outer) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function render() {
    const t = Math.max(0, audioContext.currentTime - now);
    const progress = Math.min(1, t / end);
    ctx.fillStyle = "#080d1c";
    ctx.fillRect(0, 0, W, H);

    const background = ctx.createLinearGradient(0, 0, W, H);
    background.addColorStop(0, "#10172c");
    background.addColorStop(0.55, "#101a2d");
    background.addColorStop(1, "#291a30");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    glow(W * 0.5, H * 0.49, W * 0.65, "rgba(50,91,103,0.20)", "rgba(50,91,103,0)");

    for (const star of stars) {
      const alpha = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * star.speed + star.phase));
      ctx.fillStyle = `rgba(223,232,224,${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }

    let energy = 0;
    let shimmer = 0;
    for (const pulse of pulses) {
      const age = t - pulse.time;
      if (age >= 0 && age < 1.5) {
        const v = pulse.weight * Math.exp(-age * (pulse.high ? 7 : 3));
        if (pulse.high) shimmer += v;
        else energy += v;
      }
    }

    const cx = W * 0.5;
    const cy = H * 0.49;
    const scale = W / 1080;
    const radius = (216 + energy * 16) * scale;

    glow(cx, cy, radius * 2.2, `rgba(244,168,113,${0.11 + energy * 0.06})`, "rgba(244,168,113,0)");

    ctx.save();
    ctx.translate(cx, cy);

    // Interlaced paths are drawn behind and in front of the central light.
    function threads(front) {
      for (let k = 0; k < 9; k++) {
        const phase = k * Math.PI * 2 / 9 + t * 0.12;
        ctx.beginPath();
        let drawing = false;
        for (let i = 0; i <= 220; i++) {
          const a = i / 220 * Math.PI * 2;
          const depth = Math.sin(a + phase);
          const x = Math.cos(a) * (radius * 1.62 + k * 5 * scale);
          const y = Math.sin(a) * radius * 0.43 + Math.sin(a * 2 + phase) * radius * 0.56;
          const rotate = phase * 0.3 + t * 0.045;
          const px = x * Math.cos(rotate) - y * Math.sin(rotate);
          const py = x * Math.sin(rotate) + y * Math.cos(rotate);
          if ((depth > 0) === front) {
            if (!drawing) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
            drawing = true;
          } else {
            drawing = false;
          }
        }
        ctx.strokeStyle = front
          ? `rgba(241,195,154,${0.23 + shimmer * 0.12})`
          : "rgba(111,173,171,0.18)";
        ctx.lineWidth = (k % 3 === 0 ? 1.8 : 0.9) * scale;
        ctx.stroke();
      }
    }

    threads(false);

    const disk = ctx.createRadialGradient(-radius * 0.3, -radius * 0.35, radius * 0.05, 0, 0, radius);
    disk.addColorStop(0, "#fff0ce");
    disk.addColorStop(0.42, "#f7c993");
    disk.addColorStop(0.8, "#df8b70");
    disk.addColorStop(1, "#a45562");
    ctx.fillStyle = disk;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 24; i++) {
      const y = (i / 23 * 2 - 1) * radius;
      ctx.beginPath();
      for (let x = -radius; x <= radius; x += 5 * scale) {
        const wave = Math.sin(x / radius * 5 + t * 0.8 + i * 0.42) * (5 + energy * 5) * scale;
        if (x === -radius) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.strokeStyle = `rgba(105,57,77,${0.06 + i * 0.002})`;
      ctx.lineWidth = 1.2 * scale;
      ctx.stroke();
    }
    ctx.restore();

    // The shadow travels slowly across the light, then recedes.
    const eclipse = Math.sin(progress * Math.PI) * radius * 0.74;
    ctx.fillStyle = "rgba(12,22,38,0.89)";
    ctx.beginPath();
    ctx.arc(radius * 1.13 - eclipse, -radius * 0.2, radius * 0.89, 0, Math.PI * 2);
    ctx.fill();

    threads(true);

    // Each sounding note becomes a short-lived point on an orbit.
    for (const note of notes) {
      const age = t - note.time;
      if (age < 0 || age > 1.8 || note.kind === "bass") continue;
      const angle = (note.midi - 60) * 0.47 - Math.PI / 2 + t * 0.12;
      const orbit = radius * (1.28 + age * 0.22);
      const x = Math.cos(angle) * orbit;
      const y = Math.sin(angle) * orbit * 0.72;
      const alpha = Math.exp(-age * 2) * note.strength;
      glow(x, y, 28 * scale, `rgba(255,222,170,${alpha * 0.55})`, "rgba(255,222,170,0)");
      ctx.fillStyle = `rgba(255,235,199,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, (2 + note.strength * 3) * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // A quiet visual measure of the performance.
    const lineY = H * 0.88;
    const lineX = W * 0.18;
    const lineW = W * 0.64;
    ctx.strokeStyle = "rgba(224,213,196,0.22)";
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    ctx.moveTo(lineX, lineY);
    ctx.lineTo(lineX + lineW, lineY);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,222,186,0.8)";
    ctx.beginPath();
    ctx.moveTo(lineX, lineY);
    ctx.lineTo(lineX + lineW * progress, lineY);
    ctx.stroke();
    ctx.fillStyle = "#ffe0b9";
    ctx.beginPath();
    ctx.arc(lineX + lineW * progress, lineY, 3 * scale, 0, Math.PI * 2);
    ctx.fill();

    if (t < end) requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}
