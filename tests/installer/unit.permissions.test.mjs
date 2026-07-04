// Unit tests for bin/lib/permissions.js (--with-autoallow presets) plus argv
// framing for the new flags. Run: node --test tests/installer/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const INSTALLER = path.resolve(HERE, '..', '..', 'bin', 'install.js');
const PERMS = require(path.resolve(HERE, '..', '..', 'bin', 'lib', 'permissions.js'));

function run(...args) {
  return spawnSync('node', [INSTALLER, ...args], { encoding: 'utf8' });
}

// ── Preset safety invariants ────────────────────────────────────────────────
// The whole point of the curated list is that nothing in it can write,
// delete, or exfiltrate. Lock that in so a future edit can't casually add a
// footgun back.
const FORBIDDEN_PREFIXES = [
  'Bash(rm', 'Bash(mv', 'Bash(cp', 'Bash(chmod', 'Bash(chown',
  'Bash(find', 'Bash(echo', 'Bash(sed', 'Bash(awk', 'Bash(tee',
  'Bash(curl', 'Bash(wget', 'Bash(ssh', 'Bash(scp',
  'Bash(git add', 'Bash(git commit', 'Bash(git push', 'Bash(git checkout',
  'Bash(git reset', 'Bash(git clean', 'Bash(git rebase',
  'Bash(npm install', 'Bash(npm publish', 'Bash(pip install',
  'Bash(sudo',
];

test('no preset tier contains a write/delete/network/mutating rule', () => {
  for (const [tier, rules] of Object.entries(PERMS.PRESETS)) {
    for (const rule of rules) {
      for (const bad of FORBIDDEN_PREFIXES) {
        assert.ok(!rule.startsWith(bad), `${tier} tier contains forbidden rule: ${rule}`);
      }
    }
  }
});

test('dev tier is a strict superset of readonly', () => {
  const dev = new Set(PERMS.PRESETS.dev);
  for (const rule of PERMS.PRESETS.readonly) {
    assert.ok(dev.has(rule), `dev tier missing readonly rule: ${rule}`);
  }
  assert.ok(PERMS.PRESETS.dev.length > PERMS.PRESETS.readonly.length);
});

test('every rule is well-formed Bash(...) syntax', () => {
  for (const rule of PERMS.ALL_MANAGED) {
    assert.match(rule, /^Bash\([^()]+\)$/, `malformed rule: ${rule}`);
  }
});

// ── Merge / strip behavior ──────────────────────────────────────────────────

test('addAutoallow merges into empty settings and is idempotent', () => {
  const settings = {};
  const added = PERMS.addAutoallow(settings, 'readonly');
  assert.equal(added, PERMS.PRESETS.readonly.length);
  assert.deepEqual(settings.permissions.allow, PERMS.PRESETS.readonly);
  // Second run adds nothing.
  assert.equal(PERMS.addAutoallow(settings, 'readonly'), 0);
});

test('addAutoallow preserves user-authored rules and does not duplicate', () => {
  const settings = { permissions: { allow: ['Bash(terraform plan:*)', 'Bash(ls:*)'] } };
  PERMS.addAutoallow(settings, 'readonly');
  const allow = settings.permissions.allow;
  assert.ok(allow.includes('Bash(terraform plan:*)'));
  assert.equal(allow.filter(r => r === 'Bash(ls:*)').length, 1);
});

test('addAutoallow rejects unknown tier', () => {
  assert.throws(() => PERMS.addAutoallow({}, 'yolo'), /unknown autoallow tier/);
});

test('removeAutoallow strips only preset entries', () => {
  const settings = { permissions: { allow: ['Bash(terraform plan:*)'], deny: ['Bash(rm -rf:*)'] } };
  PERMS.addAutoallow(settings, 'dev');
  const removed = PERMS.removeAutoallow(settings);
  assert.equal(removed, PERMS.PRESETS.dev.length);
  assert.deepEqual(settings.permissions.allow, ['Bash(terraform plan:*)']);
  assert.deepEqual(settings.permissions.deny, ['Bash(rm -rf:*)']);
});

test('removeAutoallow cleans up empty permissions object', () => {
  const settings = {};
  PERMS.addAutoallow(settings, 'readonly');
  PERMS.removeAutoallow(settings);
  assert.equal(settings.permissions, undefined);
});

test('removeAutoallow tolerates missing/odd shapes', () => {
  assert.equal(PERMS.removeAutoallow({}), 0);
  assert.equal(PERMS.removeAutoallow({ permissions: {} }), 0);
  assert.equal(PERMS.removeAutoallow({ permissions: { allow: 'not-an-array' } }), 0);
});

// ── Argv framing ────────────────────────────────────────────────────────────

test('auto tier sets defaultMode acceptEdits when unset', () => {
  const settings = {};
  PERMS.addAutoallow(settings, 'auto');
  assert.equal(settings.permissions.defaultMode, 'acceptEdits');
  assert.equal(settings.permissions.allow.length, PERMS.PRESETS.auto.length);
});

test('auto tier never clobbers a user-chosen defaultMode', () => {
  const settings = { permissions: { defaultMode: 'plan' } };
  PERMS.addAutoallow(settings, 'auto');
  assert.equal(settings.permissions.defaultMode, 'plan');
  // but replaces an explicit 'default'
  const s2 = { permissions: { defaultMode: 'default' } };
  PERMS.addAutoallow(s2, 'auto');
  assert.equal(s2.permissions.defaultMode, 'acceptEdits');
});

test('non-mode tiers never touch defaultMode', () => {
  const settings = {};
  PERMS.addAutoallow(settings, 'dev');
  assert.equal(settings.permissions.defaultMode, undefined);
});

test('removeAutoallow clears acceptEdits but preserves other modes', () => {
  const s1 = {};
  PERMS.addAutoallow(s1, 'auto');
  PERMS.removeAutoallow(s1);
  assert.equal(s1.permissions, undefined);
  const s2 = { permissions: { defaultMode: 'bypassPermissions', allow: ['Bash(ls:*)'] } };
  PERMS.removeAutoallow(s2);
  assert.equal(s2.permissions.defaultMode, 'bypassPermissions');
});

test('MODE_BY_TIER only ever maps to acceptEdits', () => {
  // Guardrail: presets must never silently escalate to bypassPermissions.
  for (const mode of Object.values(PERMS.MODE_BY_TIER)) {
    assert.equal(mode, 'acceptEdits');
  }
});

test('--with-autoallow=bogus exits 2 naming valid tiers', () => {
  const r = run('--with-autoallow=bogus');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown autoallow tier/);
  assert.match(r.stderr, /readonly, dev/);
});

test('--help documents --with-autoallow and --with-rtk', () => {
  const r = run('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--with-autoallow/);
  assert.match(r.stdout, /--with-rtk/);
  assert.match(r.stdout, /rtk init -g/);
});
