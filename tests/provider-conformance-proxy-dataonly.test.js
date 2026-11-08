'use strict';
const assert=require('node:assert/strict');
const Conformance=require('../provider-conformance-v13.js');

const PROFILE={
  schema:Conformance.PROFILE_SCHEMA,providerId:'provider',adapterId:'adapter',
  protocolVersion:'proto-v1',capabilityDigest:'a'.repeat(64),
  suiteVersion:'suite-v1',evidenceDigest:'b'.repeat(64),result:'PASS'
};
const RECEIPT={
  schema:Conformance.RECEIPT_SCHEMA,profileDigest:'f'.repeat(64),
  observedAt:'2026-11-01T20:00:00Z',expiresAt:'2026-11-02T20:00:00Z',
  keyId:'eval',signature:'A'.repeat(88)
};
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
function trapProxy(object){
  let traps=0;
  const proxy=new Proxy(object,{
    getPrototypeOf(){traps++;throw new Error('untrusted_proxy_trap_executed');},
    ownKeys(){traps++;throw new Error('untrusted_proxy_trap_executed');}
  });
  return {proxy,traps:()=>traps};
}

test('profile Proxy rejects before invoking getPrototypeOf',()=>{
  const {proxy,traps}=trapProxy(PROFILE);
  assert.throws(()=>Conformance.normalizeProviderConformanceProfile(proxy),/invalid_provider_conformance_profile/);
  assert.equal(traps(),0);
});
test('receipt Proxy rejects before invoking getPrototypeOf',()=>{
  const {proxy,traps}=trapProxy(RECEIPT);
  assert.throws(()=>Conformance.normalizeConformanceReceipt(proxy),/invalid_provider_conformance_receipt/);
  assert.equal(traps(),0);
});
test('revoked profile Proxy rejects without IsArray error',()=>{
  const {proxy,revoke}=Proxy.revocable(PROFILE,{});revoke();
  assert.throws(()=>Conformance.normalizeProviderConformanceProfile(proxy),/invalid_provider_conformance_profile/);
});
test('revoked receipt Proxy rejects without IsArray error',()=>{
  const {proxy,revoke}=Proxy.revocable(RECEIPT,{});revoke();
  assert.throws(()=>Conformance.normalizeConformanceReceipt(proxy),/invalid_provider_conformance_receipt/);
});
test('revoked receipt returns fail-closed verification rather than throwing',()=>{
  const {proxy,revoke}=Proxy.revocable(RECEIPT,{});revoke();
  const result=Conformance.verifyProviderConformanceReceipt(proxy,{profileDigest:RECEIPT.profileDigest});
  assert.equal(result.verified,false);
  assert.equal(result.reason,'invalid_provider_conformance_receipt');
});
test('plain profile and receipt retain existing behavior',()=>{
  assert.equal(Conformance.normalizeProviderConformanceProfile(PROFILE).providerId,'provider');
  assert.equal(Conformance.normalizeConformanceReceipt(RECEIPT).keyId,'eval');
});
assert.equal(passed,6);
console.log('Provider conformance Proxy data-only boundary: 6/6 PASS');
