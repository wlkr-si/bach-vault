export const title = "A Bell Made of Paper";

export function start({ audioContext, canvas, duration = 15, random }) {
  const ac = audioContext;
  const g = canvas.getContext("2d");
  const TAU = 2 * Math.PI;
  const length = Math.max(0.01, duration);
  const stretch = length / 15;
  const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
  const mix = (a, b, x) => a + (b - a) * x;
  const ease = (a, b, x) => {
    const u = clamp((x - a) / (b - a));
    return u * u * (3 - 2 * u);
  };
  const hz = note => 440 * Math.pow(2, (note - 69) / 12);
  const seconds = beat => 0.5 * beat + 0.12;

  // Each entry gives the onset in beats, MIDI pitch, ring time, and force.
  const porcelain = [
    [0,69,.7,.73], [.75,74,.6,.83], [1.25,76,.4,.57], [1.5,77,.7,.79],
    [2.5,73,.45,.51], [3,69,.65,.67], [3.75,64,.4,.40],
    [4,65,.55,.67], [4.75,69,.55,.82], [5.25,74,.45,.66], [5.5,76,.68,.83],
    [6.5,77,.68,.76], [7.25,72,.52,.61], [7.75,69,.36,.49],
    [8,67,.6,.73], [8.75,74,.6,.83], [9.25,76,.42,.59], [9.5,77,.69,.82],
    [10.5,81,.64,.93], [11.25,79,.48,.68], [11.75,76,.38,.51],
    [12,74,.6,.77], [12.75,70,.49,.67], [13.5,67,.43,.55], [14,73,.68,.88],
    [14.75,76,.45,.74], [15.25,82,.45,.85], [15.75,81,.35,.61],
    [16,77,.68,.91], [16.75,81,.59,.89], [17.25,86,.4,.80], [17.5,88,.62,.97],
    [18.5,89,.61,.87], [19,88,.49,.67], [19.5,84,.34,.62], [19.75,81,.3,.56],
    [20,86,.64,.93], [20.5,89,.49,.86], [21,93,.63,.99], [21.5,88,.46,.76],
    [22,85,.55,.85], [22.5,82,.44,.74], [23,81,.49,.79], [23.5,76,.39,.66],
    [23.75,73,.25,.51], [24,78,1.08,1], [25.25,76,.79,.56],
    [26.25,69,.79,.41], [27.1,74,1.02,.47]
  ];
  const gut = [
    [.5,62,.46,.46], [1.875,57,.46,.51], [2.25,65,.52,.63], [3.3,64,.48,.45],
    [4.35,62,.52,.59], [4.65,65,.55,.70], [5.75,69,.51,.77], [6.25,72,.5,.71],
    [6.75,69,.53,.62], [7.5,64,.46,.61],
    [8.25,58,.57,.71], [8.5,62,.52,.61], [9,64,.51,.65], [9.75,69,.56,.82],
    [10.25,67,.53,.70], [11,70,.52,.76], [11.5,69,.50,.62],
    [12.1,64,.6,.81], [12.45,67,.51,.69], [13,70,.55,.78], [13.85,74,.53,.71],
    [14.11,69,.55,.72], [14.5,67,.49,.79], [15,64,.46,.69], [15.5,61,.47,.72],
    [16.05,65,.68,.87], [16.5,69,.53,.83], [17,72,.48,.86], [17.75,74,.63,.93],
    [18,76,.43,.81], [18.25,72,.48,.79], [18.75,69,.47,.77], [19.25,65,.48,.82],
    [20.04,65,.72,.94], [20.25,69,.50,.85], [20.75,74,.47,.85],
    [21.25,72,.53,.79], [21.75,70,.48,.74],
    [22.06,57,.6,.93], [22.25,64,.52,.8], [22.75,67,.53,.80],
    [23.25,70,.46,.75], [23.75,64,.46,.79],
    [24.01,62,1.06,.95], [24.08,69,1,.86], [24.16,76,.99,.76], [24.27,81,.93,.68],
    [26,62,.88,.43]
  ];
  const ground = [
    [0,38,.9,.69], [2.75,45,.53,.45], [4,34,.96,.73], [6.75,41,.49,.53],
    [8,43,.83,.86], [10.75,50,.54,.55], [12,40,.75,.74], [14,45,.66,.77],
    [15.5,33,.46,.53], [16,41,.88,.91], [18.25,45,.59,.69], [20,34,.82,.91],
    [21.5,41,.48,.62], [22,45,.67,.77], [23.25,33,.57,.81],
    [24,38,1.45,1], [26,50,.85,.45]
  ];
  const air = [
    [1.4,2.5,.20,[57,64]], [4,3.65,.27,[53,57,62,64]],
    [8,3.65,.33,[58,62,64,69]], [11.8,2.05,.33,[55,58,62]],
    [13.8,2.15,.37,[55,58,61,64]], [15.85,4.1,.46,[53,57,60,64,69]],
    [19.85,2.08,.46,[53,57,62,64]], [21.85,2.2,.49,[55,58,61,64]],
    [23.93,3.85,.48,[54,57,62,64,69]]
  ];
  const brushes = [
    [1.875,.22], [3.75,.28], [4.625,.22], [6.25,.26], [7.75,.32],
    [8.5,.27], [9.75,.31], [11.5,.34], [12.45,.33], [13.85,.32], [15.5,.47],
    [16,.51], [16.5,.35], [17.75,.41], [18.25,.31], [19.5,.38],
    [20,.54], [20.75,.38], [21.5,.43], [21.75,.30], [22,.42],
    [22.75,.36], [23.25,.31], [23.75,.44], [24,.56]
  ];

  const dry = ac.createGain();
  const send = ac.createGain();
  const wet = ac.createGain();
  const room = ac.createConvolver();
  const limiter = ac.createDynamicsCompressor();
  const output = ac.createGain();
  dry.gain.value = 0.89;
  wet.gain.value = 0.43;
  limiter.threshold.value = -16;
  limiter.knee.value = 14;
  limiter.ratio.value = 2.5;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.14;
  dry.connect(limiter);
  send.connect(room);
  room.connect(wet);
  wet.connect(limiter);
  limiter.connect(output);
  output.connect(ac.destination);

  const sr = ac.sampleRate;
  const impulse = ac.createBuffer(2, Math.ceil(sr * 2.55), sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    let low = 0;
    let energy = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      const white = random() * 2 - 1;
      low += (white - low) * 0.21;
      const rise = clamp((t - 0.023) / 0.079);
      const sample = (0.44 * white + 0.56 * low) * rise * Math.exp(-3.95 * t);
      data[i] = sample;
      energy += sample * sample;
    }
    const normalization = 0.61 / Math.sqrt(energy);
    for (let i = 0; i < data.length; i++) data[i] *= normalization;
    for (const [delay, level] of [[.018,.16], [.031,.12], [.047,-.084], [.068,.07]]) {
      const offset = Math.floor(sr * (delay + ch * 0.0047));
      for (let i = 0; i < 9; i++) data[offset + i] += level * Math.exp(-i * 0.43);
    }
  }
  room.normalize = false;
  room.buffer = impulse;

  const noise = ac.createBuffer(1, Math.ceil(sr * 1.45), sr);
  const noiseData = noise.getChannelData(0);
  let noiseLow = 0;
  for (let i = 0; i < noiseData.length; i++) {
    const white = random() * 2 - 1;
    noiseLow += 0.16 * (white - noiseLow);
    noiseData[i] = white * 0.8 + noiseLow * 0.2;
  }

  const paper = typeof OffscreenCanvas === "function"
    ? new OffscreenCanvas(1080, 1350)
    : document.createElement("canvas");
  paper.width = 1080;
  paper.height = 1350;
  const pg = paper.getContext("2d");
  const grain = pg.createImageData(1080, 1350);
  let grainState = (random() * 4294967296) >>> 0;
  for (let y = 0, i = 0; y < 1350; y++) {
    for (let x = 0; x < 1080; x++, i += 4) {
      grainState = (Math.imul(1664525, grainState) + 1013904223) >>> 0;
      const speck = ((grainState >>> 24) / 255 - 0.5) * 13;
      const light = 5 * Math.sin(x / 1080 * Math.PI * 0.93 + 0.12)
        - 8 * (y / 1350) ** 2 - 3 * ((x - 470) / 650) ** 2;
      grain.data[i] = 239 + light + speck;
      grain.data[i + 1] = 231 + light + speck;
      grain.data[i + 2] = 211 + light + 1.13 * speck;
      grain.data[i + 3] = 255;
    }
  }
  pg.putImageData(grain, 0, 0);
  pg.lineWidth = 0.5;
  for (let i = 0; i < 1900; i++) {
    const x = random() * 1080;
    const y = random() * 1350;
    pg.strokeStyle = i % 3 ? "rgba(91,60,41,.065)" : "rgba(255,251,229,.36)";
    pg.beginPath();
    pg.moveTo(x, y);
    pg.lineTo(x + 1 + 5 * random(), y + 1.2 * (random() - 0.5));
    pg.stroke();
  }
  pg.fillStyle = "#222d30";
  pg.font = '100px Georgia, "Times New Roman", serif';
  pg.fillText("A Bell Made", 77, 144);
  pg.font = 'italic 104px Georgia, "Times New Roman", serif';
  pg.fillText("of Paper", 77, 236);

  pg.strokeStyle = "rgba(45,53,50,.36)";
  pg.lineWidth = 1;
  pg.beginPath();
  pg.moveTo(83, 273.5);
  pg.lineTo(997, 273.5);
  pg.moveTo(83, 1101.5);
  pg.lineTo(997, 1101.5);
  pg.moveTo(83, 1251.5);
  pg.lineTo(997, 1251.5);
  pg.stroke();

  for (let i = 0; i < 29; i++) {
    const y = 329.5 + i * 25;
    const width = i % 4 === 0 ? 10 : 4;
    pg.strokeStyle = `rgba(58,63,56,${i % 4 === 0 ? 0.27 : 0.14})`;
    pg.beginPath();
    pg.moveTo(83, y);
    pg.lineTo(83 + width, y);
    pg.moveTo(997 - width, y);
    pg.lineTo(997, y);
    pg.stroke();
  }

  // The five holes in the plate carry the opening figure.
  pg.strokeStyle = "rgba(45,53,50,.28)";
  pg.beginPath();
  pg.ellipse(934, 177, 45, 45, 0, 0, TAU);
  pg.moveTo(934, 124);
  pg.lineTo(934, 230);
  pg.moveTo(881, 177);
  pg.lineTo(987, 177);
  pg.stroke();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI * 0.84 + i * 0.73;
    const r = 21 + (porcelain[i][1] - 69) * 1.68;
    pg.fillStyle = i === 3 ? "#a34f37" : "#354747";
    pg.beginPath();
    pg.arc(934 + r * Math.cos(a), 177 + r * Math.sin(a), i === 3 ? 3.9 : 2.6, 0, TAU);
    pg.fill();
  }

  function position(pan, reverb) {
    const node = ac.createStereoPanner();
    const tap = ac.createGain();
    node.pan.value = pan;
    tap.gain.value = reverb;
    node.connect(dry);
    node.connect(tap);
    tap.connect(send);
    return node;
  }

  const ceramicPartials = [
    [1,1,1], [2.002,.34,.64], [2.997,.17,.46],
    [4.217,.082,.31], [5.389,.055,.24], [7.689,.031,.18]
  ];
  const stringPartials = [
    [1,1,1], [2,.62,.71], [3.001,.39,.54], [4.004,.25,.43],
    [5.007,.16,.35], [6.013,.092,.28], [7.02,.077,.23], [9.041,.047,.17]
  ];
  const bassPartials = [[1,1,1], [2,.49,.63], [3.002,.16,.43], [4.012,.065,.25]];
  const epoch = ac.currentTime + 0.065;
  const at = beat => epoch + seconds(beat) * stretch;

  function struck(noteEvent, kind, index) {
    const [beat, note, ring, force] = noteEvent;
    const time = at(beat);
    const fundamental = hz(note);
    const ceramic = kind === 0;
    const bass = kind === 2;
    const partials = ceramic ? ceramicPartials : bass ? bassPartials : stringPartials;
    const pan = ceramic ? 0.16 + 0.27 * Math.sin(index * 1.31)
      : bass ? 0.055 * Math.sin(index * 1.9) : -0.31 + 0.15 * Math.sin(index * 0.83);
    const bus = position(pan, ceramic ? 0.62 : bass ? 0.19 : 0.36);
    const hit = (ceramic ? 0.112 : bass ? 0.158 : 0.075) * force
      * (ceramic ? Math.pow(0.986, Math.max(0, note - 77)) : 1);
    const detune = (random() - 0.5) * (bass ? 1.4 : 4.2);

    for (const [ratio, level, decay] of partials) {
      if (fundamental * ratio > Math.min(10200, sr * 0.42)) continue;
      const oscillator = ac.createOscillator();
      const envelope = ac.createGain();
      const attack = (bass ? 0.014 : ceramic ? 0.0037 : 0.0055) * stretch;
      const end = time + (ring * decay + (bass ? 0.23 : 0.13)) * stretch;
      const peak = hit * level;
      oscillator.frequency.value = fundamental * ratio;
      oscillator.detune.setValueAtTime(detune + (bass ? 37 : ceramic ? 2 : 12), time);
      oscillator.detune.setTargetAtTime(detune, time, 0.029 * stretch);
      envelope.gain.setValueAtTime(0.00001, time);
      envelope.gain.exponentialRampToValueAtTime(peak, time + attack);
      envelope.gain.exponentialRampToValueAtTime(
        peak * (ceramic && ratio === 1 ? 0.54 : 0.36),
        time + (end - time) * 0.21
      );
      envelope.gain.exponentialRampToValueAtTime(0.00001, end);
      oscillator.connect(envelope);
      envelope.connect(bus);
      oscillator.start(time);
      oscillator.stop(end + 0.01);
    }
  }

  function brushed(time, span, level, pan, low, high, swelling = false) {
    const source = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const envelope = ac.createGain();
    const bus = position(pan, swelling ? 0.71 : 0.35);
    const end = time + span * stretch;
    source.buffer = noise;
    source.loop = true;
    filter.type = "bandpass";
    filter.Q.value = swelling ? 0.72 : 1.24;
    filter.frequency.setValueAtTime(low, time);
    filter.frequency.exponentialRampToValueAtTime(high, end);
    envelope.gain.setValueAtTime(0.00001, time);
    envelope.gain.exponentialRampToValueAtTime(
      level, time + (end - time) * (swelling ? 0.87 : 0.1)
    );
    envelope.gain.exponentialRampToValueAtTime(0.00001, end);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(bus);
    source.start(time, random() * 0.9);
    source.stop(end);
  }

  porcelain.forEach((event, i) => struck(event, 0, i));
  gut.forEach((event, i) => struck(event, 1, i));
  ground.forEach((event, i) => struck(event, 2, i));
  brushes.forEach(([beat, level], i) => {
    brushed(at(beat), 0.07 + level * 0.19, level * 0.105,
      0.53 * Math.sin(i * 2.17), 3650 - level * 900, 1160);
  });
  brushed(at(14.26), 0.83, 0.043, -0.27, 620, 2250, true);
  brushed(at(22.32), 0.80, 0.056, 0.26, 410, 2600, true);
  brushed(at(24), 0.28, 0.093, 0.04, 540, 123);

  for (const [beat, hold, force, notes] of air) {
    notes.forEach((note, i) => {
      const t = at(beat + i * 0.061);
      const attack = (0.24 + 0.048 * i) * stretch;
      const release = at(beat + hold) + 0.34 * stretch;
      const bus = position((i / (notes.length - 1) - 0.5) * 1.44, 0.83);
      const body = ac.createGain();
      const tremor = ac.createOscillator();
      const depth = ac.createGain();
      const peak = force * 0.05 / Math.sqrt(notes.length / 2);
      tremor.frequency.value = 4.1 + random() * 1.5;
      depth.gain.value = 3 + random() * 4;
      tremor.connect(depth);
      body.gain.setValueAtTime(0.00001, t);
      body.gain.exponentialRampToValueAtTime(peak, t + attack);
      body.gain.linearRampToValueAtTime(peak * 0.67, release - 0.26 * stretch);
      body.gain.exponentialRampToValueAtTime(0.00001, release);
      body.connect(bus);

      for (const [ratio, level, cent] of [[1,.74,-5], [1,.53,5], [2,.28,1], [3,.095,-3]]) {
        const wave = ac.createOscillator();
        const gain = ac.createGain();
        wave.frequency.value = hz(note) * ratio;
        wave.detune.value = cent;
        gain.gain.value = level;
        depth.connect(wave.detune);
        wave.connect(gain);
        gain.connect(body);
        wave.start(t);
        wave.stop(release);
      }
      tremor.start(t);
      tremor.stop(release);
    });
  }
  output.gain.setValueAtTime(0.92, epoch);
  output.gain.setValueAtTime(0.92, epoch + length * 0.969);
  output.gain.linearRampToValueAtTime(0, epoch + length);

  const panelColors = [
    [31,55,62], [48,86,88], [42,63,75], [130,67,47],
    [47,62,73], [29,59,65], [108,60,49], [41,77,82]
  ];
  const innerColors = [
    [165,147,112], [200,167,122], [109,132,126], [193,117,80],
    [191,164,119], [98,127,126], [205,138,95], [165,153,119]
  ];
  const panelCount = panelColors.length;
  const rows = 26;
  const columns = 7;
  const fragments = [];
  porcelain.forEach(([beat, note, , force], i) => {
    if (beat < 4 || (beat < 16 && i % 3 !== 0)) return;
    const count = beat === 24 ? 11 : beat >= 16 && beat <= 23 ? 3 : 1;
    for (let j = 0; j < count; j++) {
      fragments.push({
        time: seconds(beat) + j * 0.014,
        angle: note * 0.39 + random() * (count > 3 ? TAU : 0.92),
        speed: 32 + random() * 152 * force,
        lift: 40 + random() * 163,
        roll: (random() - 0.5) * 8.7,
        size: 2 + random() * (count > 3 ? 13 : 8),
        life: 0.62 + random() * 0.73,
        warm: random() > 0.4
      });
    }
  });

  function line(a, b, color, width) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(a.X, a.Y);
    g.lineTo(b.X, b.Y);
    g.stroke();
  }

  function score(t) {
    const x0 = 83;
    const x1 = 997;
    const top = 1134;
    const bottom = 1226;
    const xAt = when => mix(x0, x1, clamp(when / 15));
    const cross = xAt(t);
    const voices = [porcelain, gut, ground];
    const pitches = [[64,93],[57,81],[33,50]];
    const indents = [1152,1180,1209];
    for (let i = 0; i < 3; i++) {
      const y = indents[i];
      line({ X:x0, Y:y }, { X:x1, Y:y }, "rgba(58,62,53,.19)", 0.75);
      line({ X:x0, Y:y }, { X:cross, Y:y }, "rgba(49,71,70,.42)", 0.9);
      let previous;
      voices[i].forEach(([beat, note, , force]) => {
        const time = seconds(beat);
        const x = xAt(time);
        const [low, high] = pitches[i];
        const markY = y + mix(8, -8, (note - low) / (high - low));
        const age = t - time;
        if (previous && i !== 2 && x - previous.X < 52) {
          line(previous, { X:x, Y:markY }, age > 0
            ? "rgba(39,66,67,.29)" : "rgba(66,66,55,.11)", 0.8);
        }
        previous = { X:x, Y:markY };
        const live = age >= 0 ? Math.exp(-age * 13) : 0;
        g.fillStyle = live > 0.16 ? "#aa4e33"
          : age >= 0 ? (i === 0 ? "#27474b" : "#645447") : "rgba(53,58,48,.23)";
        g.beginPath();
        if (i === 2) {
          g.rect(x - 1.1 - live, markY - 3 - force, 2.2 + 2 * live, 6 + 2 * force);
        } else {
          g.ellipse(x, markY, 1.3 + force + 2.2 * live,
            1.05 + force * 0.54 + 1.75 * live, -0.44, 0, TAU);
        }
        g.fill();
      });
    }
    for (let beat = 0; beat <= 28; beat += 4) {
      const x = xAt(seconds(beat));
      line({ X:x, Y:top }, { X:x, Y:top + 4 }, "rgba(43,58,57,.46)", 1);
      line({ X:x, Y:bottom - 4 }, { X:x, Y:bottom }, "rgba(43,58,57,.46)", 1);
    }
    if (t >= 0) {
      line({ X:cross, Y:top - 1 }, { X:cross, Y:bottom + 1 }, "rgba(154,70,46,.72)", 1);
      g.fillStyle = "#9b4f39";
      g.beginPath();
      g.arc(cross, top - 3, 2.05, 0, TAU);
      g.fill();
    }
  }

  function draw(t) {
    g.setTransform(canvas.width / 1080, 0, 0, canvas.height / 1350, 0, 0);
    g.drawImage(paper, 0, 0);
    let pressure = 0;
    let answer = 0;
    for (const [beat, , , force] of ground) {
      const age = t - seconds(beat);
      if (age >= 0 && age < 1.4) {
        pressure += force * age * 14 * Math.exp(-age * 7.8);
      }
    }
    for (const [beat, , , force] of gut) {
      const age = t - seconds(beat);
      if (age >= 0 && age < 0.5) answer += force * age * 10 * Math.exp(-age * 13);
    }

    const final = ease(11.95, 12.78, t);
    const settle = ease(13.18, 15, t);
    const open = 0.27 + 0.19 * ease(0, 2.3, t) + 0.14 * ease(3.85, 5.6, t)
      - 0.18 * (ease(5.9, 6.8, t) - ease(7.6, 8.45, t))
      + 0.19 * ease(7.7, 10.3, t) + 0.25 * final - 0.15 * settle + 0.065 * pressure;
    const yaw = -0.56 + 0.43 * t + 0.39 * Math.sin(t * 0.83)
      + 0.53 * final - 0.24 * settle;
    const tilt = 0.28 + 0.12 * Math.sin(t * 0.91 + 0.3)
      + 0.28 * final - 0.13 * settle + 0.05 * pressure;
    const swing = -0.085 + 0.15 * Math.sin(1.24 * t - 0.7) * (1 - 0.64 * final)
      + 0.12 * final + 0.036 * answer;
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    const ctilt = Math.cos(tilt), stilt = Math.sin(tilt);
    const cswing = Math.cos(swing), sswing = Math.sin(swing);
    const cx = 540 + 20 * Math.sin(t * 0.78) * (1 - 0.65 * final);
    const cy = 670 - 10 * pressure + 16 * final;
    const tall = 501 - 34 * open + 11 * answer;
    const twist = 1.21 - 0.39 * open + 0.21 * Math.sin(t * 1.17) + 0.15 * answer;

    function project(x, y, z) {
      const x1 = x * cyaw + z * syaw;
      const z1 = z * cyaw - x * syaw;
      const y2 = y * ctilt - z1 * stilt;
      const z2 = y * stilt + z1 * ctilt;
      const xx = x1 * cswing - y2 * sswing;
      const yy = x1 * sswing + y2 * cswing;
      const p = 1470 / (1470 - z2);
      return { x: xx, y: yy, z: z2, X: cx + xx * p, Y: cy + yy * p };
    }

    const lipY = tall * 0.49;
    const groundShadow = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    groundShadow.addColorStop(0, `rgba(67,55,43,${0.13 + 0.065 * open})`);
    groundShadow.addColorStop(0.55, "rgba(79,64,47,.065)");
    groundShadow.addColorStop(1, "rgba(79,64,47,0)");
    g.save();
    g.translate(cx + 35, 1034 + 8 * final);
    g.scale(104 + 279 * open, 19 + 11 * open);
    g.fillStyle = groundShadow;
    g.fillRect(-1, -1, 2, 2);
    g.restore();

    for (const [beat, , , force] of ground) {
      const age = t - seconds(beat);
      if (age < 0 || age > 1.08 || force < 0.65) continue;
      for (let band = 0; band < 2; band++) {
        const radius = (34 + 224 * open) * (0.69 + age * 1.63 - band * 0.105);
        const alpha = Math.sin(Math.PI * clamp(age / 1.08)) * force * (band ? 0.13 : 0.24);
        g.lineWidth = band ? 0.75 : 1.25;
        g.strokeStyle = `rgba(118,76,53,${alpha})`;
        g.beginPath();
        for (let j = 0; j <= 80; j++) {
          const a = j * TAU / 80;
          const r = radius + 3.5 * Math.sin(7 * a - 13 * age);
          const p = project(r * Math.cos(a), lipY + 22 + age * 104 + band * 9, r * Math.sin(a));
          if (j === 0 || j % 20 === 0) g.moveTo(p.X, p.Y);
          else g.lineTo(p.X, p.Y);
        }
        g.stroke();
      }
    }

    const neck = project(0, -0.52 * tall, 0);
    const pin = { X: 540, Y: 321 };
    g.beginPath();
    g.moveTo(pin.X, pin.Y);
    g.quadraticCurveTo(544 - 18 * swing, (321 + neck.Y) * 0.5, neck.X, neck.Y);
    g.strokeStyle = "rgba(60,67,60,.58)";
    g.lineWidth = 1.15;
    g.stroke();
    g.strokeStyle = "#77634c";
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(pin.X, pin.Y, 4.4, 0, TAU);
    g.stroke();
    line({ X:pin.X - 17, Y:pin.Y }, { X:pin.X - 8, Y:pin.Y }, "rgba(71,75,62,.48)", 1);
    line({ X:pin.X + 8, Y:pin.Y }, { X:pin.X + 17, Y:pin.Y }, "rgba(71,75,62,.48)", 1);

    const faces = [];
    const rowWave = new Float64Array(rows + 1);
    const ringing = new Float64Array(panelCount);
    for (const [beat, note, , force] of porcelain) {
      const age = t - seconds(beat);
      if (age < 0 || age > 0.83) continue;
      const a = Math.min(1, age / 0.045) * force * Math.exp(-age * 4.6);
      ringing[note % panelCount] += a;
      for (let k = 0; k <= rows; k++) {
        const v = k / rows;
        const d = v - age * 1.79;
        rowWave[k] += a * Math.exp(-17 * d * d) * Math.sin(22 * d);
      }
    }

    for (let panel = 0; panel < panelCount; panel++) {
      const points = [];
      const angle = panel * TAU / panelCount;
      for (let k = 0; k <= rows; k++) {
        const v = k / rows;
        const flare = Math.pow(v, 3.5);
        const shoulder = Math.pow(Math.sin(Math.PI * v), 1.58);
        const wave = rowWave[k];
        const body = 24 + 26 * v + (41 + 86 * open) * shoulder
          + open * (47 * v + 223 * flare);
        const turn = twist * (1 - Math.pow(1 - v, 1.48)) + 0.27 * Math.sin(Math.PI * v);
        const gap = 0.045 + 0.112 * flare + 0.034 * open * v;
        const wobble = 0.034 * Math.sin(v * 9 - 4 * t + panel * 0.93) * v;
        for (let j = 0; j <= columns; j++) {
          const u = j / columns;
          const fold = Math.sin(Math.PI * u) ** 1.18;
          const theta = angle + turn + wobble + (gap * 0.5 + u * (1 - gap)) * TAU / panelCount;
          const ridge = (16 + 25 * open) * fold + (u - 0.48) * (19 + 14 * open);
          const asymmetry = Math.cos(theta * 2 - 0.7) * flare * (27 + 21 * open);
          const radius = body + ridge * (0.14 + 0.86 * v) + asymmetry
            + wave * (10 + 15 * v) * Math.cos(theta * 3 + 1.1);
          const y = (v - 0.52) * tall
            + flare * (26 * fold + 24 * Math.sin(theta * 2 + 0.35) + 11 * Math.sin(angle * 3))
            + 10 * wave * v;
          points.push(project(radius * Math.cos(theta), y, radius * Math.sin(theta)));
        }
      }
      const stride = columns + 1;
      for (let k = 0; k < rows; k++) {
        for (let j = 0; j < columns; j++) {
          const id = k * stride + j;
          const a = points[id], b = points[id + 1];
          const c = points[id + stride + 1], d = points[id + stride];
          faces.push({ a, b, c, d, z: (a.z + b.z + c.z + d.z) * 0.25, panel, k, j });
        }
      }
    }

    // The clapper is suspended inside the same mesh and shares its occlusion.
    const clapperX = 22 * Math.sin(t * 3.9) * (0.34 + pressure + final * 0.72);
    const clapperZ = 12 * Math.sin(t * 4.7 + 0.9);
    const clapperY = lipY + 5 - 12 * open - 16 * pressure;
    const clapperProfile = [[-56,6],[-45,8],[-32,13],[-13,21],[4,23],[21,15],[29,4]];
    const clapper = clapperProfile.map(([y, r]) => Array.from({ length: 13 }, (_, j) => {
      const theta = j * TAU / 12;
      return project(clapperX + r * Math.cos(theta), clapperY + y,
        clapperZ + r * Math.sin(theta));
    }));
    for (let k = 0; k < clapper.length - 1; k++) {
      for (let j = 0; j < 12; j++) {
        const a = clapper[k][j], b = clapper[k][j + 1];
        const c = clapper[k + 1][j + 1], d = clapper[k + 1][j];
        faces.push({ a, b, c, d, z: (a.z + b.z + c.z + d.z) * 0.25, panel: -1, k, j });
      }
    }

    faces.sort((a, b) => a.z - b.z);
    g.lineJoin = "round";
    for (const { a, b, c, d, panel, k, j } of faces) {
      const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z;
      const fx = d.x - a.x, fy = d.y - a.y, fz = d.z - a.z;
      let nx = fy * ez - fz * ey, ny = fz * ex - fx * ez, nz = fx * ey - fy * ex;
      const norm = Math.hypot(nx, ny, nz) || 1;
      const outside = nz >= 0;
      const sign = outside ? 1 : -1;
      nx *= sign / norm;
      ny *= sign / norm;
      nz *= sign / norm;
      const diffuse = clamp(-0.46 * nx - 0.57 * ny + 0.67 * nz);
      const bounce = clamp(0.81 * nx + 0.19 * ny + 0.2 * nz);
      const highlight = Math.pow(diffuse, panel < 0 ? 8 : 5);
      const base = panel < 0 ? [146, 87, 45] : outside ? panelColors[panel] : innerColors[panel];
      const note = panel < 0 ? pressure : ringing[panel];
      const ridge = panel >= 0 && j === 0 ? 0.91 : 1;
      const incised = panel >= 0 ? 1 + 0.017 * Math.sin(k * 2.1 + panel) : 1;
      const shade = (0.47 + 0.55 * diffuse + 0.14 * bounce) * ridge * incised;
      const warm = 37 * highlight + 32 * note + final * 12 * diffuse;
      const red = base[0] * shade + warm + 3;
      const green = base[1] * shade + warm * 0.72 + 4;
      const blue = base[2] * shade + warm * 0.43 + 5;
      const color = `rgb(${Math.round(red)},${Math.round(green)},${Math.round(blue)})`;
      g.fillStyle = g.strokeStyle = color;
      g.lineWidth = 0.68;
      g.beginPath();
      g.moveTo(a.X, a.Y);
      g.lineTo(b.X, b.Y);
      g.lineTo(c.X, c.Y);
      g.lineTo(d.X, d.Y);
      g.closePath();
      g.fill();
      g.stroke();

      if (panel >= 0) {
        if (j === 0 || j === columns - 1) {
          const color = `rgba(238,200,142,${0.20 + 0.35 * diffuse + 0.22 * note})`;
          if (j === 0) line(a, d, color, 0.83);
          else line(b, c, color, 1.02);
        } else {
          line(a, d, outside ? "rgba(221,210,170,.15)" : "rgba(70,57,49,.19)", 0.54);
        }
        if (k % 4 === 0 && k > 0) {
          line(a, b, outside ? "rgba(7,25,30,.24)" : "rgba(72,53,36,.21)", 0.56);
        }
        if (k === rows - 1) {
          line(d, c, `rgba(241,203,148,${0.45 + 0.39 * diffuse})`, 1.37);
        }
      }
    }

    for (const shard of fragments) {
      const age = t - shard.time;
      if (age < 0 || age > shard.life) continue;
      const a = shard.angle + 0.38 * age * shard.roll;
      const r = (0.75 + 0.25 * Math.sin(shard.angle * 3)) * (59 + 257 * open)
        + age * shard.speed;
      const y = lipY + age * (shard.lift - 96 * age);
      const point = project(r * Math.cos(a), y, r * Math.sin(a));
      if (point.Y > 1080 || point.X < 95 || point.X > 985) continue;
      const fade = ease(0, 0.08, age) * (1 - ease(shard.life * 0.37, shard.life, age));
      const w = shard.size * (0.22 + 0.78 * Math.abs(Math.cos(a + 7 * age)));
      g.save();
      g.translate(point.X, point.Y);
      g.rotate(a + age * shard.roll);
      g.fillStyle = shard.warm
        ? `rgba(153,73,47,${0.79 * fade})` : `rgba(44,74,77,${0.72 * fade})`;
      g.beginPath();
      g.moveTo(-w, 0);
      g.quadraticCurveTo(-w * 0.24, -shard.size * 0.43, w, -1);
      g.lineTo(w * 0.35, shard.size * 0.36);
      g.closePath();
      g.fill();
      g.restore();
    }

    score(t);
  }

  function frame() {
    const elapsed = ac.currentTime - epoch;
    draw(Math.min(15, elapsed / stretch));
    if (elapsed < length) requestAnimationFrame(frame);
  }
  frame();
}