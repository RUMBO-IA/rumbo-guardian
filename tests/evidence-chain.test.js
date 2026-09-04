const assert = require('node:assert/strict');

(async () => {
  const Chain = require('../evidence-chain.js');
  const first = await Chain.appendEntry([], { score: 10, label: 'Bajo', date: '2026-09-04T10:00:00Z' });
  assert.equal(first.length, 1);
  assert.equal(first[0].sequence, 1);
  assert.equal(first[0].previousHash, Chain.GENESIS_HASH);
  assert.match(first[0].entryHash, /^[a-f0-9]{64}$/);

  const second = await Chain.appendEntry(first, { score: 91, label: 'Alto', date: '2026-09-04T10:01:00Z' });
  assert.equal(second[1].previousHash, second[0].entryHash);
  assert.deepEqual(await Chain.verifyChain(second), { valid: true, entries: 2, brokenAt: null });

  const tampered = structuredClone(second);
  tampered[0].score = 99;
  const verification = await Chain.verifyChain(tampered);
  assert.equal(verification.valid, false);
  assert.equal(verification.brokenAt, 1);

  const rebuilt = await Chain.buildChain([{score:1},{score:2}]);
  assert.equal(rebuilt.length,2);
  assert.equal(rebuilt[0].sequence,1);
  assert.equal(rebuilt[1].previousHash,rebuilt[0].entryHash);
  assert.equal((await Chain.verifyChain(rebuilt)).valid,true);

  console.log('RUMBO Guardian tamper-evident ledger: PASS');
})().catch(error => { console.error(error); process.exit(1); });