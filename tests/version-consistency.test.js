const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const pkg = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('extension/manifest.json'));
const app = read('app.js');
const popup = read('extension/popup.js');

assert.equal(pkg.version, manifest.version, 'package and extension versions must match');
assert.match(app, new RegExp(`version:['\"]${pkg.version.replace(/\./g, '\\.')}`), 'app exports must use package version');
assert.match(popup, new RegExp(`version:['\"]${pkg.version.replace(/\./g, '\\.')}`), 'popup exports must use package version');

console.log('RUMBO Guardian version consistency: PASS');