export const title = "A Clock Learns to Bloom";

export function start({ audioContext: ac, canvas, duration = 15, random }) {
  const rng = typeof random === "function" ? random : () => 0.5;
  const D = Math.max(1, duration);
  const scale = D / 15;
  const eighth = 15 / 56;
  const origin = ac.currentTime + 0.035;
  const ctx = canvas.getContext("2d");
  const events = [];
  const sources = [];
  const connections = [];
  let frame = 0;
  let stopped = false;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => {
    const u = clamp((x - a) / (b - a), 0, 1);
    return u * u * (3 - 2 * u);
  };
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  const when = t => origin + t * scale;
  const remember = node => (connections.push(node), node);

  const master = remember(ac.createGain());
  const mix = remember(ac.createGain());
  const compressor = remember(ac.createDynamicsCompressor());
  compressor.threshold.value = -17;
  compressor.knee.value = 14;
  compressor.ratio.value = 3.2;
  compressor.attack.value = 0.009;
  compressor.release.value = 0.16;
  mix.connect(compressor);
  compressor.connect(master);
  master.connect(ac.destination);
  master.gain.setValueAtTime(0, origin);
  master.gain.linearRampToValueAtTime(0.83, when(0.025));
  master.gain.setValueAtTime(0.83, when(13.7));
  master.gain.linearRampToValueAtTime(0, origin + D - 0.025);

  const reverb = remember(ac.createConvolver());
  const room = ac.createBuffer(2, Math.ceil(ac.sampleRate * 2.1 * scale), ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = room.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / ac.sampleRate / scale;
      const n = rng() * 2 - 1;
      low = 0.62 * low + 0.38 * n;
      data[i] = (0.6 * low + 0.13 * n) *
        Math.exp(-3.2 * t) * smooth(0, 0.018, t);
    }
    for (const [t, gain] of [[0.041, 0.38], [0.079, 0.23], [0.127, 0.14]]) {
      const i = Math.floor((t + ch * 0.007) * scale * ac.sampleRate);
      if (i < data.length) data[i] += gain;
    }
  }
  reverb.buffer = room;
  const roomOut = remember(ac.createGain());
  roomOut.gain.value = 0.43;
  reverb.connect(roomOut);
  roomOut.connect(mix);

  const delay = remember(ac.createDelay(4 * scale + 1));
  const feedback = remember(ac.createGain());
  const delayTone = remember(ac.createBiquadFilter());
  const delayOut = remember(ac.createStereoPanner());
  delay.delayTime.value = eighth * 3 * scale;
  delayTone.type = "lowpass";
  delayTone.frequency.value = 2700;
  feedback.gain.value = 0.29;
  delayOut.pan.value = -0.48;
  delay.connect(delayTone);
  delayTone.connect(feedback);
  feedback.connect(delay);
  delayTone.connect(delayOut);
  delayOut.connect(mix);

  const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const noiseData = noise.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < noiseData.length; i++) {
    brown = (brown + (rng() * 2 - 1) * 0.025) / 1.025;
    noiseData[i] = (rng() * 2 - 1) * 0.75 + brown;
  }

  function route(node, pan = 0, wet = 0.15, echo = 0) {
    const p = ac.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    node.connect(p);
    p.connect(mix);
    if (wet) {
      const g = ac.createGain();
      g.gain.value = wet;
      p.connect(g);
      g.connect(reverb);
    }
    if (echo) {
      const g = ac.createGain();
      g.gain.value = echo;
      p.connect(g);
      g.connect(delay);
    }
  }

  function run(source, t, length) {
    sources.push(source);
    source.start(when(t));
    source.stop(when(Math.min(14.94, t + length)));
  }

  const pitchClasses = [2, 4, 6, 7, 9, 11, 1];
  function laneFor(midi) {
    const pc = ((midi % 12) + 12) % 12;
    let best = 0, distance = 100;
    pitchClasses.forEach((p, i) => {
      const d = Math.min((pc - p + 12) % 12, (p - pc + 12) % 12);
      if (d < distance) { best = i; distance = d; }
    });
    return best;
  }

  function mark(t, midi, strength, kind, life = 1) {
    events.push({ t, midi, strength, kind, life, lane: laneFor(midi) });
  }

  function glass(t, midi, amp = 0.12, length = 1.2, pan = 0, echo = 0.12) {
    const f = hz(midi);
    const carrier = ac.createOscillator();
    const mod = ac.createOscillator();
    const index = ac.createGain();
    const env = ac.createGain();
    carrier.type = "sine";
    mod.type = "sine";
    carrier.frequency.setValueAtTime(f * 1.002, when(t));
    carrier.frequency.exponentialRampToValueAtTime(f, when(t + 0.045));
    mod.frequency.value = f * 2.006;
    index.gain.setValueAtTime(f * 1.05, when(t));
    index.gain.exponentialRampToValueAtTime(f * 0.018, when(t + 0.23));
    mod.connect(index);
    index.connect(carrier.frequency);
    env.gain.setValueAtTime(0, when(t));
    env.gain.linearRampToValueAtTime(amp, when(t + 0.006));
    env.gain.exponentialRampToValueAtTime(amp * 0.31, when(t + 0.12));
    env.gain.exponentialRampToValueAtTime(0.0001, when(t + length));
    carrier.connect(env);
    route(env, pan, 0.25, echo);
    run(carrier, t, length + 0.02);
    run(mod, t, length + 0.02);
    mark(t, midi, amp / 0.12, "glass", length);
  }

  function string(t, midi, amp = 0.045, length = 0.55, pan = 0) {
    const f = hz(midi);
    const osc = ac.createOscillator();
    const body = ac.createOscillator();
    const bodyGain = ac.createGain();
    const filter = ac.createBiquadFilter();
    const env = ac.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    osc.detune.value = (rng() - 0.5) * 5;
    body.type = "sine";
    body.frequency.value = f;
    bodyGain.gain.value = 0.65;
    filter.type = "lowpass";
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(Math.min(10000, f * 7), when(t));
    filter.frequency.exponentialRampToValueAtTime(f * 1.45, when(t + 0.21));
    osc.connect(filter);
    filter.connect(env);
    body.connect(bodyGain);
    bodyGain.connect(env);
    env.gain.setValueAtTime(0, when(t));
    env.gain.linearRampToValueAtTime(amp, when(t + 0.004));
    env.gain.exponentialRampToValueAtTime(amp * 0.24, when(t + 0.11));
    env.gain.exponentialRampToValueAtTime(0.0001, when(t + length));
    route(env, pan, 0.14, 0);
    run(osc, t, length + 0.02);
    run(body, t, length + 0.02);
    mark(t, midi, amp / 0.075, "string", length);
  }

  function bass(t, midi, amp = 0.17, length = 0.72) {
    const osc = ac.createOscillator();
    const overtone = ac.createOscillator();
    const overtoneGain = ac.createGain();
    const env = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(hz(midi) * 1.035, when(t));
    osc.frequency.exponentialRampToValueAtTime(hz(midi), when(t + 0.065));
    overtone.type = "triangle";
    overtone.frequency.value = hz(midi) * 2;
    overtoneGain.gain.value = 0.17;
    osc.connect(env);
    overtone.connect(overtoneGain);
    overtoneGain.connect(env);
    env.gain.setValueAtTime(0, when(t));
    env.gain.linearRampToValueAtTime(amp, when(t + 0.012));
    env.gain.exponentialRampToValueAtTime(amp * 0.55, when(t + 0.17));
    env.gain.exponentialRampToValueAtTime(0.0001, when(t + length));
    route(env, 0, 0.035, 0);
    run(osc, t, length + 0.02);
    run(overtone, t, length + 0.02);
    mark(t, midi, amp / 0.17, "bass", length);
  }

  function breath(t, amp, length, frequency, pan) {
    const source = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const env = ac.createGain();
    source.buffer = noise;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 2.2;
    env.gain.setValueAtTime(0, when(t));
    env.gain.linearRampToValueAtTime(amp, when(t + Math.min(0.1, length * 0.28)));
    env.gain.exponentialRampToValueAtTime(0.0001, when(t + length));
    source.connect(filter);
    filter.connect(env);
    route(env, pan, 0.35);
    run(source, t, length + 0.02);
  }

  function tick(t, accent, pan) {
    const source = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const env = ac.createGain();
    source.buffer = noise;
    filter.type = "bandpass";
    filter.frequency.value = accent ? 1600 : 6200;
    filter.Q.value = accent ? 6 : 0.65;
    const length = accent ? 0.12 : 0.045;
    env.gain.setValueAtTime(0, when(t));
    env.gain.linearRampToValueAtTime(accent ? 0.10 : 0.028, when(t + 0.002));
    env.gain.exponentialRampToValueAtTime(0.0001, when(t + length));
    source.connect(filter);
    filter.connect(env);
    route(env, pan, 0.1);
    run(source, t, length + 0.015);
    if (accent) mark(t, 62, 0.32, "tick", 0.15);
  }

  function pad(t, notes, amp, length) {
    notes.forEach((midi, i) => {
      const env = ac.createGain();
      const filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(650, when(t));
      filter.frequency.linearRampToValueAtTime(1800, when(t + length * 0.45));
      filter.frequency.linearRampToValueAtTime(550, when(t + length));
      filter.Q.value = 0.5;
      filter.connect(env);
      env.gain.setValueAtTime(0, when(t));
      env.gain.linearRampToValueAtTime(amp, when(t + 0.24));
      env.gain.setValueAtTime(amp * 0.75, when(t + length * 0.55));
      env.gain.exponentialRampToValueAtTime(0.0001, when(t + length));
      for (const detune of [-4, 4]) {
        const osc = ac.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = hz(midi);
        osc.detune.value = detune;
        osc.connect(filter);
        run(osc, t, length + 0.03);
      }
      route(env, (i / Math.max(1, notes.length - 1) - 0.5) * 1.25, 0.4);
    });
  }

  const harmonies = [
    { bass: 38, arp: [62, 69, 73, 66, 76, 69, 73], pad: [57, 61, 66] },
    { bass: 35, arp: [59, 66, 69, 62, 73, 66, 69], pad: [57, 62, 66] },
    { bass: 31, arp: [59, 66, 69, 62, 74, 66, 71], pad: [55, 62, 66] },
    { bass: 40, arp: [59, 66, 71, 62, 74, 66, 69], pad: [55, 62, 67] },
    { bass: 39, arp: [58, 65, 69, 62, 74, 65, 70], pad: [58, 62, 69] },
    { bass: 33, arp: [57, 64, 67, 62, 73, 64, 67], pad: [55, 61, 64] },
    { bass: 38, arp: [62, 69, 73, 66, 76, 69, 78], pad: [57, 61, 66, 69] }
  ];

  const melodies = [
    [[0, 74, 1.0], [1.5, 81, 0.73], [2, 85, 0.88], [4, 78, 0.90], [5, 76, 0.72]],
    [[0, 74, 0.88], [1.5, 73, 0.72], [2.5, 78, 0.86], [4, 81, 0.96], [6, 78, 0.70]],
    [[0, 78, 0.90], [1, 81, 0.72], [2, 83, 0.94], [3.5, 86, 0.78], [4.5, 81, 0.86], [6, 78, 0.66]],
    [[0, 79, 0.98], [1.5, 78, 0.78], [2, 76, 0.88], [4, 83, 0.96], [5.5, 81, 0.76], [6, 78, 0.68]],
    [[0, 77, 0.96], [1, 81, 0.80], [2, 86, 1.0], [3.5, 84, 0.82], [4, 82, 0.90], [5, 81, 0.77], [6, 77, 0.66]],
    [[0, 76, 0.94], [1.5, 74, 0.70], [2, 73, 0.91], [4, 79, 0.84], [5, 76, 0.75], [6, 73, 0.66]],
    [[0, 74, 0.98], [1.5, 81, 0.72], [2, 85, 0.87], [4, 86, 1.02]]
  ];

  breath(0, 0.10, 0.7, 1100, -0.3);
  for (let bar = 0; bar < 7; bar++) {
    const at = bar * 7 * eighth;
    const h = harmonies[bar];
    const energy = [0.62, 0.76, 0.9, 0.93, 1, 0.84, 0.68][bar];

    pad(at + 0.025, h.pad, bar === 6 ? 0.018 : 0.010 * energy,
      bar === 6 ? 3.2 : 2.02);
    bass(at, h.bass, 0.16 * energy, bar === 6 ? 2.6 : 0.83);

    if (bar > 0 && bar < 6) {
      bass(at + 4 * eighth, h.bass + 12, 0.095 * energy, 0.53);
    }

    for (let step = 0; step < 7; step++) {
      if (bar === 0 && step < 2) continue;
      if (bar === 6 && step > 4) continue;
      const jitter = (rng() - 0.5) * 0.009;
      const t = at + step * eighth + 0.01 + jitter;
      const accent = step === 0 || step === 2 || step === 4;
      string(t, h.arp[step], (accent ? 0.047 : 0.032) * energy,
        bar === 6 ? 1.3 : 0.48, (step % 2 ? 1 : -1) * 0.45);
      if (bar >= 1 && bar <= 5) {
        tick(t, step === 2 || step === 6, step % 2 ? 0.55 : -0.55);
        if (bar >= 2 && bar <= 4 && (step === 3 || step === 5)) {
          tick(t + eighth * 0.5, false, -0.7);
        }
      }
      if ((bar === 3 || bar === 4) && (step === 1 || step === 4 || step === 6)) {
        string(t + eighth * 0.5, h.arp[(step + 2) % 7] + 12,
          0.025, 0.32, 0.62);
      }
    }

    melodies[bar].forEach(([step, midi, velocity], i) => {
      const t = at + step * eighth;
      const final = bar === 6 && step === 4;
      glass(t, midi, velocity * 0.115,
        final ? 2.25 : i === melodies[bar].length - 1 ? 1.15 : 0.86,
        Math.sin((bar * 3 + i) * 0.9) * 0.28, final ? 0.07 : 0.13);
      if (bar === 2 || bar === 4) {
        string(t + 0.012, midi - 12, 0.027 * velocity, 0.8, -0.28);
      }
    });
  }

  breath(7 * eighth * 4 - 0.25, 0.105, 0.55, 2400, 0.6);
  breath(7 * eighth * 6 - 0.38, 0.08, 0.65, 1500, -0.5);
  glass(6 * 7 * eighth + 4 * eighth + 0.035, 78, 0.055, 2.1, -0.55, 0.04);
  string(6 * 7 * eighth + 4 * eighth + 0.065, 62, 0.065, 2.0, 0.35);

  events.sort((a, b) => a.t - b.t);

  const W = 1080, H = 1350;
  const TAU = Math.PI * 2;
  const colors = [
    [233, 182, 113], [152, 208, 195], [244, 204, 143],
    [129, 178, 189], [226, 151, 110], [177, 204, 162], [207, 183, 219]
  ];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${clamp(a, 0, 1)})`;
  const dust = Array.from({ length: 170 }, () => ({
    x: rng() * W, y: rng() * H, r: 0.3 + rng() * 1.1, a: 0.025 + rng() * 0.07
  }));

  function circle(x, y, r, stroke, width = 1) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.01, r), 0, TAU);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function petalPoint(u, side, length, width, bend, opening) {
    const a = Math.sin(Math.PI * u);
    return {
      x: side * width * Math.pow(a, 1.12) +
        bend * Math.sin(Math.PI * u) +
        Math.sin(u * TAU) * opening * 9,
      y: -(67 + length * u)
    };
  }

  function draw(t) {
    const time = Math.max(0, t);
    const entrance = smooth(0, 0.75, time);
    const bloom = smooth(10.7, 13.1, time);
    const opening = 0.22 + 0.48 * smooth(0.2, 7.8, time) + bloom * 0.3;
    const coda = smooth(13.1, 14.9, time);
    const barPos = clamp(time / (7 * eighth), 0, 7);
    const energies = Array(7).fill(0);
    let low = 0;
    let click = 0;

    for (const e of events) {
      const age = time - e.t;
      if (age < 0 || age > 3.5) continue;
      if (e.kind === "bass") low += e.strength * Math.exp(-age * 4);
      else if (e.kind === "tick") click += e.strength * Math.exp(-age * 16);
      else energies[e.lane] += e.strength * Math.exp(-age * (e.kind === "glass" ? 3.7 : 8));
    }

    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#071923");
    bg.addColorStop(0.56, "#101c25");
    bg.addColorStop(1, "#080f18");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const halo = ctx.createRadialGradient(540, 690, 20, 540, 690, 570);
    halo.addColorStop(0, `rgba(74,115,112,${0.10 + low * 0.035 + bloom * 0.05})`);
    halo.addColorStop(0.65, "rgba(37,69,76,0.05)");
    halo.addColorStop(1, "rgba(5,12,18,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    for (const d of dust) {
      ctx.fillStyle = `rgba(222,217,191,${d.a})`;
      ctx.fillRect(d.x, d.y, d.r, d.r);
    }

    ctx.globalAlpha = entrance;
    ctx.fillStyle = "#e6dcc5";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "italic 49px Georgia, 'Times New Roman', serif";
    ctx.fillText(title, 540, 155);

    ctx.strokeStyle = "rgba(217,190,144,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(493, 216);
    ctx.lineTo(587, 216);
    ctx.stroke();

    const cx = 540, cy = 710;
    ctx.save();
    ctx.translate(cx, cy);

    const rotation = -0.075 + time * 0.009 - bloom * 0.055;
    const outer = 419;
    circle(0, 0, outer, `rgba(184,196,180,${0.16 * (1 - bloom * 0.55)})`);
    circle(0, 0, outer + 17, "rgba(184,196,180,0.045)");

    for (let i = 0; i < 49; i++) {
      const a = i / 49 * TAU - Math.PI / 2;
      const major = i % 7 === 0;
      const progress = time / eighth;
      const lit = i <= progress && i > progress - 1;
      ctx.strokeStyle = lit ? "rgba(247,216,161,0.85)" :
        `rgba(199,196,172,${major ? 0.32 : 0.11})`;
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (outer + 5), Math.sin(a) * (outer + 5));
      ctx.lineTo(Math.cos(a) * (outer + (major ? 17 : 10)),
        Math.sin(a) * (outer + (major ? 17 : 10)));
      ctx.stroke();
    }

    for (let j = 0; j < 7; j++) {
      const start = -Math.PI / 2 + j / 7 * TAU + 0.025;
      const full = TAU / 7 - 0.05;
      const amount = clamp(barPos - j, 0, 1);
      if (amount > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, outer + 27, start, start + full * amount);
        ctx.strokeStyle = rgba(colors[j], 0.3 + 0.25 * (j === Math.floor(barPos)));
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    for (const e of events) {
      const age = time - e.t;
      if (e.kind !== "bass" || age < 0 || age > 1.4) continue;
      const r = 76 + age * 205;
      circle(0, 0, r, `rgba(188,218,207,${0.15 * e.strength * Math.exp(-age * 2.6)})`,
        1 + (1 - age / 1.4));
    }

    const order = [3, 4, 2, 5, 1, 6, 0];
    for (const lane of order) {
      const energy = Math.min(1.65, energies[lane]);
      const angle = lane / 7 * TAU + rotation;
      const color = colors[lane];
      const length = 224 + opening * 95 + energy * 15 +
        Math.sin(time * 0.8 + lane * 1.7) * 5;
      const width = 20 + opening * 63 + energy * 11;
      const bend = Math.sin(time * 0.67 + lane * 0.87) * (8 + opening * 9);
      ctx.save();
      ctx.rotate(angle);

      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const p = petalPoint(i / 64, -1, length, width, bend, opening);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      for (let i = 64; i >= 0; i--) {
        const p = petalPoint(i / 64, 1, length, width, bend, opening);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      const fill = ctx.createLinearGradient(0, -67, 0, -67 - length);
      fill.addColorStop(0, rgba(color, 0.015));
      fill.addColorStop(0.6, rgba(color, 0.055 + energy * 0.035));
      fill.addColorStop(1, rgba(color, 0.12 + energy * 0.045));
      ctx.fillStyle = fill;
      ctx.fill();

      for (let fiber = -5; fiber <= 5; fiber++) {
        const side = fiber / 5;
        ctx.beginPath();
        for (let i = 0; i <= 56; i++) {
          const u = i / 56;
          const p = petalPoint(u, side, length, width, bend, opening);
          p.x += Math.sin(u * Math.PI * 4 - time * 3.5 + lane) *
            energy * 4.5 * Math.sin(Math.PI * u);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = rgba(color,
          (fiber === -5 || fiber === 5 ? 0.50 : 0.19) + energy * 0.17);
        ctx.lineWidth = fiber === 0 ? 1.35 : 0.85;
        ctx.stroke();
      }

      for (const e of events) {
        if (e.lane !== lane || (e.kind !== "glass" && e.kind !== "string")) continue;
        const age = time - e.t;
        if (age < -0.24 || age > 1.3) continue;
        const travel = age < 0 ? 1 + age / 0.24 : 1 - Math.min(1, age / 1.1);
        const p = petalPoint(clamp(travel, 0, 1), 0, length, width, bend, opening);
        const alpha = age < 0 ? smooth(-0.24, 0, age) * 0.4 : Math.exp(-age * 3);
        const radius = (e.kind === "glass" ? 4.2 : 2.1) * (0.7 + e.strength * 0.3);
        ctx.shadowBlur = e.kind === "glass" ? 18 : 7;
        ctx.shadowColor = rgba(color, 0.9);
        ctx.fillStyle = rgba([255, 241, 209], alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (age >= 0 && age < 0.45 && e.kind === "glass") {
          circle(0, -67 - length, 5 + age * 65, rgba(color, (1 - age / 0.45) * 0.45));
        }
      }

      const tipY = -67 - length;
      ctx.fillStyle = rgba(color, 0.6 + energy * 0.2);
      ctx.beginPath();
      ctx.arc(0, tipY, 2.6 + energy * 1.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.rotate(-time * 0.10);
    const hubRadius = 59 + low * 3;
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU;
      const b = (i + 2) / 7 * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * hubRadius, Math.sin(a) * hubRadius);
      ctx.quadraticCurveTo(0, 0, Math.cos(b) * hubRadius, Math.sin(b) * hubRadius);
      ctx.strokeStyle = rgba(colors[i], 0.33 + low * 0.14);
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    ctx.restore();

    circle(0, 0, 67 + low * 3, "rgba(232,204,155,0.5)", 1);
    circle(0, 0, 73 + low * 3, "rgba(232,204,155,0.16)", 1);
    const heart = ctx.createRadialGradient(0, 0, 0, 0, 0, 41 + low * 10);
    heart.addColorStop(0, `rgba(255,227,178,${0.30 + low * 0.2 + click * 0.1})`);
    heart.addColorStop(0.3, "rgba(230,188,124,0.10)");
    heart.addColorStop(1, "rgba(230,188,124,0)");
    ctx.fillStyle = heart;
    ctx.beginPath();
    ctx.arc(0, 0, 55, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#f6deb2";
    ctx.beginPath();
    ctx.arc(0, 0, 3.2 + low * 2, 0, TAU);
    ctx.fill();
    ctx.restore();

    const baseY = 1210;
    ctx.globalAlpha = entrance * (0.7 - coda * 0.25);
    for (let lane = 0; lane < 7; lane++) {
      ctx.beginPath();
      for (let x = 170; x <= 910; x += 4) {
        const u = (x - 170) / 740;
        const window = Math.pow(Math.sin(Math.PI * u), 2);
        let displacement = 0;
        for (const e of events) {
          const age = time - e.t;
          if (e.lane !== lane || age < 0 || age > 1.4 || e.kind === "bass") continue;
          const center = age / 1.4;
          const d = u - center;
          displacement += Math.sin(d * 44) * Math.exp(-d * d * 85) *
            Math.exp(-age * 1.8) * e.strength * 13;
        }
        const y = baseY + (lane - 3) * 5 +
          displacement * window +
          Math.sin(u * TAU + lane * 0.55 + time * 0.35) * bloom * 5 * window;
        if (x === 170) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(colors[lane], 0.24 + Math.min(1, energies[lane]) * 0.2);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    for (const s of sources) {
      try { s.stop(); } catch (_) {}
    }
    for (const n of connections) {
      try { n.disconnect(); } catch (_) {}
    }
  }

  function animate() {
    if (stopped) return;
    const elapsed = (ac.currentTime - origin) / scale;
    draw(Math.min(15, elapsed));
    if (ac.currentTime < origin + D) frame = requestAnimationFrame(animate);
    else stop();
  }

  draw(0);
  frame = requestAnimationFrame(animate);
  return stop;
}