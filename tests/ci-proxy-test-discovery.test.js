'use strict';
const assert = require('node:assert/strict');
const {scripts} = require('../package.json');
const token = 'node tests/provider-conformance-proxy-dataonly.test.js';
for (const script of ['test','test:unit']) {
  assert.ok(scripts[script].split(' && ').includes(token),
    script + ' must execute the Proxy data-only regression');
}
assert.ok(scripts.check.split(' && ').includes('node --check tests/provider-conformance-proxy-dataonly.test.js'),
  'check must syntax-check the Proxy data-only regression');
console.log('Proxy CI discovery contract: PASS');
