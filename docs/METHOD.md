# How Bach Bench measures Pieces

**Complexity** measures the amount and variety of content in the sound and picture. **Sync** measures how closely audible attacks and visible changes line up. **Uniqueness** measures distance from the other published Pieces. Nothing is graded by AI, and there is no overall score. The three numbers describe the Clips and their context. Artistic quality is a judgment for listeners.

Complexity and Sync use fixed scales and depend only on the Clip. Uniqueness and the map depend on the current field. The title word counts describe that field too. Adding a Piece can move every dot on the map.

## Which replies become Pieces

Each model is run with the identical Instruction until it produces a Piece
that plays. Only that Piece is shown.

## Common measurements

FFmpeg decodes the first 15 seconds of the first audio and video streams with one codec and filter thread. Audio is mono 12 kHz float PCM, resampled with the timeline starting at zero. Picture uses 20 frames/s starting at zero, area-resized to 64 × 80 and converted to 8-bit RGB. Missing audio supplies zero samples. Missing picture holds the last complete frame, starting at black. The stream status is captured separately. Use the same FFmpeg and Node builds to reproduce the archived bytes.

For the formulas below, **scale(value, low, high)** is (value − low) / (high − low), clipped to [0,1]. Standard deviation uses the full measured population. Percentiles take the lower indexed sample at floor((n−1) × percentile), with empty samples returning zero. Final scores and measurements are rounded to four decimal places.

## Complexity

Complexity is the arithmetic mean of the two halves before rounding.

**Music** is 100 × tonal presence × the mean of the eight scaled measures below. A 50 ms audio slice gives RMS level in dBFS, floored at −80. The site’s 4,096-sample Hann-windowed spectrum is measured 8 times per second. For each spectrum, local tonal peaks between bins 9 and 899 must exceed their neighbors and amplitude 0.00025, and carry at least 1.8% of power in the peak and adjacent two bins. Concentration is the share of power above bin 8 in the six strongest qualifying peaks. Tonal presence is the mean concentration scaled from 0.25 to 0.70, giving zero weight to slices at or below −62 dBFS. Pitch and bandwidth estimates require concentration of at least 0.28 and level above −62 dBFS.

| Measure | Definition | Scale |
|---|---|---|
| Distinct pitches | Count nearest semitones present in at least two tonal windows. Interpolate peaks quadratically and keep up to six low-to-high peaks after rejecting integer harmonics within max(4 Hz, 1.2% of peak frequency). | 1–32 |
| Onsets per second | Positive level rise minus 1.5 dB, only above −62 dBFS. Count local maxima of at least 2 dB and divide by 15. Ties favor the earlier tick. | 0.2–5 |
| Simultaneous pitches | Mean number of distinct detected pitches per tonal window. | 1–4 |
| Rhythmic variety | Standard deviation divided by mean of onset gaps, requiring three gaps. | 0.08–1 |
| Frequency range | Mean log₂ ratio of 95th to 5th power-percentile frequency in tonal windows, using bins 9 and above. | 0.1–5 octaves |
| Dynamic range | 90th minus 10th percentile of levels above −62 dBFS. | 2–20 dB |
| Structural change | Mean distance between consecutive 2.5 s sound profiles × (1 − 0.65 × repetition). | 0.025–0.35 |
| Ending drop | Positive difference between mean level from 12.5–14 s and the final 0.25 s. | 3–28 dB |

A sound profile averages normalized spectral power in ten bands (band index min(9, floor(2 log₂(bin/9))), bins 9 and up) over 2.5 s. Inactive windows give zero vectors. Distance is half the sum of absolute bin differences. Repetition is the maximum over shifts of 8 to 48 spectral windows (1–6 s) of (1 − scale(mean spectral distance across overlapping windows, 0, 0.25)) × positive Pearson correlation of the shifted onset streams. The onset shift is rounded to the nearest 50 ms tick.

