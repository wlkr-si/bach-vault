# Reproducing the benchmark

Each record names the requested model, client version and effort setting where
available. Start a fresh session in the recorded client and send the full
[Instruction](../bench/instruction.md) as the sole user message, with no prior
conversation, files or enabled tools. The recorded replies are the original
outputs. A provider can change its service and a fresh response will vary.

Cursor runs used an empty workspace, print mode, Ask mode, and the enabled
sandbox. The model argument is the recorded effort variant, or the recorded
model ID when the variant is the model default. Read, write, shell, directory
listing, search, web and MCP permissions were denied. The sandbox confined
reads to the workspace and denied outbound network access. The MCP list was
empty. The command was:

```sh
cursor-agent --print --mode ask --sandbox enabled --trust --workspace WORKSPACE \
  --output-format stream-json --stream-partial-output --model MODEL INSTRUCTION
```

Use the first complete JavaScript module in the final reply that exports
`title` and `start`. The [recorder](../bench/record.mjs) plays that module with
a seeded random source in Chromium and records it at 1080 × 1350. The checked-in
dependency lock pins Playwright. The published Clip is the input to scoring.
See [the method](METHOD.md) for decoder settings and formulas.
