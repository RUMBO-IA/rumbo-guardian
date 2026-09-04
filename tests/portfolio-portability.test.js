const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const tracked = [
  'README.md','PRODUCT.md','PORTFOLIO.md','SECURITY.md','EVIDENCE.md',
  'app.js','guardian-core.js','evidence-chain.js','server.js','START_GUARDIAN.cmd',
  'extension/manifest.json','extension/popup.html','extension/popup.js','extension/core.js',
  'tests/extension-integration.js','tests/ledger-browser-integration.js','tests/run-ledger-browser-integration.ps1','tests/v03.test.js','tests/v040-ledger-integration.test.js'
];
const bannedText = [
  String.raw`C:\Users\Usuario`,
  String.raw`C:\\Users\\Usuario`,
  'fscfede@gmail.com',
  'Verso Labs',
  'verso@labs.local'
];
let failures = [];
for (const rel of tracked) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const banned of bannedText) {
    if (text.includes(banned)) failures.push(`${rel}: ${banned}`);
  }
}
if (failures.length) {
  console.error('PORTABILITY_FAIL');
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('RUMBO Guardian portfolio portability: PASS');
