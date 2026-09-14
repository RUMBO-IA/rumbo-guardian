const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rel = '.github/workflows/desktop-install-lab.yml';
const full = path.join(root, rel);

assert.equal(fs.existsSync(full), true, `missing:${rel}`);
const workflow = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');

assert.match(workflow, /windows-latest/);
assert.match(workflow, /node-version:\s*['"]22\.23\.2['"]/);
assert.match(workflow, /dtolnay\/rust-toolchain@1\.98\.1/);
assert.match(workflow, /node tests\/desktop-install-lab\.test\.js/);
assert.match(workflow, /cargo check --locked/);
assert.match(workflow, /@tauri-apps\/cli@2\.11\.4 build --bundles nsis -- --locked/);

// Installation must stay current-user and silent on the ephemeral runner.
assert.match(workflow, /LOCALAPPDATA/);
assert.match(workflow, /RUMBO Guardian/);
assert.match(workflow, /ArgumentList\s+['"]\/S['"]/);
assert.match(workflow, /ExitCode/);
assert.match(workflow, /rumbo-guardian-desktop\.exe/);

// Smoke launch must be bounded and cleaned up.
assert.match(workflow, /Start-Process[^\n]*rumbo-guardian-desktop|Start-Process\s+-FilePath\s+\$appExe/);
assert.match(workflow, /Start-Sleep/);
assert.match(workflow, /Stop-Process/);

// Uninstall and post-condition are mandatory.
assert.match(workflow, /uninstall.*\.exe/i);
assert.match(workflow, /Test-Path\s+\$installDir/);
assert.match(workflow, /throw .*uninstall/i);

// No production or external-machine authority is allowed in this lab.
assert.doesNotMatch(workflow, /TAURI_SIGNING_PRIVATE_KEY|AZURE_|REMOTE_DESKTOP|TRIGGERcmd|gh release create/);
assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);

console.log('desktop-install-lab policy: PASS');
