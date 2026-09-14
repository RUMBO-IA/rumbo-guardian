const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'desktop-build.yml');
assert.equal(fs.existsSync(workflowPath), true, 'desktop build workflow missing');
const workflow = fs.readFileSync(workflowPath, 'utf8');

assert.match(workflow, /id-token:\s*write/);
assert.match(workflow, /attestations:\s*write/);
assert.match(workflow, /contents:\s*read/);
assert.match(workflow, /anchore\/sbom-action@e22c389904149dbc22b58101806040fa8d37a610/);
assert.match(workflow, /format:\s*spdx-json/);
assert.match(workflow, /output-file:\s*build\/guardian\.spdx\.json/);
assert.match(workflow, /actions\/attest@1e69f48acb82d1966a394da916b4c1698aa569d6/g);
assert.match(workflow, /subject-path:\s*['"]src-tauri\/target\/release\/bundle\/nsis\/\*-setup\.exe['"]/);
assert.match(workflow, /sbom-path:\s*['"]build\/guardian\.spdx\.json['"]/);
assert.doesNotMatch(workflow, /push-to-registry:\s*true/);
assert.doesNotMatch(workflow, /contents:\s*write/);
assert.doesNotMatch(workflow, /gh release create|softprops\/action-gh-release/);

console.log('desktop-trust tests: PASS');
