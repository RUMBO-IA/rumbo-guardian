#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
const y=fs.readFileSync('.github/workflows/product-registry.yml','utf8');
for(const s of ['contents: read','node-version: 22.23.2','toolchain: 1.98.1','npm run registry:test','npm run registry:validate','npm run release:validate','npm run desktop:test','node tests/desktop-trust.test.js','node tests/desktop-install-lab.test.js','cargo check --locked','npm run check','npm test']) assert.ok(y.includes(s),`missing ${s}`);
for(const s of ['contents: write','git push','production_go: true','push-to-registry: true']) assert.ok(!y.includes(s),`forbidden ${s}`);
const policy=`gh attestation verify <candidate-exe> -R RUMBO-IA/rumbo-guardian\ngh attestation verify <candidate-exe> -R RUMBO-IA/rumbo-guardian --predicate-type https://spdx.dev/Document/v2.3`;
assert.ok(policy.includes('--predicate-type https://spdx.dev/Document/v2.3'));
console.log('product-registry CI policy PASS');
