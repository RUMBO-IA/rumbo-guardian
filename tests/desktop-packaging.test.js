const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function readText(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function mustExist(rel) {
  assert.equal(fs.existsSync(path.join(root, rel)), true, `missing:${rel}`);
}

function testDesktopProductContract() {
  const product = readJson('packaging/product.json');
  assert.ok(product.surfaces.includes('desktop-windows'), 'desktop-windows surface missing');
  assert.equal(product.desktop.windows.framework, 'tauri-2');
  assert.equal(product.desktop.windows.target, 'x86_64-pc-windows-msvc');
  assert.equal(product.desktop.windows.bundle, 'nsis');
  assert.equal(product.desktop.windows.signing, 'not-proven');
  assert.equal(product.desktop.windows.updater, 'disabled');
}

function testTauriContract() {
  for (const rel of [
    'src-tauri/Cargo.toml',
    'src-tauri/build.rs',
    'src-tauri/src/main.rs',
    'src-tauri/tauri.conf.json',
    'src-tauri/capabilities/default.json',
  ]) mustExist(rel);

  const config = readJson('src-tauri/tauri.conf.json');
  assert.equal(config.productName, 'RUMBO Guardian');
  assert.equal(config.version, '1.0.0');
  assert.equal(config.identifier, 'com.rumbo.guardian');
  assert.equal(config.build.frontendDist, '../desktop-dist');
  assert.equal(config.build.beforeBuildCommand, 'node tools/build-desktop-assets.mjs');
  assert.deepEqual(config.bundle.targets, ['nsis']);
  assert.equal(config.plugins?.updater, undefined, 'updater must remain disabled in v1');

  const cargo = readText('src-tauri/Cargo.toml');
  assert.match(cargo, /edition\s*=\s*"2021"/);
  assert.match(cargo, /tauri\s*=\s*\{\s*version\s*=\s*"2"/);
  assert.doesNotMatch(cargo, /tauri-plugin-(shell|fs|updater)/);

  const main = readText('src-tauri/src/main.rs');
  assert.doesNotMatch(main, /invoke_handler/);
  assert.doesNotMatch(main, /plugin\s*\(/);
}

function testAssetBuilderContract() {
  mustExist('tools/build-desktop-assets.mjs');
  const source = readText('tools/build-desktop-assets.mjs');
  const expected = [
    'index.html', 'styles.css', 'guardian-core.js', 'evidence-chain.js',
    'app.js', 'manifest.webmanifest', 'sw.js',
  ];
  for (const file of expected) assert.match(source, new RegExp(file.replace('.', '\\.')));
  assert.match(source, /desktop-build\.json/);
}

function testDesktopWorkflowContract() {
  mustExist('.github/workflows/desktop-build.yml');
  const workflow = readText('.github/workflows/desktop-build.yml');
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /node-version:\s*['"]?22/);
  assert.match(workflow, /npm run release:validate/);
  assert.match(workflow, /node tests\/desktop-packaging\.test\.js/);
  assert.match(workflow, /cargo check/);
  assert.match(workflow, /cargo tauri build/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.doesNotMatch(workflow, /softprops\/action-gh-release|gh release create/);
}

testDesktopProductContract();
testTauriContract();
testAssetBuilderContract();
testDesktopWorkflowContract();
console.log('desktop-packaging tests: PASS');
