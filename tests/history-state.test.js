const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('function getHistory(){');
const end = source.indexOf('async function ensureHistoryChain', start);
assert.ok(start >= 0 && end > start, 'getHistory function must remain present');
const functionSource = source.slice(start, end);

function loadGetHistory(value) {
  const getHistory = Function('localStorage', `const HISTORY_KEY='rumboGuardianHistory'; return (${functionSource});`)({
    getItem: () => value,
  });
  return getHistory();
}

assert.deepStrictEqual(loadGetHistory(JSON.stringify({ bad: true })), []);
assert.deepStrictEqual(loadGetHistory(JSON.stringify(null)), []);
assert.deepStrictEqual(loadGetHistory(JSON.stringify([null])), []);
assert.deepStrictEqual(loadGetHistory(JSON.stringify([null, { sequence: 1 }])), []);
assert.deepStrictEqual(loadGetHistory(JSON.stringify([{ sequence: 1 }, 42])), []);
assert.deepStrictEqual(loadGetHistory(JSON.stringify([{ sequence: 1 }])), [{ sequence: 1 }]);
assert.deepStrictEqual(loadGetHistory('not-json'), []);

console.log('RUMBO Guardian history-state tests: PASS');
