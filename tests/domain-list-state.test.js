const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const match = source.match(/function getLists\(\)\{[\s\S]*?\n\}\nfunction saveLists/);
assert.ok(match, 'getLists function must remain present');

function loadGetLists(value) {
  const context = { localStorage: { getItem: () => value } };
  vm.runInNewContext(`${match[0].replace(/\nfunction saveLists[\s\S]*$/, '')}\nthis.getLists = getLists;`, context);
  return context.getLists();
}

function assertLists(value, expected) {
  assert.equal(JSON.stringify(loadGetLists(value)), JSON.stringify(expected));
}

assertLists(JSON.stringify({ trusted: {}, blocked: null }), { trusted: [], blocked: [] });
assertLists(JSON.stringify({ trusted: ['safe.example', 42, null], blocked: ['evil.test', {}] }), {
  trusted: ['safe.example'],
  blocked: ['evil.test'],
});
assertLists(JSON.stringify({ trusted: 'safe.example', blocked: 'evil.test' }), { trusted: [], blocked: [] });
assertLists('not-json', { trusted: [], blocked: [] });

console.log('RUMBO Guardian domain-list state tests: PASS');
