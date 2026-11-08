'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const pkg = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('extension/manifest.json'));
const app = read('app.js');
const popup = read('extension/popup.js');

// Extract quoted values using a fixed expression; compare the full string.
// Never interpolate version input into a dynamically constructed RegExp.
const exportedVersions = source =>
  [...source.matchAll(/\bversion\s*:\s*(['"])([^'"]+)\1/g)].map(match => match[2]);

assert.equal(pkg.version, manifest.version, 'package and extension versions must match');
assert.ok(exportedVersions(app).includes(pkg.version), 'app exports must use package version');
assert.ok(exportedVersions(popup).includes(pkg.version), 'popup exports must use package version');

// Regression: a suffix must not satisfy an exact version match.
assert.equal(exportedVersions("version:'" + pkg.version + "-unexpected-suffix'").includes(pkg.version), false);
assert.equal(exportedVersions('version:"' + pkg.version + '"').includes(pkg.version), true);

console.log('RUMBO Guardian version consistency: PASS');
