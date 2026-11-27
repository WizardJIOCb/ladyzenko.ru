import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('worker entry point runs and reports configuration failures to systemd', () => {
  const state = mkdtempSync(join(tmpdir(), 'lady-worker-'));
  try {
    const run = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/commerce-worker.ts'], {
      cwd: process.cwd(), env: { ...process.env, COMMERCE_STATE: state }, encoding: 'utf8', timeout: 30000,
    });
    const empty = run();
    assert.ifError(empty.error);
    assert.equal(empty.status, 0, empty.stderr);
    writeFileSync(join(state, 'config.json'), '{invalid');
    const invalid = run();
    assert.ifError(invalid.error);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Commerce worker failed/);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});
