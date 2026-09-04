const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const manifest = JSON.parse(read('extension/manifest.json'));
assert.ok(manifest.permissions.includes('contextMenus'), 'contextMenus permission required');
assert.equal(manifest.background?.service_worker, 'background.js');
assert.ok(!manifest.host_permissions, 'context menu must not add broad host permissions');

const bg = read('extension/background.js');
assert.match(bg, /contexts:\s*\[\s*['"]link['"]\s*\]/);
assert.match(bg, /contexts:\s*\[\s*['"]selection['"]\s*\]/);
assert.match(bg, /chrome\.storage\.session\.set/);
assert.match(bg, /chrome\.tabs\.create/);
assert.doesNotMatch(bg, /fetch\s*\(|XMLHttpRequest|WebSocket/);

const report = read('extension/report.js');
assert.match(report, /chrome\.storage\.session\.get/);
assert.match(report, /chrome\.storage\.session\.remove/);
assert.match(report, /analyzeUrl|analyzeMessage/);
assert.doesNotMatch(report, /fetch\s*\(|XMLHttpRequest|WebSocket/);
console.log('context-menu tests: PASS');
