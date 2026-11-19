# Bach Vault

The permanent record of every Piece published by [Bach Bench](https://bach.wlkr.si).
It holds the original modules and final replies, measured data, the fixed
[Instruction](bench/instruction.md) and the original [recorder](bench/record.mjs).
The [manifest](manifest.json) records SHA-256 for every permanent file and
media object. The original Clips and posters are kept in write-once storage.

## Index contract v1

Fetch [index.json](https://vault.bach.wlkr.si/index.json). `schemaVersion` is
`1`. `revision` is a SHA-256 of the generated dataset. `pieces` lists active
Pieces in slug order. Each entry includes its title, model, lab, media URLs,
common measurements, scores, map coordinates, `withdrawn: false`, and an
absolute `detailUrl` tied to that index revision. `titleWordCounts` counts
words across the active field. Numeric measurements and scores can be null
where the method allows missing readings. See the [contract types](scripts/types.ts).

The detail document adds metadata, public run readings, the full analysis
and score breakdown, and the timeline for the frequency, pitch, level and
colour chart. It links to the permanent record, module and final reply. Read
details from the current index. The index and details under `derived/` send a
60-second cache lifetime. Permanent media
sends a one-year immutable lifetime. A withdrawal removes a Piece from the
next index and active field. Its record and original media stay available.

## Checks and reproducibility

Use Node 24 or later. With dependencies installed using `npm ci`, run
`npm run integrity`, `npm run determinism`, `npm run typecheck` and
`npm run lint`. `npm run build` writes the index and details to `dist/`.
Set `BASE_REVISION` to the base commit to check the manifest is append-only.
Add `-- --remote` to the integrity command to verify public media bytes and
headers. The same checks gate PRs. Only a push to main publishes the derived
files, with details uploaded before their index. The workflow uses a
bucket-scoped R2 credential stored in Actions secrets.

The [capture notes](docs/REPRODUCIBILITY.md) describe the model run and recorder.
The [scoring method](docs/METHOD.md) documents the existing formulas. Each
`signals.json` stores the Clip's fixed measurements and the feature vectors
required to recalculate Uniqueness, Balance and the map. This lets the index
builder use the same score engine without fetching or decoding the Clips
whenever the field changes. To reproduce those inputs from media with FFmpeg,
follow [the archive procedure](AGENTS.md).

Original code is [MIT](LICENSE), subject to the scope in the
[rights statement](PIECES-RIGHTS.md). Factual scores and measurements are
[CC0](LICENSE-DATA).
