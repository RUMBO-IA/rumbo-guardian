'use strict';
const assert=require('node:assert/strict');
const Conformance=require('../provider-conformance-v13.js');

const ADAPTER={adapterId:'adapter',protocolVersion:'proto-v1'};
const CAPABILITY={capabilityDigest:'a'.repeat(64)};
const RECEIPT={
  schema:Conformance.RECEIPT_SCHEMA,
  profileDigest:'f'.repeat(64),
  observedAt:'2026-11-01T20:00:00Z',
  expiresAt:'2026-11-02T20:00:00Z',
  keyId:'eval',signature:'A'.repeat(88)
};
let passed=0;
let failures=0;
function test(name,fn){
  try{fn();passed++;console.log('PASS',name);}
  catch(err){failures++;console.error('FAIL',name,err.message);}
}
function trapProxy(object){
  let traps=0;
  return {
    proxy:new Proxy(object,{getOwnPropertyDescriptor(){
      traps++;throw new Error('untrusted_proxy_descriptor_trap_executed');
    }}),
    count:()=>traps
  };
}

test('policy container Proxy rejected before descriptor trap',()=>{
  const {proxy,count}=trapProxy({adapter:{}});
  assert.throws(
    ()=>Conformance.resolveProviderConformance(ADAPTER,CAPABILITY,proxy),
    /trusted_provider_conformance_required/);
  assert.equal(count(),0);
});
test('revoked policy container Proxy rejected fail closed',()=>{
  const {proxy,revoke}=Proxy.revocable({adapter:{}},{});
  revoke();
  assert.throws(
    ()=>Conformance.resolveProviderConformance(ADAPTER,CAPABILITY,proxy),
    /trusted_provider_conformance_required/);
});
test('trusted keys container Proxy rejected before descriptor trap',()=>{
  const {proxy,count}=trapProxy({eval:'untrusted'});
  const result=Conformance.verifyProviderConformanceReceipt(RECEIPT,{
    profileDigest:RECEIPT.profileDigest,
    trustedPublicKeys:proxy,now:'2026-11-02T00:00:00Z'
  });
  assert.equal(result.verified,false);
  assert.equal(result.reason,'untrusted_provider_conformance_key');
  assert.equal(count(),0);
});
test('revoked trusted keys container Proxy rejected fail closed',()=>{
  const {proxy,revoke}=Proxy.revocable({eval:'untrusted'},{});
  revoke();
  const result=Conformance.verifyProviderConformanceReceipt(RECEIPT,{
    profileDigest:RECEIPT.profileDigest,
    trustedPublicKeys:proxy,now:'2026-11-02T00:00:00Z'
  });
  assert.equal(result.verified,false);
  assert.equal(result.reason,'untrusted_provider_conformance_key');
});
if(failures!==0) throw new Error('policy_proxy_security_regressions_failed:'+failures);
assert.equal(passed,4);
console.log('Provider policy/key Proxy boundary: 4/4 PASS');
