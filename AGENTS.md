# Bach Vault

A permanent archive of the Pieces published by Bach Bench. Keep the benchmark's
Instruction, recorder and existing Piece records byte-identical. Do not run
models here or judge, describe or rank their Pieces.

## Add a Piece

Run `node bench/add.mjs` in the private Workshop. It records the first
mechanically valid reply, uses `scripts/workshop.ts` to package the public
record and upload original media create-only, then opens a Vault PR. The
Workshop enrolls its own PR in GitHub auto-merge. The required `check` job
verifies the append-only manifest, public media, and deterministic dataset
before merge. A merged manifest or withdrawal change republishes the index.

Run `node bench/withdraw.mjs withdraw <slug>` or
`node bench/withdraw.mjs restore <slug>` in the Workshop. Both update
`withdrawn.json` through the same checks. The archive and media remain
available. Keep field-relative outputs out of `pieces/`.

Fixture PRs target a branch named `workshop-staging-<lane>`, created from
main and protected by the same required check. Fixture slugs start with
`workshop-fixture-` and are rejected by the production integrity check.
The staging branch can write only its own index and details under
`staging/workshop/<lane>/`. Fixture media also lives under that prefix.
Do not add automated tests. Use the checks and inspect real output.
