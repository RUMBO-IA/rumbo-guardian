const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));

const pkg = JSON.parse(read('package.json'));
const ext = JSON.parse(read('extension/manifest.json'));
const readme = read('README.md');
const sw = read('sw.js');

assert.match(pkg.version, /^0\.[34]\.\d+$/);
assert.strictEqual(ext.version, pkg.version, 'app y extensión deben compartir versión');
assert(/rumbo-guardian-v0(31|40|41)/.test(sw), 'service worker debe usar cache versionado');
assert(/Guardian CI/.test(readme), 'README debe mostrar CI');
assert(/Portfolio demo/.test(readme), 'README debe exponer demo');
assert(/portfolio\/dashboard-v031\.png/.test(readme), 'README debe conservar screenshot');
assert(exists('.github/workflows/pages.yml'));
assert(exists('scripts/capture-portfolio.ps1'));
assert(exists('portfolio/dashboard-v031.png'));
console.log('RUMBO Guardian portfolio baseline: PASS');