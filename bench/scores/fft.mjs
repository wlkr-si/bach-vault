export const rate = 12000;
export const size = 4096;
const hann = Array.from(
  { length: size },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)),
);

export function spectrum(samples, center) {
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
