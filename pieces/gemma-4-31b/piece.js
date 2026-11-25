/**
 * Title: Clockwork Singularity
 * Concept: A fusion of Baroque polyphony and futuristic FM synthesis.
 * The piece explores the intersection of mathematical precision and organic decay.
 */

export const title = "Clockwork Singularity";

export function start({ audioContext, canvas, duration, random }) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;

  // --- Audio Engine ---
  
  // FM Synthesizer helper
  const createFMSynth = (freq, modIndex, modRatio, gainValue) => {
    const carrier = audioContext.createOscillator();
    const modulator = audioContext.createOscillator();
    const modGain = audioContext.createGain();
    const mainGain = audioContext.createGain();

    carrier.type = 'sine';
    modulator.type = 'sine';

    modulator.frequency.value = freq * modRatio;
    modGain.gain.value = freq * modIndex;
    
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(mainGain);
    mainGain.connect(audioContext.destination);

    return { carrier, modulator, mainGain };
  };

  const playNote = (time, freq, duration, vol = 0.2, modIdx = 10, modRat = 2) => {
    const synth = createFMSynth(freq, modIdx, modRat, vol);
    synth.mainGain.gain.setValueAtTime(0, time);
    synth.mainGain.gain.linearRampToValueAtTime(vol, time + 0.01);
    synth.mainGain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    
    synth.carrier.frequency.setValueAtTime(freq, time);
    synth.modulator.frequency.setValueAtTime(freq * modRat, time);
    
    synth.carrier.start(time);
    synth.modulator.start(time);
    synth.carrier.stop(time + duration);
    synth.modulator.stop(time + duration);
  };

  // Harmonic progression (A minor / Phrygian blend)
  const scale = [110.00, 130.81, 146.83, 164.81, 196.00, 220.00, 246.94, 261.63];
  const chords = [
    [0, 2, 4], // Am
    [3, 5, 7], // Em/G
    [1, 3, 5], // C
    [2, 4, 6]  // Dm/F
  ];

  const now = audioContext.currentTime;

  // 1. The Bed: Evolving Low Drone
  const drone = audioContext.createOscillator();
  const droneGain = audioContext.createGain();
  drone.type = 'sawtooth';
  drone.frequency.value = 55; // A1
  
  const lowPass = audioContext.createBiquadFilter();
  lowPass.type = 'lowpass';
  lowPass.frequency.setValueAtTime(200, now);
  lowPass.frequency.linearRampToValueAtTime(800, now + 7);
  lowPass.frequency.linearRampToValueAtTime(200, now + 15);

  drone.connect(lowPass);
  lowPass.connect(droneGain);
  droneGain.connect(audioContext.destination);
  droneGain.gain.setValueAtTime(0, now);
  droneGain.gain.linearRampToValueAtTime(0.1, now + 2);
  droneGain.gain.exponentialRampToValueAtTime(0.0001, now + 15);
  drone.start(now);
  drone.stop(now + 15);

  // 2. The Clockwork: Polyrhythmic FM Sequence
  const bpm = 124;
  const beatStep = 60 / bpm;
  
  for (let i = 0; i < 60; i++) {
    const time = now + i * (beatStep / 2);
    if (time >= now + 15) break;

    // Interlocking rhythms (3 vs 4)
    if (i % 3 === 0) {
      const note = scale[Math.floor(random() * 4)];
      playNote(time, note * 2, 0.2, 0.1, 20, 1.5);
    }
    if (i % 4 === 0) {
      const note = scale[Math.floor(random() * 8)];
      playNote(time, note * 4, 0.1, 0.05, 50, 3.1);
    }
    
    // Accent on the downbeat
    if (i % 8 === 0) {
      playNote(time, 55, 0.4, 0.2, 5, 1);
    }
  }

  // 3. The Melodic Arc (Bach-inspired counterpoint)
  const melody = [
    [0, 2, 4, 2, 0], [1, 3, 5, 3, 1], [2, 4, 6, 4, 2], [3, 5, 7, 5, 3]
  ];
  
  for (let bar = 0; bar < 4; bar++) {
    const barStart = now + bar * (beatStep * 4);
    melody[bar].forEach((noteIdx, step) => {
      const freq = scale[noteIdx] * 2;
      playNote(barStart + step * beatStep, freq, 0.3, 0.15, 15, 2);
    });
  }

  // --- Visual Engine ---

  let frame = 0;
  const particles = Array.from({ length: 100 }, () => ({
    angle: random() * Math.PI * 2,
    dist: random() * 400,
    size: random() * 3 + 1,
    speed: (random() - 0.5) * 0.02
  }));

  function animate() {
    frame++;
    const time = (Date.now() / 1000) % 15;
    
    // Background: Deep obsidian gradient
    const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 700);
    grad.addColorStop(0, '#0a0a12');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Audio-reactive pulse
    const pulse = Math.sin(time * Math.PI * 2 * (bpm/60)) * 20;
    const glow = (Math.sin(time * 0.5) + 1) * 0.5;

    ctx.save();
    ctx.translate(centerX, centerY);

    // Draw "The Clockwork"
    for (let r = 0; r < 6; r++) {
      ctx.rotate(frame * 0.002 * (r % 2 === 0 ? 1 : -1));
      
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${100 + glow * 155}, ${150 + glow * 105}, 255, ${0.2 + (glow * 0.3)})`;
      ctx.lineWidth = 1;
      
      const radius = 100 + r * 50 + pulse;
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Draw ticking markers
      for (let m = 0; m < 12; m++) {
        ctx.rotate(Math.PI / 6);
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(radius + 10, 0);
        ctx.stroke();
      }
    }

    // Draw Particles
    particles.forEach(p => {
      p.angle += p.speed;
      const x = Math.cos(p.angle) * p.dist;
      const y = Math.sin(p.angle) * p.dist;
      
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 215, 0, ${0.4 + glow * 0.6})`;
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();

      // Connect particles to center if they are aligned with the pulse
      if (Math.abs(pulse) > 15) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255, 255, 255, 0.05)`;
        ctx.moveTo(0, 0);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    });

    // Central Core
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 40 + pulse);
    coreGrad.addColorStop(0, '#fff');
    coreGrad.addColorStop(0.4, '#44aaff');
    coreGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 60 + pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (time < 15) {
      requestAnimationFrame(animate);
    }
  }

  animate();
}

