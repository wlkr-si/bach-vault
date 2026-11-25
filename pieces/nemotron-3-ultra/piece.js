export const title = "Neural Bloom";

export function start({ audioContext, canvas, duration, random }) {
  if (audioContext.state === 'suspended') audioContext.resume();

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;

  const now = audioContext.currentTime;
  const endTime = now + duration;

  // ========== AUDIO GRAPH ==========
  const masterGain = audioContext.createGain();
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(1, now + 1);
  masterGain.gain.setValueAtTime(1, now + 14);
  masterGain.gain.linearRampToValueAtTime(0, endTime);

  const globalFilter = audioContext.createBiquadFilter();
  globalFilter.type = 'lowpass';
  globalFilter.frequency.setValueAtTime(200, now);
  globalFilter.frequency.exponentialRampToValueAtTime(8000, now + 8);
  globalFilter.frequency.exponentialRampToValueAtTime(2000, endTime);
  globalFilter.Q.setValueAtTime(1, now);

  const sendGain = audioContext.createGain();
  sendGain.gain.setValueAtTime(0, now);
  sendGain.gain.linearRampToValueAtTime(0.2, now + 5);
  sendGain.gain.linearRampToValueAtTime(0.1, endTime);

  const delay = audioContext.createDelay(2);
  delay.delayTime.setValueAtTime(0.371, now);
  const delayFeedback = audioContext.createGain();
  delayFeedback.gain.setValueAtTime(0.25, now);
  const delayFilter = audioContext.createBiquadFilter();
  delayFilter.type = 'lowpass';
  delayFilter.frequency.setValueAtTime(3000, now);
  delay.connect(delayFilter).connect(delayFeedback).connect(delay);
  delayFeedback.connect(globalFilter);

  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-20, now);
  compressor.knee.setValueAtTime(10, now);
  compressor.ratio.setValueAtTime(4, now);
  compressor.attack.setValueAtTime(0.01, now);
  compressor.release.setValueAtTime(0.1, now);

  masterGain.connect(globalFilter);
  masterGain.connect(sendGain);
  sendGain.connect(delay);
  globalFilter.connect(compressor);
  compressor.connect(audioContext.destination);

  // Fundamental with FM
  const fundOsc = audioContext.createOscillator();
  const fundGain = audioContext.createGain();
  fundOsc.type = 'sine';
  fundOsc.frequency.setValueAtTime(110, now);
  const modOsc = audioContext.createOscillator();
  const modGain = audioContext.createGain();
  modOsc.type = 'sine';
  modOsc.frequency.setValueAtTime(4.3, now);
  modGain.gain.setValueAtTime(0, now);
  modGain.gain.linearRampToValueAtTime(8, now + 3);
  modGain.gain.linearRampToValueAtTime(3, endTime);
  modOsc.connect(modGain).connect(fundOsc.frequency);
  fundOsc.connect(fundGain).connect(masterGain);
  fundGain.gain.setValueAtTime(0, now);
  fundGain.gain.linearRampToValueAtTime(0.25, now + 0.5);
  fundGain.gain.setValueAtTime(0.25, now + 14);
  fundGain.gain.linearRampToValueAtTime(0, endTime);
  fundOsc.start(now);
  fundOsc.stop(endTime);
  modOsc.start(now);
  modOsc.stop(endTime);

  // Harmonics
  const harmonics = [];
  for (let h = 2; h <= 16; h++) {
    const startOffset = 2 + (h - 2) * 0.25 + random() * 0.5;
    const startTime = now + startOffset;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110 * h, now);
    osc.detune.setValueAtTime((random() - 0.5) * 8, now);
    osc.connect(gain);
    gain.connect(masterGain);
    gain.connect(sendGain);

    const peakGain = 0.12 / Math.sqrt(h);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 1);
    gain.gain.linearRampToValueAtTime(peakGain * 0.4, startTime + 5);
    gain.gain.linearRampToValueAtTime(peakGain * 0.8, now + 10);
    gain.gain.linearRampToValueAtTime(0, endTime);

    osc.start(startTime);
    osc.stop(endTime);

    harmonics.push({
      h,
      startTime: startOffset,
      hue: (h * 37 + random() * 30) % 360,
      phase: random() * Math.PI * 2
    });
  }

  // Noise buffer
  const noiseLength = Math.floor(audioContext.sampleRate * 0.2);
  const noiseBuffer = audioContext.createBuffer(1, noiseLength, audioContext.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i++) {
    noiseData[i] = (random() * 2 - 1) * Math.exp(-i / (audioContext.sampleRate * 0.05));
  }

  // Percussion hits
  const hitTimes = [];
  for (let i = 0; i < 40; i++) {
    const progress = i / 40;
    const t = 3 + 10 * (progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2);
    const jitter = (random() - 0.5) * 0.15;
    const absTime = now + t + jitter;
    if (absTime < endTime - 0.5) hitTimes.push(absTime);
  }

  hitTimes.forEach(t => {
    const src = audioContext.createBufferSource();
    src.buffer = noiseBuffer;
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800 + random() * 4000, t);
    filter.Q.setValueAtTime(3 + random() * 5, t);
    src.connect(filter).connect(gain).connect(masterGain);
    gain.gain.setValueAtTime(0.15 * (0.5 + random() * 0.5), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    src.start(t);
  });

  // ========== VISUALS ==========
  const visualHitTimes = hitTimes.map(t => t - now);

  function drawFrame() {
    const elapsed = audioContext.currentTime - now;
    if (elapsed > duration) return;

    // Trails
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, 0, width, height);

    // Harmonic lines & particles
    harmonics.forEach(h => {
      const age = elapsed - h.startTime;
      if (age < 0) return;

      const maxLen = Math.min(width, height) * 0.45;
      const growSpeed = 80 + h.h * 5;
      const len = Math.min(maxLen, age * growSpeed);
      const rotSpeed = 0.15 * (1 + h.h * 0.05);
      const angle = h.phase + elapsed * rotSpeed;

      const x2 = cx + Math.cos(angle) * len;
      const y2 = cy + Math.sin(angle) * len;

      const hue = (h.hue + elapsed * 2) % 360;
      const alpha = 0.6 * Math.pow(1 - elapsed / duration, 0.5);
      ctx.strokeStyle = `hsla(${hue}, 70%, 60%, ${alpha})`;
      ctx.lineWidth = 1.5 + h.h * 0.15;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const numParticles = 2 + Math.floor(h.h / 4);
      for (let i = 0; i < numParticles; i++) {
        const cyclePeriod = 2 + h.h * 0.1;
        const p = ((elapsed * 0.5 / cyclePeriod) + i / numParticles) % 1;
        const px = cx + Math.cos(angle) * p * len;
        const py = cy + Math.sin(angle) * p * len;
        const particleAlpha = 0.8 * (1 - Math.abs(p - 0.5) * 2);
        ctx.fillStyle = `hsla(${hue}, 80%, 75%, ${particleAlpha * alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 2 + h.h * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Hit rings
    visualHitTimes.forEach(ht => {
      const age = elapsed - ht;
      if (age > 0 && age < 0.8) {
        const r = age * 400;
        const alpha = (1 - age / 0.8) * 0.4;
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 2 * (1 - age / 0.8);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        const hue = (elapsed * 50) % 360;
        ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${alpha * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // Central bloom
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3.1);
    const glowRadius = 40 + pulse * 30 + Math.sin(elapsed * 7) * 5;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
    grad.addColorStop(0, `hsla(${(elapsed * 20) % 360}, 100%, 80%, 0.6)`);
    grad.addColorStop(0.5, `hsla(${(elapsed * 20 + 60) % 360}, 80%, 60%, 0.2)`);
    grad.addColorStop(1, 'hsla(0,0%,0%,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    requestAnimationFrame(drawFrame);
  }

  requestAnimationFrame(drawFrame);
}