**Picture** is 100 × scale(supported detail, 0.0008, 0.008) × (1 − scale(detail, 0.08, 0.14)) × the mean of the five scaled measures below. RGB values are in [0,1]. Detail averages absolute differences with the right and lower neighboring pixels across channels, excluding the bottom row and right edge. The high-detail taper suppresses dense static. Fine grain is discounted for the detail contribution. Average each nonoverlapping 4 × 4 pixel block. Recompute detail on the smaller frame, with right and below channel differences below 0.025 treated as zero. Supported detail is the smaller of original detail and mean coarse detail divided by four (the coarse step size in original pixels). The picture score uses supported detail in both the low-detail gate and the detail term. The original detail stays in the supporting figures and the high-detail taper. The adjustment leaves motion, color, music and Uniqueness measurements unchanged. The controlled moving-scene fixture showed that residual grain can still have a small effect.

| Measure | Definition | Scale |
|---|---|---|
| Detail | Mean spatial difference across frames. Use supported detail in the score. | 0.002–0.038 |
| Effective colors | Mean exp(Shannon entropy in natural logs) of per-frame RGB histograms, using four uniform bins per channel. Use log₂ of the mean in the score. | 0–3 log₂ colors |
| Motion | Mean coherent change across frames. | 0.00003–0.003 |
| Motion variety | Standard deviation of coherent change. | 0.0001–0.005 |
| Palette change | Mean half-L1 distance of adjacent 2.5 s mean histograms. Multiply the scaled result by scale(spatial motion share, 0.01, 0.3). | 0.01–0.3 |

For coherent change, multiply mean absolute RGB change **M** by scale(1 − N/(M + 10⁻⁹), 0.05, 0.7) × scale(1 − |sum of signed RGB changes|/(sum of absolute changes + 10⁻⁹), 0.1, 0.7). **N** is the mean neighbor difference of the signed RGB changes, sampled as for detail. This discounts spatially uncorrelated flicker and frame-wide brightness changes. Spatial motion share divides summed coherent change by summed raw change plus 10⁻⁹. Frame zero supplies zero motion.

## Sync

Sync is the larger of **event** and **continuous** Sync. Either a repeated visual response to audible attacks or a repeated response to changes in sustained sound can establish coupling. Both paths use the same regions: the full frame, four horizontal strips and sixteen cells of a 4 × 4 grid. Regional brightness is mean RGB. Regional motion is mean absolute interframe RGB difference. Frame zero has zero motion.

- **Event.** Compare the positive audio level-rise series used for Complexity against each of the 21 regional motion series. Pearson correlation removes the constant motion baseline. Audio activity is scale(full-series standard deviation, 0.15, 1.4) and picture activity is scale(full-series standard deviation, 0.00006, 0.0007).
- **Continuous.** Compare broadband RMS, low, mid and high audio energy against the brightness and motion series of the same regions. Audio energy is 50 ms RMS of the relevant signal. The low filter is a one-pole low-pass at 180 Hz. Mid subtracts it from a 700 Hz low-pass. High subtracts a 2400 Hz low-pass from the original. The pole update is state += (1 − exp(−2π × cutoff / 12000)) × (sample − state). Subtract each series' centered 61-tick mean from its centered 5-tick mean, truncating windows at the ends. Activity is scale(standard deviation of the detrended series, 0.00008, 0.001) for audio and scale(standard deviation, 0.00006, 0.0007) for picture. Both raw series must show at least three direction reversals in their 250 ms block means. Ignore moves below 0.0002 audio RMS or 0.00015 picture units and hold the previous accepted value until the next move.

For each feature pair and lag, compute three Pearson correlations, one in each successive five-second section. Exclude four ticks at each section edge from the audio slice and shift only the picture slice. Search lags of 0, +1, −1 through +4, −4 in that order, each 50 ms. Positive lag means picture follows sound. Pearson divides by the product of standard deviations plus 10⁻¹². Sort the three section correlations and use (lowest + 2 × middle) / 3. This makes one coincident fade or a different winning cue in each section insufficient.

