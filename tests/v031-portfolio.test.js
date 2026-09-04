const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));

const pkg = JSON.parse(read('package.json'));
const ext = JSON.parse(read('extension/manifest.json'));
const readme = read('README.md');
const app = read('app.js');
const popup = read('extension/popup.js');
const sw = read('sw.js');

assert.strictEqual(pkg.version, '0.3.1', 'package.json debe declarar 0.3.1');
assert.strictEqual(ext.version, '0.3.1', 'la extensión debe declarar 0.3.1');
assert(/version:'0\.3\.1'/.test(app), 'los reportes de la app deben declarar 0.3.1');
assert(/version:'0\.3\.1'/.test(popup), 'los reportes de la extensión deben declarar 0.3.1');
assert(/rumbo-guardian-v031/.test(sw), 'service worker debe usar cache v031');
assert(/Guardian CI/.test(readme), 'README debe mostrar badge/estado de CI');
assert(/v0\.3\.1/.test(readme), 'README debe mostrar v0.3.1');
assert(/portfolio\/dashboard-v031\.png/.test(readme), 'README debe incluir screenshot del dashboard');
assert(exists('.github/workflows/pages.yml'), 'debe existir workflow de GitHub Pages');
assert(exists('scripts/capture-portfolio.ps1'), 'debe existir captura reproducible');
assert(exists('portfolio/dashboard-v031.png'), 'debe existir screenshot de portafolio');
console.log('RUMBO Guardian V0.3.1 portfolio polish: PASS');