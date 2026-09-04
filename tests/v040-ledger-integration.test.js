const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

const html=read('index.html');
const app=read('app.js');
const pkg=JSON.parse(read('package.json'));

assert.match(pkg.version,/^0\.\d+\.\d+$/);
assert.ok(html.includes('evidence-chain.js'));
assert.ok(html.includes('id="ledgerIntegrity"'));
assert.ok(app.includes('RumboGuardianEvidenceChain'));
assert.ok(app.includes('appendEntry'));
assert.ok(app.includes('verifyChain'));
assert.ok(app.includes('integrity:'));
assert.ok(app.includes("integrity.valid?'safe':'danger'"),'estado de integridad debe usar clases visuales existentes');
assert.ok(!app.includes('Todav?a')&&!app.includes(' ? evento'),'no debe quedar mojibake del ledger');
assert.ok(read('sw.js').includes('evidence-chain.js'),'PWA debe cachear el módulo de integridad');
assert.ok(read('.github/workflows/pages.yml').includes('evidence-chain.js'),'Pages debe desplegar el módulo de integridad');

console.log('RUMBO Guardian ledger integration: PASS');