A candidate is 100 × audio activity × picture activity × scale(combined correlation, 0.12, 0.8) for event Sync, or the same formula using 0.23, 0.9 for continuous Sync. Each path keeps the first maximum in fixed feature and lag order. Multiply both scores by (1 − scale(original mean picture detail, 0.08, 0.14)) to suppress dense TV static. The existing correlation, lag and activity fields report the higher-scoring path, with ties favoring event Sync. The two new objects record the path scores, feature names, correlation, lag, activity and all three section correlations.

The score can detect coupling between observable signals. Periodic independent processes can still coincide, especially when testing many regions. It measures positive association only and can miss visually small, inverted, irregular, or long-delayed responses. It cannot establish that the visual reads the audio or that its pacing is good.

## Uniqueness and the map

For each pair, compare the six matching 2.5 s segments. Distance is 25% palette histogram distance, 35% sound profile distance, 25% visual structure distance, and 15% title distance. Palette and sound use mean half-L1 distance. Visual structure uses mean absolute difference in 4 × 4 regional pixel brightness, using equal RGB channel weights. Title distance is one minus intersection divided by union of word sets (zero for two empty sets). Words use Unicode compatibility normalization, lowercasing, and letter/number runs. The word count table includes repeat occurrences.

Uniqueness is 100 times mean distance to all other Pieces, or zero for a singleton. Each supporting figure is its mean component distance. The map uses classical multidimensional scaling. Double-center the squared distance matrix and multiply by −½. Jacobi rotations diagonalize it in stable order. Pick two eigenvectors by descending eigenvalue, breaking ties by column index, and scale by square roots of the nonnegative eigenvalues. The largest absolute loading, first sorted Piece on ties, has positive sign. The two-dimensional map compresses distances and can distort neighborhoods.

## Cost and interpretation

Runs paid through OpenCode Console use the charge the service reported. Every other run applies public standard USD prices to recorded token usage, rounded to eight decimals. OpenAI cached counts are inside total input. Anthropic cache counts are separate from fresh input. Where recorded Claude cache writes are present, use the archived five-minute and one-hour split only if it exactly reconciles to the run’s cache-write count. OpenAI and Anthropic output totals include thinking, which is separated and then priced at the same rate as other output. Missing or incompatible required counts or prices yield null with a reason. The table uses GPT-5.6 Sol's list rate before its temporary promotion. The price table records sources and model announcements, including nulls for figures that could not be confirmed. These calculations put subscription runs on a public token-price scale. They do not represent invoices.

Pitches and simultaneous tones are approximate. Harmonic rejection can remove real octaves and miss detuned harmonics. Mono downmix can cancel audio. Some percussion-rich music will score low on tonal presence. The ending measure recognizes level drops and cannot infer a deliberate resolution. Fast motion may disappear during sampling and resizing. Coarse color and layout can miss meaningful similarity, and synchronized fades or periodic pulses can correlate by coincidence. Treat the field’s scores as measurements from one Clip per model.

## Balance and the quadrant

Balance is the lowest of a Piece’s standings in Complexity, Sync and
Uniqueness. Each standing is the percentile of its ascending rank, using the
average rank for ties. The lowest rank maps to 0 and the highest to 100.
Only Pieces with all three scores enter the field. Balance is unavailable
for the entire field below five eligible Pieces, and for any Piece missing a
score. Balance changes with the field and stays fixed when labs are filtered.

The Most attractive quadrant is a field-relative bearing. On Balance vs. cost
it marks values strictly above median Balance and strictly below median
cost. Both medians use the same set of Pieces with both measurements.
Values on either median and Pieces without a price are outside the region.
Changing axes uses the same median rule in the direction shown in the caption.
There is no overall ranking.
