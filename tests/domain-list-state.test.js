const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('function getLists(){');
const end = source.indexOf('\nfunction saveLists', start);
assert.ok(start >= 0 && end > start, 'getLists function must remain present');
const functionSource = source.slice(start, end);

function loadGetLists(value) {
  const getLists = Function('localStorage', `const LIST_KEY='rumboGuardianDomainListsV03'; return (${functionSource});`)({
    getItem: () => value,
  });
  return getLists();
}

function assertLists(value, expected) {
  assert.deepStrictEqual(loadGetLists(value), expected);
}

assertLists(JSON.stringify({ trusted: {}, blocked: null }), { trusted: [], blocked: [] });
assertLists(JSON.stringify({ trusted: ['safe.example', 42, null], blocked: ['evil.test', {}] }), {
  trusted: ['safe.example'],
  blocked: ['evil.test'],
});
assertLists(JSON.stringify({ trusted: 'safe.example', blocked: 'evil.test' }), { trusted: [], blocked: [] });
assertLists('not-json', { trusted: [], blocked: [] });

console.log('RUMBO Guardian domain-list state tests: PASS');
