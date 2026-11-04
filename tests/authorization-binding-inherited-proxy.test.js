'use strict';
const assert=require('node:assert/strict');
const Dispatch=require('../agent-authorized-dispatch.js');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
function denyNoSideEffect(action){
  let consumed=0;
  const result=Dispatch.prepareAuthorizedAction(action,{replayStore:{consume(){consumed++;return {consumed:true};}}});
  assert.equal(result.decision,'DENY');
  assert.equal(result.stage,'authorization_input');
  assert.equal(consumed,0);
}
test('revoked Proxy action fails closed, does not throw',()=>{
  const {proxy,revoke}=Proxy.revocable({},{});revoke();denyNoSideEffect(proxy);
});
test('revoked Proxy nested authorization fails closed, does not throw',()=>{
  const {proxy,revoke}=Proxy.revocable({},{});revoke();denyNoSideEffect({authorization:proxy});
});
test('inherited observation getter does not execute',()=>{
  let calls=0;
  Object.defineProperty(Object.prototype,'authorizationObservedAt',{configurable:true,get(){calls++;return '2026-11-01T20:00:00Z';}});
  try{denyNoSideEffect({id:'send1',effect:'send'});assert.equal(calls,0);}
  finally{delete Object.prototype.authorizationObservedAt;}
});
test('inherited authorization digest getter does not execute',()=>{
  let calls=0;
  Object.defineProperty(Object.prototype,'actionDigest',{configurable:true,get(){calls++;return 'f'.repeat(64);}});
  try{denyNoSideEffect({id:'send2',effect:'send',authorization:{authorizationId:'id'}});assert.equal(calls,0);}
  finally{delete Object.prototype.actionDigest;}
});
test('inherited authorization digest data value rejected before gating',()=>{
  Object.prototype.actionDigest='f'.repeat(64);
  try{denyNoSideEffect({id:'send3',effect:'send',authorization:{authorizationId:'id'}});}
  finally{delete Object.prototype.actionDigest;}
});
test('plain action without inherited fields preserves policy path',()=>{
  const result=Dispatch.prepareAuthorizedAction({id:'read1',effect:'read',purpose:'Audit'},{});
  assert.notEqual(result.stage,'authorization_input');
});
assert.equal(passed,6);
console.log('Inherited-accessor/revoked-proxy binding: 6/6 PASS');
