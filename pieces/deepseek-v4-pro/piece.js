export const title = "Noctilucent Circuit";

export function start({ audioContext: ac, canvas, duration, random }) {
  const W = 1080, H = 1350, CX = W / 2, CY = H / 2;
  const painter = canvas.getContext('2d');
  const t0 = ac.currentTime + 0.08;
  const beat = 60 / 90;
  const bar = beat * 4;

  // Master chain
  const master = ac.createGain();
  master.gain.value = 0.82;

  const compressor = ac.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 22;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.27;

  const analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.72;

  master.connect(compressor);
  compressor.connect(ac.destination);
  master.connect(analyser); // visual tap pre-compressor

  // Delay
  const delay = ac.createDelay(1.5);
  delay.delayTime.value = 0.5;
  const delayDamp = ac.createBiquadFilter();
  delayDamp.type = 'lowpass';
  delayDamp.frequency.value = 2400;
  const delayFeedback = ac.createGain();
  delayFeedback.gain.value = 0.30;
  delay.connect(delayDamp);
  delayDamp.connect(delayFeedback);
  delayFeedback.connect(delay);
  const delayWet = ac.createGain();
  delayWet.gain.value = 0.28;
  delay.connect(delayWet);
  delayWet.connect(master);

  // Reverb impulse
  function makeImpulse() {
    const len = Math.floor(ac.sampleRate * 2.2);
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / ac.sampleRate;
      data[i] = (random() * 2 - 1) * Math.exp(-3.6 * t);
    }
    return buffer;
  }
  const reverb = ac.createConvolver();
  reverb.buffer = makeImpulse();
  const reverbWet = ac.createGain();
  reverbWet.gain.value = 0.30;
  reverb.connect(reverbWet);
  reverbWet.connect(master);

  // Synth bus, with delay/reverb sends
  const synthBus = ac.createGain();
  synthBus.gain.value = 0.68;
  synthBus.connect(master);
  const delaySend = ac.createGain();
  delaySend.gain.value = 0.24;
  synthBus.connect(delaySend);
  delaySend.connect(delay);
  const verbSend = ac.createGain();
  verbSend.gain.value = 1.0;
  synthBus.connect(verbSend);
  verbSend.connect(reverb);

  function makeNoiseBuffer() {
    const len = Math.floor(ac.sampleRate * 1.2);
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = random() * 2 - 1;
    return buffer;
  }
  const noiseBuffer = makeNoiseBuffer();

  function mtof(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function playTone(t, {
    freq,
    type = 'sine',
    gain = 0.2,
    dur = 0.2,
    att = 0.005,
    dec = 0.1,
    rel = 0.1,
    filterFreq = 8000,
    filterType = 'lowpass',
    filterQ = 0.5,
    detune = 0,
    pan = 0,
    out = master,
  }) {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.detune.setValueAtTime(detune, t);

    const filter = ac.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, t);
    filter.Q.value = filterQ;

    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(gain, t + att);
    const sustain = Math.max(gain * 0.22, 0.0001);
    env.gain.exponentialRampToValueAtTime(sustain, t + att + dec);
    env.gain.setValueAtTime(sustain, t + dur);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);

    osc.connect(filter);
    filter.connect(env);

    let node = env;
    if (pan !== 0 && ac.createStereoPanner) {
      const panner = ac.createStereoPanner();
      panner.pan.setValueAtTime(pan, t);
      node.connect(panner);
      node = panner;
    }
    node.connect(out);

    osc.start(t);
    osc.stop(t + dur + rel + 0.05);
  }

  function playKick(t, amp = 0.85) {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.13);
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(amp, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(t + 0.5);

    const click = ac.createBufferSource();
    click.buffer = noiseBuffer;
    const clickHP = ac.createBiquadFilter();
    clickHP.type = 'highpass';
    clickHP.frequency.value = 1200;
    const clickGain = ac.createGain();
    clickGain.gain.setValueAtTime(amp * 0.12, t);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    click.connect(clickHP);
    clickHP.connect(clickGain);
    clickGain.connect(master);
    click.start(t, 0, 0.03);
    click.stop(t + 0.04);
  }

  function playSnare(t, amp = 0.26) {
    playTone(t, {
      freq: 180,
      type: 'triangle',
      gain: amp * 0.35,
      dur: 0.12,
      att: 0.001,
      dec: 0.05,
      rel: 0.06,
      filterFreq: 700,
      filterType: 'lowpass',
      out: master,
    });

    const src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.85;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(amp, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    src.connect(filter);
    filter.connect(env);
    env.connect(master);
    src.start(t);
    src.stop(t + 0.25);
  }

  function playHat(t, amp = 0.11, open = false) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(amp, t + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.28 : 0.05));
    src.connect(filter);
    filter.connect(env);
    env.connect(master);
    if (open) src.playbackRate.value = 0.85;
    src.start(t);
    src.stop(t + (open ? 0.32 : 0.07));
  }

  function playBass(t, midi, dur, amp = 0.28) {
    playTone(t, {
      freq: mtof(midi),
      type: 'sine',
      gain: amp,
      dur,
      att: 0.004,
      dec: 0.08,
      rel: 0.11,
      filterFreq: 320,
      filterType: 'lowpass',
      filterQ: 0.4,
      out: master,
    });
    playTone(t, {
      freq: mtof(midi),
      type: 'sawtooth',
      gain: amp * 0.22,
      dur,
      att: 0.004,
      dec: 0.06,
      rel: 0.09,
      filterFreq: 850,
      filterType: 'lowpass',
      filterQ: 0.7,
      detune: -6,
      out: synthBus,
    });
  }

  function playPadNote(t, midi, dur, amp = 0.07) {
    playTone(t, {
      freq: mtof(midi),
      type: 'sawtooth',
      gain: amp,
      dur,
      att: 0.8,
      dec: 0.4,
      rel: 1.6,
      filterFreq: 850 + (midi - 40) * 70,
      filterType: 'lowpass',
      filterQ: 0.35,
      detune: -8,
      pan: -0.25,
      out: synthBus,
    });
    playTone(t, {
      freq: mtof(midi),
      type: 'sawtooth',
      gain: amp,
      dur,
      att: 0.8,
      dec: 0.4,
      rel: 1.6,
      filterFreq: 850 + (midi - 40) * 70,
      filterType: 'lowpass',
      filterQ: 0.35,
      detune: 8,
      pan: 0.3,
      out: synthBus,
    });
  }

  function playArp(t, midi, amp = 0.085, pan = 0) {
    const freq = mtof(midi);
    playTone(t, {
      freq,
      type: 'triangle',
      gain: amp,
      dur: 0.12,
      att: 0.006,
      dec: 0.06,
      rel: 0.08,
      filterFreq: 4200,
      filterType: 'lowpass',
      filterQ: 0.65,
      pan,
      out: synthBus,
    });
    playTone(t, {
      freq: freq * 2,
      type: 'sine',
      gain: amp * 0.3,
      dur: 0.08,
      att: 0.004,
      dec: 0.03,
      rel: 0.05,
      filterFreq: 6800,
      filterType: 'lowpass',
      filterQ: 0.5,
      pan,
      out: synthBus,
    });
  }

  function playLead(t, midi, dur, amp = 0.24) {
    const freq = mtof(midi);
    const carrier = ac.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;

    const modulator = ac.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.value = freq * 2.7;
    const modAmount = ac.createGain();
    modAmount.gain.value = freq * 0.6;
    modulator.connect(modAmount);
    modAmount.connect(carrier.frequency);

    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(amp, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    carrier.connect(env);
    let out = env;
    if (ac.createStereoPanner) {
      const panner = ac.createStereoPanner();
      panner.pan.setValueAtTime(midi % 2 === 0 ? -0.2 : 0.2, t);
      out.connect(panner);
      out = panner;
    }
    out.connect(synthBus);

    carrier.start(t);
    carrier.stop(t + dur + 0.05);
    modulator.start(t);
    modulator.stop(t + dur + 0.05);
  }

  function playRiser(t, dur, amp = 0.24) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(220, t);
    filter.frequency.exponentialRampToValueAtTime(6500, t + dur);

    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(amp, t + dur * 0.82);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function playImpact(t) {
    playKick(t, 1.1);
    playTone(t, {
      freq: mtof(45),
      type: 'sawtooth',
      gain: 0.42,
      dur: 1.3,
      att: 0.006,
      dec: 0.4,
      rel: 1.5,
      filterFreq: 2600,
      filterType: 'lowpass',
      filterQ: 0.4,
      out: master,
    });
    playTone(t, {
      freq: mtof(57),
      type: 'sawtooth',
      gain: 0.28,
      dur: 1.3,
      att: 0.006,
      dec: 0.4,
      rel: 1.5,
      filterFreq: 2600,
      filterType: 'lowpass',
      filterQ: 0.4,
      out: master,
    });
    playTone(t, {
      freq: mtof(62),
      type: 'sine',
      gain: 0.22,
      dur: 1.2,
      att: 0.006,
      dec: 0.35,
      rel: 1.5,
      filterFreq: 5000,
      filterType: 'lowpass',
      filterQ: 0.4,
      out: master,
    });

    const crash = ac.createBufferSource();
    crash.buffer = noiseBuffer;
    crash.loop = true;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.34, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    crash.connect(hp);
    hp.connect(env);
    env.connect(master);
    crash.start(t);
    crash.stop(t + 1.4);
  }

  const chords = [
    { root: 45, chord: [57, 60, 64, 67, 71], arp: [57, 60, 64, 67, 71, 67, 64, 60] },
    { root: 41, chord: [53, 57, 60, 64, 69], arp: [53, 57, 60, 64, 69, 64, 60, 57] },
    { root: 43, chord: [55, 59, 62, 66, 69], arp: [55, 59, 62, 66, 69, 66, 62, 59] },
    { root: 40, chord: [52, 55, 59, 62, 67], arp: [52, 55, 59, 62, 67, 62, 59, 55] },
    { root: 41, chord: [53, 57, 60, 64, 69], arp: [60, 64, 69, 72, 76, 72, 69, 64] },
  ];

  // Pads
  for (let b = 0; b < 5; b++) {
    const start = t0 + b * bar;
    chords[b].chord.forEach(midi => playPadNote(start, midi, bar * 0.98, 0.07));
  }

  // Kick pattern
  for (let b = 0; b < 5; b++) {
    for (let k = 0; k < 4; k++) {
      if (b === 0 && (k === 1 || k === 3)) continue;
      const t = t0 + b * bar + k * beat;
      playKick(t, b === 0 ? 0.6 : 0.85);
    }
  }

  // Snare backbeat
  for (let b = 1; b < 5; b++) {
    playSnare(t0 + b * bar + 1 * beat, 0.26);
    playSnare(t0 + b * bar + 3 * beat, 0.26);
  }

  // Hats
  for (let b = 2; b < 5; b++) {
    for (let k = 0; k < 4; k++) {
      playHat(t0 + b * bar + (k + 0.5) * beat, 0.1, false);
    }
    if (b >= 3) {
      for (let k = 0; k < 4; k++) {
        playHat(t0 + b * bar + (k + 0.25) * beat, 0.04, false);
        playHat(t0 + b * bar + (k + 0.75) * beat, 0.04, false);
      }
    }
  }

  // Bass
  const bassPatterns = [
    [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    [0, 0.75, 1.5, 2.25, 3],
    [0, 0.5, 1, 2, 2.5, 3.5],
  ];
  for (let b = 0; b < 5; b++) {
    const pattern = bassPatterns[b % 3];
    pattern.forEach((offset, idx) => {
      const t = t0 + b * bar + offset * beat;
      const midi = chords[b].root + (idx % 2 === 1 ? 12 : 0);
      playBass(t, midi, 0.16, 0.28);
    });
  }

  // Arpeggios
  for (let b = 0; b < 5; b++) {
    const arpNotes = chords[b].arp;
    for (let i = 0; i < 16; i++) {
      const midi = arpNotes[i % arpNotes.length] + (i % 4 === 3 ? 12 : 0);
      const t = t0 + b * bar + (i * beat) / 4;
      const accent = i % 4 === 0 ? 1.0 : i % 4 === 2 ? 0.7 : 0.45;
      const pan = i % 2 === 0 ? -0.28 : 0.28;
      playArp(t, midi, 0.085 * accent, pan);
    }
  }

  // FM lead melody
  const melody = [
    [2, 0.0, 74, 0.5, 0.48],
    [2, 0.5, 71, 0.3, 0.4],
    [2, 1.0, 72, 0.5, 0.4],
    [2, 1.5, 76, 0.3, 0.4],
    [2, 2.0, 74, 0.5, 0.48],
    [2, 2.5, 72, 0.25, 0.4],
    [2, 3.0, 71, 0.75, 0.44],

    [3, 0.0, 76, 0.5, 0.48],
    [3, 0.5, 74, 0.3, 0.4],
    [3, 1.0, 71, 0.5, 0.4],
    [3, 1.5, 67, 0.3, 0.4],
    [3, 2.0, 76, 0.5, 0.44],
    [3, 2.5, 74, 0.25, 0.4],
    [3, 3.0, 79, 0.75, 0.32],

    [4, 0.0, 69, 0.5, 0.48],
    [4, 0.5, 72, 0.3, 0.4],
    [4, 1.0, 74, 0.5, 0.44],
    [4, 1.75, 71, 0.25, 0.4],
    [4, 2.0, 69, 0.5, 0.4],
    [4, 2.5, 67, 0.25, 0.35],
    [4, 3.0, 69, 0.9, 0.42],
  ];
  for (const [barIdx, offsetBeats, midi, durBeats, amp] of melody) {
    playLead(t0 + barIdx * bar + offsetBeats * beat, midi, durBeats * beat, amp);
  }

  playRiser(t0 + 4 * bar, 2.667, 0.24);
  playImpact(t0 + 5 * bar);

  // -------- Visuals --------
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.fftSize);

  const particles = [];
  for (let i = 0; i < 85; i++) {
    particles.push({
      baseAngle: random() * Math.PI * 2,
      radius: 270 + random() * 320,
      speed: 0.03 + random() * 0.16,
      size: 1 + random() * 3.2,
      phase: random() * Math.PI * 2,
      flatness: 0.62 + random() * 0.25,
    });
  }

  painter.fillStyle = '#030308';
  painter.fillRect(0, 0, W, H);

  function drawFrame(time) {
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);

    const bins = freqData.length;
    const bassEnd = Math.min(8, bins);
    const midStart = 8;
    const midEnd = Math.min(48, bins);
    const highStart = 48;
    const highEnd = Math.min(160, bins);

    let bassSum = 0, midSum = 0, highSum = 0, energySum = 0;
    for (let i = 0; i < bassEnd; i++) bassSum += freqData[i] / 255;
    for (let i = midStart; i < midEnd; i++) midSum += freqData[i] / 255;
    for (let i = highStart; i < highEnd; i++) highSum += freqData[i] / 255;
    for (let i = 0; i < bins; i++) energySum += freqData[i] / 255;

    const bass = bassEnd > 0 ? bassSum / bassEnd : 0;
    const mid = midEnd > midStart ? midSum / (midEnd - midStart) : 0;
    const high = highEnd > highStart ? highSum / (highEnd - highStart) : 0;
    const energy = bins > 0 ? energySum / bins : 0;

    const hue = (time * 16 + mid * 30) % 360;

    painter.globalCompositeOperation = 'source-over';
    painter.fillStyle = 'rgba(3, 3, 8, 0.23)';
    painter.fillRect(0, 0, W, H);

    painter.save();
    painter.translate(CX, CY);

    // Outer woven polygons
    for (let ring = 0; ring < 3; ring++) {
      const sides = [6, 9, 14][ring];
      const radius = 440 + ring * 80 + high * 150 + Math.sin(time * 0.8 + ring * 2.1) * 15;
      const rot = time * (0.06 + ring * 0.04);
      painter.beginPath();
      for (let i = 0; i <= sides; i++) {
        const a = rot + (i * Math.PI * 2) / sides;
        const x = Math.cos(a) * radius;
        const y = Math.sin(a) * radius * 0.82;
        if (i === 0) painter.moveTo(x, y);
        else painter.lineTo(x, y);
      }
      painter.closePath();
      painter.strokeStyle = `hsla(${(hue + ring * 50) % 360}, 72%, 68%, ${0.15 + ring * 0.07})`;
      painter.lineWidth = 1.1 + ring * 0.7;
      painter.setLineDash([12 + ring * 7, 18 + ring * 10]);
      painter.stroke();
    }
    painter.setLineDash([]);

    // Audio waveform ring
    const waveRadius = 340 + energy * 130;
    const wavePoints = 180;
    painter.save();
    painter.beginPath();
    for (let i = 0; i <= wavePoints; i++) {
      const a = (i / wavePoints) * Math.PI * 2 - time * 0.2;
      const idx = Math.floor((i / wavePoints) * (timeData.length - 1));
      const sample = (timeData[idx] - 128) / 128;
      const radius = waveRadius + sample * (36 + bass * 90);
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius * 0.88;
      if (i === 0) painter.moveTo(x, y);
      else painter.lineTo(x, y);
    }
    painter.closePath();
    painter.strokeStyle = `hsla(${(hue + 80) % 360}, 85%, 62%, 0.55)`;
    painter.lineWidth = 2.4;
    painter.shadowColor = `hsla(${(hue + 80) % 360}, 85%, 62%, 0.8)`;
    painter.shadowBlur = 22;
    painter.stroke();
    painter.restore();

    // Inner rings and rotating coordinates
    painter.rotate(time * 0.16);
    for (let k = 0; k < 6; k++) {
      const radius = 180 + k * 40 + mid * 120 + Math.sin(time * 1.7 + k * 1.2) * 12;
      painter.beginPath();
      painter.arc(0, 0, radius, 0, Math.PI * 2);
      painter.strokeStyle = `hsla(${(hue + k * 35) % 360}, 75%, 70%, 0.13)`;
      painter.lineWidth = 5;
      painter.stroke();
    }

    // Petals
    const bloom = 0.72 + bass * 1.7 + Math.sin(time * 1.4) * 0.14;
    const petalCount = 14;
    for (let i = 0; i < petalCount; i++) {
      const baseA = (i / petalCount) * Math.PI * 2 + time * 0.07;
      const half = 0.09 + high * 0.04;
      const a0 = baseA - half;
      const a1 = baseA + half;
      const len = (110 + (i % 5) * 24) * bloom + high * 130 + Math.sin(time * 2.3 + i * 1.9) * 15;
      const inner = (52 + bass * 25) * bloom * 0.85;
      const c1x = Math.cos(a0) * len * 0.52;
      const c1y = Math.sin(a0) * len * 0.52;
      const c2x = Math.cos(a1) * len * 0.52;
      const c2y = Math.sin(a1) * len * 0.52;
      const tipX = Math.cos(baseA) * len;
      const tipY = Math.sin(baseA) * len * 0.92;

      painter.beginPath();
      painter.moveTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
      painter.quadraticCurveTo(c1x, c1y, tipX, tipY);
      painter.quadraticCurveTo(c2x, c2y, Math.cos(a1) * inner, Math.sin(a1) * inner);
      painter.closePath();
      painter.fillStyle = `hsla(${(hue + i * 20) % 360}, 75%, 62%, ${0.08 + high * 0.14})`;
      painter.fill();
      painter.strokeStyle = `hsla(${(hue + i * 20) % 360}, 85%, 72%, ${0.12 + high * 0.2})`;
      painter.lineWidth = 0.8;
      painter.stroke();
    }

    // Particles and central core, additive glow
    painter.globalCompositeOperation = 'lighter';

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const a = p.baseAngle + time * p.speed + bass * 0.05;
      const radius = p.radius + Math.sin(time * 0.5 + p.phase) * 55 + mid * 75;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius * p.flatness;
      painter.beginPath();
      painter.arc(x, y, p.size + high * 3, 0, Math.PI * 2);
      painter.fillStyle = `hsla(${(hue + p.phase * 55) % 360}, 85%, 75%, ${0.35 + high * 0.5})`;
      painter.fill();
    }

    const coreRadius = 48 + bass * 55 + Math.sin(time * 3.5) * 6;
    const coreGrad = painter.createRadialGradient(0, 0, 0, 0, 0, coreRadius * 3);
    coreGrad.addColorStop(0, `hsla(${hue}, 95%, 86%, 0.95)`);
    coreGrad.addColorStop(0.35, `hsla(${hue}, 90%, 65%, 0.75)`);
    coreGrad.addColorStop(1, `hsla(${hue}, 80%, 35%, 0)`);
    painter.beginPath();
    painter.arc(0, 0, coreRadius * 3, 0, Math.PI * 2);
    painter.fillStyle = coreGrad;
    painter.fill();

    painter.globalCompositeOperation = 'source-over';
    painter.restore();

    // Vignette
    const vignette = painter.createRadialGradient(CX, CY, H * 0.35, CX, CY, H * 0.78);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.58)');
    painter.fillStyle = vignette;
    painter.fillRect(0, 0, W, H);

    // Bottom spectral bars
    const barsCount = 80;
    const barWidth = W / barsCount;
    for (let i = 0; i < barsCount; i++) {
      const index = Math.floor((i / barsCount) * bins);
      const value = freqData[index] / 255;
      const h = value * 170;
      painter.fillStyle = `hsla(${(i / barsCount * 90 + hue * 0.5) % 360}, 80%, 60%, 0.5)`;
      painter.fillRect(i * barWidth, H - h, Math.max(1, barWidth - 1), h);
    }

    // Ending fade
    if (time > duration - 1.0) {
      const black = Math.min(1, (time - (duration - 1.0)) / 1.0);
      painter.fillStyle = `rgba(3, 3, 8, ${black})`;
      painter.fillRect(0, 0, W, H);
    }
  }

  function frame() {
    const time = Math.max(0, ac.currentTime - t0);
    if (time > duration + 0.8) return;
    drawFrame(time);
    requestAnimationFrame(frame);
  }
  frame();
}
