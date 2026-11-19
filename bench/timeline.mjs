import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const rate = 12000;
const size = 4096;
const windows = 120;
const firstNote = 28;
const lastNote = 100;
const hann = Array.from(
  { length: size },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)),
);

function decode(clip, args) {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', clip, ...args, 'pipe:1']);
}

function spectrum(samples, center) {
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let i = 0, reversed = 0; i < size; i++) {
    real[reversed] = (samples[center + i - size / 2] ?? 0) * hann[i];
    let bit = size >> 1;
    while (bit && reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
  }
  for (let span = 2; span <= size; span *= 2) {
    const half = span / 2;
    for (let j = 0; j < half; j++) {
      const angle = (-2 * Math.PI * j) / span;
      const cos = Math.cos(angle),
        sin = Math.sin(angle);
      for (let i = j; i < size; i += span) {
        const k = i + half;
        const r = real[k] * cos - imaginary[k] * sin;
        const q = real[k] * sin + imaginary[k] * cos;
        real[k] = real[i] - r;
        imaginary[k] = imaginary[i] - q;
        real[i] += r;
        imaginary[i] += q;
      }
    }
  }
  return real
    .subarray(0, size / 2)
    .map((r, i) => (Math.hypot(r, imaginary[i]) * 4) / size);
}

function extract(clip) {
  const pcm = decode(clip, [
    '-map',
    '0:a:0',
    '-ac',
    '1',
    '-ar',
    String(rate),
    '-f',
    'f32le',
  ]);
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
  const env = Array.from({ length: 75 }, (_, i) => {
    const count = rate / 5;
    const energy = samples
      .subarray(i * count, (i + 1) * count)
      .reduce((sum, x) => sum + x * x, 0);
    return Math.round(Math.max(-90, 10 * Math.log10(energy / count)) * 10) / 10;
  });
  const notes = [];
  const heat = Array.from({ length: windows }, (_, i) => {
    const bins = spectrum(samples, ((i + 0.5) * rate) / 8);
    const peaks = [];
    for (let bin = 9; bin < 900; bin++) {
      if (
        bins[bin] < 0.002 ||
        bins[bin] <= bins[bin - 1] ||
        bins[bin] <= bins[bin + 1]
      )
        continue;
      const offset =
        (0.5 * (bins[bin - 1] - bins[bin + 1])) /
        (bins[bin - 1] - 2 * bins[bin] + bins[bin + 1]);
      const note = Math.round(
        69 + 12 * Math.log2(((bin + offset) * rate) / size / 440),
      );
      if (note >= firstNote && note <= lastNote)
        peaks.push({ note, amplitude: bins[bin] });
    }
    peaks.sort((a, b) => b.amplitude - a.amplitude);
    const seen = new Set();
    for (const { note, amplitude } of peaks.slice(0, 4)) {
      if (seen.has(note) || amplitude < peaks[0].amplitude * 0.22) continue;
      seen.add(note);
      notes.push([i, note]);
    }
    return Array.from({ length: lastNote - firstNote + 1 }, (_, j) => {
      const bin = Math.round(
        (440 * 2 ** ((j + firstNote - 69) / 12) * size) / rate,
      );
      return Math.round(
        Math.max(0, Math.min(15, (20 * Math.log10(bins[bin]) + 78) / 4)),
      ).toString(16);
    }).join('');
  });
  const rgb = decode(clip, [
    '-map',
    '0:v:0',
    '-vf',
    'fps=2,scale=12:15:flags=area',
    '-pix_fmt',
    'rgb24',
    '-f',
    'rawvideo',
  ]);
  const colors = Array.from({ length: rgb.length / 540 }, (_, i) => {
    const pixels = rgb.subarray(i * 540, (i + 1) * 540);
    const channels = [0, 0, 0];
    let weight = 0;
    for (let j = 0; j < pixels.length; j += 3) {
      const bright = 1 + Math.max(pixels[j], pixels[j + 1], pixels[j + 2]);
      weight += bright;
      channels.forEach((_, c) => {
        channels[c] += pixels[j + c] * bright;
      });
    }
    return [
      i / 2,
      '#' +
        channels
          .map((n) =>
            Math.round(n / weight)
              .toString(16)
              .padStart(2, '0'),
          )
          .join(''),
    ];
  });
  return { env, notes, heat, colors };
}

const [clip, output] = process.argv.slice(2);
if (!clip || !output) throw new Error('Usage: node bench/timeline.mjs CLIP OUTPUT_JSON');
writeFileSync(output, JSON.stringify(extract(clip)) + '\n');
