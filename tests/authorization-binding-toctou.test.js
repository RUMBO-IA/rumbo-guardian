'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const Gate=require('../agent-action-gate.js');
const Auth=require('../agent-authorization-v3.js');
const Dispatch=require('../agent-authorized-dispatch.js');
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const publicPem=publicKey.export({type:'spki',format:'pem'});
const NOW='2026-09-07T09:30:00Z', OBS='2026-09-07T09:25:00Z', EXP='2026-09-07T09:35:00Z';
const base={id:'act-1',effect:'send',target:'approved@example.com',purpose:'Send approved file',intentAligned:true,targetVerified:true,explicitAuthorization:true,evidenceCount:1,authorizationObservedAt:OBS};
const evil={...base,target:'unapproved@example.com'};
const digestA=Gate.computeActionDigest(evil),digestB=Gate.computeActionDigest(base);
function proof(action,authId){
  const signed={authorizationId:authId,actionDigest:Gate.computeActionDigest(action),keyId:'operator-1',observedAt:OBS,expiresAt:EXP};
  signed.signature=crypto.sign(null,Buffer.from(Auth.authorizationMessage(signed)),privateKey).toString('base64');
  return signed;
}
function dispatch(action){
  let calls=0;
  const store={consume(){calls++;return {consumed:true,reason:null}}};
  const result=Dispatch.prepareAuthorizedAction(action,{gateOptions:{now:NOW},trustedPublicKeys:{'operator-1':publicPem},replayStore:store});
  return {...result,consumeCalls:calls};
}
let count=0;
function test(name,fn){fn();count++; console.log('PASS',name)}
test('legitimate signed action still authorized',()=>{
  const signed=proof(base,'legit-1');const r=dispatch({...base,authorization:signed});
  assert.equal(r.decision,'ALLOW');assert.equal(r.consumeCalls,1);
});
test('stateful authorization digest object cannot swap signed target',()=>{
  let calls=0;const mutable={toString(){calls++;return calls===1?digestA:digestB;}};
  const signed=proof(base,'attack-object'); const r=dispatch({...evil,authorization:{...signed,actionDigest:mutable}});
  assert.notEqual(r.decision,'ALLOW','must deny action A with a signature for action B');
  assert.equal(r.consumeCalls,0,'never consume or dispatch unauthorized action');
  assert.equal(calls,0,'do not execute hostile digest coercion hooks');
});
test('stateful accessor digest cannot swap signed target',()=>{
  let calls=0;const signed=proof(base,'attack-getter');
  const authorization={...signed};
  Object.defineProperty(authorization,'actionDigest',{enumerable:true,get(){calls++;return calls===1?digestA:digestB;}});
  const r=dispatch({...evil,authorization});
  assert.notEqual(r.decision,'ALLOW','accessor must not change digest between policy and cryptographic signature');
  assert.equal(r.consumeCalls,0);
  assert.equal(calls,0,'do not execute accessor digest');
});
test('accessor observation timestamp cannot change authorization window',()=>{
  let calls=0;const signed=proof(base,'attack-time');
  const authorization={...signed};
  const action={...base,authorization};
  Object.defineProperty(action,'authorizationObservedAt',{enumerable:true,get(){calls++;return calls===1?OBS:'2026-08-07T09:25:00Z';}});
  const r=dispatch(action);
  assert.notEqual(r.decision,'ALLOW','observation time cannot change between policy and signature');
  assert.equal(r.consumeCalls,0);
  assert.equal(calls,0,'do not execute accessor observation time');
});
test('authorization Proxy must not execute traps',()=>{
  let traps=0;const signed=proof(base,'attack-proxy');
  const proxied=new Proxy(signed,{getPrototypeOf(){traps++;return Object.prototype;},get(target,key){traps++;return target[key]}});
  const r=dispatch({...base,authorization:proxied});
  assert.notEqual(r.decision,'ALLOW');assert.equal(r.consumeCalls,0);assert.equal(traps,0);
});
test('missing authorization still requests policy review',()=>{
  const r=dispatch({...base});assert.equal(r.decision,'REVIEW');assert.equal(r.consumeCalls,0);
});
console.log(`RUMBO signature binding TOCTOU: ${count}/6 PASS`);
