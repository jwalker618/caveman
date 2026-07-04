# caveman-prune

Context go stale. Prune find dead weight.

## What it does

Long agent sessions accumulate context: files read ten turns ago, documents
pasted for a question long answered, pins nobody remembers pinning. All of it
rides along in every prompt — costing input tokens and diluting attention.

`/caveman-prune` audits the conversation: which files are actually part of the
current work (**live**) and which haven't been referenced or modified in the
last N interactions (**stale**, default N = 5). It reports one line per file
and suggests what to drop. It never removes anything itself — you decide.

Sizes in the report come only from what the model actually observed (line
counts from real reads). Unknown sizes say `size unknown` — no invented
numbers, same honesty rule as [caveman-stats](../caveman-stats/README.md).

## How to invoke

```
/caveman-prune        # default: stale = untouched for 5 interactions
/caveman-prune 10     # stricter memory: stale after 10
```

## Example output

```
Context audit (last 5 interactions)
────────────────────────────────────
LIVE   src/hooks/caveman-config.js   edited 1 turn ago
STALE  docs/token-economy.md         read 11 turns ago, ~120 lines
────────────────────────────────────
1 stale rock. Drop suggestion:
- unpin/stop mentioning docs/token-economy.md — re-read later if needed
```

## Where it fits in the token economy

The [token-economy guide](../../docs/token-economy.md) covers four streams.
Pruning attacks the **re-sent conversation history** stream from a new angle:
instead of compressing what's there (caveman, RTK, compress), it removes what
shouldn't be there at all. Pairs well with `/compact` on long sessions.

Surfaces with explicit context pinning (IDEs that maintain a pin list) get the
most out of this — the suggestions map one-to-one onto unpin actions.

## See also

- [`SKILL.md`](./SKILL.md) — the audit contract the model follows
- [caveman-stats](../caveman-stats/README.md) — token receipts for the session
- [Caveman README](../../README.md) — repo overview
