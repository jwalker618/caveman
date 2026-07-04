---
name: caveman-prune
description: >
  Context staleness audit. Reviews which files and documents are sitting in
  the current conversation context, flags ones not referenced or modified in
  the last N interactions, and suggests dropping them to save input tokens
  and keep attention sharp. Triggers on /caveman-prune [N]. Advisory only —
  never removes anything itself.
---

# Caveman prune — context staleness audit

When the user runs `/caveman-prune` (optionally `/caveman-prune <N>`, default
N = 5), audit the conversation context and report what has gone stale.

## What to do

1. **Inventory context.** Scan the conversation for files and documents that
   entered context: files read with tools, files @-mentioned in prompts,
   pasted file contents, and files you edited. Note for each the last turn it
   was referenced, modified, or quoted.

2. **Classify.** A file is **stale** when neither the user nor you referenced
   or modified it within the last N user interactions AND the current thread
   of work does not obviously depend on it. A file is **live** otherwise.
   When unsure, call it live — a wrongly-dropped file costs a re-read plus a
   confused turn, which is worse than carrying it.

3. **Weigh honestly.** Report approximate size per stale file ONLY from what
   you actually observed (line counts from reads, visible content length).
   Never invent token counts. If you did not see the size, say `size unknown`.

4. **Report, caveman voice.** One line per file:

   ```
   Context audit (last 5 interactions)
   ────────────────────────────────────
   LIVE   src/hooks/caveman-config.js   edited 1 turn ago
   LIVE   skills/caveman/SKILL.md       quoted 3 turns ago
   STALE  docs/token-economy.md         read 11 turns ago, ~120 lines
   STALE  benchmarks/run.py             read 14 turns ago, size unknown
   ────────────────────────────────────
   2 stale rocks. Drop suggestions:
   - unpin/stop mentioning docs/token-economy.md — re-read later if needed
   - benchmarks/run.py done its job — not part of current work
   Long session + much stale → /compact also good move.
   ```

5. **Suggest, never act.** Do not delete files, do not run /compact yourself,
   do not rewrite pins. The user (or the tool hosting you) decides. If the
   host surface has explicit context pinning (an IDE pin list), phrase
   suggestions as "unpin X"; otherwise as "stop carrying X".

## Rules

- Advisory one-shot. Not a mode. Does not change the caveman flag or persist.
- Auto-clarity applies: if dropping something looks risky (file relates to an
  in-flight irreversible operation), say so in plain prose.
- Honest weights only. Approximations must be labeled approximate. No
  fabricated token numbers, no fabricated cost figures.
- If nothing is stale, say so in one line and stop. No filler.
