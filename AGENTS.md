# Bach Vault

A permanent archive of the Pieces published by Bach Bench. Keep the benchmark's
Instruction, recorder and existing Piece records byte-identical. Do not run
models here or judge, describe or rank their Pieces.

## Add a Piece

1. Accept the Workshop's first mechanically valid published record. Export only
   its module, final reply, metadata, public run readings and analysis. Review
   the export for private material and third-party rights.
2. Capture the immutable score inputs from the original Clip with
   `node bench/scores/score.mjs MEDIA_ROOT SCORES_JSON --capture-signals`.
   Add the resulting `signals.json` with the other permanent files under
   `pieces/<slug>/`. MEDIA_ROOT holds each Piece in a directory named by slug
   with the Clip, metadata, public run readings and analysis alongside it.
3. Append the file and media entries to `manifest.json`. Run the media upload
   dry run first with `node scripts/media.ts STAGING_ROOT --dry-run`. Media
   paths under STAGING_ROOT match their manifest keys. Review every checksum,
   size and header. Then use `--upload` and verify the public bytes with
   `npm run integrity -- --remote`. The bucket locks production media on its
   first write. Do not re-encode it or overwrite it.
4. Open a PR and merge after the Vault checks pass. The push to main publishes
   the index and details automatically. Read the public index back to verify
   the Piece appears.

For withdrawal, add the slug to `withdrawn.json` in a PR. The next index omits
the Piece and recomputes field scores. Its archive and media remain available.
A removal from the list restores it. Keep all field-relative outputs out of
`pieces/`. Do not add automated tests. Use the checks and inspect real output.
