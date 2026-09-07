const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const match = source.match(/function getHistory\(\)\{[\s\S]*?\n\}\nasync function ensureHistoryChain/);
assert.ok(match, 'getHistory function must remain present');
const functionSource = match[0].replace(/\nasync function ensureHistoryChain$/, '');

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
