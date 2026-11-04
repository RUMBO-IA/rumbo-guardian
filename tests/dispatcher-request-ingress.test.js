'use strict';
const assert=require('node:assert/strict');
const {createToolDispatcher}=require('../agent-tool-dispatcher-v4.js');

const dispatcher=createToolDispatcher({tools:[{name:'read',effect:'read',handler:async()=>({ok:true})}]});
let count=0;
async function check(name,request,expectedStage,expectedCalls=0,counter=()=>0){
  const result=await dispatcher.dispatch(request);
  assert.equal(result.decision,'DENY',name);
  assert.equal(result.stage,expectedStage,name);
  assert.equal(result.executed,false,name);
  assert.equal(counter(),expectedCalls,name+' getter side effects');
  count++;console.log('PASS',name);
}
async function run(){
  let calls=0;
  await check('top-level tool getter rejected without running', {get tool(){calls++;return 'read';}}, 'request_binding',0,()=>calls);
  await check('action effect getter rejected without running',{tool:'read',action:{get effect(){calls++;return 'read';}}},'request_binding',0,()=>calls);
  await check('nested authorization getter rejected without running',{tool:'read',action:{authorization:{get authorizationId(){calls++;return 'a';}}}},'request_binding',0,()=>calls);

  const raw=Proxy.revocable({tool:'read'},{});raw.revoke();
  await check('revoked top-level Proxy fails closed',raw.proxy,'request_binding');
  const action=Proxy.revocable({effect:'read'},{});action.revoke();
  await check('revoked action Proxy fails closed',{tool:'read',action:action.proxy},'request_binding');
  const authorization=Proxy.revocable({authorizationId:'a'},{});authorization.revoke();
  await check('revoked authorization Proxy fails closed',{tool:'read',action:{authorization:authorization.proxy}},'request_binding');

  Object.defineProperty(Object.prototype,'tool',{configurable:true,get(){calls++;return 'read';}});
  try{await check('prototype getter is not read',{},'tool_lookup',0,()=>calls);}
  finally{delete Object.prototype.tool;}

  await check('nonprimitive tool name rejected without coercion',{tool:{toString(){calls++;return 'read';}}},'request_binding',0,()=>calls);
  const sym=Symbol('covert');
  const dangerous={effect:'read'};
  Object.defineProperty(dangerous,sym,{enumerable:true,get(){calls++;return 'send';}});
  await check('symbol getter rejected before spread',{tool:'read',action:dangerous},'request_binding',0,()=>calls);

  const ordinary=await dispatcher.dispatch({tool:'read',action:{id:'r1',effect:'read',purpose:'Inspect',intentAligned:true}});
  assert.notEqual(ordinary.stage,'request_binding','ordinary data-only requests still reach authorization policy');
  assert.equal(ordinary.executed,false);
  count++;console.log('PASS ordinary data-only request passes ingress');
  assert.equal(count,10);
  console.log('RUMBO dispatcher ingress hardening: 10/10 PASS');
}
run().catch(err=>{console.error(err);process.exitCode=1});
