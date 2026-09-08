const assert=require('node:assert/strict');
const {InMemorySharedCoordinatorV15,STATES}=require('../multihost-coordinator-v15.js');
const {coordinatedExecute}=require('../coordinated-execution-v15.js');

async function main(){
  let passed=0;const ok=()=>passed++;let now=1000;
  const coordinator=new InMemorySharedCoordinatorV15({leaseMs:100,clock:()=>now});
  const args={executionId:'ex-int-1',ownerId:'host-a',actionDigest:'a'.repeat(64),toolBindingDigest:'b'.repeat(64),adapterId:'adapter-v1',input:{amount:10}};
  {
    let seen=null;const result=await coordinatedExecute({...args,coordinator,effect:async(input,ctx)=>{seen={input,ctx};return {ok:true};}});assert.equal(result.state,STATES.SUCCEEDED);assert.equal(seen.ctx.fencingToken,1);assert.match(seen.ctx.fencingDigest,/^[a-f0-9]{64}$/);ok();
  }
  {
    const result=await coordinator.read('ex-int-1');assert.equal(result.state,STATES.SUCCEEDED);assert.equal(result.ownerId,null);ok();
  }
  {
    await assert.rejects(()=>coordinatedExecute({...args,coordinator,effect:async()=>({})}),/execution_terminal/);ok();
  }
  {
    const c2=new InMemorySharedCoordinatorV15({leaseMs:10,clock:()=>now});let called=0;const failure=await coordinatedExecute({...args,executionId:'ex-unknown',coordinator:c2,effect:async()=>{called++;throw new Error('remote_uncertain');}});assert.equal(called,1);assert.equal(failure.effectOutcome,STATES.UNKNOWN);assert.equal(c2.read('ex-unknown').state,STATES.UNKNOWN);ok();
  }
  {
    const c3=new InMemorySharedCoordinatorV15({leaseMs:10,clock:()=>now});const first=await coordinatedExecute({...args,executionId:'ex-race',ownerId:'host-a',coordinator:c3,effect:async(_input,ctx)=>{now+=11;return ctx.fencingToken;}});assert.equal(first.state,STATES.SUCCEEDED);const row=c3.read('ex-race');assert.equal(row.fence,1);ok();
  }
  {
    const c4=new InMemorySharedCoordinatorV15({leaseMs:10,clock:()=>now});c4.reserve({...args,executionId:'ex-mismatch'});await assert.rejects(()=>coordinatedExecute({...args,executionId:'ex-mismatch',actionDigest:'c'.repeat(64),coordinator:c4,effect:async()=>({})}),/action_digest_mismatch/);ok();
  }
  {
    const c5={read:async()=>null,reserve:async()=>{throw new Error('shared_down')},acquireLease(){},complete(){},markUnknown(){}};await assert.rejects(()=>coordinatedExecute({...args,coordinator:c5,effect:async()=>({})}),/shared_down/);ok();
  }
  assert.equal(passed,6);
  console.log('RUMBO Coordinated Execution V15: 6/6 PASS + fenced context + terminal guard + unknown outcome + mismatch + fail-closed coordinator');
}
main().catch(err=>{console.error(err);process.exit(1);});
