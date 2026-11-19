
export const title = "Nine Bars of Starlight";

export function start({ audioContext, canvas, duration, random }) {
  const ctx = audioContext;
  if (ctx.state === "suspended") ctx.resume();

  const g = canvas.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  const W = canvas.width || 1080;
  const H = canvas.height || 1350;
  const TAU = Math.PI * 2;
  const rnd = () => (typeof random === "function" ? random() : Math.random());

  // 36 beats over the supplied duration: nine 4/4 bars.
  const beat = duration / 36;
  const barDur = beat * 4;
  const t0 = ctx.currentTime + 0.08;

  // ---------- output chain ----------
  const master = ctx.createGain();
  master.gain.value = 0.9;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 18;
  comp.ratio.value = 5;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  master.connect(comp);
  comp.connect(ctx.destination);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;
  comp.connect(analyser);

  // generated impulse-response reverb
  const conv = ctx.createConvolver();
  const irLen = Math.floor(ctx.sampleRate * 2.2);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) {
      d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / irLen, 3.2) * 0.55;
    }
  }
  conv.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.24;
  master.connect(conv);
  conv.connect(wet);
  wet.connect(comp);

  // feedback delay, dotted-eighth-ish
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = beat * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const fbF = ctx.createBiquadFilter();
  fbF.type = "lowpass";
  fbF.frequency.value = 2400;
  const dWet = ctx.createGain();
  dWet.gain.value = 0.2;
  delay.connect(fbF);
  fbF.connect(fb);
  fb.connect(delay);
  delay.connect(dWet);
  dWet.connect(master);
  const delaySend = ctx.createGain();
  delaySend.gain.value = 1;
  delaySend.connect(delay);

  const busPluck = ctx.createGain();
  busPluck.gain.value = 0.85;
  busPluck.connect(master);
  busPluck.connect(delaySend);

  const busBass = ctx.createGain();
  busBass.gain.value = 0.95;
  busBass.connect(master);

  const busPad = ctx.createGain();
  busPad.gain.value = 0.8;
  busPad.connect(master);

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;

  // ---------- note events (audio + visual share this list) ----------
  const kindColor = {
    lead: [255, 205, 110],
    alto: [130, 220, 255],
    bass: [150, 120, 255],
    pad: [80, 255, 200],
    bell: [255, 255, 255]
  };
  const events = [];

  function panner(node, panVal) {
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = panVal;
      node.connect(p);
      return p;
    }
    return node;
  }

  function pluck(when, freq, dur, vel, opts = {}) {
    const filter = opts.filter || 3200;
    const rel = 0.35 + (opts.release || 0);

    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = opts.q || 0.9;
    f.frequency.setValueAtTime(Math.max(80, filter * 0.35), when);
    f.frequency.linearRampToValueAtTime(filter, when + 0.025);
    f.frequency.exponentialRampToValueAtTime(Math.max(90, filter * 0.35), when + dur + rel);

    const o1 = ctx.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = freq;
    o1.detune.value = (rnd() - 0.5) * 9;

    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = freq * 2;
    o2.detune.value = (rnd() - 0.5) * 12;
    const g2 = ctx.createGain();
    g2.gain.value = opts.bright ? 0.28 : 0.18;

    o1.connect(f);
    o2.connect(g2);
    g2.connect(f);

    const gOut = ctx.createGain();
    f.connect(gOut);
    gOut.gain.setValueAtTime(0.0001, when);
    gOut.gain.linearRampToValueAtTime(vel, when + 0.008);
    gOut.gain.exponentialRampToValueAtTime(0.0001, when + 0.008 + dur + rel);

    const out = panner(gOut, opts.pan || 0);
    out.connect(busPluck);

    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    n.loop = true;
    n.playbackRate.value = 0.8 + rnd() * 0.5;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = Math.min(12000, Math.max(800, freq * 3));
    nf.Q.value = 6;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vel * 0.25, when);
    ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
    n.connect(nf);
    nf.connect(ng);
    ng.connect(busPluck);

    const stopT = when + dur + rel + 0.15;
    o1.start(when); o2.start(when);
    o1.stop(stopT); o2.stop(stopT);
    n.start(when); n.stop(when + 0.08);
  }

  function bass(when, freq, dur, vel, pan) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(180, when);
    f.frequency.linearRampToValueAtTime(420, when + 0.05);
    f.frequency.exponentialRampToValueAtTime(160, when + dur + 0.2);

    const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = "triangle"; o2.frequency.value = freq;
    const g2 = ctx.createGain(); g2.gain.value = 0.45;
    const o3 = ctx.createOscillator(); o3.type = "sine"; o3.frequency.value = freq * 2;
    const g3 = ctx.createGain(); g3.gain.value = 0.12;

    o1.connect(f);
    o2.connect(g2); g2.connect(f);
    o3.connect(g3); g3.connect(f);

    const g = ctx.createGain();
    const a = 0.012;
    const hold = Math.max(0, dur - 0.03);
    const rel = 0.09;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vel, when + a);
    g.gain.setValueAtTime(vel, when + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, when + a + hold + rel);

    f.connect(g);
    const out = panner(g, pan);
    out.connect(busBass);

    const stopT = when + dur + rel + 0.1;
    [o1, o2, o3].forEach(o => { o.start(when); o.stop(stopT); });
  }

  function pad(when, freq, dur, vel, pan) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 0.6;
    const a = Math.min(0.6, dur * 0.45);
    f.frequency.setValueAtTime(220, when);
    f.frequency.linearRampToValueAtTime(950, when + a);
    f.frequency.exponentialRampToValueAtTime(240, when + dur + 0.8);

    const o1 = ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = freq; o1.detune.value = -6 + rnd() * 4;
    const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = freq; o2.detune.value = 6 + rnd() * 4;
    o1.connect(f); o2.connect(f);

    const g = ctx.createGain();
    const hold = Math.max(0, dur - a);
    const rel = 0.8;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vel, when + a);
    g.gain.setValueAtTime(vel, when + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, when + a + hold + rel);

    f.connect(g);
    const out = panner(g, pan);
    out.connect(busPad);

    const stopT = when + dur + rel + 0.2;
    o1.start(when); o2.start(when);
    o1.stop(stopT); o2.stop(stopT);
  }

  function bell(when, freq, vel) {
    const car = ctx.createOscillator();
    car.type = "sine";
    car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 2.76;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(freq * 3.2 * vel, when);
    mg.gain.exponentialRampToValueAtTime(1, when + 1.2);
    mod.connect(mg);
    mg.connect(car.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vel, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 2.8);

    car.connect(g);
    const out = panner(g, 0);
    out.connect(master);
    out.connect(delaySend);

    car.start(when); mod.start(when);
    car.stop(when + 3); mod.stop(when + 3);
  }

  function addNote(kind, beatOffset, lenBeats, midi, vel, opts = {}) {
    const jitter = (rnd() - 0.5) * 0.012;
    const off = beatOffset + jitter;
    const t = off * beat;
    const dur = Math.max(0.03, lenBeats * beat);
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const when = t0 + t;
    const pan = opts.pan !== undefined ? opts.pan : (rnd() - 0.5) * 0.5;

    if (kind === "lead" || kind === "alto") pluck(when, freq, dur, vel, { ...opts, pan });
    else if (kind === "bass") bass(when, freq, dur, vel, pan);
    else if (kind === "pad") pad(when, freq, dur, vel, pan);
    else if (kind === "bell") bell(when, freq, vel);

    const c = kindColor[kind];
    events.push({
      t, dur, midi, freq, vel, kind, pan,
      css: "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"
    });
  }

  // ---------- composition: D minor, nine bars ----------
  const chordNames = ["Dm", "B♭", "F", "C", "Gm", "Dm", "B♭", "C", "Dm"];
  const roots = [38, 34, 41, 36, 43, 38, 34, 36, 38];
  const chords = [
    [62, 65, 69], [58, 62, 65], [60, 65, 69], [60, 64, 67], [55, 58, 62],
    [62, 65, 69], [58, 62, 65], [60, 64, 67], [62, 65, 69]
  ];
  const leadBars = [
    [74, 76, 77, 79, 81, 79, 77, 76],
    [77, 76, 74, 72, 74, 77, 81, 79],
    [81, 79, 77, 76, 77, 81, 84, 83],
    [79, 81, 82, 84, 82, 81, 79, 77],
    [79, 82, 86, 84, 82, 79, 77, 76],
    [74, 77, 81, 79, 77, 76, 74, 72],
    [82, 81, 79, 77, 76, 77, 79, 81],
    [82, 84, 86, 84, 82, 81, 79, 77],
    [76, 77, 79, 81, 86, 84, null, null]
  ];

  for (let b = 0; b < 9; b++) {
    const chord = chords[b];
    const root = roots[b];

    for (const m of chord) {
      addNote("pad", b * 4, b === 8 ? 4.0 : 4.05, m, 0.16, { pan: (rnd() - 0.5) * 0.8 });
    }
    if (b === 8) addNote("pad", b * 4, 4.0, 74, 0.12, { pan: 0.2 });

    const bp = [
      [0, root, 0.9, 0.55],
      [1, root + 7, 0.9, 0.48],
      [2, root + 12, 0.9, 0.5],
      [3, root + 7, 0.9, 0.45]
    ];
    for (const [off, m, len, v] of bp) addNote("bass", b * 4 + off, len, m, v, { pan: -0.15 });
    if (rnd() < 0.35) addNote("bass", b * 4 + 3.5, 0.5, root + 10, 0.32, { pan: -0.1 });

    const patterns = [
      [0, 1, 2, 1, 0, 2, 1, 2],
      [0, 2, 1, 2, 0, 1, 2, 1],
      [1, 0, 2, 1, 0, 2, 1, 0]
    ];
    const pat = patterns[Math.floor(rnd() * patterns.length)];
    for (let i = 0; i < 8; i++) {
      let m = chord[pat[i]];
      if (i === 3 && rnd() < 0.5) m += 12;
      if (i === 7 && rnd() < 0.4) m += 12;
      addNote("alto", b * 4 + i * 0.5, 0.3, m, 0.16 + rnd() * 0.05, {
        filter: 2400,
        pan: (rnd() - 0.5) * 0.9
      });
    }

    const seq = leadBars[b];
    for (let i = 0; i < seq.length; i++) {
      const note = seq[i];
      if (note == null) continue;
      const off = b * 4 + i * 0.5;
      const len = (b === 8 && i === 7) ? 0.5 : 0.46;
      const v = 0.3 + (i === 0 ? 0.05 : 0) + rnd() * 0.04;
      addNote("lead", off, len, note, v, {
        filter: i % 2 ? 5200 : 6200,
        pan: i % 2 ? 0.18 : -0.18
      });
      if (i > 0 && off - b * 4 > 0.05 && rnd() < 0.22) {
        addNote("lead", off - 0.1, 0.085, note + (rnd() < 0.5 ? 1 : 2), v * 0.38, {
          filter: 6800,
          pan: -0.2
        });
      }
    }
  }

  addNote("lead", 35, 1.0, 86, 0.38, { filter: 7200, pan: 0 });
  addNote("lead", 35, 1.0, 74, 0.2, { filter: 5000, pan: -0.25 });
  addNote("bell", 0, 2.5, 86, 0.2);
  addNote("bell", 16, 2.5, 82, 0.16);
  addNote("bell", 32, 2.5, 86, 0.22);

  // gentle fade right before the harness cutoff
  master.gain.setValueAtTime(0.9, t0);
  master.gain.setValueAtTime(0.9, t0 + duration - 0.1);
  master.gain.linearRampToValueAtTime(0.0001, t0 + duration - 0.015);

  // ---------- visual ----------
  const fbuf = new Uint8Array(analyser.fftSize);
  const tbuf = new Uint8Array(analyser.fftSize);
  let rms = 0;

  const stars = [];
  for (let i = 0; i < 240; i++) {
    stars.push({
      x: rnd() * W,
      y: rnd() * H,
      r: 0.4 + rnd() * 1.6,
      ph: rnd() * TAU,
      sp: 0.3 + rnd() * 1.4,
      c: rnd()
    });
  }

  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#070a1a");
  bg.addColorStop(0.45, "#0b1030");
  bg.addColorStop(1, "#020309");

  const glow = g.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, H * 0.68);
  glow.addColorStop(0, "rgba(80, 125, 255, 0.22)");
  glow.addColorStop(0.45, "rgba(120, 70, 220, 0.10)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");

  const x0 = W * 0.08;
  const x1 = W * 0.92;

  function noteEnv(e, age) {
    const a = e.kind === "pad" ? 0.45 : e.kind === "bass" ? 0.012 : 0.01;
    if (age < a) return (age / a) * (e.kind === "pad" ? 0.9 : 1);
    if (e.kind === "pad" || e.kind === "bass") {
      return age < e.dur ? 1 : Math.exp(-(age - e.dur) * 4);
    }
    let v = Math.exp(-Math.max(0, age - a) / (e.dur * 0.65 + 0.12));
    if (age > e.dur) v *= Math.exp(-(age - e.dur) * 7);
    return Math.min(1, v * 1.2);
  }

  function draw(now) {
    analyser.getByteFrequencyData(fbuf);
    analyser.getByteTimeDomainData(tbuf);
    let sum = 0;
    for (let i = 0; i < tbuf.length; i += 4) {
      const v = (tbuf[i] - 128) / 128;
      sum += v * v;
    }
    rms = rms * 0.75 + Math.sqrt(sum / (tbuf.length / 4)) * 0.25;

    const p = Math.min(1, Math.max(0, now / duration));

    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = Math.min(1, 0.55 + rms * 2.2);
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;

    // stars
    g.globalCompositeOperation = "lighter";
    for (const s of stars) {
      const tw = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(now * s.sp + s.ph));
      g.globalAlpha = tw * (s.c < 0.12 ? 1 : 0.72);
      g.fillStyle = s.c < 0.12 ? "#ffdca8" : s.c < 0.5 ? "#cfe6ff" : "#ffffff";
      g.beginPath();
      g.arc(s.x, s.y, s.r, 0, TAU);
      g.fill();
    }

    // flowing staff ribbons
    g.globalCompositeOperation = "source-over";
    g.lineWidth = 1;
    for (let j = 0; j < 5; j++) {
      g.strokeStyle = "rgba(130, 180, 255, 0.20)";
      g.beginPath();
      for (let x = 0; x <= W; x += 18) {
        const y = H * 0.3 + j * H * 0.034 + Math.sin(x * 0.012 + now * 1.1 + j * 1.7) * (4 + rms * 14);
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }

    // bar lines
    g.strokeStyle = "rgba(190, 210, 255, 0.07)";
    for (let b = 0; b <= 9; b++) {
      const x = x0 + (b * barDur / duration) * (x1 - x0);
      g.beginPath();
      g.moveTo(x, H * 0.1);
      g.lineTo(x, H * 0.78);
      g.stroke();
    }

    // playhead
    const px = x0 + p * (x1 - x0);
    g.fillStyle = "rgba(255, 240, 200, 0.05)";
    g.fillRect(px - 12, 0, 24, H);
    g.fillStyle = "rgba(255, 240, 200, 0.22)";
    g.fillRect(px - 1, 0, 2, H);

    // notes
    g.globalCompositeOperation = "lighter";
    for (const e of events) {
      const age = now - e.t;
      if (age < -1.2 || age > e.dur + 1.6) continue;
      let env;
      if (age < 0) env = 0.08 * (1 + age / 1.2);
      else env = noteEnv(e, age);
      if (env <= 0.004) continue;

      const x = x0 + (e.t / duration) * (x1 - x0) + Math.max(0, age) * 10;
      const y = H * 0.7 - ((e.midi - 31) / (86 - 31)) * H * 0.5;
      const base = e.kind === "bass" ? 6 : e.kind === "pad" ? 8 : e.kind === "bell" ? 7 : 4.5;
      const r = base * (0.65 + e.vel) * (1 + env * 1.2 + rms * 3);

      g.fillStyle = e.css;
      g.globalAlpha = 0.1 * env * (age < 0 ? 0.4 : 1);
      g.beginPath();
      g.arc(x, y, r * 2.6, 0, TAU);
      g.fill();
      g.globalAlpha = Math.min(1, 0.85 * env);
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.globalAlpha = 0.12 * env;
      g.fillRect(x - r * 3, y - r * 0.25, r * 3, r * 0.5);
    }
    g.globalAlpha = 1;

    // reactive spectrum mandala
    const cx = W / 2;
    const cy = H * 0.8;
    const rot = now * 0.18 + rms * 2;
    for (let j = 0; j < 6; j++) {
      const rr = 54 + j * 34 + rms * 50;
      g.strokeStyle = "hsla(" + (230 + j * 12) + ",80%,65%,0.10)";
      g.lineWidth = 1;
      g.beginPath();
      g.arc(cx, cy, rr, 0, TAU);
      g.stroke();
    }
    const bins = 56;
    g.lineWidth = 1.4;
    for (let i = 0; i < bins; i++) {
      const v = fbuf[Math.floor(i * fbuf.length / bins)] / 255;
      const a = rot + (i / bins) * TAU;
      const r0 = 70 + (i % 8);
      const r1 = r0 + 18 + v * (120 + 260 * rms);
      g.strokeStyle = "hsla(" + (190 + i * 2.5) + ",90%," + (60 + v * 20) + "%," + (0.12 + v * 0.55) + ")";
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.stroke();
    }

    // waveform ribbon
    g.strokeStyle = "rgba(120, 235, 255, 0.55)";
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < tbuf.length; i += 8) {
      const x = (i / tbuf.length) * W;
      const y = H * 0.93 + ((tbuf[i] - 128) / 128) * H * 0.055 * (1 + rms * 2.5);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();

    // text
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 0.78;
    g.fillStyle = "#eaf1ff";
    g.textAlign = "left";
    g.textBaseline = "top";
    g.font = "600 34px system-ui, -apple-system, Segoe UI, sans-serif";
    g.fillText(title, W * 0.06, H * 0.045);
    g.textAlign = "right";
    g.font = "500 26px system-ui, -apple-system, Segoe UI, sans-serif";
    g.fillText(now.toFixed(2) + " / " + duration.toFixed(2) + "s", W * 0.94, H * 0.05);

    g.textAlign = "center";
    g.font = "22px system-ui, -apple-system, Segoe UI, sans-serif";
    g.globalAlpha = 0.38;
    for (let b = 0; b < 9; b++) {
      const x = x0 + (((b + 0.5) * barDur) / duration) * (x1 - x0);
      g.fillText(chordNames[b], x, H * 0.965);
    }
    g.globalAlpha = 1;
  }

  function frame() {
    const raw = ctx.currentTime - t0;
    if (raw >= duration) {
      draw(duration);
      return;
    }
    draw(raw < 0 ? 0 : raw);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
