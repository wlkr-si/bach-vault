export const title = "A Clock That Blooms";

export function start({ audioContext: ac, canvas, duration = 15, random }) {
  const entered = ac.currentTime;
  const rng = typeof random === "function" ? random : () => 0.5;
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = x => {
    x = clamp(x);
    return x * x * (3 - 2 * x);
  };
  const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
  const nodes = [];
  const sources = [];
  const events = [];
  const leadNotes = [];
  const own = n => (nodes.push(n), n);
  const gain = value => {
    const n = own(ac.createGain());
    n.gain.value = value;
    return n;
  };
  const oscillator = (type, hz) => {
    const n = own(ac.createOscillator());
    n.type = type;
    n.frequency.value = hz;
    sources.push(n);
    return n;
  };
  const filter = (type, hz, q = 0.7) => {
    const n = own(ac.createBiquadFilter());
    n.type = type;
    n.frequency.value = hz;
    n.Q.value = q;
    return n;
  };
  const pan = value => {
    const n = own(ac.createStereoPanner());
    n.pan.value = value;
    return n;
  };

  const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rng() * 2 - 1;

  const impulse = ac.createBuffer(2, Math.ceil(ac.sampleRate * 2.1), ac.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const d = impulse.getChannelData(channel);
    let low = 0;
    for (let i = 0; i < d.length; i++) {
      const seconds = i / ac.sampleRate;
      low = low * 0.62 + (rng() * 2 - 1) * 0.38;
      d[i] = seconds < 0.019 ? 0 :
        low * Math.exp(-seconds * 3.6) * Math.min(1, (seconds - 0.019) * 100);
    }
    for (const [time, amount] of [[0.031, 0.38], [0.053, 0.24], [0.089, 0.16]]) {
      d[Math.floor((time + channel * 0.007) * ac.sampleRate)] += amount;
    }
  }

  const makeWave = harmonics => {
    const real = new Float32Array(harmonics.length + 1);
    const imag = new Float32Array(harmonics.length + 1);
    harmonics.forEach((v, i) => { imag[i + 1] = v; });
    return ac.createPeriodicWave(real, imag);
  };
  const woodWave = makeWave([1, 0.31, 0.16, 0.075, 0.025, 0.018]);
  const bassWave = makeWave([1, 0.23, 0.095, 0.035]);

  const paper = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(1080, 1350)
    : canvas.ownerDocument.createElement("canvas");
  paper.width = 1080;
  paper.height = 1350;
  const p = paper.getContext("2d");
  const paperGradient = p.createRadialGradient(490, 570, 80, 540, 675, 950);
  paperGradient.addColorStop(0, "#f8f1df");
  paperGradient.addColorStop(1, "#e6dcc6");
  p.fillStyle = paperGradient;
  p.fillRect(0, 0, 1080, 1350);

  for (let i = 0; i < 8500; i++) {
    p.fillStyle = `rgba(72,48,28,${0.015 + rng() * 0.045})`;
    p.fillRect(rng() * 1080, rng() * 1350, 0.4 + rng(), 0.4 + rng());
  }

  p.fillStyle = "#263633";
  p.font = "46px Georgia, serif";
  p.fillText("A CLOCK THAT", 84, 103);
  p.font = "italic 112px Georgia, serif";
  p.fillText("Blooms", 77, 216);
  p.strokeStyle = "rgba(38,54,51,0.3)";
  p.lineWidth = 1;
  p.beginPath();
  p.moveTo(84, 264);
  p.lineTo(996, 264);
  p.moveTo(84, 1154);
  p.lineTo(996, 1154);
  p.stroke();

  const mix = gain(0.95);
  const highpass = filter("highpass", 27);
  const compressor = own(ac.createDynamicsCompressor());
  compressor.threshold.value = -12;
  compressor.knee.value = 9;
  compressor.ratio.value = 3.3;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.14;
  const analyser = own(ac.createAnalyser());
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.5;
  const output = gain(0);
  mix.connect(highpass);
  highpass.connect(compressor);
  compressor.connect(analyser);
  analyser.connect(output);
  output.connect(ac.destination);

  const reverb = own(ac.createConvolver());
  reverb.buffer = impulse;
  const reverbTone = filter("lowpass", 6200);
  const reverbLevel = gain(0.72);
  reverb.connect(reverbTone);
  reverbTone.connect(reverbLevel);
  reverbLevel.connect(mix);

  const echoIn = gain(1);
  const echoL = own(ac.createDelay(1));
  const echoR = own(ac.createDelay(1));
  const echoToneL = filter("lowpass", 3400);
  const echoToneR = filter("lowpass", 2800);
  const feedbackL = gain(0.24);
  const feedbackR = gain(0.24);
  const echoOutL = gain(0.52);
  const echoOutR = gain(0.52);
  const left = pan(-0.72);
  const right = pan(0.72);
  echoIn.connect(echoL);
  echoIn.connect(echoR);
  echoL.connect(echoToneL);
  echoR.connect(echoToneR);
  echoToneL.connect(feedbackL);
  feedbackL.connect(echoR);
  echoToneR.connect(feedbackR);
  feedbackR.connect(echoL);
  echoToneL.connect(echoOutL);
  echoToneR.connect(echoOutR);
  echoOutL.connect(left);
  echoOutR.connect(right);
  left.connect(mix);
  right.connect(mix);

  const t0 = ac.currentTime + 0.065;
  const D = Math.max(0.5, duration - (t0 - entered) - 0.025);
  const unit = D / 15;
  const at = s => t0 + s * unit;
  echoL.delayTime.value = 0.225 * unit;
  echoR.delayTime.value = 0.375 * unit;

  output.gain.setValueAtTime(0, t0);
  output.gain.linearRampToValueAtTime(1.15, at(0.025));
  output.gain.setValueAtTime(1.15, at(14.35));
  output.gain.linearRampToValueAtTime(0, at(15));

  function route(node, position = 0, room = 0.15, echo = 0) {
    const stereo = pan(position);
    node.connect(stereo);
    stereo.connect(mix);
    if (room) {
      const send = gain(room);
      stereo.connect(send);
      send.connect(reverb);
    }
    if (echo) {
      const send = gain(echo);
      stereo.connect(send);
      send.connect(echoIn);
    }
  }

  function begin(source, time, length) {
    source.start(time);
    source.stop(Math.min(time + length, at(15) + 0.01));
  }

  function noiseSource() {
    const n = own(ac.createBufferSource());
    n.buffer = noise;
    sources.push(n);
    return n;
  }

  function mark(kind, s, midi, velocity) {
    const e = {
      kind, t: s, midi, velocity,
      petal: ((midi - 62) % 5 + 5) % 5,
      u: 0.24 + clamp((midi - 65) / 23) * 0.5
    };
    events.push(e);
    return e;
  }

  function bell(midi, s, velocity = 1, life = 1.35) {
    const time = at(s);
    const f = frequency(midi);
    const bus = gain(1);
    const e = mark("lead", s, midi, velocity);
    route(bus, Math.sin(e.petal * TAU / 5) * 0.43, 0.27, 0.2);

    const ratios = [1, 2.003, 3.997, 6.012];
    const levels = [0.145, 0.037, 0.018, 0.007];
    const lengths = [life, life * 0.64, life * 0.34, life * 0.2];

    for (let i = 0; i < ratios.length; i++) {
      const o = oscillator("sine", f * ratios[i]);
      const envelope = gain(0);
      const length = lengths[i] * unit;
      const a = levels[i] * velocity;
      envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(a, time + 0.003 * unit);
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.00011, a * 0.48), time + length * 0.18
      );
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + length);
      o.connect(envelope);
      envelope.connect(bus);

      if (i === 0) {
        const mod = oscillator("sine", f * 2.002);
        const index = gain(0);
        index.gain.setValueAtTime(f * 1.35 * velocity, time);
        index.gain.exponentialRampToValueAtTime(f * 0.006, time + 0.075 * unit);
        mod.connect(index);
        index.connect(o.frequency);
        begin(mod, time, length + 0.03);
      }
      begin(o, time, length + 0.03);
    }

    e.sparks = Array.from({ length: 11 }, () => {
      const a = rng() * TAU;
      const speed = 24 + rng() * 77;
      return {
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 22,
        life: 0.5 + rng() * 0.8,
        size: 0.8 + rng() * 1.9
      };
    });
    leadNotes.push(e);
  }

  function wood(midi, s, velocity = 1, position = 0) {
    const time = at(s);
    const o = oscillator("sine", frequency(midi));
    o.setPeriodicWave(woodWave);
    const tone = filter("lowpass", 4100, 0.65);
    tone.frequency.setValueAtTime(4100, time);
    tone.frequency.exponentialRampToValueAtTime(720, time + 0.32 * unit);
    const envelope = gain(0);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.052 * velocity, time + 0.0025 * unit);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.66 * unit);
    o.connect(tone);
    tone.connect(envelope);
    route(envelope, position, 0.14, 0.12);
    begin(o, time, 0.7 * unit);
    mark("wood", s, midi, velocity);
  }

  function bass(midi, s, length = 0.65, velocity = 1) {
    const time = at(s);
    const body = gain(0);
    const tone = filter("lowpass", 650, 0.6);
    tone.frequency.setValueAtTime(650, time);
    tone.frequency.exponentialRampToValueAtTime(150, time + 0.19 * unit);
    body.gain.setValueAtTime(0, time);
    body.gain.linearRampToValueAtTime(0.2 * velocity, time + 0.008 * unit);
    body.gain.exponentialRampToValueAtTime(0.11 * velocity, time + 0.12 * unit);
    body.gain.exponentialRampToValueAtTime(0.0001, time + length * unit);
    const o = oscillator("sine", frequency(midi));
    o.setPeriodicWave(bassWave);
    o.connect(tone);
    tone.connect(body);
    route(body, 0, 0.025, 0);
    begin(o, time, (length + 0.03) * unit);
    mark("bass", s, midi, velocity);
  }

  function chord(notes, s, length, strength) {
    const time = at(s);
    notes.forEach((midi, i) => {
      const envelope = gain(0);
      const tone = filter("lowpass", 1450 + strength * 600, 0.45);
      envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(
        0.0115 * strength, time + 0.26 * unit
      );
      envelope.gain.setValueAtTime(
        0.0115 * strength, time + Math.max(0.3, length - 0.35) * unit
      );
      envelope.gain.linearRampToValueAtTime(0, time + (length + 0.3) * unit);
      for (const detune of [-5, 5]) {
        const o = oscillator("triangle", frequency(midi));
        o.detune.value = detune + (rng() - 0.5) * 1.2;
        o.connect(tone);
        begin(o, time, (length + 0.35) * unit);
      }
      tone.connect(envelope);
      route(envelope, -0.66 + i * 0.33, 0.38, 0);
    });
  }

  function kick(s, velocity = 1) {
    const time = at(s);
    const o = oscillator("sine", 132);
    o.frequency.setValueAtTime(132, time);
    o.frequency.exponentialRampToValueAtTime(46, time + 0.085 * unit);
    o.frequency.exponentialRampToValueAtTime(39, time + 0.29 * unit);
    const envelope = gain(0);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.48 * velocity, time + 0.002 * unit);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.32 * unit);
    o.connect(envelope);
    route(envelope, 0, 0.035, 0);
    begin(o, time, 0.34 * unit);
    mark("kick", s, 36, velocity);
  }

  function rim(s, velocity = 1) {
    const time = at(s);
    const bus = gain(1);
    route(bus, 0.18, 0.15, 0.045);
    for (const [hz, level] of [[827, 0.065], [1631, 0.028]]) {
      const o = oscillator("sine", hz);
      const envelope = gain(0);
      envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(level * velocity, time + 0.001 * unit);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.062 * unit);
      o.connect(envelope);
      envelope.connect(bus);
      begin(o, time, 0.07 * unit);
    }
    const n = noiseSource();
    const tone = filter("bandpass", 2150, 0.75);
    const envelope = gain(0);
    envelope.gain.setValueAtTime(0.047 * velocity, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.095 * unit);
    n.connect(tone);
    tone.connect(envelope);
    envelope.connect(bus);
    n.start(time, rng() * 0.6, 0.11 * unit);
    mark("rim", s, 42, velocity);
  }

  function hat(s, velocity = 1, open = false) {
    const time = at(s);
    const n = noiseSource();
    const tone = filter("highpass", 7200, 0.5);
    const envelope = gain(0);
    const length = (open ? 0.19 : 0.047) * unit;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.033 * velocity, time + 0.001 * unit);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + length);
    n.connect(tone);
    tone.connect(envelope);
    route(envelope, open ? 0.53 : -0.3, 0.09, 0);
    n.start(time, rng() * 0.6, length + 0.01);
    mark("hat", s, 48, velocity);
  }

  function breath(s, length, strength) {
    const time = at(s);
    const n = noiseSource();
    const tone = filter("bandpass", 1200, 0.8);
    tone.frequency.setValueAtTime(1200, time);
    tone.frequency.exponentialRampToValueAtTime(5700, time + length * unit);
    const envelope = gain(0);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(strength, time + length * unit * 0.86);
    envelope.gain.linearRampToValueAtTime(0, time + length * unit);
    n.connect(tone);
    tone.connect(envelope);
    route(envelope, -0.25, 0.48, 0.08);
    n.start(time, 0, length * unit);
  }

  const harmony = [
    [50, 57, 61, 66, 76],
    [47, 54, 57, 62, 64],
    [43, 54, 59, 61, 69],
    [52, 59, 62, 66, 69],
    [50, 57, 59, 64, 66]
  ];
  const melody = [
    [[0,74,1], [3,69,.73], [5,76,.9], [8,78,1], [10,73,.82], [13,71,.76], [15,80,1], [18,76,.8]],
    [[0,78,.98], [2,74,.74], [5,73,.91], [7,69,.77], [10,66,.9], [12,73,.75], [15,76,1], [17,78,.9], [19,81,.73]],
    [[0,83,1.07], [3,81,.78], [5,78,.84], [8,76,.9], [10,73,.84], [12,74,.78], [15,78,1], [17,81,.9], [19,85,.8]],
    [[0,83,1.04], [2,78,.79], [4,80,.88], [7,81,1], [10,78,.85], [12,76,.79], [14,73,.87], [16,71,.9], [18,76,.89], [19,78,.72]],
    [[0,81,1], [3,78,.87], [5,76,.8], [8,73,.88], [12,74,1.1]]
  ];

  const roots = [38, 35, 31, 40, 38];
  for (let bar = 0; bar < 5; bar++) {
    const base = bar * 3;
    chord(harmony[bar], base, bar === 4 ? 2.65 : 2.9,
      [0.7, 0.82, 1, 1.1, 0.85][bar]);

    for (const [step, midi, velocity] of melody[bar]) {
      bell(midi, base + step * 0.15, velocity, bar === 4 ? 1.65 : 1.3);
    }

    bass(roots[bar], base, bar === 4 ? 1.1 : 0.72);
    if (bar < 4) {
      bass(roots[bar] + 12, base + 1.05, 0.32, 0.64);
      bass(roots[bar] + 7, base + 1.5, 0.38, 0.78);
      bass(roots[bar], base + 1.95, 0.65, 0.88);
      bass(roots[bar] + 12, base + 2.7, 0.25, 0.58);
    } else {
      bass(38, 13.8, 1.05, 0.8);
    }

    const kicks = [
      [0, 10], [0, 7, 10, 17], [0, 10, 13, 18], [0, 7, 10, 16], [0, 10]
    ][bar];
    const rims = [[14], [6, 14], [6, 14], [6, 14, 17, 19], [6]][bar];

    kicks.forEach((step, i) => kick(base + step * 0.15, i === 0 ? 1 : 0.72));
    rims.forEach((step, i) => rim(base + step * 0.15,
      bar === 3 && i > 1 ? 0.43 + i * 0.07 : 0.76));

    for (let step = 0; step < 20; step += 2) {
      if (bar === 0 && step < 4) continue;
      if (bar === 4 && step > 8) continue;
      const offset = step % 4 === 2 ? 0.014 : 0;
      hat(base + step * 0.15 + offset,
        (step % 4 === 0 ? 0.72 : 0.43) * (bar === 0 ? 0.65 : 1),
        bar > 0 && bar < 4 && step === 18);
    }
    if (bar === 3) hat(base + 2.85, 0.42);
  }

  const arpeggios = [
    [57, 61, 64, 66, 69],
    [54, 57, 61, 62, 66],
    [55, 59, 61, 66, 69],
    [52, 59, 62, 66, 69],
    [57, 59, 64, 66, 69]
  ];
  const arpOrder = [0, 2, 4, 1, 3, 2, 1];
  for (let n = 0; n < 34; n++) {
    const s = 0.2 + n * 0.4;
    if (s > 13.3 || (s < 3 && n % 2)) continue;
    const bar = Math.min(4, Math.floor(s / 3));
    const midi = arpeggios[bar][arpOrder[n % arpOrder.length]];
    wood(midi, s, 0.68 + (n % 3 === 0 ? 0.22 : 0), Math.sin(n * 1.8) * 0.58);
  }
  bell(86, 13.8, 0.34, 1.1);
  wood(62, 13.8, 0.85, -0.18);
  breath(5.48, 0.52, 0.026);
  breath(8.4, 0.6, 0.034);
  breath(11.5, 0.5, 0.023);

  const ctx = canvas.getContext("2d");
  const W = 1080, H = 1350, CX = 540, CY = 710;
  const pulse = new Float32Array(5);
  const waveData = new Float32Array(analyser.fftSize);
  const palette = [[35, 48], [169, 24], [17, 48], [39, 50], [173, 23]];
  const colors = palette.map(([h, s]) =>
    Array.from({ length: 80 }, (_, i) =>
      `hsl(${h},${s}%,${24 + i * 0.72}%)`)
  );
  const roman = ["I", "II", "III", "IV", "V"];
  let raf = 0;
  let stopped = false;

  function draw(t) {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(paper, 0, 0);
    pulse.fill(0);
    let heartbeat = 0;
    let low = 0;
    let tick = 0;

    for (const e of events) {
      const age = t - e.t;
      if (age < 0 || age > 2) continue;
      if (e.kind === "lead") pulse[e.petal] += Math.exp(-age * 4.6) * e.velocity;
      if (e.kind === "wood") pulse[e.petal] += Math.exp(-age * 7) * e.velocity * 0.18;
      if (e.kind === "kick") heartbeat += Math.exp(-age * 13) * e.velocity;
      if (e.kind === "bass") low += Math.exp(-age * 5) * e.velocity;
      if (e.kind === "rim") tick += Math.exp(-age * 18) * e.velocity;
    }

    const bloom = (0.59 + 0.41 * smooth(t / 3.1))
      * (1 + 0.035 * smooth((t - 5) / 3))
      * (1 - 0.075 * smooth((t - 13.7) / 1.3));
    const rx = 0.29 + 0.1 * Math.sin(t * 0.39);
    const ry = 0.17 * Math.sin(t * 0.28);
    const rz = 0.035 * t + 0.035 * Math.sin(t * 0.8);
    const sx = Math.sin(rx), cx = Math.cos(rx);
    const sy = Math.sin(ry), cy = Math.cos(ry);
    const sz = Math.sin(rz), cz = Math.cos(rz);

    function project(x, y, z) {
      const yy = y * cx - z * sx;
      const zz = y * sx + z * cx;
      const xx = x * cy + zz * sy;
      const zzz = -x * sy + zz * cy;
      const X = xx * cz - yy * sz;
      const Y = xx * sz + yy * cz;
      const perspective = 1100 / (1100 + zzz);
      return { x: CX + X * perspective, y: CY + Y * perspective, z: zzz };
    }

    function petal(j, u, v = 0) {
      const s = Math.max(0.0001, Math.sin(Math.PI * u));
      const c = Math.cos(Math.PI * u);
      const a = -Math.PI / 2 + j * TAU / 5;
      const flutter = 0.07 * Math.sin(t * 0.63 + j * 1.7);
      const theta = a + 0.43 * c + flutter * s;
      const R = (286 + 7 * Math.sin(t * 0.7 + j)) * bloom;
      const swell = Math.min(1.6, pulse[j]);
      const ripple = swell * 9 * Math.sin(u * 19 - t * 12);
      const r = 62 + R * s ** 0.88 + ripple * s;
      const dr = R * 0.88 * Math.PI * c * s ** -0.12;
      const da = -0.43 * Math.PI * s + flutter * Math.PI * c;
      const tx = dr * Math.cos(theta) - r * Math.sin(theta) * da;
      const ty = dr * Math.sin(theta) + r * Math.cos(theta) * da;
      const norm = Math.hypot(tx, ty) || 1;
      const nx = -ty / norm, ny = tx / norm;
      const twist = TAU * u + j * 0.82 + Math.sin(t * 0.68) * 0.36;
      const width = (5 + 31 * s ** 0.7) * (0.7 + bloom * 0.3);
      const z = 77 * Math.sin(TAU * u)
        + 18 * Math.sin(u * TAU * 3 + j) * s
        + swell * 15 * Math.sin(u * 22 - t * 11) * s;
      return project(
        r * Math.cos(theta) + nx * v * width * Math.cos(twist),
        r * Math.sin(theta) + ny * v * width * Math.cos(twist),
        z + v * width * Math.sin(twist)
      );
    }

    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "rgba(49,66,57,0.14)";
    ctx.beginPath();
    ctx.arc(CX, CY, 407, 0, TAU);
    ctx.stroke();

    for (let k = 0; k < 20; k++) {
      const a = -Math.PI / 2 + k * TAU / 20;
      const major = k % 4 === 0;
      const inner = major ? 393 : 401;
      ctx.strokeStyle = major ? "rgba(49,66,57,0.38)" : "rgba(49,66,57,0.21)";
      ctx.lineWidth = major ? 1.3 : 0.8;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(a) * inner, CY + Math.sin(a) * inner);
      ctx.lineTo(CX + Math.cos(a) * 413, CY + Math.sin(a) * 413);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(49,66,57,0.09)";
    ctx.lineWidth = 0.7;
    for (let j = 0; j < 5; j++) {
      const a = -Math.PI / 2 + j * TAU / 5;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(a) * 73, CY + Math.sin(a) * 73);
      ctx.lineTo(CX + Math.cos(a) * 385, CY + Math.sin(a) * 385);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(CX, CY, 121 + j * 48, a - 0.18, a + 0.44);
      ctx.stroke();
    }

    const clockAngle = -Math.PI / 2 + TAU * t / 3;
    for (let k = 7; k >= 0; k--) {
      const a = clockAngle - k * 0.021;
      ctx.fillStyle = `rgba(177,63,37,${(1 - k / 9) * 0.75})`;
      ctx.beginPath();
      ctx.arc(CX + Math.cos(a) * 407, CY + Math.sin(a) * 407,
        k === 0 ? 4.5 + heartbeat * 2 : 1.5, 0, TAU);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(9, 16);
    ctx.strokeStyle = "rgba(59,43,25,0.045)";
    ctx.lineWidth = 19;
    ctx.shadowColor = "rgba(59,43,25,0.11)";
    ctx.shadowBlur = 17;
    for (let j = 0; j < 5; j++) {
      ctx.beginPath();
      for (let k = 0; k <= 48; k++) {
        const q = petal(j, k / 48);
        if (k) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
      }
      ctx.stroke();
    }
    ctx.restore();

    const segments = 48, bands = 5;
    const faces = [];
    for (let j = 0; j < 5; j++) {
      const grid = [];
      for (let k = 0; k <= segments; k++) {
        const row = [];
        for (let b = 0; b <= bands; b++) {
          row.push(petal(j, k / segments, b / bands * 2 - 1));
        }
        grid.push(row);
      }
      for (let k = 0; k < segments; k++) {
        for (let b = 0; b < bands; b++) {
          const points = [
            grid[k][b], grid[k + 1][b],
            grid[k + 1][b + 1], grid[k][b + 1]
          ];
          const u = (k + 0.5) / segments;
          const sheen = 0.5 + 0.5 * Math.cos(
            TAU * u + j * 0.82 + Math.sin(t * 0.68) * 0.36 - 0.7
          );
          const light = clamp(
            0.13 + sheen * 0.54
            + 0.21 * Math.sin((b + 0.5) / bands * Math.PI)
            + Math.min(pulse[j], 1.5) * 0.075
          );
          faces.push({
            points,
            z: points.reduce((sum, q) => sum + q.z, 0) / 4,
            color: colors[j][Math.floor(light * 79)]
          });
        }
      }
    }
    faces.sort((a, b) => b.z - a.z);
    ctx.lineWidth = 0.42;
    ctx.strokeStyle = "rgba(36,45,35,0.2)";
    for (const face of faces) {
      ctx.beginPath();
      face.points.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
      ctx.closePath();
      ctx.fillStyle = face.color;
      ctx.fill();
      ctx.stroke();
    }

    for (const e of leadNotes) {
      const age = t - e.t;
      if (age < 0 || age > 1.35) continue;
      const origin = petal(e.petal, e.u, 0.12);
      for (const spark of e.sparks) {
        if (age > spark.life) continue;
        const life = age / spark.life;
        const x = origin.x + spark.vx * age;
        const y = origin.y + spark.vy * age + 23 * age * age;
        ctx.globalAlpha = (1 - life) ** 2 * 0.65;
        ctx.strokeStyle = e.petal % 2 ? "#315f56" : "#af482c";
        ctx.lineWidth = spark.size;
        ctx.beginPath();
        ctx.moveTo(x - spark.vx * 0.024, y - spark.vy * 0.024);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.globalAlpha = clamp(1 - age / 0.75);
      const size = 4 + 6 * Math.exp(-age * 13);
      ctx.fillStyle = "#fff8e7";
      ctx.strokeStyle = "#ac442a";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, size, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = "#eee4ce";
    ctx.strokeStyle = "#5c6554";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(CX, CY, 53 + low * 1.4, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(65,73,55,0.45)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(CX, CY, 45, 0, TAU);
    ctx.stroke();

    for (let j = 0; j < 5; j++) {
      const a = -Math.PI / 2 + j * TAU / 5 - t * 0.21;
      const x = CX + Math.cos(a) * 39;
      const y = CY + Math.sin(a) * 39;
      ctx.fillStyle = "#485b4d";
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, TAU);
      ctx.fill();
    }

    analyser.getFloatTimeDomainData(waveData);
    ctx.strokeStyle = "#375d52";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k <= 128; k++) {
      const a = k / 128 * TAU;
      const r = 25 + waveData[(k * 2) % waveData.length] * 38 + heartbeat * 2;
      const x = CX + Math.cos(a) * r;
      const y = CY + Math.sin(a) * r;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "#b84b2b";
    ctx.beginPath();
    ctx.arc(CX, CY, 5 + heartbeat * 3 + tick * 2, 0, TAU);
    ctx.fill();

    const phase = Math.min(4, Math.floor(t / 3));
    ctx.save();
    ctx.translate(936, 147);
    for (let j = 0; j < 5; j++) {
      ctx.save();
      ctx.rotate(j * TAU / 5 + t * 0.045);
      ctx.strokeStyle = j === phase ? "#ae492e" : "rgba(46,66,53,0.45)";
      ctx.fillStyle = j === phase ? "#b65b36" : "#e8dfc9";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, -20, 7, 18, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(49,66,57,0.13)";
    ctx.lineWidth = 0.7;
    for (const y of [1192, 1220, 1248]) {
      ctx.beginPath();
      ctx.moveTo(84, y);
      ctx.lineTo(996, y);
      ctx.stroke();
    }

    for (let bar = 0; bar < 5; bar++) {
      const x = 84 + bar * 912 / 5;
      ctx.strokeStyle = "rgba(49,66,57,0.23)";
      ctx.beginPath();
      ctx.moveTo(x, 1179);
      ctx.lineTo(x, 1257);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.font = "18px Georgia, serif";
      ctx.fillStyle = bar === phase ? "#a3472e" : "rgba(38,54,51,0.46)";
      ctx.fillText(roman[bar], x + 91.2, 1293);
    }
    ctx.textAlign = "left";

    for (const e of events) {
      const x = 84 + e.t / 15 * 912;
      const age = t - e.t;
      if (e.kind === "lead") {
        const y = 1190 + (86 - e.midi) * 2;
        const active = age >= 0 && age < 0.45;
        ctx.fillStyle = active ? "#b64b2b" :
          age >= 0 ? "rgba(41,71,59,0.78)" : "rgba(41,71,59,0.26)";
        ctx.beginPath();
        ctx.arc(x, y, active ? 3.3 + 3 * Math.exp(-age * 12) : 2.5, 0, TAU);
        ctx.fill();
      } else if (e.kind === "kick" || e.kind === "rim") {
        ctx.strokeStyle = age >= 0 ? "rgba(62,72,52,0.65)" : "rgba(62,72,52,0.2)";
        ctx.lineWidth = e.kind === "kick" ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 1248);
        ctx.lineTo(x, e.kind === "kick" ? 1256 : 1242);
        ctx.stroke();
      }
    }

    const cursor = 84 + clamp(t / 15) * 912;
    ctx.strokeStyle = "rgba(174,62,35,0.65)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cursor, 1175);
    ctx.lineTo(cursor, 1262);
    ctx.stroke();
    ctx.fillStyle = "#ae3e23";
    ctx.beginPath();
    ctx.arc(cursor, 1174, 3, 0, TAU);
    ctx.fill();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    for (const source of sources) {
      try { source.stop(); } catch {}
    }
    for (const node of nodes) {
      try { node.disconnect(); } catch {}
    }
  }

  function frame() {
    if (stopped) return;
    const elapsed = (ac.currentTime - t0) / unit;
    draw(clamp(elapsed, 0, 15));
    if (elapsed < 15.08) raf = requestAnimationFrame(frame);
    else stop();
  }

  draw(0);
  raf = requestAnimationFrame(frame);
  return stop;
}