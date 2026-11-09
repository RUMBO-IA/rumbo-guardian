#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('.github/workflows/product-registry.yml', 'utf8');
for(const required of ['name: Product Registry', 'pull_request:', 'branches: [main]', 'contents: read', 'ubuntu-latest', 'npm run registry:validate', 'npm run registry:test', 'npm run release:validate', 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262', 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020']) assert.ok(source.includes(required), 'missing workflow policy: '+required);
assert.doesNotMatch(source, /contents:\s*write|id-token:\s*write|attestations:\s*write|pull_request_target:|git push|gh release create|deploy:/);
console.log('PRODUCT_REGISTRY_CI_POLICY_PASS');
