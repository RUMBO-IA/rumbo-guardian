'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const Auth=require('../agent-authorization-v3.js');
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const publicPem=publicKey.export({type:'spki',format:'pem'});
const valid={authorizationId:'a1',actionDigest:'f'.repeat(64),observedAt:'2026-11-01T20:00:00Z',expiresAt:'2026-11-01T20:10:00Z',keyId:'operator'};
let tests=0;
function test(name,fn){fn();tests++;console.log('PASS',name);}
function sign(fields){return {...fields,signature:crypto.sign(null,Buffer.from(Auth.authorizationMessage(fields)),privateKey).toString('base64')};}
const signed=sign(valid);
test('legitimate Ed25519 signed envelope verifies',()=>{
  assert.equal(Auth.verifyAuthorizationProof(signed,{trustedPublicKeys:{operator:publicPem}}).verified,true);
});
test('wrong key is rejected',()=>{
  const {publicKey:wrongKey}=crypto.generateKeyPairSync('ed25519');
  assert.equal(Auth.verifyAuthorizationProof(signed,{trustedPublicKeys:{operator:wrongKey.export({type:'spki',format:'pem'})}}).verified,false);
});
test('malicious actionDigest object is rejected without coercion',()=>{
  let calls=0;
  const evil={...signed,actionDigest:{toString(){calls++;return 'f'.repeat(64);}}};
  assert.deepEqual(Auth.verifyAuthorizationProof(evil,{trustedPublicKeys:{operator:publicPem}}).reasons,['invalid_authorization_envelope']);
  assert.equal(calls,0);
});
test('stateful signature getter is rejected without evaluation',()=>{
  let calls=0;const evil={...signed};
  Object.defineProperty(evil,'signature',{get(){calls++;return signed.signature;}});
  assert.deepEqual(Auth.verifyAuthorizationProof(evil,{trustedPublicKeys:{operator:publicPem}}).reasons,['invalid_authorization_envelope']);
  assert.equal(calls,0);
});
test('stateful signed-field getter is rejected before serialization',()=>{
  let calls=0;const evil={...valid};
  Object.defineProperty(evil,'actionDigest',{get(){calls++;return valid.actionDigest;}});
  assert.throws(()=>Auth.authorizationMessage(evil),/invalid_authorization_envelope/);
  assert.equal(calls,0);
});
test('proxy authorization input never invokes traps',()=>{
  let traps=0;
  const evil=new Proxy(signed,{get(){traps++;throw Error('getter');},getOwnPropertyDescriptor(){traps++;throw Error('descriptor');}});
  assert.deepEqual(Auth.verifyAuthorizationProof(evil,{trustedPublicKeys:{operator:publicPem}}).reasons,['invalid_authorization_envelope']);
  assert.equal(traps,0);
});
test('revoked proxy fails closed without throwing',()=>{
  const {proxy,revoke}=Proxy.revocable(signed,{});revoke();
  assert.deepEqual(Auth.verifyAuthorizationProof(proxy,{trustedPublicKeys:{operator:publicPem}}).reasons,['invalid_authorization_envelope']);
});
test('prototype-inherited trusted key is rejected',()=>{
  const inherited=Object.create({operator:publicPem});
  assert.deepEqual(Auth.verifyAuthorizationProof(signed,{trustedPublicKeys:inherited}).reasons,['untrusted_authorizer_key']);
});
test('accessor trusted key is not invoked',()=>{
  let calls=0;const keys={};
  Object.defineProperty(keys,'operator',{get(){calls++;return publicPem;}});
  assert.deepEqual(Auth.verifyAuthorizationProof(signed,{trustedPublicKeys:keys}).reasons,['untrusted_authorizer_key']);
  assert.equal(calls,0);
});
test('invalid signature remains rejected',()=>{
  assert.deepEqual(Auth.verifyAuthorizationProof({...signed,signature:'!!!!'},{trustedPublicKeys:{operator:publicPem}}).reasons,['invalid_signature_encoding']);
});
test('null-prototype primitive envelope remains supported',()=>{
  const env=Object.assign(Object.create(null),signed);
  assert.equal(Auth.verifyAuthorizationProof(env,{trustedPublicKeys:{operator:publicPem}}).verified,true);
});
assert.equal(tests,11);
console.log('Authorization data-only verifier: 11/11 PASS');
