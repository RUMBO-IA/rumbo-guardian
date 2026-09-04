const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Chain = require('../evidence-chain.js');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-ledger-cli-'));
  const validPath = path.join(dir, 'valid.json');
  const badPath = path.join(dir, 'tampered.json');
  const history = await Chain.buildChain([{score:12,label:'Bajo',date:'2026-09-04T12:00:00Z'},{score:88,label:'Alto',date:'2026-09-04T12:01:00Z'}]);
  fs.writeFileSync(validPath, JSON.stringify({product:'RUMBO Guardian',version:'0.4.2',integrity:{valid:true,entries:2,brokenAt:null},history}));
  const valid = spawnSync(process.execPath, ['tools/verify-ledger.js', validPath, '--json'], {cwd:path.join(__dirname,'..'),encoding:'utf8'});
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);
  const summary = JSON.parse(valid.stdout);
  assert.equal(summary.valid, true); assert.equal(summary.entries, 2); assert.match(summary.rootHash,/^[a-f0-9]{64}$/);

  const tampered = structuredClone(history); tampered[0].score = 99;
  fs.writeFileSync(badPath, JSON.stringify({product:'RUMBO Guardian',version:'0.4.2',history:tampered}));
  const bad = spawnSync(process.execPath, ['tools/verify-ledger.js', badPath, '--json'], {cwd:path.join(__dirname,'..'),encoding:'utf8'});
  assert.equal(bad.status, 2); assert.equal(JSON.parse(bad.stdout).valid, false); assert.equal(JSON.parse(bad.stdout).brokenAt, 1);

  console.log('RUMBO Guardian offline ledger verifier CLI: PASS');
})().catch(error => { console.error(error); process.exit(1); });