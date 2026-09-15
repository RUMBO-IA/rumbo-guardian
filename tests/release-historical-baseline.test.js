#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = process.cwd();
const run = (releasePath, ...extra) => spawnSync(process.execPath, [
  'tools/validate-release.mjs',
  '--product', 'packaging/product.json',
  '--release', releasePath,
  '--extension', 'extension/manifest.json',
  '--package', 'package.json',
  ...extra,
], {encoding: 'utf8'});

const historical = path.join(root, 'packaging/release.json');
const normal = run(historical);
assert.notEqual(normal.status, 0, 'candidate must not validate historical release as current product release');

const allowed = run(historical, '--allow-historical-baseline');
assert.equal(allowed.status, 0, allowed.stderr || allowed.stdout);
const result = JSON.parse(allowed.stdout);
assert.equal(result.status, 'VERIFIED');
assert.equal(result.mode, 'HISTORICAL_BASELINE');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rumbo-release-'));
try {
  const mutated = path.join(temp, 'release.json');
  const release = JSON.parse(fs.readFileSync(historical, 'utf8'));
  release.version = '1.1.0-rc.1';
  fs.writeFileSync(mutated, JSON.stringify(release));
  const rejected = run(mutated, '--allow-historical-baseline');
  assert.notEqual(rejected.status, 0, 'historical mode must not mask a release version mutation');
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}

console.log('historical baseline release policy PASS');
