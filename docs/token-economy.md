# Token economy — the full stack

Caveman shrink what agent *say*. But agent session have four token streams, and caveman only one piece. This page: what each stream cost, what tool cover it, and the two economies no compression tool can see (prompt cache, round trips).

## The four streams

| Stream | What it is | Covered by |
|---|---|---|
| Model output | What the agent writes back | **caveman** (`/caveman`, ~65% measured, see [benchmarks/](../benchmarks/)) |
| Tool-result input | Shell/test/git output fed back to the model | **[RTK — rust-token-killer](https://github.com/albertfengjiajun/rust-token-killer)** (third-party CLI proxy) |
| Static context input | CLAUDE.md, memory files, tool descriptions — re-read every session | **`/caveman-compress`** (~46% measured) + **[caveman-shrink](https://www.npmjs.com/package/caveman-shrink)** for MCP tool descriptions |
| Re-sent conversation history | The whole transcript, re-sent every turn | **The prompt cache** — nothing to install, but easy to silently break (below) |

One install for the whole stack: the caveman [one-liner](../INSTALL.md) with `--with-rtk` also installs RTK via its official installer and wires its Claude Code hook (`rtk init -g`). RTK stays a separate upstream project (we drive its installer, we don't vendor it) — it sits between your agent and the shell, so it composes with caveman without configuration.

```bash
curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash -s -- --with-rtk --with-autoallow
```

## Order of levers

Biggest first:

1. **Keep the prompt cache healthy.** Cached input bills at ~0.1× the normal input price. In a long session the re-sent history is the largest stream by far — one silent cache invalidator costs more than every compression tool combined saves.
2. **Compress output** (caveman). Output tokens cost ~5× input tokens.
3. **Compress repeated input** (`/caveman-compress` on memory files, caveman-shrink on tool descriptions). Paid once, saves every session.
4. **Compress tool output** (RTK). Big absolute volume in agentic coding sessions.
5. **Prompt terse.** Smallest lever — your typed prompts are short and input is the cheap direction — but free, and clearer prompts also get better answers.

Things that do **not** work, so nobody has to rediscover them: gzip/base64/hex encodings (high-entropy text tokenizes *worse* per character, and the model can't decode them), abbreviation schemes (rare letter sequences split into more sub-word tokens), emitting token IDs (each ID is itself text made of more tokens — detokenization is already free and billing is already per token). The tokenizer's compression is fully priced in; the only variable left is meaning-per-token of what's actually said — which is what caveman optimizes.

## Prompt cache hygiene

The cache is a strict prefix match: any byte that changes early in the prompt invalidates everything after it, every turn. Common silent invalidators:

- A timestamp, date, or session ID interpolated into a system prompt, rule file, or hook output
- A tool set that changes mid-session (tools render at the front of the prompt)
- Another plugin injecting *varying* context at session start or per turn
- Non-deterministic serialization (unsorted JSON keys) in anything that feeds the prompt

**Measured vs estimated — the dashboard's honesty rule.** `/caveman-stats` separates the two: output tokens, input/cache breakdown, compress byte-deltas, and RTK's own tracked savings (read live from `rtk gain --all --format json`) are **measured**; the "without caveman" figure is a **benchmark-ratio estimate** and is labeled as such. The lifetime view (`--all`) joins them into one line without pretending they're the same kind of number: `Joined lifetime: N tokens (X caveman est. + Y RTK measured)`.

**How to check:** run `/caveman-stats`. It reads real per-turn usage from the session log and prints the cache hit rate. Healthy multi-turn sessions read mostly from cache; the stats output warns when a session is 5+ turns deep with a hit rate under 40% — that pattern almost always means an invalidator, not bad luck. `/caveman-stats --all` shows the lifetime rate.

## Turns per prompt — the over-compression guard

Compression can backfire: truncate tool output too hard (or compress context past ambiguity) and the model misses something, then burns an extra round trip to recover. One extra turn re-sends the whole history and generates new output — usually more expensive than whatever the truncation saved.

The tell is **turns per prompt** (assistant round trips per typed prompt), which `/caveman-stats` now reports per session and lifetime. Absolute values vary by work style; the signal is *change* — if the ratio creeps up right after tightening a compression setting, loosen it. Judge tools by tokens per completed task, never tokens per turn.

## Fewer permission prompts (the productivity half)

Token cost is one tax; babysitting permission prompts is the other. Three levels, safest first:

1. **`--with-autoallow`** (ships with caveman's installer) — merges a curated allowlist into `settings.json → permissions.allow` so commands that *can't* hurt you stop prompting: listing, reading, searching, git read ops, version probes. `--with-autoallow=dev` adds test/lint/build runners. Deliberately excluded from both tiers: anything that writes, deletes, installs, or touches the network (`rm`, `find` (has `-delete`), `echo`/`sed` (shell redirection), `curl`, `git push`, `npm install`, …) — those still ask. Removed cleanly on `--uninstall`; audit anytime with `/permissions`.
2. **Built-in modes** — Shift+Tab in Claude Code cycles to accept-edits mode (file edits stop prompting for the session); `/permissions` lets you allow a specific command pattern permanently the moment it prompts.
3. **Full bypass** (`--dangerously-skip-permissions`) — exists, works, and is the right call *only* inside a container or VM where the blast radius is disposable. Don't run it on your main machine; one prompt-injected `curl | sh` is all it takes.

The honest framing: prompts exist because the model executes untrusted plans. The allowlist approach keeps the guardrail exactly where it matters (mutations, network, installs) and deletes it where it never mattered (reading what's already on disk).

## Prompt terse (paste-ready snippet)

Most people talk to agents in conversation register — greetings, hedging, "could you please maybe take a look at". None of it carries task information, and burying constraints in filler measurably hurts instruction-following. If you want the habit enforced, paste this into your project's `CLAUDE.md` / agent rules file (~40 tokens, applies every session):

```markdown
## Prompting style

User prompts here are terse and imperative by design — no greetings or
politeness padding. Treat short prompts as complete instructions, not
rudeness or missing context. Qualifiers that do appear ("not sure",
"maybe") are real signal — keep them in mind.
```

And the habit itself: constraints first, imperative verbs, keep code/paths/errors verbatim, keep real uncertainty ("not sure this is the right approach" is signal, not padding).

## Experimental: caveman-expand (asymmetric rendering)

`src/tools/caveman-expand.js` is a prototype of the inverse dial: let the frontier model speak `ultra` (cheapest output), then re-render the terse prose as readable English with a **free local model** — you pay smart-model prices for the thinking, and the readability tax is paid locally at zero API cost.

```bash
some-agent-output | node src/tools/caveman-expand.js          # stdin → readable stdout
node src/tools/caveman-expand.js --check                      # is a local model available?
node src/tools/caveman-expand.js --file notes.md --model llama3.2
```

Backend is a local [Ollama](https://ollama.com) server (`OLLAMA_HOST`, default `http://127.0.0.1:11434`; model via `CAVEMAN_EXPAND_MODEL` or `--model`). Honest caveats, by design:

- It's a **paraphraser, not a decoder** — semantic compression is lossy, so the expansion is the local model's wording. Code fences, inline code, paths, and numbers pass through byte-identical; only prose is re-worded. Keep the terse original when wording matters.
- **Never eats your output**: no local model reachable → input passes through unchanged, exit 0.
- Not wired into any installer or agent yet — Claude Code exposes no display-transform hook, so this runs as a pipe. The natural long-term home is a client that owns its own render loop (e.g. [caveman-code](https://github.com/JuliusBrussee/caveman-code)).

## What caveman deliberately does not do

- **No encoding/decoding layer.** See "things that do not work" above — settled physics of BPE tokenizers.
- **Thinking tokens untouched.** Caveman make mouth small, not brain small. Reasoning tokens are spent before output style applies; that's why the ceiling on output savings is what it is.
