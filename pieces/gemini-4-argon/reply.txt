export const title = "CONTRA·PUNCTUS IV — Chaconne in the Hypercube";

export function start({ audioContext, canvas, duration = 15, random = Math.random }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width || 1080;
  const H = canvas.height || 1350;

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  // ============================================================================
  // 1. MUSICAL ARCHITECTURE & SCORE (8 Bars, 128 Sixteenth-Note Steps @ 128 BPM)
  // ============================================================================
  const TOTAL_STEPS = 128;
  const STEP_DUR = duration / TOTAL_STEPS; // 0.1171875s at 15.0s (exactly 128.0 BPM)
  const t0 = audioContext.currentTime + 0.02;

  const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const midiToName = (m) => NOTE_NAMES[Math.round(m) % 12] + (Math.floor(Math.round(m) / 12) - 1);

  // Harmonic & Structural Metadata across the 8 bars
  const HARMONY_TIMELINE = [
    { step: 0,   bar: 1, numeral: "i (D minor)",       device: "I. SOLO SUBJECT & MORDENT",         p: 3, q: 2, tension: 0.25, mode: 0 },
    { step: 8,   bar: 1, numeral: "V6/5 → i",          device: "I. LEADING-TONE BARIOLAGE",         p: 5, q: 3, tension: 0.40, mode: 0 },
    { step: 16,  bar: 2, numeral: "V7 (A7) → i",       device: "II. FUGAL ANSWER IN THE ALTO",      p: 4, q: 3, tension: 0.45, mode: 0 },
    { step: 24,  bar: 2, numeral: "V6/5 of iv → iv",   device: "II. CHROMATIC INFLECTION (F# / C)", p: 7, q: 5, tension: 0.62, mode: 0 },
    { step: 32,  bar: 3, numeral: "iv7 → VII7",        device: "III. CIRCLE OF FIFTHS & PEDAL 16'", p: 6, q: 5, tension: 0.55, mode: 0 },
    { step: 40,  bar: 3, numeral: "IIImaj7 → VImaj7",  device: "III. 7-6 & 4-3 SUSPENSION CHAIN",   p: 5, q: 4, tension: 0.50, mode: 0 },
    { step: 48,  bar: 4, numeral: "ii°7 → V6/5",       device: "IV. CONTRARY CHROMATIC ASCENT",     p: 7, q: 4, tension: 0.72, mode: 0 },
    { step: 56,  bar: 4, numeral: "i → V/V → V7(b9)",  device: "IV. HALF-CADENCE PHRYGIAN TURN",    p: 9, q: 5, tension: 0.85, mode: 0 },
    { step: 64,  bar: 5, numeral: "i → i7/VII",        device: "V. STRETTO & SUBJECT INVERSION",    p: 8, q: 5, tension: 0.75, mode: 0 },
    { step: 72,  bar: 5, numeral: "VImaj7 → V6/5",     device: "V. CHACONNE DESCENDING TETRACHORD", p: 7, q: 6, tension: 0.80, mode: 0 },
    { step: 80,  bar: 6, numeral: "i6 → iv6",          device: "VI. THREE-STRAND BARIOLAGE BRAID",  p: 6, q: 5, tension: 0.78, mode: 0 },
    { step: 88,  bar: 6, numeral: "bIImaj7 → vii°7/V", device: "VI. NEAPOLITAN CRISIS (Eb → C#°7)", p: 11, q: 7, tension: 0.96, mode: 0 },
    { step: 96,  bar: 7, numeral: "i6/4 → V7sus4",     device: "VII. DOMINANT PEDAL POINT CLIMAX",  p: 9, q: 8, tension: 0.92, mode: 0 },
    { step: 104, bar: 7, numeral: "V7(b9) CASCADE",    device: "VII. 32ND-NOTE CADENTIAL FLOURISH", p: 12, q: 7, tension: 1.00, mode: 0 },
    { step: 112, bar: 8, numeral: "Isus4 (4-3 SUSP.)", device: "VIII. CATHEDRAL 4-3 SUSPENSION",    p: 4, q: 3, tension: 0.60, mode: 1 },
    { step: 116, bar: 8, numeral: "I (D MAJOR PICARDY)", device: "VIII. PICARDY TRANSFIGURATION",   p: 6, q: 4, tension: 0.10, mode: 2 },
  ];

  // [step, midi, durSteps, velocity]
  // Voice 1: Soprano ("Aurelia" — Hybrid Plucked Harpsichord-Lute & Bowed Violino)
  const scoreV1 = [
    // Bar 1: Solo Subject
    [0, 81, 1, 0.92], [1, 82, 1, 0.86], [2, 81, 2, 0.95],
    [4, 79, 1, 0.84], [5, 77, 1, 0.82], [6, 76, 1, 0.84], [7, 74, 1, 0.86],
    [8, 73, 2, 0.94], [10, 74, 1, 0.85], [11, 76, 1, 0.88],
    [12, 77, 2, 0.92], [14, 76, 1, 0.84], [15, 74, 1, 0.82],
    // Bar 2: Counter-Subject above Alto Answer
    [16, 73, 3, 0.90], [19, 76, 1, 0.84],
    [20, 81, 2, 0.94], [22, 79, 1, 0.86], [23, 77, 1, 0.84],
    [24, 76, 1, 0.92], [25, 74, 1, 0.86], [26, 72, 1, 0.88], [27, 69, 1, 0.82],
    [28, 70, 1, 0.90], [29, 74, 1, 0.88], [30, 79, 1, 0.94], [31, 77, 1, 0.88],
    // Bar 3: Circle of Fifths Sequence
    [32, 76, 1, 0.92], [33, 74, 1, 0.86], [34, 82, 2, 0.96],
    [36, 81, 1, 0.92], [37, 79, 1, 0.86], [38, 76, 1, 0.88], [39, 72, 1, 0.84],
    [40, 74, 1, 0.92], [41, 72, 1, 0.86], [42, 81, 2, 0.95],
    [44, 79, 1, 0.90], [45, 77, 1, 0.86], [46, 74, 1, 0.88], [47, 70, 1, 0.84],
    // Bar 4: Chromatic Ascent to Half-Cadence
    [48, 79, 1, 0.92], [49, 76, 1, 0.86], [50, 82, 1, 0.95], [51, 79, 1, 0.88],
    [52, 81, 1, 0.94], [53, 79, 1, 0.88], [54, 77, 1, 0.88], [55, 76, 1, 0.86],
    [56, 77, 1, 0.92], [57, 74, 1, 0.86], [58, 83, 1, 0.98], [59, 76, 1, 0.90],
    [60, 73, 1, 0.94], [61, 76, 1, 0.90], [62, 81, 2, 0.98],
    // Bar 5: Stretto Lead
    [64, 86, 1, 0.98], [65, 85, 1, 0.92], [66, 86, 1, 0.96], [67, 81, 1, 0.90],
    [68, 77, 1, 0.92], [69, 76, 1, 0.88], [70, 77, 1, 0.92], [71, 81, 1, 0.94],
    [72, 74, 1, 0.92], [73, 73, 1, 0.88], [74, 74, 1, 0.90], [75, 77, 1, 0.92],
    [76, 76, 1, 0.92], [77, 79, 1, 0.94], [78, 82, 1, 0.96], [79, 81, 1, 0.94],
    // Bar 6: Neapolitan Crisis & Diminished Launch
    [80, 81, 1, 0.94], [81, 77, 1, 0.88], [82, 74, 1, 0.86], [83, 81, 1, 0.92],
    [84, 82, 1, 0.95], [85, 79, 1, 0.88], [86, 74, 1, 0.86], [87, 82, 1, 0.94],
    [88, 79, 1, 0.98], [89, 75, 1, 0.92], [90, 82, 1, 0.98], [91, 79, 1, 0.92],
    [92, 76, 1, 0.94], [93, 79, 1, 0.94], [94, 82, 1, 0.96], [95, 85, 1, 1.00],
    // Bar 7: Dominant Pedal Climax & 32nd-Note Cascade
    [96, 86, 2, 1.00], [98, 81, 1, 0.92], [99, 77, 1, 0.90],
    [100, 79, 1, 0.94], [101, 77, 1, 0.90], [102, 76, 1, 0.92], [103, 74, 1, 0.90],
    [104, 73, 1, 0.94], [105, 76, 1, 0.94], [106, 79, 1, 0.96], [107, 82, 1, 0.98],
    [108, 81, 1, 0.98], [109, 79, 1, 0.94],
    [110, 77, 0.5, 0.95], [110.5, 76, 0.5, 0.92], [111, 74, 0.5, 0.92], [111.5, 73, 0.5, 0.96],
    // Bar 8: 4-3 Suspension (G5 -> F#5) Picardy Resolution
    [112, 79, 3, 1.00], [115, 76, 1, 0.90], [116, 78, 10.5, 1.00],
  ];

  // Voice 2: Alto ("Oboe d'Amore / Golden Horn" — Warm Formant Reed-Brass)
  const scoreV2 = [
    // Bar 2: Fugal Answer
    [16, 64, 1, 0.88], [17, 65, 1, 0.84], [18, 64, 2, 0.90],
    [20, 62, 1, 0.84], [21, 61, 1, 0.82], [22, 62, 1, 0.85], [23, 64, 1, 0.86],
    [24, 66, 2, 0.92], [26, 67, 1, 0.86], [27, 69, 1, 0.88],
    [28, 70, 2, 0.92], [30, 69, 1, 0.86], [31, 67, 1, 0.84],
    // Bar 3: Suspensions in Circle of Fifths
    [32, 67, 2, 0.88], [34, 70, 2, 0.90],
    [36, 65, 2, 0.92], [38, 64, 2, 0.88],
    [40, 65, 2, 0.88], [42, 69, 2, 0.90],
    [44, 64, 2, 0.92], [46, 62, 2, 0.88],
    // Bar 4: Inner Chromatic Counter-Line
    [48, 70, 2, 0.88], [50, 74, 2, 0.90],
    [52, 76, 2, 0.92], [54, 73, 2, 0.90],
    [56, 69, 2, 0.88], [58, 74, 1, 0.92], [59, 71, 1, 0.90],
    [60, 69, 1, 0.90], [61, 73, 1, 0.92], [62, 76, 2, 0.95],
    // Bar 5: Stretto in Inversion
    [64, 65, 2, 0.88], [66, 69, 2, 0.92],
    [68, 69, 1, 0.90], [69, 67, 1, 0.86], [70, 69, 1, 0.90], [71, 72, 1, 0.92],
    [72, 70, 1, 0.90], [73, 69, 1, 0.86], [74, 70, 1, 0.90], [75, 74, 1, 0.92],
    [76, 73, 2, 0.94], [78, 76, 1, 0.92], [79, 73, 1, 0.90],
    // Bar 6: Neapolitan Harmony
    [80, 74, 2, 0.90], [82, 77, 2, 0.92],
    [84, 74, 2, 0.90], [86, 79, 2, 0.94],
    [88, 75, 2, 0.96], [90, 74, 2, 0.94],
    [92, 73, 2, 0.94], [94, 76, 2, 0.96],
    // Bar 7: Dominant Climax
    [96, 77, 2, 0.96], [98, 74, 2, 0.92],
    [100, 74, 2, 0.95], [102, 73, 2, 0.94],
    [104, 76, 1, 0.92], [105, 73, 1, 0.90], [106, 76, 1, 0.94], [107, 79, 1, 0.96],
    [108, 77, 1, 0.96], [109, 76, 1, 0.94], [110, 74, 1, 0.94], [111, 76, 1, 0.95],
    // Bar 8: Golden Fifths Core
    [112, 74, 4, 0.96], [116, 74, 10.5, 0.96],
  ];

  // Voice 3: Tenor ("Cristallo" — Crystalline Bariolage Marimba-Clavier)
  const scoreV3 = [
    // Bar 1
    [4, 62, 2, 0.72], [6, 69, 2, 0.76],
    [8, 64, 1, 0.78], [9, 69, 1, 0.74], [10, 67, 1, 0.78], [11, 69, 1, 0.74],
    [12, 65, 1, 0.80], [13, 69, 1, 0.74], [14, 67, 1, 0.78], [15, 69, 1, 0.74],
    // Bar 2
    [16, 57, 1, 0.80], [17, 69, 1, 0.74], [18, 67, 1, 0.78], [19, 69, 1, 0.74],
    [20, 65, 1, 0.80], [21, 69, 1, 0.74], [22, 64, 1, 0.78], [23, 69, 1, 0.74],
    [24, 62, 1, 0.82], [25, 69, 1, 0.76], [26, 62, 1, 0.80], [27, 66, 1, 0.82],
    [28, 67, 1, 0.82], [29, 62, 1, 0.76], [30, 58, 1, 0.80], [31, 62, 1, 0.78],
    // Bar 3
    [32, 62, 1, 0.82], [33, 67, 1, 0.78], [34, 65, 1, 0.82], [35, 67, 1, 0.78],
    [36, 60, 1, 0.82], [37, 67, 1, 0.78], [38, 70, 1, 0.84], [39, 67, 1, 0.78],
    [40, 60, 1, 0.82], [41, 65, 1, 0.78], [42, 64, 1, 0.84], [43, 65, 1, 0.78],
    [44, 58, 1, 0.82], [45, 65, 1, 0.78], [46, 69, 1, 0.84], [47, 65, 1, 0.78],
    // Bar 4
    [48, 67, 1, 0.82], [49, 61, 1, 0.80], [50, 64, 1, 0.82], [51, 70, 1, 0.84],
    [52, 69, 1, 0.84], [53, 64, 1, 0.78], [54, 67, 1, 0.82], [55, 69, 1, 0.80],
    [56, 65, 1, 0.84], [57, 69, 1, 0.80], [58, 64, 1, 0.84], [59, 68, 1, 0.88],
    [60, 64, 1, 0.86], [61, 69, 1, 0.84], [62, 67, 1, 0.84], [63, 64, 1, 0.80],
    // Bar 5
    [64, 62, 1, 0.86], [65, 69, 1, 0.80], [66, 65, 1, 0.84], [67, 69, 1, 0.80],
    [68, 64, 1, 0.86], [69, 69, 1, 0.80], [70, 65, 1, 0.84], [71, 69, 1, 0.82],
    [72, 65, 1, 0.86], [73, 70, 1, 0.82], [74, 62, 1, 0.84], [75, 70, 1, 0.82],
    [76, 64, 1, 0.86], [77, 69, 1, 0.82], [78, 67, 1, 0.86], [79, 69, 1, 0.84],
    // Bar 6
    [80, 69, 1, 0.86], [81, 62, 1, 0.80], [82, 65, 1, 0.84], [83, 69, 1, 0.84],
    [84, 67, 1, 0.86], [85, 62, 1, 0.80], [86, 70, 1, 0.86], [87, 67, 1, 0.84],
    [88, 70, 1, 0.90], [89, 63, 1, 0.86], [90, 67, 1, 0.88], [91, 70, 1, 0.88],
    [92, 70, 1, 0.88], [93, 64, 1, 0.86], [94, 67, 1, 0.88], [95, 69, 1, 0.90],
    // Bar 7
    [96, 69, 1, 0.90], [97, 65, 1, 0.86], [98, 62, 1, 0.86], [99, 69, 1, 0.88],
    [100, 71, 1, 0.88], [101, 67, 1, 0.86], [102, 64, 1, 0.86], [103, 69, 1, 0.88],
    [104, 69, 1, 0.90], [105, 64, 1, 0.86], [106, 61, 1, 0.88], [107, 67, 1, 0.90],
    [108, 65, 1, 0.90], [109, 67, 1, 0.90], [110, 69, 1, 0.92], [111, 67, 1, 0.92],
    // Bar 8: Luminous Ascending Harp/Clavier Arpeggio into D6 Bell
    [112, 62, 1, 0.92], [113, 69, 1, 0.90], [114, 74, 1, 0.92], [115, 67, 1, 0.92],
    [116, 66, 1, 0.98], [117, 69, 1, 0.92], [118, 74, 1, 0.94], [119, 78, 1, 0.96],
    [120, 81, 1, 0.98], [121, 86, 6, 1.00],
  ];

  // Voice 4: Bass ("Sub-Continuo 16'" — Pipe Organ Pedal & Bowed Violoncello)
  const scoreV4 = [
    // Bar 1 (Pizzicato Continuo)
    [0, 50, 4, 0.72], [8, 45, 4, 0.74], [12, 50, 4, 0.76],
    // Bar 2
    [16, 45, 4, 0.82], [20, 50, 4, 0.84], [24, 48, 4, 0.86], [28, 46, 2, 0.86], [30, 43, 2, 0.86],
    // Bar 3 (16' Pedal Entry)
    [32, 31, 3, 0.94], [35, 43, 1, 0.84],
    [36, 36, 3, 0.94], [39, 48, 1, 0.84],
    [40, 29, 3, 0.95], [43, 41, 1, 0.85],
    [44, 34, 3, 0.95], [47, 46, 1, 0.85],
    // Bar 4
    [48, 40, 4, 0.94],
    [52, 37, 2, 0.94], [54, 33, 2, 0.94],
    [56, 38, 2, 0.95], [58, 32, 2, 0.98],
    [60, 33, 3.5, 0.98],
    // Bar 5 (Chaconne Tetrachord with Octave Leaps)
    [64, 26, 2, 0.98], [66, 38, 1, 0.88], [67, 33, 1, 0.88],
    [68, 36, 2, 0.96], [70, 48, 1, 0.88], [71, 43, 1, 0.88],
    [72, 34, 2, 0.96], [74, 46, 1, 0.88], [75, 41, 1, 0.88],
    [76, 33, 2, 0.98], [78, 37, 1, 0.90], [79, 33, 1, 0.90],
    // Bar 6 (Neapolitan Sub-Pedal)
    [80, 29, 2, 0.96], [82, 38, 2, 0.92],
    [84, 31, 2, 0.96], [86, 34, 2, 0.94],
    [88, 27, 2, 1.00], [90, 39, 2, 0.94],
    [92, 33, 2, 0.98], [94, 31, 1, 0.94], [95, 28, 1, 0.94],
    // Bar 7 (Dominant Pedal Point)
    [96, 33, 4, 1.00],
    [100, 33, 2, 0.98], [102, 45, 2, 0.94],
    [104, 33, 2, 0.98], [106, 40, 2, 0.94],
    [108, 33, 2, 1.00], [110, 31, 1, 0.96], [111, 28, 1, 0.98],
    // Bar 8 (Grand Picardy D1 + D2 Pedal)
    [112, 26, 14.5, 1.00],
  ];

  const ALL_VOICES = [
    { id: 0, name: "I. SOPRANO", sub: "AURELIA VIOLINO", color: "#ffd97d", glow: "#ffaa00", pan: 0.26, notes: scoreV1 },
    { id: 1, name: "II. ALTO",   sub: "OBOE D'AMORE",    color: "#ff6b4a", glow: "#ff2a00", pan: -0.30, notes: scoreV2 },
    { id: 2, name: "III. TENOR", sub: "CRISTALLO LUTA",  color: "#38f2ff", glow: "#00a8ff", pan: 0.12, notes: scoreV3 },
    { id: 3, name: "IV. PEDAL",  sub: "ORGANO 16' BASS", color: "#c77dff", glow: "#7b2cbf", pan: 0.00, notes: scoreV4 },
  ];

  // ============================================================================
  // 2. STUDIO DSP & SYNTHESIS ENGINE (Convolver, Stereo Delay, Master Bus)
  // ============================================================================
  const masterGain = audioContext.createGain();
  masterGain.gain.setValueAtTime(0.88, t0);
  // Smooth master tail fade-out right before 15.0s cutoff
  masterGain.gain.setValueAtTime(0.88, t0 + duration - 0.45);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration - 0.02);

  // Soft-knee Mastering Compressor
  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-13, t0);
  compressor.knee.setValueAtTime(10, t0);
  compressor.ratio.setValueAtTime(3.2, t0);
  compressor.attack.setValueAtTime(0.004, t0);
  compressor.release.setValueAtTime(0.14, t0);

  // Real-time Analyser for Cymatics & Waveform Chords
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.78;
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.fftSize);

  // Custom Seeded Cathedral Impulse Response (2.1s stereo)
  const createCathedralImpulse = () => {
    const rate = audioContext.sampleRate;
    const len = Math.floor(rate * 2.1);
    const buffer = audioContext.createBuffer(2, len, rate);
    const L = buffer.getChannelData(0);
    const R = buffer.getChannelData(1);

    // Golden-ratio early reflections
    const earlyMs = [11, 17, 26, 39, 53, 71, 94];
    for (let i = 0; i < earlyMs.length; i++) {
      const idx = Math.floor((earlyMs[i] / 1000) * rate);
      if (idx < len) {
        const amp = Math.pow(0.76, i) * 0.35;
        L[idx] += (i % 2 === 0 ? 1 : -0.6) * amp;
        R[idx] += (i % 2 === 1 ? 1 : -0.6) * amp;
      }
    }

    // Warm low-pass damped diffuse tail
    let lpL = 0;
    let lpR = 0;
    for (let i = Math.floor(rate * 0.015); i < len; i++) {
      const p = i / len;
      const env = Math.pow(1 - p, 2.6) * Math.exp(-p * 3.2);
      const damp = 0.25 + 0.55 * (1 - p);
      lpL = lpL * (1 - damp) + (random() * 2 - 1) * damp;
      lpR = lpR * (1 - damp) + (random() * 2 - 1) * damp;
      L[i] += lpL * env * 0.42;
      R[i] += lpR * env * 0.42;
    }
    return buffer;
  };

  const convolver = audioContext.createConvolver();
  convolver.buffer = createCathedralImpulse();
  const reverbGain = audioContext.createGain();
  reverbGain.gain.setValueAtTime(0.32, t0);

  // Stereo Ping-Pong Haasian Delay for Upper Counterpoint
  const delayL = audioContext.createDelay(1.0);
  const delayR = audioContext.createDelay(1.0);
  delayL.delayTime.setValueAtTime(STEP_DUR * 2, t0);
  delayR.delayTime.setValueAtTime(STEP_DUR * 3, t0);
  const delayFilter = audioContext.createBiquadFilter();
  delayFilter.type = "lowpass";
  delayFilter.frequency.setValueAtTime(2400, t0);
  const delayFeedback = audioContext.createGain();
  delayFeedback.gain.setValueAtTime(0.18, t0);
  const delayMerge = audioContext.createChannelMerger(2);
  const delaySend = audioContext.createGain();
  delaySend.gain.setValueAtTime(0.16, t0);

  delaySend.connect(delayFilter);
  delayFilter.connect(delayL);
  delayFilter.connect(delayR);
  delayL.connect(delayFeedback);
  delayFeedback.connect(delayR);
  delayL.connect(delayMerge, 0, 0);
  delayR.connect(delayMerge, 0, 1);

  const dryBus = audioContext.createGain();
  dryBus.gain.setValueAtTime(0.9, t0);

  dryBus.connect(compressor);
  convolver.connect(reverbGain);
  reverbGain.connect(compressor);
  delayMerge.connect(compressor);

  compressor.connect(masterGain);
  masterGain.connect(analyser);
  analyser.connect(audioContext.destination);

  // Instrument 1: Voice 1 Soprano ("Aurelia" — Plucked Clavier-Lute + Bowed Singing Sustain)
  const playVoice1 = (time, midi, dur, vel) => {
    const freq = midiToFreq(midi);
    const p = audioContext.createStereoPanner();
    p.pan.setValueAtTime(0.26 + Math.sin(midi * 0.5) * 0.08, time);

    const vca = audioContext.createGain();
    const amp = vel * 0.22;
    vca.gain.setValueAtTime(0.0001, time);
    vca.gain.linearRampToValueAtTime(amp, time + 0.006);
    vca.gain.exponentialRampToValueAtTime(amp * 0.68, time + Math.min(0.08, dur * 0.5));
    vca.gain.setValueAtTime(amp * 0.68, time + Math.max(0.01, dur - 0.025));
    vca.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.06);

    const vcf = audioContext.createBiquadFilter();
    vcf.type = "lowpass";
    vcf.Q.setValueAtTime(2.4, time);
    vcf.frequency.setValueAtTime(freq * 6.5, time);
    vcf.frequency.exponentialRampToValueAtTime(freq * 3.2, time + Math.min(0.14, dur));

    // Sawtooth + Detuned Triangle Core
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    osc1.type = "sawtooth";
    osc2.type = "triangle";
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.0022, time);

    // Expressive Baroque Vibrato on notes >= 2 steps
    if (dur >= STEP_DUR * 1.8) {
      const vib = audioContext.createOscillator();
      const vibGain = audioContext.createGain();
      vib.frequency.setValueAtTime(5.5, time);
      vibGain.gain.setValueAtTime(0.01, time);
      vibGain.gain.linearRampToValueAtTime(freq * 0.0065, time + 0.15);
      vib.connect(vibGain);
      vibGain.connect(osc1.frequency);
      vibGain.connect(osc2.frequency);
      vib.start(time);
      vib.stop(time + dur + 0.07);
    }

    // Crisp Harpsichord Jack Transient (FM 2:1 burst)
    const pluckOsc = audioContext.createOscillator();
    const pluckGain = audioContext.createGain();
    pluckOsc.type = "sine";
    pluckOsc.frequency.setValueAtTime(freq * 3, time);
    pluckGain.gain.setValueAtTime(freq * 1.8 * vel, time);
    pluckGain.gain.exponentialRampToValueAtTime(0.01, time + 0.032);
    pluckOsc.connect(pluckGain);
    pluckGain.connect(osc1.frequency);

    osc1.connect(vcf);
    osc2.connect(vcf);
    vcf.connect(vca);
    vca.connect(p);
    p.connect(dryBus);
    p.connect(convolver);
    p.connect(delaySend);

    osc1.start(time);
    osc2.start(time);
    pluckOsc.start(time);
    osc1.stop(time + dur + 0.07);
    osc2.stop(time + dur + 0.07);
    pluckOsc.stop(time + 0.04);
  };

  // Instrument 2: Voice 2 Alto ("Oboe d'Amore / Golden Horn" — Dual Formant Reed-Brass)
  const playVoice2 = (time, midi, dur, vel) => {
    const freq = midiToFreq(midi);
    const p = audioContext.createStereoPanner();
    p.pan.setValueAtTime(-0.30, time);

    const vca = audioContext.createGain();
    const amp = vel * 0.21;
    vca.gain.setValueAtTime(0.0001, time);
    vca.gain.linearRampToValueAtTime(amp, time + 0.014);
    vca.gain.exponentialRampToValueAtTime(amp * 0.78, time + 0.09);
    vca.gain.setValueAtTime(amp * 0.78, time + Math.max(0.02, dur - 0.03));
    vca.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.07);

    // Warm Reed Formant Filter + Lowpass
    const formant = audioContext.createBiquadFilter();
    formant.type = "peaking";
    formant.frequency.setValueAtTime(1150, time);
    formant.Q.setValueAtTime(2.2, time);
    formant.gain.setValueAtTime(5.5, time);

    const lpf = audioContext.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.setValueAtTime(freq * 4.8, time);
    lpf.Q.setValueAtTime(1.5, time);

    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    osc1.type = "sawtooth";
    osc2.type = "sawtooth";
    osc1.frequency.setValueAtTime(freq * 0.9985, time);
    osc2.frequency.setValueAtTime(freq * 1.0015, time);

    if (dur >= STEP_DUR * 1.8) {
      const vib = audioContext.createOscillator();
      const vibGain = audioContext.createGain();
      vib.frequency.setValueAtTime(5.1, time);
      vibGain.gain.setValueAtTime(0.01, time);
      vibGain.gain.linearRampToValueAtTime(freq * 0.0055, time + 0.14);
      vib.connect(vibGain);
      vibGain.connect(osc1.frequency);
      vibGain.connect(osc2.frequency);
      vib.start(time);
      vib.stop(time + dur + 0.08);
    }

    osc1.connect(formant);
    osc2.connect(formant);
    formant.connect(lpf);
    lpf.connect(vca);
    vca.connect(p);
    p.connect(dryBus);
    p.connect(convolver);
    p.connect(delaySend);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + dur + 0.08);
    osc2.stop(time + dur + 0.08);
  };

  // Instrument 3: Voice 3 Tenor ("Cristallo" — Crystalline FM Bell-Lute Bariolage)
  const playVoice3 = (time, midi, dur, vel) => {
    const freq = midiToFreq(midi);
    const p = audioContext.createStereoPanner();
    const panPos = Math.max(-0.6, Math.min(0.6, (midi - 65) * 0.035));
    p.pan.setValueAtTime(panPos, time);

    const vca = audioContext.createGain();
    const amp = vel * 0.19;
    vca.gain.setValueAtTime(0.0001, time);
    vca.gain.linearRampToValueAtTime(amp, time + 0.003);
    vca.gain.exponentialRampToValueAtTime(amp * 0.25, time + Math.min(0.18, dur * 0.85));
    vca.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.08);

    const carrier = audioContext.createOscillator();
    const mod = audioContext.createOscillator();
    const modGain = audioContext.createGain();

    carrier.type = "triangle";
    mod.type = "sine";
    carrier.frequency.setValueAtTime(freq, time);
    mod.frequency.setValueAtTime(freq * 3.0, time);

    modGain.gain.setValueAtTime(freq * 2.2 * vel, time);
    modGain.gain.exponentialRampToValueAtTime(0.01, time + 0.045);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(vca);
    vca.connect(p);
    p.connect(dryBus);
    p.connect(convolver);
    p.connect(delaySend);

    carrier.start(time);
    mod.start(time);
    carrier.stop(time + dur + 0.09);
    mod.stop(time + 0.06);
  };

  // Instrument 4: Voice 4 Bass ("Sub-Continuo 16'" — Pipe Organ Pedal + Bowed Cello)
  const playVoice4 = (time, midi, dur, vel, isPicardy = false) => {
    const freq = midiToFreq(midi);

    const vca = audioContext.createGain();
    const amp = vel * 0.30;
    vca.gain.setValueAtTime(0.0001, time);
    vca.gain.linearRampToValueAtTime(amp, time + 0.012);
    vca.gain.exponentialRampToValueAtTime(amp * 0.82, time + 0.12);
    vca.gain.setValueAtTime(amp * 0.82, time + Math.max(0.03, dur - 0.05));
    vca.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.08);

    // 16' Sub Fundamental + 8' Bowed Sawtooth
    const subOsc = audioContext.createOscillator();
    const celloOsc = audioContext.createOscillator();
    const fifthOsc = audioContext.createOscillator();
    const fifthGain = audioContext.createGain();

    subOsc.type = "sine";
    celloOsc.type = "sawtooth";
    fifthOsc.type = "triangle";

    subOsc.frequency.setValueAtTime(freq, time);
    celloOsc.frequency.setValueAtTime(freq * 2, time);
    fifthOsc.frequency.setValueAtTime(freq * (isPicardy ? 3.0 : 2.002), time);
    fifthGain.gain.setValueAtTime(isPicardy ? 0.35 : 0.25, time);

    const lpf = audioContext.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.Q.setValueAtTime(2.0, time);
    lpf.frequency.setValueAtTime(Math.max(180, freq * 8.5), time);
    lpf.frequency.exponentialRampToValueAtTime(Math.max(140, freq * 4.2), time + Math.min(0.25, dur));

    subOsc.connect(vca);
    celloOsc.connect(lpf);
    fifthOsc.connect(fifthGain);
    fifthGain.connect(lpf);
    lpf.connect(vca);

    vca.connect(dryBus);
    vca.connect(convolver);

    subOsc.start(time);
    celloOsc.start(time);
    fifthOsc.start(time);
    subOsc.stop(time + dur + 0.09);
    celloOsc.stop(time + dur + 0.09);
    fifthOsc.stop(time + dur + 0.09);
  };

  // Architectural Harmonic Pillar Chimes on Structural Downbeats
  const playStructuralPillar = (time, midi, isMajor = false) => {
    const freq = midiToFreq(midi);
    const vca = audioContext.createGain();
    vca.gain.setValueAtTime(0.0001, time);
    vca.gain.linearRampToValueAtTime(isMajor ? 0.14 : 0.07, time + 0.005);
    vca.gain.exponentialRampToValueAtTime(0.0001, time + (isMajor ? 1.5 : 0.65));

    const ratios = isMajor ? [1, 1.25, 1.5, 2, 3] : [1, 1.5, 2];
    ratios.forEach((r) => {
      const osc = audioContext.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * r, time);
      osc.connect(vca);
      osc.start(time);
      osc.stop(time + (isMajor ? 1.55 : 0.7));
    });
    vca.connect(convolver);
    vca.connect(dryBus);
  };

  // Schedule all 4 polyphonic voices
  scoreV1.forEach(([step, midi, durSteps, vel]) => {
    playVoice1(t0 + step * STEP_DUR, midi, durSteps * STEP_DUR, vel);
  });
  scoreV2.forEach(([step, midi, durSteps, vel]) => {
    playVoice2(t0 + step * STEP_DUR, midi, durSteps * STEP_DUR, vel);
  });
  scoreV3.forEach(([step, midi, durSteps, vel]) => {
    playVoice3(t0 + step * STEP_DUR, midi, durSteps * STEP_DUR, vel);
  });
  scoreV4.forEach(([step, midi, durSteps, vel]) => {
    playVoice4(t0 + step * STEP_DUR, midi, durSteps * STEP_DUR, vel, step >= 112);
  });

  // Schedule architectural downbeat chimes
  [
    [0, 74, false],
    [32, 67, false],
    [64, 74, false],
    [88, 75, false],
    [96, 69, false],
    [112, 74, false],
    [116, 74, true], // Grand D Major Picardy Transfiguration Bell
  ].forEach(([step, midi, isMajor]) => {
    playStructuralPillar(t0 + step * STEP_DUR, midi, isMajor);
  });

  // ============================================================================
  // 3. VISUAL ENGINE: THE HARMONIC ASTROLABE & CONTRAPUNTAL LOOM (1080 × 1350)
  // ============================================================================
  // Pre-build note event lookup with start/end steps for visual queries
  const visualEvents = ALL_VOICES.map((voice) =>
    voice.notes.map(([step, midi, durSteps, vel]) => ({
      voiceId: voice.id,
      step,
      endStep: step + durSteps,
      durSteps,
      midi,
      name: midiToName(midi),
      pitchClass: Math.round(midi) % 12,
      vel,
      color: voice.color,
      glow: voice.glow,
    }))
  );

  // Seeded 3D Cathedral Dust & Harmonic Sparks
  const ambientMotes = Array.from({ length: 130 }, () => ({
    x: (random() - 0.5) * 2.2,
    y: (random() - 0.5) * 2.2,
    z: (random() - 0.5) * 2.2,
    size: 1.0 + random() * 2.4,
    phase: random() * Math.PI * 2,
    speed: 0.4 + random() * 1.1,
    voiceIdx: Math.floor(random() * 4),
  }));

  const activeSparks = [];
  const shockwaves = [];
  const triggeredNotes = new Set();

  // Smoothed state variables for 60fps fluid visual interpolation
  let smoothP = 3;
  let smoothQ = 2;
  let smoothTension = 0.25;
  let picardyBloom = 0;
  let picardyResolved = 0;

  // 3D Rotation & Perspective Projection helper
  const project3D = (x, y, z, rx, ry, rz, cx, cy, scale, fov = 880) => {
    // Rotate X
    let y1 = y * Math.cos(rx) - z * Math.sin(rx);
    let z1 = y * Math.sin(rx) + z * Math.cos(rx);
    let x1 = x;
    // Rotate Y
    let x2 = x1 * Math.cos(ry) + z1 * Math.sin(ry);
    let z2 = -x1 * Math.sin(ry) + z1 * Math.cos(ry);
    let y2 = y1;
    // Rotate Z
    let x3 = x2 * Math.cos(rz) - y2 * Math.sin(rz);
    let y3 = x2 * Math.sin(rz) + y2 * Math.cos(rz);
    let z3 = z2;

    const depth = fov / Math.max(120, fov + z3 * scale);
    return {
      x: cx + x3 * scale * depth,
      y: cy + y3 * scale * depth,
      z: z3,
      depth,
    };
  };

  // Musical interval name & pure ratio between two MIDI pitches
  const getIntervalInfo = (m1, m2) => {
    const semi = Math.abs(Math.round(m1 - m2)) % 12;
    const TABLE = [
      { name: "P1", ratio: "1:1" },
      { name: "m2", ratio: "16:15" },
      { name: "M2", ratio: "9:8" },
      { name: "m3", ratio: "6:5" },
      { name: "M3", ratio: "5:4" },
      { name: "P4", ratio: "4:3" },
      { name: "d5", ratio: "7:5" },
      { name: "P5", ratio: "3:2" },
      { name: "m6", ratio: "8:5" },
      { name: "M6", ratio: "5:3" },
      { name: "m7", ratio: "7:4" },
      { name: "M7", ratio: "15:8" },
    ];
    return TABLE[semi] || TABLE[0];
  };

  let rafId = null;

  const render = () => {
    const now = audioContext.currentTime;
    const elapsed = Math.max(0, now - t0);
    const curStep = elapsed / STEP_DUR;
    const progress = Math.min(1, elapsed / duration);

    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);

    // Compute acoustic energy bands
    let bassEnergy = 0;
    let midEnergy = 0;
    let highEnergy = 0;
    for (let i = 1; i < 14; i++) bassEnergy += freqData[i];
    for (let i = 14; i < 70; i++) midEnergy += freqData[i];
    for (let i = 70; i < 200; i++) highEnergy += freqData[i];
    bassEnergy = bassEnergy / (13 * 255);
    midEnergy = midEnergy / (56 * 255);
    highEnergy = highEnergy / (130 * 255);

    // Determine active harmony state
    let curHarmony = HARMONY_TIMELINE[0];
    for (let i = 0; i < HARMONY_TIMELINE.length; i++) {
      if (curStep >= HARMONY_TIMELINE[i].step) {
        curHarmony = HARMONY_TIMELINE[i];
      }
    }

    smoothP += (curHarmony.p - smoothP) * 0.08;
    smoothQ += (curHarmony.q - smoothQ) * 0.08;
    smoothTension += (curHarmony.tension - smoothTension) * 0.08;

    const targetBloom = curStep >= 112 ? 1 : 0;
    const targetResolved = curStep >= 116 ? 1 : 0;
    picardyBloom += (targetBloom - picardyBloom) * 0.07;
    picardyResolved += (targetResolved - picardyResolved) * 0.06;

    // Identify currently sounding note for each voice & spawn transient bursts
    const activeNotes = [null, null, null, null];
    for (let v = 0; v < 4; v++) {
      const evs = visualEvents[v];
      for (let i = 0; i < evs.length; i++) {
        const ev = evs[i];
        if (curStep >= ev.step && curStep <= ev.endStep) {
          activeNotes[v] = {
            ...ev,
            age: curStep - ev.step,
            normAge: Math.min(1, (curStep - ev.step) / Math.max(0.25, ev.durSteps)),
          };
          const key = `${v}_${ev.step}`;
          if (!triggeredNotes.has(key)) {
            triggeredNotes.add(key);
            // Spawn radial shockwave on bass or structural notes
            if (v === 3 || ev.step === 112 || ev.step === 116 || ev.step === 88 || ev.step === 96) {
              shockwaves.push({
                r: 20,
                maxR: v === 3 ? 430 : 520,
                alpha: ev.step >= 112 ? 0.95 : 0.65,
                color: ev.step >= 116 ? "#ffe28a" : ev.color,
                width: ev.step >= 112 ? 3.5 : 2.0,
              });
            }
            // Spawn particle sparks
            const count = v === 0 ? 10 : 6;
            for (let s = 0; s < count; s++) {
              const ang = (ev.pitchClass / 12) * Math.PI * 2 + (random() - 0.5) * 0.5;
              const spd = 1.5 + random() * 4.5;
              activeSparks.push({
                x: W * 0.5,
                y: 485,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                life: 1.0,
                decay: 0.02 + random() * 0.025,
                color: picardyResolved > 0.3 ? "#ffe596" : ev.color,
                size: 1.8 + random() * 2.5,
              });
            }
          }
        }
      }
    }

    // ==========================================================================
    // LAYER 0: CATHEDRAL ATMOSPHERE & VOLUMETRIC BACKGROUND
    // ==========================================================================
    ctx.globalCompositeOperation = "source-over";
    const bgGrad = ctx.createRadialGradient(W * 0.5, 485, 30, W * 0.5, 580, 920);
    if (picardyResolved > 0.01) {
      // Golden D-Major Picardy Transfiguration glow
      const g = picardyResolved;
      bgGrad.addColorStop(0, `rgb(${Math.floor(18 + 68 * g)}, ${Math.floor(22 + 48 * g)}, ${Math.floor(38 + 18 * g)})`);
      bgGrad.addColorStop(0.5, `rgb(${Math.floor(9 + 28 * g)}, ${Math.floor(13 + 18 * g)}, ${Math.floor(26 + 8 * g)})`);
      bgGrad.addColorStop(1, "#04050a");
    } else {
      const t = smoothTension;
      bgGrad.addColorStop(0, `rgb(${Math.floor(14 + 22 * t)}, ${Math.floor(18 + 10 * (1 - t))}, ${Math.floor(36 + 16 * t)})`);
      bgGrad.addColorStop(0.55, "#080b16");
      bgGrad.addColorStop(1, "#030408");
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle geometric drafting grid & Golden Ratio guidelines
    ctx.strokeStyle = `rgba(180, 205, 255, ${0.04 + picardyResolved * 0.04})`;
    ctx.lineWidth = 1;
    const astroCX = W * 0.5;
    const astroCY = 485;
    [140, 240, 340, 425].forEach((r) => {
      ctx.beginPath();
      ctx.arc(astroCX, astroCY, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Volumetric God-Rays from the Astrolabe Center during Climax & Picardy Resolution
    const rayIntensity = Math.max(bassEnergy * 0.45, picardyBloom * 0.75);
    if (rayIntensity > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const rayCount = 12;
      for (let i = 0; i < rayCount; i++) {
        const a = (i / rayCount) * Math.PI * 2 + elapsed * (0.08 + picardyResolved * 0.06);
        const spread = 0.07 + picardyResolved * 0.05;
        const rGrad = ctx.createRadialGradient(astroCX, astroCY, 20, astroCX, astroCY, 490);
        const col = picardyResolved > 0.3 ? "255, 210, 110" : "110, 175, 255";
        rGrad.addColorStop(0, `rgba(${col}, ${rayIntensity * 0.16})`);
        rGrad.addColorStop(1, `rgba(${col}, 0)`);
        ctx.fillStyle = rGrad;
        ctx.beginPath();
        ctx.moveTo(astroCX, astroCY);
        ctx.arc(astroCX, astroCY, 490, a - spread, a + spread);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // ==========================================================================
    // LAYER 1: 3D CATHEDRAL RIBBED VAULTS & HARMONIC ASTROLABE (ZONE A)
    // ==========================================================================
    // Camera orientation responds smoothly to contrapuntal phrasing & locks on Bar 8
    const lockFactor = 1 - picardyResolved * 0.82;
    const camRX = (0.38 + Math.sin(elapsed * 0.55) * 0.22) * lockFactor;
    const camRY = (elapsed * 0.32 + Math.cos(elapsed * 0.4) * 0.25) * lockFactor;
    const camRZ = Math.sin(elapsed * 0.25) * 0.12 * lockFactor;
    const astroScale = 365 + bassEnergy * 24;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // 1A. Ambient 3D Cathedral Dust Motes
    for (let i = 0; i < ambientMotes.length; i++) {
      const m = ambientMotes[i];
      const angle = elapsed * m.speed * 0.25 + m.phase;
      const mx = m.x * Math.cos(angle) - m.z * Math.sin(angle);
      const mz = m.x * Math.sin(angle) + m.z * Math.cos(angle);
      const my = m.y + Math.sin(elapsed * m.speed + m.phase) * 0.12;
      const p = project3D(mx, my, mz, camRX, camRY, camRZ, astroCX, astroCY, astroScale);
      if (p.depth > 0) {
        const vCol = picardyResolved > 0.5 ? "#ffe394" : ALL_VOICES[m.voiceIdx].color;
        ctx.fillStyle = vCol;
        ctx.globalAlpha = Math.min(0.75, p.depth * 0.35 * (0.5 + midEnergy));
        ctx.beginPath();
        ctx.arc(p.x, p.y, m.size * p.depth, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // 1B. Expanding Harmonic Shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.r += (sw.maxR - sw.r) * 0.08 + 3.5;
      sw.alpha *= 0.94;
      if (sw.alpha < 0.02) {
        shockwaves.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = sw.alpha;
      ctx.lineWidth = sw.width;
      ctx.beginPath();
      ctx.arc(astroCX, astroCY, sw.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 1C. Outer Circular FFT Acoustic Halo (120 radial frequency bars)
    const haloRadius = 392;
    const barCount = 120;
    ctx.lineWidth = 2.2;
    for (let i = 0; i < barCount; i++) {
      const bin = Math.floor((i / barCount) * 140) + 2;
      const val = freqData[bin] / 255;
      const a = (i / barCount) * Math.PI * 2 - Math.PI * 0.5;
      const r1 = haloRadius;
      const r2 = haloRadius + 4 + Math.pow(val, 1.4) * 52;
      ctx.strokeStyle = picardyResolved > 0.4
        ? `rgba(255, 215, 115, ${0.18 + val * 0.65})`
        : i % 2 === 0
        ? `rgba(56, 242, 255, ${0.15 + val * 0.6})`
        : `rgba(255, 217, 125, ${0.15 + val * 0.6})`;
      ctx.beginPath();
      ctx.moveTo(astroCX + Math.cos(a) * r1, astroCY + Math.sin(a) * r1);
      ctx.lineTo(astroCX + Math.cos(a) * r2, astroCY + Math.sin(a) * r2);
      ctx.stroke();
    }

    // 1D. Four Concentric 3D Armillary Gimbal Rings (One per Polyphonic Voice)
    const activeNodeCoords = [null, null, null, null];
    const gimbalRadii = [1.02, 0.85, 0.68, 0.51];

    for (let v = 0; v < 4; v++) {
      const voice = ALL_VOICES[v];
      const rad = gimbalRadii[v];
      const active = activeNotes[v];
      // Individual gimbal tilt per voice, aligning into a flat Rose Window on Bar 8
      const tiltX = camRX + Math.sin(elapsed * (0.4 + v * 0.12) + v * 1.4) * 0.55 * lockFactor;
      const tiltY = camRY + Math.cos(elapsed * (0.35 + v * 0.1) + v * 1.1) * 0.55 * lockFactor;
      const tiltZ = camRZ + (v * Math.PI * 0.25) * lockFactor;

      // Draw 3D gimbal ring
      ctx.beginPath();
      const segs = 72;
      for (let s = 0; s <= segs; s++) {
        const theta = (s / segs) * Math.PI * 2;
        const px = Math.cos(theta) * rad;
        const py = Math.sin(theta) * rad;
        const proj = project3D(px, py, 0, tiltX, tiltY, tiltZ, astroCX, astroCY, astroScale);
        if (s === 0) ctx.moveTo(proj.x, proj.y);
        else ctx.lineTo(proj.x, proj.y);
      }
      ctx.strokeStyle = picardyResolved > 0.6 ? "#ffd97d" : voice.color;
      ctx.globalAlpha = active ? 0.55 + (1 - active.normAge) * 0.35 : 0.22;
      ctx.lineWidth = active ? 2.4 : 1.2;
      ctx.stroke();

      // Plot the 12 Pitch-Class Nodes around each Voice Gimbal
      for (let pc = 0; pc < 12; pc++) {
        // Place D (pc = 2) at top12 o'clock
        const theta = ((pc - 2) / 12) * Math.PI * 2 - Math.PI * 0.5;
        const px = Math.cos(theta) * rad;
        const py = Math.sin(theta) * rad;
        const proj = project3D(px, py, 0, tiltX, tiltY, tiltZ, astroCX, astroCY, astroScale);

        const isCurrentPC = active && active.pitchClass === pc;
        if (isCurrentPC) {
          activeNodeCoords[v] = {
            ...proj,
            wx: px,
            wy: py,
            wz: 0,
            midi: active.midi,
            name: active.name,
            color: picardyResolved > 0.6 ? "#ffe89e" : voice.color,
            vel: active.vel,
            normAge: active.normAge,
          };

          // Blazing active note flare on the 3D gimbal
          const flareR = (10 + (1 - active.normAge) * 16) * proj.depth;
          const fGrad = ctx.createRadialGradient(proj.x, proj.y, 1, proj.x, proj.y, flareR * 2.2);
          fGrad.addColorStop(0, "#ffffff");
          fGrad.addColorStop(0.35, voice.color);
          fGrad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = fGrad;
          ctx.globalAlpha = 0.95;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, flareR * 2.2, 0, Math.PI * 2);
          ctx.fill();

          // Crisp note label next to active 3D node
          ctx.fillStyle = "#ffffff";
          ctx.font = "700 15px 'SF Mono', 'Fira Code', monospace";
          ctx.textAlign = "center";
          ctx.fillText(active.name, proj.x, proj.y - flareR - 6);
        } else {
          ctx.fillStyle = voice.color;
          ctx.globalAlpha = 0.28;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, 2.3 * proj.depth, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;

    // 1E. 3D Harmonic Tetrahedron & Live Waveform Interference Chords between Active Voices
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const n1 = activeNodeCoords[i];
        const n2 = activeNodeCoords[j];
        if (!n1 || !n2) continue;

        const info = getIntervalInfo(n1.midi, n2.midi);

        // Draw vibrating acoustic string between n1 and n2 using live timeData
        ctx.beginPath();
        const steps = 28;
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;

        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const env = Math.sin(t * Math.PI);
          const sample = (timeData[(s * 11 + i * 37) % timeData.length] - 128) / 128;
          const vibAmp = sample * env * 22 * (1 + smoothTension * 0.5);
          const x = n1.x + dx * t + nx * vibAmp;
          const y = n1.y + dy * t + ny * vibAmp;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const grad = ctx.createLinearGradient(n1.x, n1.y, n2.x, n2.y);
        grad.addColorStop(0, n1.color);
        grad.addColorStop(0.5, "#ffffff");
        grad.addColorStop(1, n2.color);
        ctx.strokeStyle = grad;
        ctx.globalAlpha = 0.72;
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // Pure frequency ratio badge at chord midpoint
        const mx = (n1.x + n2.x) * 0.5;
        const my = (n1.y + n2.y) * 0.5;
        ctx.fillStyle = "rgba(8, 12, 24, 0.78)";
        ctx.fillRect(mx - 22, my - 10, 44, 18);
        ctx.strokeStyle = "rgba(255, 225, 150, 0.45)";
        ctx.lineWidth = 1;
        ctx.strokeRect(mx - 22, my - 10, 44, 18);
        ctx.fillStyle = "#ffe8a3";
        ctx.font = "600 11px 'SF Mono', 'Fira Code', monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${info.name} ${info.ratio}`, mx, my + 3);
      }
    }

    // 1F. Central 3D Cymatic Chladni / Harmonic Spirograph Rose
    const roseSegs = 360;
    const roseRadius = 0.58 + bassEnergy * 0.14 + picardyResolved * 0.18;
    const phase1 = elapsed * 1.4;
    const phase2 = -elapsed * 0.95;

    for (let layer = 0; layer < 2; layer++) {
      ctx.beginPath();
      const lScale = layer === 0 ? 1.0 : 0.68;
      for (let i = 0; i <= roseSegs; i++) {
        const theta = (i / roseSegs) * Math.PI * 2;
        const fftMod = (freqData[(i % 64) + 4] / 255) * 0.14;
        const r =
          roseRadius *
          lScale *
          (0.52 +
            0.26 * Math.cos(smoothP * theta + phase1) +
            0.22 * Math.sin(smoothQ * theta + phase2) +
            fftMod);
        const rx3 = r * Math.cos(theta);
        const ry3 = r * Math.sin(theta);
        const rz3 = 0.16 * Math.sin((smoothP + smoothQ) * theta + elapsed * 2) * lockFactor;
        const proj = project3D(rx3, ry3, rz3, camRX * 0.6, camRY * 0.6, camRZ, astroCX, astroCY, astroScale);
        if (i === 0) ctx.moveTo(proj.x, proj.y);
        else ctx.lineTo(proj.x, proj.y);
      }
      ctx.closePath();
      ctx.strokeStyle =
        layer === 0
          ? picardyResolved > 0.3
            ? "#ffe184"
            : "#38f2ff"
          : picardyResolved > 0.3
          ? "#ffffff"
          : "#ffd97d";
      ctx.lineWidth = layer === 0 ? 2.4 : 1.5;
      ctx.globalAlpha = layer === 0 ? 0.78 : 0.62;
      ctx.stroke();
    }

    // Update & render harmonic sparks
    for (let i = activeSparks.length - 1; i >= 0; i--) {
      const sp = activeSparks[i];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.life -= sp.decay;
      if (sp.life <= 0) {
        activeSparks.splice(i, 1);
        continue;
      }
      ctx.fillStyle = sp.color;
      ctx.globalAlpha = sp.life;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size * sp.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ==========================================================================
    // LAYER 2: THE CONTRAPUNTAL LOOM — SCROLLING 4-VOICE TAPESTRY (ZONE B)
    // ==========================================================================
    const loomLeft = 75;
    const loomRight = W - 75;
    const loomW = loomRight - loomLeft;
    const loomTop = 945;
    const loomBot = 1235;
    const loomH = loomBot - loomTop;
    const nowX = loomLeft + loomW * 0.42; // Playhead meridian

    // Loom Dark Glass Backdrop
    ctx.fillStyle = "rgba(7, 10, 20, 0.78)";
    ctx.fillRect(loomLeft, loomTop, loomW, loomH);
    ctx.strokeStyle = picardyResolved > 0.4 ? "rgba(255, 215, 120, 0.45)" : "rgba(120, 175, 255, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(loomLeft, loomTop, loomW, loomH);

    // Horizontal Octave Reference Staff Lines (D2..D6)
    const minMidi = 24;
    const maxMidi = 88;
    const midiToY = (m) => loomBot - 18 - ((m - minMidi) / (maxMidi - minMidi)) * (loomH - 36);

    ctx.font = "500 11px 'SF Mono', 'Fira Code', monospace";
    ctx.textAlign = "left";
    [26, 38, 50, 62, 74, 86].forEach((m) => {
      const y = midiToY(m);
      ctx.strokeStyle = "rgba(160, 195, 255, 0.09)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(loomLeft, y);
      ctx.lineTo(loomRight, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(180, 205, 245, 0.42)";
      ctx.fillText(midiToName(m), loomLeft + 8, y - 4);
    });

    // Vertical Bar Lines scrolling across the Loom
    const windowSteps = 28; // Visible step range around playhead
    const stepToX = (s) => nowX + ((s - curStep) / windowSteps) * loomW;

    ctx.save();
    ctx.beginPath();
    ctx.rect(loomLeft, loomTop, loomW, loomH);
    ctx.clip();

    for (let b = 0; b <= 8; b++) {
      const bStep = b * 16;
      const bx = stepToX(bStep);
      if (bx >= loomLeft && bx <= loomRight) {
        ctx.strokeStyle = b === 7 ? "rgba(255, 215, 110, 0.45)" : "rgba(160, 195, 255, 0.16)";
        ctx.lineWidth = b === 7 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(bx, loomTop);
        ctx.lineTo(bx, loomBot);
        ctx.stroke();
        if (b < 8) {
          ctx.fillStyle = "rgba(200, 220, 255, 0.45)";
          ctx.font = "600 11px 'SF Mono', 'Fira Code', monospace";
          ctx.fillText(`BAR 0${b + 1}`, bx + 6, loomTop + 16);
        }
      }
    }

    // Draw Contrapuntal Voice Ribbons & Note Blocks
    for (let v = 3; v >= 0; v--) {
      const voice = ALL_VOICES[v];
      const evs = visualEvents[v];

      // Continuous melodic contour curve connecting adjacent notes
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < evs.length; i++) {
        const ev = evs[i];
        if (ev.endStep < curStep - 16 || ev.step > curStep + 20) continue;
        const x1 = stepToX(ev.step);
        const x2 = stepToX(ev.endStep);
        const y = midiToY(ev.midi);
        if (!started) {
          ctx.moveTo(x1, y);
          started = true;
        } else {
          ctx.lineTo(x1, y);
        }
        ctx.lineTo(x2, y);
      }
      ctx.strokeStyle = voice.color;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Individual Note Bars
      for (let i = 0; i < evs.length; i++) {
        const ev = evs[i];
        if (ev.endStep < curStep - 14 || ev.step > curStep + 18) continue;
        const x1 = stepToX(ev.step);
        const x2 = Math.max(x1 + 4, stepToX(ev.endStep) - 2);
        const y = midiToY(ev.midi);
        const isSounding = curStep >= ev.step && curStep <= ev.endStep;
        const isPast = curStep > ev.endStep;

        ctx.fillStyle = isSounding
          ? "#ffffff"
          : picardyResolved > 0.5 && ev.step >= 112
          ? "#ffe184"
          : voice.color;
        ctx.globalAlpha = isSounding ? 0.98 : isPast ? 0.55 : 0.25;
        const barH = isSounding ? 8 : 5;
        ctx.fillRect(x1, y - barH * 0.5, x2 - x1, barH);

        if (isSounding) {
          // Glowing aura on active note at the playhead
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const g = ctx.createRadialGradient(nowX, y, 1, nowX, y, 22);
          g.addColorStop(0, "#ffffff");
          g.addColorStop(0.4, voice.color);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(nowX, y, 22, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.restore();

    // Vertical Light-Pillars connecting the Loom Playhead up to the 3D Astrolabe Nodes
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let v = 0; v < 4; v++) {
      const act = activeNotes[v];
      const node = activeNodeCoords[v];
      if (!act || !node) continue;
      const ly = midiToY(act.midi);
      const pGrad = ctx.createLinearGradient(nowX, ly, node.x, node.y);
      pGrad.addColorStop(0, act.color);
      pGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.15)");
      pGrad.addColorStop(1, act.color);
      ctx.strokeStyle = pGrad;
      ctx.globalAlpha = 0.35 * (1 - act.normAge * 0.5);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(nowX, ly);
      ctx.lineTo(node.x, node.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Blazing "NOW" Playhead Meridian Laser
    const laserGrad = ctx.createLinearGradient(nowX, loomTop, nowX, loomBot);
    laserGrad.addColorStop(0, "rgba(255, 230, 160, 0.1)");
    laserGrad.addColorStop(0.5, "rgba(255, 245, 210, 0.85)");
    laserGrad.addColorStop(1, "rgba(255, 230, 160, 0.1)");
    ctx.strokeStyle = laserGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(nowX, loomTop - 6);
    ctx.lineTo(nowX, loomBot + 6);
    ctx.stroke();
    ctx.restore();

    // ==========================================================================
    // LAYER 3: ARCHITECTURAL ENGRAVING BORDER & TELEMETRY HUD (ZONE C)
    // ==========================================================================
    // Outer Double Engraving Frame
    ctx.strokeStyle = picardyResolved > 0.4 ? "rgba(255, 215, 120, 0.55)" : "rgba(150, 190, 255, 0.28)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(28, 28, W - 56, H - 56);
    ctx.strokeStyle = "rgba(150, 190, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(36, 36, W - 72, H - 72);

    // Top Header Bar
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 18px 'SF Mono', 'Fira Code', monospace";
    ctx.textAlign = "left";
    ctx.fillText("CONTRA·PUNCTUS IV // CHACONNE IN THE HYPERCUBE", 62, 68);

    const curBar = Math.min(8, Math.floor(curStep / 16) + 1);
    const curBeat = (Math.floor(curStep / 4) % 4) + 1;
    ctx.fillStyle = picardyResolved > 0.3 ? "#ffd97d" : "#38f2ff";
    ctx.textAlign = "right";
    ctx.fillText(`BAR 0${curBar} · BEAT 0${curBeat} · 128.0 BPM`, W - 62, 68);

    // Sub-header: Active Contrapuntal Device & Roman Numeral Harmonic Analysis
    ctx.font = "600 14px 'SF Mono', 'Fira Code', monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(210, 225, 255, 0.78)";
    ctx.fillText(`DEVICE: ${curHarmony.device}`, 62, 94);

    ctx.textAlign = "right";
    ctx.fillStyle = "#ffd97d";
    ctx.fillText(`HARMONY: ${curHarmony.numeral}  [RATIO ${Math.round(smoothP)}:${Math.round(smoothQ)}]`, W - 62, 94);

    // 4-Voice Telemetry Cards above the Contrapuntal Loom (y = 875..928)
    const cardW = (loomW - 36) / 4;
    for (let v = 0; v < 4; v++) {
      const voice = ALL_VOICES[v];
      const act = activeNotes[v];
      const cx = loomLeft + v * (cardW + 12);
      const cy = 876;

      ctx.fillStyle = "rgba(10, 15, 28, 0.82)";
      ctx.fillRect(cx, cy, cardW, 54);
      ctx.strokeStyle = act ? voice.color : "rgba(140, 170, 220, 0.22)";
      ctx.lineWidth = act ? 1.8 : 1;
      ctx.strokeRect(cx, cy, cardW, 54);

      ctx.fillStyle = voice.color;
      ctx.font = "700 12px 'SF Mono', 'Fira Code', monospace";
      ctx.textAlign = "left";
      ctx.fillText(voice.name, cx + 12, cy + 20);

      ctx.fillStyle = "rgba(190, 210, 240, 0.55)";
      ctx.font = "500 10px 'SF Mono', 'Fira Code', monospace";
      ctx.fillText(voice.sub, cx + 12, cy + 38);

      // Active Pitch Readout
      ctx.textAlign = "right";
      ctx.fillStyle = act ? "#ffffff" : "rgba(160, 180, 210, 0.35)";
      ctx.font = "700 18px 'SF Mono', 'Fira Code', monospace";
      ctx.fillText(act ? act.name : "—", cx + cardW - 12, cy + 33);
    }

    // Bottom Progress Timeline & Structural Pillars (y = 1278)
    const barY = 1282;
    ctx.fillStyle = "rgba(140, 175, 235, 0.16)";
    ctx.fillRect(loomLeft, barY, loomW, 4);
    ctx.fillStyle = picardyResolved > 0.3 ? "#ffd97d" : "#38f2ff";
    ctx.fillRect(loomLeft, barY, loomW * progress, 4);

    // 8-Bar structural markers on timeline
    ctx.font = "500 11px 'SF Mono', 'Fira Code', monospace";
    ctx.textAlign = "center";
    const BAR_LABELS = [
      "I. SUBJECT",
      "II. ANSWER",
      "III. 5THS",
      "IV. CHROMA",
      "V. STRETTO",
      "VI. bII CRISIS",
      "VII. PEDAL V",
      "VIII. PICARDY",
    ];
    for (let b = 0; b < 8; b++) {
      const bx = loomLeft + ((b + 0.5) / 8) * loomW;
      const isCurrentBar = curBar === b + 1;
      ctx.fillStyle = isCurrentBar ? "#ffffff" : "rgba(175, 198, 235, 0.45)";
      ctx.fillText(BAR_LABELS[b], bx, barY + 22);
    }

    if (elapsed < duration + 0.5) {
      rafId = requestAnimationFrame(render);
    }
  };

  rafId = requestAnimationFrame(render);

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    try {
      masterGain.disconnect();
    } catch (_) {}
  };
}
