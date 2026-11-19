export const title = "Glass Cartography";

export function start({ audioContext, canvas, duration = 15, random }) {
  const ctx = audioContext;
  const out = ctx.destination;
  const W = canvas.width || 1080;
  const H = canvas.height || 1350;
  const g = canvas.getContext("2d");
  const T = Math.min(duration, 15);
  const now = ctx.currentTime + 0.035;
  const bpm = 128;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const seed = Array.from({ length: 96 }, () => random());
  const events = [];

  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  master.gain.value = 0.68;
  comp.threshold.value = -18;
  comp.knee.value = 15;
  comp.ratio.value = 5;
  comp.attack.value = 0.008;
  comp.release.value = 0.18;
  master.connect(comp).connect(out);

  const air = ctx.createGain();
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = "bandpass";
  airFilter.Q.value = 0.7;
  air.gain.value = 0.045;
  air.connect(airFilter).connect(master);

  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const noise = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noise.length; i++) {
    noise[i] = (random() * 2 - 1) * (0.75 + 0.25 * Math.sin(i * 0.00013));
  }

  function nodeEnvelope(node, t, d, peak, attack = 0.012, release = 0.12) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.52), t + Math.max(attack + 0.02, d - release));
    node.gain.exponentialRampToValueAtTime(0.0001, t + d);
  }

  function voice(t, d, hz, amount, color = 0, visual = true) {
    if (t > now + T) return;
    const bus = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(700 + color * 2200, t);
    filter.frequency.exponentialRampToValueAtTime(260 + color * 700, t + d);
    filter.Q.value = 1.8 + color * 3;
    a.type = color > 0.62 ? "triangle" : "sine";
    b.type = "sine";
    a.frequency.setValueAtTime(hz, t);
    b.frequency.setValueAtTime(hz * (2.001 + color * 0.009), t);
    a.detune.value = (seed[(Math.floor(t * 9) + 3) % seed.length] - 0.5) * 11;
    b.detune.value = -a.detune.value * 0.35;

    const ag = ctx.createGain();
    const bg = ctx.createGain();
    ag.gain.value = 0.76;
    bg.gain.value = 0.24 + color * 0.14;
    a.connect(ag).connect(bus);
    b.connect(bg).connect(bus);
    bus.connect(filter).connect(master);
    nodeEnvelope(bus, t, d, amount, 0.008 + color * 0.02, Math.min(0.2, d * 0.36));
    a.start(t);
    b.start(t);
    a.stop(t + d + 0.04);
    b.stop(t + d + 0.04);

    if (visual) events.push({ t: t - now, d, hz, color, kind: "tone" });
  }

  function bell(t, hz, amount) {
    const bus = ctx.createGain();
    const partials = [1, 2.756, 4.071, 5.43];
    partials.forEach((p, i) => {
      const o = ctx.createOscillator();
      const v = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(hz * p, t);
      v.gain.value = amount * [0.72, 0.24, 0.15, 0.06][i];
      o.connect(v).connect(bus);
      o.start(t);
      o.stop(t + 1.4);
    });
    nodeEnvelope(bus, t, 1.25, 1, 0.002, 0.9);
    bus.connect(master);
    events.push({ t: t - now, d: 1.25, hz, color: 0.95, kind: "bell" });
  }

  function kick(t, amount) {
    const o = ctx.createOscillator();
    const v = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(138, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    nodeEnvelope(v, t, 0.22, amount, 0.001, 0.14);
    o.connect(v).connect(master);
    o.start(t);
    o.stop(t + 0.24);
    events.push({ t: t - now, d: 0.24, hz: 45, color: 0.12, kind: "kick" });
  }

  function tick(t, bright) {
    const src = ctx.createBufferSource();
    const hp = ctx.createBiquadFilter();
    const v = ctx.createGain();
    src.buffer = noiseBuffer;
    hp.type = "highpass";
    hp.frequency.value = bright ? 6000 : 3300;
    nodeEnvelope(v, t, bright ? 0.045 : 0.075, bright ? 0.065 : 0.038, 0.001, 0.035);
    src.connect(hp).connect(v).connect(master);
    src.start(t);
    src.stop(t + 0.1);
  }

  const roots = [73.416, 103.826, 87.307, 130.813, 97.999, 116.541, 82.407, 110.0];
  const chordSteps = [
    [0, 7, 10, 14], [0, 3, 7, 11], [0, 7, 9, 14], [0, 4, 7, 10],
    [0, 3, 7, 12], [0, 5, 9, 14], [0, 3, 7, 10], [0, 4, 8, 14]
  ];
  const scale = [0, 2, 3, 7, 8, 10, 14, 15, 19];

  const airSource = ctx.createBufferSource();
  airSource.buffer = noiseBuffer;
  airSource.loop = true;
  airFilter.frequency.setValueAtTime(440, now);
  for (let i = 0; i <= 8; i++) {
    airFilter.frequency.exponentialRampToValueAtTime(300 + roots[i % 8] * 10, now + i * bar + 0.7);
  }
  airSource.connect(air);
  airSource.start(now);
  airSource.stop(now + T + 0.1);

  for (let b = 0; b < 8; b++) {
    const t = now + b * bar;
    const root = roots[b];
    const chord = chordSteps[b];
    voice(t, bar * 0.93, root / 2, 0.17, 0.12, false);
    voice(t + beat * 0.03, bar * 0.78, root, 0.085, 0.34, false);
    voice(t + beat * 0.1, bar * 0.72, root * Math.pow(2, chord[2] / 12), 0.055, 0.52, false);

    for (let q = 0; q < 4; q++) {
      const qt = t + q * beat;
      kick(qt, q === 0 ? 0.2 : 0.12);
      tick(qt + beat * 0.5, q % 2 === 0);
      if (q === 3) tick(qt + beat * 0.77, true);
    }

    const pattern = b < 2 ? [0, 2, 4, 6] : b < 5 ? [0, 1, 3, 4, 6, 7] : [0, 1, 2, 4, 5, 6, 7];
    pattern.forEach((slot, index) => {
      const r = seed[(b * 11 + index) % seed.length];
      const degree = scale[(b * 2 + index * 2 + (r > 0.76 ? 1 : 0)) % scale.length];
      const octave = b > 4 && index % 3 === 0 ? 2 : 1;
      const hz = root * Math.pow(2, (degree + octave * 12) / 12);
      const mt = t + slot * beat * 0.5 + (r - 0.5) * 0.026;
      voice(mt, beat * (0.34 + r * 0.34), hz, 0.07 + r * 0.025, 0.55 + r * 0.36);
      if ((b === 3 || b === 6) && index % 2 === 0) bell(mt + beat * 0.1, hz * 2, 0.032);
    });
  }

  for (let i = 0; i < 8; i++) {
    const t = now + i * bar + bar * 0.72;
    bell(t, roots[i] * 4, 0.025);
  }

  const hueA = 190 + Math.floor(seed[1] * 32);
  const hueB = 292 + Math.floor(seed[2] * 38);
  let frame;

  function draw() {
    const elapsed = Math.max(0, ctx.currentTime - now);
    const p = Math.min(1, elapsed / T);
    const pulse = Math.sin(elapsed * Math.PI / beat) * 0.5 + 0.5;

    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, `hsl(${hueA}, 46%, ${7 + pulse * 2}%)`);
    bg.addColorStop(0.54, `hsl(${hueB}, 34%, 10%)`);
    bg.addColorStop(1, `hsl(${hueA + 50}, 55%, 5%)`);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    g.globalCompositeOperation = "screen";
    for (let i = 0; i < 11; i++) {
      const phase = elapsed * (0.16 + i * 0.017) + seed[i] * 8;
      const x = W * (0.5 + 0.47 * Math.sin(phase * 0.73 + i));
      const y = H * (0.5 + 0.45 * Math.cos(phase * 0.51 + i * 1.8));
      const r = 110 + 80 * Math.sin(phase);
      const glow = g.createRadialGradient(x, y, 0, x, y, Math.abs(r) * 2.4);
      glow.addColorStop(0, `hsla(${hueA + i * 9}, 90%, 70%, .09)`);
      glow.addColorStop(1, "transparent");
      g.fillStyle = glow;
      g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }

    const centerX = W / 2;
    const centerY = H / 2;
    for (let lane = 0; lane < 6; lane++) {
      g.beginPath();
      for (let x = -40; x <= W + 40; x += 12) {
        const xn = x / W;
        const wave =
          Math.sin(xn * 9 + elapsed * (1.1 + lane * 0.09) + lane * 1.73) * (22 + lane * 8) +
          Math.sin(xn * 23 - elapsed * 0.43 + lane) * 8;
        const y = centerY + (lane - 2.5) * 105 + wave;
        x === -40 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.strokeStyle = `hsla(${hueA + lane * 26}, 92%, 72%, ${0.13 + pulse * 0.06})`;
      g.lineWidth = 1.2;
      g.stroke();
    }

    events.forEach((e, index) => {
      const age = elapsed - e.t;
      if (age < -0.1 || age > e.d + 1.35) return;
      const life = Math.max(0, 1 - Math.max(0, age) / (e.d + 1.15));
      const lane = ((Math.log2(e.hz / 55) * 2.7 + index * 0.17) % 6 + 6) % 6;
      const y = centerY + (lane - 2.5) * 105;
      const x = ((e.t / T) * (W + 220) - 110) + Math.max(0, age) * 42;
      const r = e.kind === "kick" ? 35 + pulse * 48 : 11 + 24 * (1 - life);

      g.save();
      g.translate(x, y);
      g.rotate(age * (e.kind === "bell" ? 2.2 : 0.45) + index);
      g.strokeStyle = `hsla(${hueB + e.color * 90}, 100%, 78%, ${life * 0.82})`;
      g.fillStyle = `hsla(${hueA + e.color * 120}, 100%, 70%, ${life * 0.19})`;
      g.lineWidth = 1.5 + e.color * 2;
      if (e.kind === "bell") {
        g.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (Math.PI * 2 * k) / 8;
          const rr = k % 2 ? r * 0.42 : r;
          const px = Math.cos(a) * rr;
          const py = Math.sin(a) * rr;
          k ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.closePath();
      } else {
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
      }
      g.fill();
      g.stroke();
      g.restore();
    });

    const horizon = g.createLinearGradient(0, H * 0.88, 0, H);
    horizon.addColorStop(0, "transparent");
    horizon.addColorStop(1, "rgba(2,4,15,.9)");
    g.fillStyle = horizon;
    g.fillRect(0, H * 0.72, W, H * 0.28);

    g.globalCompositeOperation = "source-over";
    g.fillStyle = `hsla(${hueA + 20}, 100%, 88%, ${0.5 + pulse * 0.3})`;
    g.beginPath();
    g.arc(centerX, centerY, 3 + pulse * 5, 0, Math.PI * 2);
    g.fill();

    if (elapsed < T + 0.2) frame = requestAnimationFrame(draw);
  }

  draw();

  return () => {
    cancelAnimationFrame(frame);
    try { airSource.stop(); } catch (_) {}
  };
}