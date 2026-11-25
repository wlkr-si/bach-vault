export const title = "Luminance Drift";

export function start({ audioContext, canvas, duration, random }) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const totalDuration = duration;
  const startTime = audioContext.currentTime;

  // -------------------- Audio Setup --------------------
  // Master gain with fade in/out
  const masterGain = audioContext.createGain();
  masterGain.gain.setValueAtTime(0, startTime);
  masterGain.gain.linearRampToValueAtTime(1, startTime + 2);
  masterGain.gain.setValueAtTime(1, startTime + totalDuration - 2);
  masterGain.gain.linearRampToValueAtTime(0, startTime + totalDuration);
  masterGain.connect(audioContext.destination);

  // Analyser for visual reactivity
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  masterGain.connect(analyser);

  // Programmatic reverb impulse response
  const sampleRate = audioContext.sampleRate;
  const convolver = audioContext.createConvolver();
  const reverbLength = sampleRate * 2;
  const reverbBuffer = audioContext.createBuffer(2, reverbLength, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = reverbBuffer.getChannelData(ch);
    for (let i = 0; i < reverbLength; i++) {
      const decay = Math.exp(-i / (sampleRate * 0.5));
      data[i] = (random() * 2 - 1) * decay * 0.5;
    }
  }
  convolver.buffer = reverbBuffer;
  const reverbGain = audioContext.createGain();
  reverbGain.gain.value = 0.2;
  convolver.connect(reverbGain);
  reverbGain.connect(masterGain);

  // Drone: two detuned sine waves with stereo spread
  const droneFreq = 110; // A2
  const droneOsc1 = audioContext.createOscillator();
  droneOsc1.type = 'sine';
  droneOsc1.frequency.value = droneFreq;
  const droneOsc2 = audioContext.createOscillator();
  droneOsc2.type = 'sine';
  droneOsc2.frequency.value = droneFreq * Math.pow(2, 3 / 1200); // 3 cent detune
  const dronePan1 = audioContext.createStereoPanner();
  dronePan1.pan.value = -0.2;
  const dronePan2 = audioContext.createStereoPanner();
  dronePan2.pan.value = 0.2;
  const droneGain = audioContext.createGain();
  droneGain.gain.setValueAtTime(0, startTime);
  droneGain.gain.linearRampToValueAtTime(0.2, startTime + 2);
  droneGain.gain.setValueAtTime(0.2, startTime + totalDuration - 2);
  droneGain.gain.linearRampToValueAtTime(0, startTime + totalDuration);
  droneOsc1.connect(dronePan1);
  dronePan1.connect(droneGain);
  droneOsc2.connect(dronePan2);
  dronePan2.connect(droneGain);
  droneGain.connect(masterGain);
  droneOsc1.start(startTime);
  droneOsc2.start(startTime);
  droneOsc1.stop(startTime + totalDuration + 0.1);
  droneOsc2.stop(startTime + totalDuration + 0.1);

  // Atmospheric noise with low-pass filter and slow LFO modulation
  const noiseBuffer = audioContext.createBuffer(1, sampleRate * 2, sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < sampleRate * 2; i++) {
    noiseData[i] = random() * 2 - 1;
  }
  const noiseSource = audioContext.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;
  const noiseFilter = audioContext.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 500;
  const noiseLFO = audioContext.createOscillator();
  noiseLFO.type = 'sine';
  noiseLFO.frequency.value = 0.1;
  const noiseLFOGain = audioContext.createGain();
  noiseLFOGain.gain.value = 300;
  noiseLFO.connect(noiseLFOGain);
  noiseLFOGain.connect(noiseFilter.frequency);
  const noiseGain = audioContext.createGain();
  noiseGain.gain.setValueAtTime(0, startTime);
  noiseGain.gain.linearRampToValueAtTime(0.05, startTime + 2);
  noiseGain.gain.setValueAtTime(0.05, startTime + totalDuration - 2);
  noiseGain.gain.linearRampToValueAtTime(0, startTime + totalDuration);
  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseSource.start(startTime);
  noiseLFO.start(startTime);
  noiseSource.stop(startTime + totalDuration + 0.1);
  noiseLFO.stop(startTime + totalDuration + 0.1);

  // Generate A minor pentatonic scale (3 octaves, A3 to A6)
  function generateScale(rootFreq, intervals, numOctaves) {
    const scale = [];
    for (let oct = 0; oct < numOctaves; oct++) {
      for (const interval of intervals) {
        scale.push(rootFreq * Math.pow(2, (oct * 12 + interval) / 12));
      }
    }
    scale.push(rootFreq * Math.pow(2, numOctaves * 12 / 12));
    return scale;
  }
  const scale = generateScale(220, [0, 3, 5, 7, 10], 3);

  // Kick drum synthesizer
  function triggerKick(time, volume) {
    const osc = audioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  // Schedule kicks and collect timing for particles
  const kicks = [];
  const beatDuration = 60 / 120; // 120 BPM
  const kickStart = startTime + 2;
  const kickEnd = startTime + (totalDuration - 2);
  const totalKicks = Math.floor((kickEnd - kickStart) / beatDuration);
  for (let i = 0; i < totalKicks; i++) {
    const time = kickStart + i * beatDuration;
    let vol;
    if (i < 4) vol = 0.1 + 0.2 * (i / 4);
    else if (i >= totalKicks - 4) {
      const fadeIdx = i - (totalKicks - 4);
      vol = 0.3 * (1 - fadeIdx / 4);
    } else vol = 0.3;
    kicks.push({ time, vol });
    triggerKick(time, vol);
  }

  // Arpeggio with stereo panning
  const arpGain = audioContext.createGain();
  arpGain.gain.setValueAtTime(0, startTime + 2);
  arpGain.gain.linearRampToValueAtTime(0.5, startTime + 3);
  arpGain.gain.setValueAtTime(0.5, startTime + totalDuration - 4);
  arpGain.gain.linearRampToValueAtTime(0, startTime + totalDuration - 2);
  arpGain.connect(masterGain);
  arpGain.connect(convolver);

  function triggerArpNote(time, freq, velocity, pan) {
    const osc = audioContext.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    const panner = audioContext.createStereoPanner();
    panner.pan.value = pan;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(velocity, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    osc.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(arpGain);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  // Generate arpeggio notes via random walk
  const arpNoteDuration = beatDuration / 2;
  const arpStart = startTime + 2;
  const arpEnd = startTime + (totalDuration - 2);
  const totalArpNotes = Math.floor((arpEnd - arpStart) / arpNoteDuration);
  let arpIndex = 5; // Start at A4
  for (let i = 0; i < totalArpNotes; i++) {
    const time = arpStart + i * arpNoteDuration;
    const freq = scale[arpIndex];
    const velocity = 0.1 + random() * 0.15;
    const pan = (random() - 0.5) * 0.8;
    triggerArpNote(time, freq, velocity, pan);
    const step = Math.floor(random() * 5) - 2;
    arpIndex = Math.max(0, Math.min(scale.length - 1, arpIndex + step));
  }

  // Melody with vibrato
  const melodyGain = audioContext.createGain();
  melodyGain.gain.setValueAtTime(0, startTime + 4);
  melodyGain.gain.linearRampToValueAtTime(0.2, startTime + 5);
  melodyGain.gain.setValueAtTime(0.2, startTime + totalDuration - 5);
  melodyGain.gain.linearRampToValueAtTime(0, startTime + totalDuration - 3);
  melodyGain.connect(masterGain);
  melodyGain.connect(convolver);

  function triggerMelodyNote(time, freq, velocity, noteDuration) {
    const osc = audioContext.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const lfo = audioContext.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5;
    const lfoGain = audioContext.createGain();
    lfoGain.gain.value = freq * 0.002; // ~3.4 cent vibrato depth
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(velocity, time + 0.02);
    gain.gain.setValueAtTime(velocity, time + noteDuration - 0.1);
    gain.gain.linearRampToValueAtTime(0.001, time + noteDuration);
    osc.connect(gain);
    gain.connect(melodyGain);
    lfo.start(time);
    osc.start(time);
    osc.stop(time + noteDuration);
    lfo.stop(time + noteDuration);
  }

  // Generate melody notes via random walk
  const melodyNoteDuration = beatDuration;
  const melodyStartTime = startTime + 4;
  const melodyEndTime = startTime + (totalDuration - 3);
  const totalMelodyNotes = Math.floor((melodyEndTime - melodyStartTime) / melodyNoteDuration);
  let melodyIndex = 8; // Start at E5
  for (let i = 0; i < totalMelodyNotes; i++) {
    const time = melodyStartTime + i * melodyNoteDuration;
    const freq = scale[melodyIndex];
    const velocity = 0.2 + random() * 0.15;
    const noteDur = melodyNoteDuration * 1.2;
    triggerMelodyNote(time, freq, velocity, noteDur);
    const step = Math.floor(random() * 7) - 3;
    melodyIndex = Math.max(5, Math.min(scale.length - 1, melodyIndex + step));
  }

  // -------------------- Visual Setup --------------------
  // Precompute particles for kick triggers (deterministic with seed)
  const particles = [];
  const particlesPerKick = 30;
  for (const kick of kicks) {
    for (let i = 0; i < particlesPerKick; i++) {
      particles.push({
        birthTime: kick.time,
        life: 1 + random() * 1.5,
        x: width / 2 + (random() - 0.5) * 100,
        y: height / 2 + (random() - 0.5) * 50,
        vx: (random() - 0.5) * 50,
        vy: -(50 + random() * 100),
        size: 1 + random() * 3,
        hue: 200 + random() * 100,
        maxAlpha: 0.5 + random() * 0.5
      });
    }
  }

  // Frequency band configuration for visual rings
  const bands = [
    { start: 0, end: 10, baseRadius: 150, hue: 250, speed: 0.1 },
    { start: 10, end: 30, baseRadius: 220, hue: 270, speed: 0.08 },
    { start: 30, end: 60, baseRadius: 290, hue: 290, speed: 0.06 },
    { start: 60, end: 90, baseRadius: 360, hue: 310, speed: 0.04 },
    { start: 90, end: 128, baseRadius: 430, hue: 330, speed: 0.02 }
  ];

  // Initial background
  ctx.fillStyle = 'rgb(10, 5, 25)';
  ctx.fillRect(0, 0, width, height);

  // Animation loop
  function animate() {
    const currentTime = audioContext.currentTime;
    if (currentTime - startTime >= totalDuration) return;

    // Get frequency domain data
    analyser.getByteFrequencyData(frequencyData);

    // Motion trail effect
    ctx.fillStyle = 'rgba(10, 5, 25, 0.15)';
    ctx.fillRect(0, 0, width, height);

    // Calculate normalized band levels
    const bandLevels = bands.map(band => {
      let sum = 0;
      for (let i = band.start; i < band.end; i++) sum += frequencyData[i];
      return sum / (band.end - band.start) / 255;
    });

    // Draw rotating dashed frequency rings
    ctx.lineCap = 'round';
    for (let i = 0; i < bands.length; i++) {
      const band = bands[i];
      const level = bandLevels[i];
      const radius = band.baseRadius + level * 60;
      const alpha = 0.2 + level * 0.6;
      const rotation = currentTime * band.speed;
      const numDashes = 32;
      const dashRatio = 0.3;

      ctx.strokeStyle = `hsla(${band.hue}, 80%, 60%, ${alpha})`;
      ctx.lineWidth = 3 + level * 4;

      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate(rotation);

      ctx.beginPath();
      for (let d = 0; d < numDashes; d++) {
        const startAngle = d * (Math.PI * 2 / numDashes);
        const endAngle = startAngle + (Math.PI * 2 / numDashes) * dashRatio;
        ctx.moveTo(radius * Math.cos(startAngle), radius * Math.sin(startAngle));
        ctx.lineTo(radius * Math.cos(endAngle), radius * Math.sin(endAngle));
      }
      ctx.stroke();
      ctx.restore();
    }

    // Central glowing orb pulsing with bass
    const bassLevel = bandLevels[0];
    const orbRadius = 80 + bassLevel * 120;
    const orbHue = 250 + bassLevel * 50;
    const orbGradient = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, orbRadius
    );
    orbGradient.addColorStop(0, `hsla(${orbHue}, 100%, 80%, 0.9)`);
    orbGradient.addColorStop(0.4, `hsla(${orbHue + 20}, 90%, 60%, 0.6)`);
    orbGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = orbGradient;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, orbRadius, 0, Math.PI * 2);
    ctx.fill();

    // Draw particles
    for (const p of particles) {
      const age = currentTime - p.birthTime;
      if (age < 0 || age > p.life) continue;

      const t = age / p.life;
      const alpha = p.maxAlpha * (1 - t);
      const x = p.x + p.vx * age;
      const y = p.y + p.vy * age + 0.5 * 20 * age * age; // Slight gravity

      ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
