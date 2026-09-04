const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const popup = fs.readFileSync(path.join(root, 'extension/popup.js'), 'utf8');

assert.match(popup, /forms:\s*\[\.\.\.document\.forms\]/, 'popup must collect form destinations');
assert.match(popup, /analyzeFormDestination/, 'popup must score form destinations through shared core');
assert.match(popup, /passwordFields/, 'form payload must preserve password-field count');
assert.match(popup, /formCount/, 'page-level form count must remain available');
console.log('RUMBO Guardian popup form integration: PASS');
