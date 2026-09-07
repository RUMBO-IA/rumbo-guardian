const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const Conformance=require('../provider-conformance-v13.js');

const {publicKey}=crypto.generateKeyPairSync('ed25519');
const pub=publicKey.export({type:'spki',format:'pem'});
const PROFILE={schema:Conformance.PROFILE_SCHEMA,providerId:'provider',adapterId:'adapter',protocolVersion:'proto-v1',capabilityDigest:'a'.repeat(64),suiteVersion:'suite-v1',evidenceDigest:'b'.repeat(64),result:'PASS'};
const PROFILE_DIGEST=Conformance.computeProviderConformanceProfileDigest(PROFILE);
const RECEIPT={schema:Conformance.RECEIPT_SCHEMA,profileDigest:PROFILE_DIGEST,observedAt:'2026-09-07T18:00:00Z',expiresAt:'2026-09-08T18:00:00Z',keyId:'eval',signature:'A'.repeat(88)};

function main(){
  let passed=0;const ok=()=>passed++;
  {
    let calls=0;const bad={...PROFILE,providerId:{toString(){calls++;return 'provider';}}};
    assert.throws(()=>Conformance.normalizeProviderConformanceProfile(bad),/invalid_provider_conformance_profile/);assert.equal(calls,0);ok();
  }
  {
    let calls=0;const bad={...PROFILE};Object.defineProperty(bad,'adapterId',{enumerable:true,get(){calls++;return 'adapter';}});
    assert.throws(()=>Conformance.computeProviderConformanceProfileDigest(bad),/invalid_provider_conformance_profile/);assert.equal(calls,0);ok();
  }
  {
    let calls=0;const bad={...RECEIPT,observedAt:{toString(){calls++;return '2026-09-07T18:00:00Z';}}};
    assert.throws(()=>Conformance.normalizeConformanceReceipt(bad),/invalid_provider_conformance_receipt/);assert.equal(calls,0);ok();
  }
  {
    let calls=0;const bad={...RECEIPT};Object.defineProperty(bad,'profileDigest',{enumerable:true,get(){calls++;return PROFILE_DIGEST;}});
    assert.throws(()=>Conformance.conformanceReceiptMessage(bad),/invalid_provider_conformance_receipt/);assert.equal(calls,0);ok();
  }
  {
    let calls=0;const keys={};Object.defineProperty(keys,'eval',{enumerable:true,get(){calls++;return pub;}});
    const result=Conformance.verifyProviderConformanceReceipt(RECEIPT,{profileDigest:PROFILE_DIGEST,trustedPublicKeys:keys,now:'2026-09-07T18:01:00Z'});
    assert.equal(result.verified,false);assert.equal(result.reason,'untrusted_provider_conformance_key');assert.equal(calls,0);ok();
  }
  assert.equal(passed,5);
  console.log('RUMBO Provider Conformance Data-Only V13: 5/5 PASS + no getter/toString execution');
}
main();
