// caveman — curated Claude Code permission presets (--with-autoallow).
//
// Cuts the constant permission prompts for commands that can't hurt you,
// WITHOUT reaching for --dangerously-skip-permissions. Two tiers:
//
//   readonly  inspection only — listing, reading, searching, git read ops,
//             version probes. Nothing that writes, deletes, or talks to the
//             network. This is the default tier.
//   dev       readonly + project verification commands (test/lint/build
//             runners). These execute project code, so the blast radius is
//             "whatever your test suite does" — opt in with =dev.
//
// Deliberately excluded from BOTH tiers, so nobody re-adds them casually:
//   find   (-delete / -exec rm)          echo/sed/awk (shell redirection writes)
//   curl/wget (network exfil surface)    git add/commit/push/checkout (mutates)
//   rm/mv/cp/chmod (obvious)             npm install / pip install (runs postinstall)
//
// Entries use Claude Code permission-rule syntax: `Bash(cmd:*)` prefix-matches
// the command; a bare `Bash(cmd)` matches exactly. Merged into
// settings.json → permissions.allow, deduped, and stripped again on
// uninstall (exact-match against these lists only — user-authored rules are
// never touched).
//
// Pure stdlib, CommonJS, Node ≥14.

'use strict';

const READONLY = [
  // Filesystem inspection
  'Bash(ls:*)',
  'Bash(pwd)',
  'Bash(cat:*)',
  'Bash(head:*)',
  'Bash(tail:*)',
  'Bash(wc:*)',
  'Bash(grep:*)',
  'Bash(rg:*)',
  'Bash(which:*)',
  'Bash(file:*)',
  'Bash(stat:*)',
  'Bash(du:*)',
  'Bash(df:*)',
  'Bash(tree:*)',
  // Git — read operations only
  'Bash(git status:*)',
  'Bash(git log:*)',
  'Bash(git diff:*)',
  'Bash(git show:*)',
  'Bash(git branch:*)',
  'Bash(git blame:*)',
  'Bash(git remote -v)',
  // Version probes
  'Bash(git --version)',
  'Bash(node --version)',
  'Bash(npm --version)',
  'Bash(python --version)',
  'Bash(python3 --version)',
];

const DEV_EXTRA = [
  // JS/TS verification
  'Bash(npm test:*)',
  'Bash(npm run test:*)',
  'Bash(npm run lint:*)',
  'Bash(npm run build:*)',
  'Bash(npx jest:*)',
  'Bash(npx vitest:*)',
  'Bash(npx tsc:*)',
  'Bash(npx eslint:*)',
  // Python
  'Bash(pytest:*)',
  'Bash(python -m pytest:*)',
  // Rust
  'Bash(cargo check:*)',
  'Bash(cargo test:*)',
  'Bash(cargo build:*)',
  'Bash(cargo clippy:*)',
  'Bash(cargo fmt --check)',
  // Go
  'Bash(go test:*)',
  'Bash(go build:*)',
  'Bash(go vet:*)',
  // Make
  'Bash(make test:*)',
  'Bash(make lint:*)',
];

const PRESETS = {
  readonly: READONLY,
  dev: [...READONLY, ...DEV_EXTRA],
  // 'auto' = the dev allowlist PLUS permissions.defaultMode: "acceptEdits" —
  // file edits and listed commands run without prompting; destructive /
  // network / install commands still ask. This is the fork's product default
  // ("largely permissionless"), one notch below bypassPermissions.
  auto: [...READONLY, ...DEV_EXTRA],
};

// Tiers that also set a permission default mode. We only ever set
// 'acceptEdits' — never 'bypassPermissions' (users who want full YOLO can set
// that themselves; it shouldn't arrive via a preset).
const MODE_BY_TIER = { auto: 'acceptEdits' };

// Every entry we could ever have written, across tiers — the strip set.
const ALL_MANAGED = new Set([...READONLY, ...DEV_EXTRA]);

// Merge a preset tier into settings.permissions.allow. Idempotent: entries
// already present (from us or hand-added by the user) are not duplicated.
// Returns the number of entries actually added.
function addAutoallow(settings, tier) {
  const preset = PRESETS[tier];
  if (!preset) throw new Error(`unknown autoallow tier: ${tier} (valid: ${Object.keys(PRESETS).join(', ')})`);
  if (!settings.permissions || typeof settings.permissions !== 'object') settings.permissions = {};
  if (!Array.isArray(settings.permissions.allow)) settings.permissions.allow = [];
  const have = new Set(settings.permissions.allow);
  let added = 0;
  for (const rule of preset) {
    if (have.has(rule)) continue;
    settings.permissions.allow.push(rule);
    have.add(rule);
    added++;
  }
  // Mode-setting tiers: only claim defaultMode when the user hasn't chosen
  // one (absent or explicit 'default') — never clobber an existing choice
  // like 'plan'. removeAutoallow undoes exactly this.
  const mode = MODE_BY_TIER[tier];
  if (mode && (!settings.permissions.defaultMode || settings.permissions.defaultMode === 'default')) {
    settings.permissions.defaultMode = mode;
  }
  return added;
}

// Uninstall helper: remove exactly the entries our presets could have added.
// User-authored rules (anything not string-equal to a preset entry) survive.
// Returns the number removed.
function removeAutoallow(settings) {
  if (!settings || !settings.permissions || typeof settings.permissions !== 'object') return 0;
  let removed = 0;
  const allow = settings.permissions.allow;
  if (Array.isArray(allow)) {
    const before = allow.length;
    settings.permissions.allow = allow.filter(rule => !ALL_MANAGED.has(rule));
    removed = before - settings.permissions.allow.length;
    if (settings.permissions.allow.length === 0) delete settings.permissions.allow;
  }
  // Undo the 'auto' tier's mode claim. We only ever set 'acceptEdits', so
  // that's the only value we remove — a user-chosen 'plan'/'bypassPermissions'
  // survives.
  if (settings.permissions.defaultMode === 'acceptEdits') {
    delete settings.permissions.defaultMode;
  }
  if (Object.keys(settings.permissions).length === 0) delete settings.permissions;
  return removed;
}

module.exports = { PRESETS, MODE_BY_TIER, READONLY, DEV_EXTRA, ALL_MANAGED, addAutoallow, removeAutoallow };
