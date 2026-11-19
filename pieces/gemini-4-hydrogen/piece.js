export const title = "The Celestial Escapement";

export function start({ audioContext, canvas, duration = 15, random = Math.random }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width || 1080;
  const H = canvas.height || 1350;
  const REF_W = 1080;
  const REF_H = 1350;
  const dur = Math.max(1, duration || 15);
  const beat = dur / 32; // 8 bars of 4/4 -> exact 128 BPM at 15s

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  // --- Utilities ---
  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const pitchToFifthIndex = (midi) => (((midi % 12) - 2 + 12) * 7) % 12;

  // --- Master Audio Routing ---
  const t0 = audioContext.currentTime + 0.035;
  const endTime = t0 + dur;

  const masterGain = audioContext.createGain();
  masterGain.gain.setValueAtTime(0.0001, t0);
  masterGain.gain.linearRampToValueAtTime(0.84, t0 + 0.04);
  masterGain.gain.setValueAtTime(0.84, Math.max(t0 + 0.05, endTime - 0.18));
  masterGain.gain.linearRampToValueAtTime(0.0001, endTime);

  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-14, t0);
  compressor.knee.setValueAtTime(16, t0);
  compressor.ratio.setValueAtTime(3.2, t0);
  compressor.attack.setValueAtTime(0.006, t0);
  compressor.release.setValueAtTime(0.16, t0);

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.82;

  compressor.connect(masterGain);
  masterGain.connect(analyser);
  analyser.connect(audioContext.destination);

  const dryBus = audioContext.createGain();
  dryBus.gain.value = 1.0;
  dryBus.connect(compressor);

  // --- Algorithmic Warm Stereo Concert Hall Reverb ---
  const createReverbImpulse = (seconds = 2.4) => {
    const sr = audioContext.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = audioContext.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const u = i / len;
        const env = Math.pow(1 - u, 2.8) * 0.72 + Math.exp(-u * 14) * 0.28;
        const n = random() * 2 - 1;
        // Progressive high-frequency damping so tail feels like warm wood & stone
        const damp = 0.22 + 0.45 * (1 - u);
        lp = lp + damp * (n - lp);
        data[i] = lp * env;
      }
      // Subtle early reflection taps
      const taps = [0.013, 0.021, 0.034, 0.049, 0.068];
      for (let k = 0; k < taps.length; k++) {
        const idx = Math.floor((taps[k] + ch * 0.003) * sr);
        if (idx < len) data[idx] += (random() * 0.4 + 0.35) * Math.pow(0.75, k);
      }
    }
    return buf;
  };

  const convolver = audioContext.createConvolver();
  convolver.buffer = createReverbImpulse(2.5);
  const reverbFilter = audioContext.createBiquadFilter();
  reverbFilter.type = "lowpass";
  reverbFilter.frequency.value = 4600;
  const reverbReturn = audioContext.createGain();
  reverbReturn.gain.value = 0.36;

  convolver.connect(reverbFilter);
  reverbFilter.connect(reverbReturn);
  reverbReturn.connect(compressor);

  // --- Stereo Ping-Pong Delay ---
  const delayInput = audioContext.createGain();
  delayInput.gain.value = 0.22;
  const delayL = audioContext.createDelay(1.0);
  const delayR = audioContext.createDelay(1.0);
  delayL.delayTime.value = beat * 0.75;
  delayR.delayTime.value = beat * 0.5;
  const fbL = audioContext.createGain();
  const fbR = audioContext.createGain();
  fbL.gain.value = 0.32;
  fbR.gain.value = 0.28;
  const dFilterL = audioContext.createBiquadFilter();
  const dFilterR = audioContext.createBiquadFilter();
  dFilterL.type = "lowpass";
  dFilterR.type = "lowpass";
  dFilterL.frequency.value = 2200;
  dFilterR.frequency.value = 2000;
  const panDL = audioContext.createStereoPanner();
  const panDR = audioContext.createStereoPanner();
  panDL.pan.value = -0.65;
  panDR.pan.value = 0.65;

  delayInput.connect(delayL);
  delayL.connect(dFilterL);
  dFilterL.connect(panDL);
  panDL.connect(compressor);
  panDL.connect(convolver);
  dFilterL.connect(fbL);
  fbL.connect(delayR);

  delayR.connect(dFilterR);
  dFilterR.connect(panDR);
  panDR.connect(compressor);
  panDR.connect(convolver);
  dFilterR.connect(fbR);
  fbR.connect(delayL);

  // Shared white noise buffer (seeded)
  const noiseBuffer = (() => {
    const len = audioContext.sampleRate * 1.2;
    const buf = audioContext.createBuffer(1, len, audioContext.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = random() * 2 - 1;
    return buf;
  })();

  // --- Visual Score Timeline ---
  const visualEvents = [];
  const logEvent = (ev) => visualEvents.push(ev);

  // --- Synthesized Instruments ---
  function sendToMix(node, panVal, revAmt, delAmt) {
    const pan = audioContext.createStereoPanner();
    pan.pan.value = clamp(panVal, -0.95, 0.95);
    node.connect(pan);
    pan.connect(dryBus);
    if (revAmt > 0) {
      const rSend = audioContext.createGain();
      rSend.gain.value = revAmt;
      pan.connect(rSend);
      rSend.connect(convolver);
    }
    if (delAmt > 0) {
      const dSend = audioContext.createGain();
      dSend.gain.value = delAmt;
      pan.connect(dSend);
      dSend.connect(delayInput);
    }
  }

  function playTick(beatPos, vel = 0.08, panVal = 0, stepIdx = 0) {
    const t = t0 + beatPos * beat;
    if (t >= endTime - 0.02) return;

    // Precision metallic/woodblock escapement click
    const src = audioContext.createBufferSource();
    src.buffer = noiseBuffer;
    const bp = audioContext.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = stepIdx % 2 === 0 ? 3100 : 2550;
    bp.Q.value = 5.5;

    const gNoise = audioContext.createGain();
    gNoise.gain.setValueAtTime(0.0001, t);
    gNoise.gain.linearRampToValueAtTime(vel * 0.85, t + 0.002);
    gNoise.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);

    src.connect(bp);
    bp.connect(gNoise);
    sendToMix(gNoise, panVal, 0.16, 0.08);
    src.start(t);
    src.stop(t + 0.045);

    const osc = audioContext.createOscillator();
    osc.type = "triangle";
    const fBase = stepIdx % 2 === 0 ? 1850 : 1480;
    osc.frequency.setValueAtTime(fBase, t);
    osc.frequency.exponentialRampToValueAtTime(fBase * 0.55, t + 0.024);

    const gOsc = audioContext.createGain();
    gOsc.gain.setValueAtTime(0.0001, t);
    gOsc.gain.linearRampToValueAtTime(vel * 0.5, t + 0.0015);
    gOsc.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);

    osc.connect(gOsc);
    sendToMix(gOsc, panVal, 0.12, 0.0);
    osc.start(t);
    osc.stop(t + 0.035);

    logEvent({ type: "tick", time: beatPos * beat, step: stepIdx, vel });
  }

  function playPluck(beatPos, midi, durBeats = 1.2, vel = 0.14) {
    const t = t0 + beatPos * beat;
    if (t >= endTime - 0.02) return;
    const freq = midiToFreq(midi);
    const ring = Math.min(durBeats * beat + 0.75, endTime - t + 0.1);
    const panVal = clamp((midi - 70) / 26, -0.68, 0.68);

    // Body fundamental + crystalline FM bell overtone
    const osc1 = audioContext.createOscillator();
    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(freq, t);

    const carrier = audioContext.createOscillator();
    carrier.type = "sine";
    carrier.frequency.setValueAtTime(freq, t);

    const mod = audioContext.createOscillator();
    mod.type = "sine";
    mod.frequency.setValueAtTime(freq * 3.0, t);
    const modGain = audioContext.createGain();
    modGain.gain.setValueAtTime(freq * 1.15, t);
    modGain.gain.exponentialRampToValueAtTime(0.01, t + 0.16);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(9500, freq * 6.5), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 1.6), t + ring * 0.8);

    const env = audioContext.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.006);
    env.gain.exponentialRampToValueAtTime(vel * 0.25, t + 0.18);
    env.gain.exponentialRampToValueAtTime(0.0001, t + ring);

    const g1 = audioContext.createGain();
    g1.gain.value = 0.62;
    const g2 = audioContext.createGain();
    g2.gain.value = 0.45;

    osc1.connect(g1);
    carrier.connect(g2);
    g1.connect(filter);
    g2.connect(filter);
    filter.connect(env);
    sendToMix(env, panVal, 0.42, 0.36);

    osc1.start(t);
    carrier.start(t);
    mod.start(t);
    osc1.stop(t + ring + 0.04);
    carrier.stop(t + ring + 0.04);
    mod.stop(t + ring + 0.04);

    logEvent({
      type: "note",
      voice: "pluck",
      time: beatPos * beat,
      endTime: beatPos * beat + Math.max(0.28, durBeats * beat),
      midi,
      vel,
      pan: panVal,
    });
  }

  function playBass(beatPos, midi, durBeats = 1.5, vel = 0.22) {
    const t = t0 + beatPos * beat;
    if (t >= endTime - 0.02) return;
    const freq = midiToFreq(midi);
    const noteDur = Math.min(durBeats * beat, endTime - t + 0.05);

    const oscA = audioContext.createOscillator();
    const oscB = audioContext.createOscillator();
    const sub = audioContext.createOscillator();
    oscA.type = "sawtooth";
    oscB.type = "sawtooth";
    sub.type = "sine";
    oscA.frequency.setValueAtTime(freq, t);
    oscB.frequency.setValueAtTime(freq, t);
    oscA.detune.setValueAtTime(-5, t);
    oscB.detune.setValueAtTime(5, t);
    sub.frequency.setValueAtTime(freq, t);

    const lp = audioContext.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 1.6;
    lp.frequency.setValueAtTime(140, t);
    lp.frequency.linearRampToValueAtTime(640, t + Math.min(0.14, noteDur * 0.3));
    lp.frequency.exponentialRampToValueAtTime(210, t + noteDur);

    const env = audioContext.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vel, t + Math.min(0.06, noteDur * 0.25));
    env.gain.setValueAtTime(vel * 0.82, t + Math.max(0.07, noteDur * 0.72));
    env.gain.exponentialRampToValueAtTime(0.0001, t + noteDur + 0.14);

    const gSaw = audioContext.createGain();
    gSaw.gain.value = 0.42;
    const gSub = audioContext.createGain();
    gSub.gain.value = 0.65;

    oscA.connect(gSaw);
    oscB.connect(gSaw);
    gSaw.connect(lp);
    sub.connect(gSub);
    gSub.connect(lp);
    lp.connect(env);
    sendToMix(env, 0, 0.24, 0.0);

    oscA.start(t);
    oscB.start(t);
    sub.start(t);
    oscA.stop(t + noteDur + 0.18);
    oscB.stop(t + noteDur + 0.18);
    sub.stop(t + noteDur + 0.18);

    logEvent({
      type: "note",
      voice: "bass",
      time: beatPos * beat,
      endTime: beatPos * beat + noteDur,
      midi,
      vel,
      pan: 0,
    });
  }

  function playLead(beatPos, midi, durBeats = 1.0, vel = 0.18, isCounter = false) {
    const t = t0 + beatPos * beat;
    if (t >= endTime - 0.02) return;
    const freq = midiToFreq(midi);
    const noteDur = Math.min(durBeats * beat, endTime - t + 0.05);
    const panVal = isCounter ? -0.24 : 0.14;

    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    osc1.type = "sawtooth";
    osc2.type = "triangle";
    osc1.frequency.setValueAtTime(freq, t);
    osc2.frequency.setValueAtTime(freq * 2, t);
    osc1.detune.setValueAtTime(-3, t);
    osc2.detune.setValueAtTime(3, t);

    // Expressive vibrato that blooms after attack
    const lfo = audioContext.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = isCounter ? 4.8 : 5.5;
    const lfoDepth = audioContext.createGain();
    lfoDepth.gain.setValueAtTime(0.0, t);
    lfoDepth.gain.linearRampToValueAtTime(freq * 0.0065, t + Math.min(0.28, noteDur * 0.6));
    lfo.connect(lfoDepth);
    lfoDepth.connect(osc1.frequency);
    lfoDepth.connect(osc2.frequency);

    // Vocal-like resonant formant shaping
    const formant = audioContext.createBiquadFilter();
    formant.type = "bandpass";
    formant.frequency.setValueAtTime(isCounter ? 950 : 1450, t);
    formant.Q.value = 1.25;

    const warmth = audioContext.createBiquadFilter();
    warmth.type = "lowpass";
    warmth.frequency.setValueAtTime(isCounter ? 1800 : 3200, t);

    const g1 = audioContext.createGain();
    g1.gain.value = 0.65;
    const g2 = audioContext.createGain();
    g2.gain.value = 0.25;

    const env = audioContext.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.055);
    env.gain.setValueAtTime(vel * 0.85, t + Math.max(0.06, noteDur * 0.78));
    env.gain.exponentialRampToValueAtTime(0.0001, t + noteDur + 0.16);

    osc1.connect(g1);
    osc2.connect(g2);
    g1.connect(warmth);
    g2.connect(warmth);
    warmth.connect(formant);
    warmth.connect(env);
    formant.connect(env);
    sendToMix(env, panVal, 0.48, 0.22);

    osc1.start(t);
    osc2.start(t);
    lfo.start(t);
    osc1.stop(t + noteDur + 0.2);
    osc2.stop(t + noteDur + 0.2);
    lfo.stop(t + noteDur + 0.2);

    logEvent({
      type: "note",
      voice: isCounter ? "counter" : "lead",
      time: beatPos * beat,
      endTime: beatPos * beat + noteDur,
      midi,
      vel,
      pan: panVal,
    });
  }

  function playPad(beatPos, midis, durBeats = 4.0, vel = 0.045) {
    const t = t0 + beatPos * beat;
    if (t >= endTime - 0.05) return;
    const padDur = Math.min(durBeats * beat, endTime - t);

    midis.forEach((midi, idx) => {
      const freq = midiToFreq(midi);
      const oscA = audioContext.createOscillator();
      const oscB = audioContext.createOscillator();
      oscA.type = "sawtooth";
      oscB.type = "triangle";
      oscA.frequency.setValueAtTime(freq, t);
      oscB.frequency.setValueAtTime(freq, t);
      oscA.detune.setValueAtTime(-7 + idx * 2, t);
      oscB.detune.setValueAtTime(7 - idx * 2, t);

      const lp = audioContext.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(420, t);
      lp.frequency.linearRampToValueAtTime(1650, t + padDur * 0.48);
      lp.frequency.linearRampToValueAtTime(620, t + padDur);

      const env = audioContext.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(vel, t + Math.min(0.55, padDur * 0.32));
      env.gain.setValueAtTime(vel * 0.9, t + padDur * 0.72);
      env.gain.exponentialRampToValueAtTime(0.0001, t + padDur);

      oscA.connect(lp);
      oscB.connect(lp);
      lp.connect(env);
      const pan = ((idx / Math.max(1, midis.length - 1)) - 0.5) * 0.75;
      sendToMix(env, pan, 0.58, 0.0);

      oscA.start(t);
      oscB.start(t);
      oscA.stop(t + padDur + 0.08);
      oscB.stop(t + padDur + 0.08);

      logEvent({
        type: "note",
        voice: "pad",
        time: beatPos * beat,
        endTime: beatPos * beat + padDur,
        midi,
        vel: vel * 2.2,
        pan,
      });
    });
  }

  function playKick(beatPos, vel = 0.28) {
    const t = t0 + beatPos * beat;
    if (t >= endTime - 0.02) return;

    const osc = audioContext.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(125, t);
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.11);

    const g = audioContext.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);

    osc.connect(g);
    sendToMix(g, 0, 0.22, 0);
    osc.start(t);
    osc.stop(t + 0.4);

    // Soft timpani felt mallet transient
    const nSrc = audioContext.createBufferSource();
    nSrc.buffer = noiseBuffer;
    const lp = audioContext.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    const ng = audioContext.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(vel * 0.35, t + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    nSrc.connect(lp);
    lp.connect(ng);
    sendToMix(ng, 0, 0.18, 0);
    nSrc.start(t);
    nSrc.stop(t + 0.07);

    logEvent({ type: "pulse", time: beatPos * beat, vel });
  }

  function playShaker(beatPos, vel = 0.036, panVal = 0.25) {
    const t = t0 + beatPos * beat;
    if (t >= endTime - 0.02) return;
    const src = audioContext.createBufferSource();
    src.buffer = noiseBuffer;
    const hp = audioContext.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.value = 6200;
    hp.Q.value = 1.4;
    const g = audioContext.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    src.connect(hp);
    hp.connect(g);
    sendToMix(g, panVal, 0.2, 0.12);
    src.start(t);
    src.stop(t + 0.07);
  }

  function playChime(beatPos, midi, vel = 0.19) {
    const t = t0 + beatPos * beat;
    if (t >= endTime - 0.05) return;
    const freq = midiToFreq(midi);
    const ring = Math.max(0.4, endTime - t);
    const partials = [
      { ratio: 1.0, amp: 0.55, dec: 1.0 },
      { ratio: 2.0, amp: 0.28, dec: 0.72 },
      { ratio: 2.756, amp: 0.16, dec: 0.45 },
      { ratio: 4.07, amp: 0.09, dec: 0.28 },
    ];
    partials.forEach((p, idx) => {
      const osc = audioContext.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * p.ratio, t);
      const g = audioContext.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel * p.amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ring * p.dec);
      osc.connect(g);
      sendToMix(g, (idx % 2 === 0 ? -0.18 : 0.18), 0.65, 0.2);
      osc.start(t);
      osc.stop(t + ring + 0.05);
    });

    logEvent({
      type: "chime",
      time: beatPos * beat,
      endTime: dur,
      midi,
      vel,
      pan: 0,
    });
  }

  // =========================================================================
  // MUSICAL SCORE — 8 Bars of 4/4 (32 Beats)
  // =========================================================================

  // 1. Escapement Clockwork Ticks
  for (let s = 0; s < 56; s++) {
    const b = s * 0.5;
    const accent = s % 2 === 0 ? 1.0 : 0.66;
    const fadeIn = smoothstep(0, 2, s);
    playTick(b, 0.072 * accent * (0.55 + 0.45 * fadeIn), s % 2 === 0 ? -0.34 : 0.34, s);
    // Intricate double-escapement 16th subdivisions during Sections B & C
    if (b >= 8 && b < 24 && (s % 4 === 1 || s % 8 === 7)) {
      playTick(b + 0.25, 0.038, 0.45, s + 100);
    }
  }
  // Ritardando final ticks in Bar 8
  playTick(28.0, 0.068, -0.25, 56);
  playTick(29.0, 0.052, 0.25, 57);
  playTick(30.0, 0.036, 0.0, 58);

  // 2. Harp / Celesta Counterpoint Arpeggios
  const arpEvents = [
    // Bar 1: Dm9
    [0.0, 62, 1.0, 0.12], [0.5, 69, 1.0, 0.12], [1.0, 76, 1.0, 0.13], [1.5, 77, 1.0, 0.13],
    [2.0, 81, 1.2, 0.14], [2.5, 76, 1.0, 0.12], [3.0, 72, 1.0, 0.12], [3.5, 69, 1.0, 0.11],
    // Bar 2: Bbmaj7 -> C6/A
    [4.0, 58, 1.0, 0.12], [4.5, 65, 1.0, 0.12], [5.0, 74, 1.0, 0.13], [5.5, 81, 1.2, 0.14],
    [6.0, 60, 1.0, 0.12], [6.5, 67, 1.0, 0.12], [7.0, 76, 1.0, 0.13], [7.5, 81, 1.2, 0.14],
    // Bar 3: Dm -> Gm7
    [8.0, 62, 0.8, 0.13], [8.5, 69, 0.8, 0.12], [9.0, 74, 0.8, 0.13], [9.5, 77, 0.8, 0.13],
    [10.0, 67, 0.8, 0.13], [10.5, 74, 0.8, 0.12], [11.0, 77, 0.7, 0.13],
    [11.25, 79, 0.6, 0.12], [11.5, 82, 0.7, 0.13], [11.75, 79, 0.6, 0.12],
    // Bar 4: C -> A7
    [12.0, 60, 0.8, 0.13], [12.5, 67, 0.8, 0.12], [13.0, 72, 0.8, 0.13], [13.5, 76, 0.8, 0.13],
    [14.0, 61, 0.8, 0.13], [14.5, 69, 0.8, 0.12], [15.0, 73, 0.7, 0.13],
    [15.25, 76, 0.6, 0.13], [15.5, 79, 0.6, 0.14], [15.75, 81, 0.7, 0.15],
    // Bar 5: Climax 16th cascades — Dm9 -> Fmaj7
    [16.0, 62, 0.7, 0.14], [16.25, 69, 0.6, 0.12], [16.5, 74, 0.6, 0.13], [16.75, 76, 0.6, 0.13],
    [17.0, 77, 0.7, 0.14], [17.25, 81, 0.6, 0.14], [17.5, 76, 0.6, 0.13], [17.75, 74, 0.6, 0.12],
    [18.0, 65, 0.7, 0.14], [18.25, 72, 0.6, 0.13], [18.5, 76, 0.6, 0.13], [18.75, 77, 0.6, 0.14],
    [19.0, 81, 0.7, 0.15], [19.25, 84, 0.6, 0.15], [19.5, 81, 0.6, 0.14], [19.75, 76, 0.6, 0.13],
    // Bar 6: Bbmaj7 -> Gm9 -> A7
    [20.0, 58, 0.7, 0.14], [20.25, 65, 0.6, 0.13], [20.5, 70, 0.6, 0.13], [20.75, 74, 0.6, 0.14],
    [21.0, 77, 0.7, 0.14], [21.25, 81, 0.6, 0.15], [21.5, 77, 0.6, 0.13], [21.75, 74, 0.6, 0.12],
    [22.0, 55, 0.7, 0.14], [22.25, 62, 0.6, 0.13], [22.5, 67, 0.6, 0.13], [22.75, 70, 0.6, 0.14],
    [23.0, 57, 0.7, 0.14], [23.25, 64, 0.6, 0.13], [23.5, 69, 0.6, 0.14], [23.75, 73, 0.7, 0.15],
    // Bar 7: Picardy Third Dmaj9 ascending sweep!
    [24.0, 62, 0.9, 0.15], [24.25, 66, 0.8, 0.14], [24.5, 69, 0.8, 0.14], [24.75, 73, 0.8, 0.14],
    [25.0, 76, 0.9, 0.15], [25.25, 78, 0.8, 0.15], [25.5, 81, 1.0, 0.16], [25.75, 86, 1.2, 0.16],
    [26.0, 85, 1.0, 0.14], [26.5, 81, 1.0, 0.13], [27.0, 78, 1.2, 0.13], [27.5, 76, 1.2, 0.12],
    // Bar 8: Final celestial stardust
    [28.0, 74, 2.2, 0.12], [28.5, 78, 2.0, 0.11], [29.0, 81, 2.0, 0.11], [29.5, 85, 2.2, 0.10],
  ];
  arpEvents.forEach(([b, m, d, v]) => playPluck(b, m, d, v));

  // 3. Bowed Cello & Sub-Bass
  const bassEvents = [
    [0.0, 38, 3.8, 0.18],
    [4.0, 38, 1.9, 0.19], [6.0, 36, 1.9, 0.19],
    [8.0, 38, 1.4, 0.22], [9.5, 45, 0.45, 0.18], [10.0, 43, 1.4, 0.22], [11.5, 46, 0.45, 0.19],
    [12.0, 48, 1.4, 0.22], [13.5, 43, 0.45, 0.19], [14.0, 45, 1.4, 0.23], [15.5, 49, 0.45, 0.20],
    [16.0, 38, 1.4, 0.24], [17.5, 45, 0.45, 0.20], [18.0, 41, 1.4, 0.24], [19.5, 48, 0.45, 0.20],
    [20.0, 46, 1.4, 0.24], [21.5, 41, 0.45, 0.20], [22.0, 43, 0.95, 0.23], [23.0, 45, 0.95, 0.24],
    [24.0, 38, 1.95, 0.25], [26.0, 45, 0.95, 0.22], [27.0, 42, 0.95, 0.21],
    [28.0, 38, 3.6, 0.21],
  ];
  bassEvents.forEach(([b, m, d, v]) => playBass(b, m, d, v));

  // 4. Singing Lead Melody (Bars 3–7)
  const leadEvents = [
    [8.0, 81, 1.45, 0.17], [9.5, 77, 0.48, 0.15], [10.0, 79, 0.95, 0.17], [11.0, 76, 0.95, 0.16],
    [12.0, 74, 0.72, 0.17], [12.75, 76, 0.24, 0.15], [13.0, 77, 0.95, 0.17], [14.0, 76, 0.95, 0.17], [15.0, 73, 0.95, 0.16],
    [16.0, 74, 0.48, 0.18], [16.5, 77, 0.95, 0.19], [17.5, 81, 1.45, 0.20], [19.0, 84, 0.48, 0.19], [19.5, 81, 0.48, 0.18],
    [20.0, 82, 1.45, 0.20], [21.5, 81, 0.48, 0.18], [22.0, 79, 0.48, 0.18], [22.5, 77, 0.48, 0.18], [23.0, 76, 0.95, 0.19],
    [24.0, 78, 1.95, 0.21], [26.0, 76, 0.95, 0.18], [27.0, 74, 1.8, 0.17],
  ];
  leadEvents.forEach(([b, m, d, v]) => playLead(b, m, d, v, false));

  // 5. Inner Counter-Melody (Bars 5–7)
  const counterEvents = [
    [16.0, 65, 1.9, 0.12], [18.0, 64, 1.9, 0.12],
    [20.0, 62, 1.9, 0.12], [22.0, 67, 0.95, 0.12], [23.0, 64, 0.95, 0.12],
    [24.0, 66, 1.9, 0.13], [26.0, 69, 1.8, 0.12],
  ];
  counterEvents.forEach(([b, m, d, v]) => playLead(b, m, d, v, true));

  // 6. Celestial Choir Pads
  playPad(4.0, [62, 65, 69, 72], 4.0, 0.038);
  playPad(12.0, [60, 64, 67, 70], 2.0, 0.04);
  playPad(14.0, [61, 64, 69, 73], 2.0, 0.042);
  playPad(16.0, [62, 65, 69, 76], 2.0, 0.048);
  playPad(18.0, [65, 69, 72, 76], 2.0, 0.05);
  playPad(20.0, [58, 62, 65, 69], 2.0, 0.05);
  playPad(22.0, [57, 61, 64, 67], 2.0, 0.048);
  playPad(24.0, [62, 66, 69, 73, 76], 7.6, 0.052);

  // 7. Timpani & Brushed Shaker
  [
    [8.0, 0.22], [10.0, 0.20], [12.0, 0.22], [14.0, 0.22],
    [16.0, 0.28], [17.5, 0.18], [18.0, 0.26], [19.5, 0.18],
    [20.0, 0.28], [21.5, 0.18], [22.0, 0.25], [23.0, 0.25],
    [24.0, 0.30], [28.0, 0.20],
  ].forEach(([b, v]) => playKick(b, v));

  for (let b = 16.0; b < 24.0; b += 0.25) {
    const idx = Math.round((b - 16) * 4);
    const v = idx % 4 === 0 ? 0.042 : idx % 2 === 0 ? 0.028 : 0.018;
    playShaker(b, v, idx % 2 === 0 ? 0.28 : -0.28);
  }

  // 8. Final Celestial Chime (Beat 28.0 -> 13.125s)
  playChime(28.0, 74, 0.21);
  playChime(28.0, 81, 0.11);

  // Sort visual events chronologically
  visualEvents.sort((a, b) => a.time - b.time);

  // =========================================================================
  // VISUAL ARCHITECTURE — 1080 × 1350 Kinetic Astrolabe & Pendulum Matrix
  // =========================================================================
  const CX = 540;
  const CY = 520;

  // Offscreen static backdrop (Deep cosmos, stars, and fine astronomical hairlines)
  const bgCanvas = document.createElement("canvas");
  bgCanvas.width = REF_W;
  bgCanvas.height = REF_H;
  const bgCtx = bgCanvas.getContext("2d");

  const skyGrad = bgCtx.createRadialGradient(CX, CY, 40, CX, CY + 120, 960);
  skyGrad.addColorStop(0, "#0d1730");
  skyGrad.addColorStop(0.42, "#070c1b");
  skyGrad.addColorStop(1, "#020308");
  bgCtx.fillStyle = skyGrad;
  bgCtx.fillRect(0, 0, REF_W, REF_H);

  // Subtle nebula glow washes
  const neb1 = bgCtx.createRadialGradient(CX - 180, CY - 140, 20, CX - 180, CY - 140, 420);
  neb1.addColorStop(0, "rgba(42, 108, 158, 0.10)");
  neb1.addColorStop(1, "rgba(0,0,0,0)");
  bgCtx.fillStyle = neb1;
  bgCtx.fillRect(0, 0, REF_W, REF_H);

  const neb2 = bgCtx.createRadialGradient(CX + 210, CY + 220, 20, CX + 210, CY + 220, 460);
  neb2.addColorStop(0, "rgba(182, 122, 54, 0.08)");
  neb2.addColorStop(1, "rgba(0,0,0,0)");
  bgCtx.fillStyle = neb2;
  bgCtx.fillRect(0, 0, REF_W, REF_H);

  // Seeded starfield
  const stars = [];
  for (let i = 0; i < 240; i++) {
    const sx = random() * REF_W;
    const sy = random() * REF_H;
    const sr = 0.4 + Math.pow(random(), 2.4) * 1.9;
    const tint = random();
    const color = tint < 0.25 ? "165, 226, 255" : tint < 0.55 ? "255, 224, 175" : "235, 240, 255";
    const alpha = 0.18 + random() * 0.65;
    bgCtx.fillStyle = `rgba(${color}, ${alpha})`;
    bgCtx.beginPath();
    bgCtx.arc(sx, sy, sr, 0, Math.PI * 2);
    bgCtx.fill();
    if (i < 70) {
      stars.push({ x: sx, y: sy, r: sr * 1.35, color, phase: random() * Math.PI * 2, speed: 1.5 + random() * 3.0 });
    }
  }

  // Astronomical border hairlines & subtle calibration grid
  bgCtx.strokeStyle = "rgba(226, 184, 112, 0.16)";
  bgCtx.lineWidth = 1;
  bgCtx.strokeRect(34, 34, REF_W - 68, REF_H - 68);
  bgCtx.strokeStyle = "rgba(226, 184, 112, 0.08)";
  bgCtx.strokeRect(44, 44, REF_W - 88, REF_H - 88);

  // Corner brackets
  const corners = [
    [34, 34, 1, 1],
    [REF_W - 34, 34, -1, 1],
    [34, REF_H - 34, 1, -1],
    [REF_W - 34, REF_H - 34, -1, -1],
  ];
  bgCtx.strokeStyle = "rgba(236, 198, 126, 0.36)";
  bgCtx.lineWidth = 1.5;
  corners.forEach(([x, y, dx, dy]) => {
    bgCtx.beginPath();
    bgCtx.moveTo(x, y + dy * 28);
    bgCtx.lineTo(x, y);
    bgCtx.lineTo(x + dx * 28, y);
    bgCtx.stroke();
  });

  // Meridian hairlines
  bgCtx.strokeStyle = "rgba(155, 210, 255, 0.06)";
  bgCtx.lineWidth = 1;
  bgCtx.beginPath();
  bgCtx.moveTo(CX, 44);
  bgCtx.lineTo(CX, 965);
  bgCtx.moveTo(64, CY);
  bgCtx.lineTo(REF_W - 64, CY);
  bgCtx.stroke();

  // Subtle engraved title at bottom
  bgCtx.fillStyle = "rgba(232, 194, 126, 0.42)";
  bgCtx.font = "500 18px Georgia, 'Times New Roman', serif";
  bgCtx.textAlign = "center";
  bgCtx.fillText("T H E   C E L E S T I A L   E S C A P E M E N T", CX, 1286);

  // Seeded floating dust embers
  const motes = [];
  for (let i = 0; i < 48; i++) {
    motes.push({
      x: 110 + random() * (REF_W - 220),
      y: 120 + random() * (REF_H - 220),
      r: 1.0 + random() * 2.2,
      vy: 10 + random() * 22,
      drift: random() * Math.PI * 2,
      warm: random() > 0.35,
    });
  }

  // Dynamic visual state trackers
  const fftData = new Uint8Array(analyser.frequencyBinCount);
  const waveData = new Uint8Array(analyser.fftSize);
  const noteEnergy = new Float32Array(12); // Circle of Fifths indices 0..11
  const ribbons = []; // Harmonic constellation arcs between consecutive notes
  const ripples = []; // Expanding shockwave circles

  let nextEventIdx = 0;
  let lastHarmonicFifth = -1;
  let gearStep = 0;
  let gearAngle = 0;
  let gearTargetAngle = 0;
  let lastFrameTime = 0;
  let rafId = 0;

  const fifthLabels = ["D", "A", "E", "B", "F♯", "C♯", "A♭", "E♭", "B♭", "F", "C", "G"];

  function processEventsUpTo(elapsed) {
    while (nextEventIdx < visualEvents.length && visualEvents[nextEventIdx].time <= elapsed) {
      const ev = visualEvents[nextEventIdx++];
      if (ev.type === "tick") {
        gearStep += 1;
        gearTargetAngle = (gearStep / 64) * Math.PI * 2;
      } else if (ev.type === "pulse") {
        ripples.push({
          t: ev.time,
          life: 1.4,
          maxR: 470,
          color: elapsed >= 11.2 ? "255, 224, 145" : "120, 225, 255",
          alpha: 0.32 * (ev.vel / 0.28),
        });
      } else if (ev.type === "chime") {
        ripples.push({
          t: ev.time,
          life: 2.3,
          maxR: 590,
          color: "255, 232, 165",
          alpha: 0.45,
        });
        const fIdx = pitchToFifthIndex(ev.midi);
        noteEnergy[fIdx] = Math.min(1.5, noteEnergy[fIdx] + 1.1);
      } else if (ev.type === "note") {
        const fIdx = pitchToFifthIndex(ev.midi);
        const boost = ev.voice === "lead" ? 1.1 : ev.voice === "pluck" ? 0.85 : 0.6;
        noteEnergy[fIdx] = Math.min(1.4, noteEnergy[fIdx] + boost);

        if ((ev.voice === "pluck" || ev.voice === "lead") && lastHarmonicFifth !== -1 && lastHarmonicFifth !== fIdx) {
          ribbons.push({
            from: lastHarmonicFifth,
            to: fIdx,
            t: ev.time,
            life: ev.voice === "lead" ? 1.6 : 1.05,
            isLead: ev.voice === "lead",
          });
        }
        if (ev.voice === "pluck" || ev.voice === "lead") {
          lastHarmonicFifth = fIdx;
        }
      }
    }
  }

  function render() {
    const now = audioContext.currentTime;
    const elapsed = clamp(now - t0, 0, dur + 0.5);
    const dt = clamp(lastFrameTime === 0 ? 0.016 : elapsed - lastFrameTime, 0.001, 0.05);
    lastFrameTime = elapsed;

    processEventsUpTo(elapsed);

    // Real-time audio analysis
    analyser.getByteFrequencyData(fftData);
    analyser.getByteTimeDomainData(waveData);

    let bassSum = 0;
    for (let i = 1; i < 10; i++) bassSum += fftData[i];
    const bassEnergy = bassSum / (9 * 255);

    let highSum = 0;
    for (let i = 30; i < 110; i++) highSum += fftData[i];
    const highEnergy = highSum / (80 * 255);

    // Compositional phase curves
    const picardy = smoothstep(11.15, 11.85, elapsed);
    const climaxArc = smoothstep(3.4, 8.2, elapsed) * (1 - 0.55 * smoothstep(12.2, 14.9, elapsed));
    const endFade = 1 - 0.35 * smoothstep(13.8, 15.0, elapsed);

    // Decay pitch node glow & spring-animate escapement gear
    for (let i = 0; i < 12; i++) {
      noteEnergy[i] = Math.max(0, noteEnergy[i] - dt * 1.45);
    }
    gearAngle += (gearTargetAngle - gearAngle) * Math.min(1, dt * 18);

    // Prepare frame
    ctx.save();
    ctx.scale(W / REF_W, H / REF_H);

    // 1. Static cosmos & architectural frame
    ctx.drawImage(bgCanvas, 0, 0);

    // Picardy Third ambient golden warmth wash
    if (picardy > 0.001) {
      const pGrad = ctx.createRadialGradient(CX, CY, 30, CX, CY, 650);
      pGrad.addColorStop(0, `rgba(255, 222, 145, ${0.13 * picardy * endFade})`);
      pGrad.addColorStop(0.5, `rgba(218, 165, 82, ${0.05 * picardy * endFade})`);
      pGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = pGrad;
      ctx.fillRect(0, 0, REF_W, REF_H);
    }

    // 2. Twinkling stars & floating luminous embers
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(elapsed * s.speed + s.phase));
      ctx.fillStyle = `rgba(${s.color}, ${tw * (0.45 + highEnergy * 0.55)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      const my = ((m.y - elapsed * m.vy * (0.7 + climaxArc * 0.8)) % (REF_H - 180) + (REF_H - 180)) % (REF_H - 180) + 90;
      const mx = m.x + Math.sin(elapsed * 0.9 + m.drift) * 18;
      const alpha = (0.12 + 0.35 * climaxArc + 0.25 * highEnergy) * endFade;
      ctx.fillStyle = m.warm || picardy > 0.5
        ? `rgba(255, 214, 138, ${alpha})`
        : `rgba(128, 224, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(mx, my, m.r * (1 + bassEnergy * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. Expanding Resonant Ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      const age = elapsed - rp.t;
      if (age > rp.life) {
        ripples.splice(i, 1);
        continue;
      }
      const p = age / rp.life;
      const rad = 80 + rp.maxR * (1 - Math.pow(1 - p, 2.2));
      const a = rp.alpha * (1 - p) * (1 - p);
      ctx.strokeStyle = `rgba(${rp.color}, ${a})`;
      ctx.lineWidth = 2.4 * (1 - p) + 0.6;
      ctx.beginPath();
      ctx.arc(CX, CY, rad, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 4. GRAND ASTROLABE MECHANISM (CX=540, CY=520)
    // Outer Escapement Ring (R = 420)
    const R1 = 420;
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(gearAngle);

    ctx.strokeStyle = `rgba(232, 188, 112, ${0.42 + 0.25 * picardy})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, R1, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(232, 188, 112, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, R1 - 16, 0, Math.PI * 2);
    ctx.stroke();

    // 64 precision escapement teeth & ticks
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const isMajor = i % 4 === 0;
      const rIn = isMajor ? R1 - 16 : R1 - 8;
      const rOut = isMajor ? R1 + 9 : R1 + 4;
      ctx.strokeStyle = isMajor ? "rgba(248, 214, 146, 0.72)" : "rgba(220, 178, 106, 0.34)";
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
      ctx.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut);
      ctx.stroke();
    }
    ctx.restore();

    // Static Top Escapement Anchor Pawl (points down onto Ring 1)
    const tickFlick = Math.sin(gearAngle * 64) * 0.08;
    ctx.save();
    ctx.translate(CX, CY - R1 - 24);
    ctx.rotate(tickFlick);
    ctx.fillStyle = "rgba(246, 210, 140, 0.85)";
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.lineTo(-10, -4);
    ctx.lineTo(10, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Ring 2: Audio-Reactive Spectrum Corona (R = 352)
    const R2 = 352;
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(elapsed * 0.06);

    ctx.strokeStyle = `rgba(126, 224, 255, ${0.22 + 0.18 * climaxArc})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, R2, 0, Math.PI * 2);
    ctx.stroke();

    const specCount = 96;
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < specCount; i++) {
      const a = (i / specCount) * Math.PI * 2;
      const bin = 2 + Math.floor((i % 48) * 1.8);
      const amp = (fftData[bin] / 255) * (24 + 34 * climaxArc);
      const r0 = R2 - 4;
      const r1 = R2 + 5 + amp;
      const warmMix = clamp(picardy * 0.85 + (i % 12 === 0 ? 0.4 : 0), 0, 1);
      const cr = Math.round(lerp(110, 255, warmMix));
      const cg = Math.round(lerp(225, 212, warmMix));
      const cb = Math.round(lerp(255, 138, warmMix));
      ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.22 + 0.55 * (amp / 55)})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();

    // Ring 3: Circle-of-Fifths Harmonic Pitch Constellation (R = 282)
    const R3 = 282;
    const nodePos = [];
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
      nodePos.push({
        x: CX + Math.cos(a) * R3,
        y: CY + Math.sin(a) * R3,
        a,
      });
    }

    ctx.strokeStyle = "rgba(232, 188, 112, 0.24)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(CX, CY, R3, 0, Math.PI * 2);
    ctx.stroke();

    // Sacred Geometry Harmonic Ribbons between consecutive notes
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = ribbons.length - 1; i >= 0; i--) {
      const rb = ribbons[i];
      const age = elapsed - rb.t;
      if (age > rb.life) {
        ribbons.splice(i, 1);
        continue;
      }
      const p = age / rb.life;
      const alpha = (1 - p) * (1 - p) * (rb.isLead ? 0.65 : 0.42);
      const pA = nodePos[rb.from];
      const pB = nodePos[rb.to];
      // Pull curve gently toward astrolabe center
      const mx = lerp((pA.x + pB.x) * 0.5, CX, 0.55);
      const my = lerp((pA.y + pB.y) * 0.5, CY, 0.55);

      ctx.strokeStyle = rb.isLead || picardy > 0.55
        ? `rgba(255, 218, 138, ${alpha})`
        : `rgba(116, 224, 255, ${alpha})`;
      ctx.lineWidth = rb.isLead ? 2.8 * (1 - p * 0.5) : 1.7;
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.quadraticCurveTo(mx, my, pB.x, pB.y);
      ctx.stroke();
    }
    ctx.restore();

    // 12 Harmonic Pitch-Class Jewels
    for (let i = 0; i < 12; i++) {
      const np = nodePos[i];
      const e = noteEnergy[i];
      const baseR = 6.5 + e * 6.5;

      if (e > 0.04) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const glowR = 26 + e * 38;
        const g = ctx.createRadialGradient(np.x, np.y, 1, np.x, np.y, glowR);
        const col = picardy > 0.5 || i === 0 || i === 1 || i === 4
          ? "255, 218, 138"
          : "120, 225, 255";
        g.addColorStop(0, `rgba(${col}, ${Math.min(0.85, e * 0.68)})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(np.x, np.y, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Jewel bezel & core
      ctx.fillStyle = e > 0.15
        ? `rgba(255, 240, 200, ${0.75 + 0.25 * Math.min(1, e)})`
        : "rgba(32, 48, 78, 0.9)";
      ctx.strokeStyle = `rgba(235, 195, 122, ${0.45 + 0.5 * Math.min(1, e)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(np.x, np.y, baseR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Subtle pitch label slightly inside ring
      const lx = CX + Math.cos(np.a) * (R3 - 26);
      const ly = CY + Math.sin(np.a) * (R3 - 26);
      ctx.fillStyle = `rgba(235, 208, 155, ${0.32 + 0.6 * Math.min(1, e)})`;
      ctx.font = "600 13px Georgia, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(fifthLabels[i], lx, ly);
    }

    // Ring 4: Counter-Rotating Brass Filigree Gears (R = 205 & R = 148)
    const drawFiligreeRing = (radius, spokes, rot, col) => {
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(rot);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, radius - 14, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (radius - 14), Math.sin(a) * (radius - 14));
        ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
        ctx.stroke();
      }
      ctx.restore();
    };

    const slowScale = 1 - 0.55 * smoothstep(11.5, 14.8, elapsed);
    drawFiligreeRing(205, 16, -elapsed * 0.19 * slowScale, "rgba(222, 178, 104, 0.34)");
    drawFiligreeRing(148, 12, elapsed * 0.28 * slowScale, "rgba(130, 218, 250, 0.28)");

    // 5. Central Solar Iris & Harmonic Rose Curve
    ctx.save();
    ctx.translate(CX, CY);
    ctx.globalCompositeOperation = "lighter";

    const irisGlowR = 130 + bassEnergy * 55 + picardy * 35;
    const coreGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, irisGlowR);
    coreGrad.addColorStop(0, `rgba(255, 244, 210, ${(0.55 + bassEnergy * 0.35) * endFade})`);
    coreGrad.addColorStop(0.35, `rgba(244, 188, 96, ${(0.28 + climaxArc * 0.2) * endFade})`);
    coreGrad.addColorStop(0.7, `rgba(92, 198, 245, ${(0.12 + highEnergy * 0.14) * endFade})`);
    coreGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, irisGlowR, 0, Math.PI * 2);
    ctx.fill();

    // Parametric 8-petal harmonic rose breathing with audio
    const petals = 8;
    const baseRoseR = 46 + climaxArc * 42 + bassEnergy * 24 + picardy * 14;
    for (let layer = 0; layer < 2; layer++) {
      ctx.rotate(layer === 0 ? elapsed * 0.14 : -elapsed * 0.21);
      ctx.strokeStyle = layer === 0
        ? `rgba(255, 224, 152, ${(0.55 + 0.3 * climaxArc) * endFade})`
        : `rgba(132, 226, 255, ${(0.40 + 0.25 * picardy) * endFade})`;
      ctx.lineWidth = layer === 0 ? 1.9 : 1.3;
      ctx.beginPath();
      const steps = 160;
      for (let s = 0; s <= steps; s++) {
        const th = (s / steps) * Math.PI * 2;
        const r = baseRoseR * (0.58 + 0.42 * Math.cos(petals * th)) * (layer === 0 ? 1 : 0.74);
        const px = Math.cos(th) * r;
        const py = Math.sin(th) * r;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();

    // 6. LOWER SECTION: SUSPENDED HARMONIC PENDULUM WAVE MATRIX (y = 955..1170)
    // Suspension struts from astrolabe bottom to crossbar
    ctx.strokeStyle = "rgba(224, 184, 114, 0.32)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(CX - 95, CY + 410);
    ctx.lineTo(CX - 280, 965);
    ctx.moveTo(CX + 95, CY + 410);
    ctx.lineTo(CX + 280, 965);
    ctx.stroke();

    // Brass suspension crossbar
    ctx.strokeStyle = "rgba(238, 200, 128, 0.55)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(220, 965);
    ctx.lineTo(860, 965);
    ctx.stroke();

    // 15 Phase-Shifted Harmonic Pendulums
    const pendCount = 15;
    const pendAmp = (0.28 + 0.26 * climaxArc + 0.14 * bassEnergy) * (1 - 0.55 * smoothstep(12.8, 15.0, elapsed));
    for (let i = 0; i < pendCount; i++) {
      const u = i / (pendCount - 1); // 0..1
      const ax = lerp(245, 835, u);
      const ay = 965;
      // Arched length profile (cathedral arch)
      const arch = Math.sin(u * Math.PI);
      const len = 104 + arch * 68;
      // Progressive frequency for wave motion
      const freq = (1.6 + i * 0.11) * Math.PI;
      const ang = pendAmp * Math.sin(elapsed * freq);
      const bx = ax + Math.sin(ang) * len;
      const by = ay + Math.cos(ang) * len;

      // Motion arc ghost
      ctx.strokeStyle = "rgba(130, 215, 250, 0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();

      // Pendulum bob
      const isCenter = i === 7;
      const bobR = isCenter ? 7.5 : 5.2;
      const bobWarm = picardy > 0.5 || i % 2 === 0;
      ctx.fillStyle = bobWarm
        ? `rgba(255, 220, 146, ${0.78 * endFade})`
        : `rgba(135, 228, 255, ${0.75 * endFade})`;
      ctx.beginPath();
      ctx.arc(bx, by, bobR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7. CYMATIC RESONANT WAVEFORM STRING (y = 1212)
    const strY = 1212;
    const strX0 = 150;
    const strX1 = 930;

    // Anchor finials
    ctx.fillStyle = "rgba(238, 200, 128, 0.72)";
    [strX0, strX1].forEach((fx) => {
      ctx.beginPath();
      ctx.arc(fx, strY, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const stringLayers = [
      { col: `rgba(255, 220, 142, ${0.65 * endFade})`, scale: 42, width: 2.0 },
      { col: `rgba(120, 224, 255, ${0.42 * endFade})`, scale: -30, width: 1.3 },
    ];
    stringLayers.forEach((sl) => {
      ctx.strokeStyle = sl.col;
      ctx.lineWidth = sl.width;
      ctx.beginPath();
      const segs = 128;
      for (let s = 0; s <= segs; s++) {
        const u = s / segs;
        const px = lerp(strX0, strX1, u);
        // Taper displacement to zero at anchor finials
        const env = Math.sin(u * Math.PI);
        const wIdx = Math.floor(u * (waveData.length - 1));
        const sample = (waveData[wIdx] - 128) / 128;
        const py = strY + sample * sl.scale * env;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
    ctx.restore();

    ctx.restore();

    if (elapsed < dur + 0.35) {
      rafId = requestAnimationFrame(render);
    }
  }

  rafId = requestAnimationFrame(render);

  return () => {
    cancelAnimationFrame(rafId);
  };
}
