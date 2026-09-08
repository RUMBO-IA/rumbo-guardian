const assert=require('node:assert/strict');
const {InMemorySharedCoordinatorV15,STATES,computeFencingDigest,makeFailClosedCoordinator}=require('../multihost-coordinator-v15.js');

async function main(){
  let passed=0;const ok=()=>passed++;
  let now=1000;const c=new InMemorySharedCoordinatorV15({leaseMs:100,nodeId:'shared',clock:()=>now});
  const base={executionId:'ex-1',actionDigest:'a'.repeat(64),toolBindingDigest:'b'.repeat(64),adapterId:'stripe-v1',providerConformanceProfileDigest:'c'.repeat(64)};
  {
    const r=c.reserve(base);assert.equal(r.state,STATES.RESERVED);assert.equal(r.fence,0);ok();
  }
  let a;
  {a=c.acquireLease('ex-1','host-a');assert.equal(a.execution.ownerId,'host-a');assert.equal(a.execution.fence,1);assert.ok(a.execution.leaseUntil>now);ok();}
  {
    assert.throws(()=>c.acquireLease('ex-1','host-b'),/execution_lease_held/);assert.throws(()=>c.complete('ex-1','host-b',2,{ok:true}),/stale_fencing_token/);ok();
  }
  {
    const before=a.execution.leaseUntil;now+=50;const renewed=c.renewLease('ex-1','host-a',1);assert.ok(renewed.leaseUntil>before);ok();
  }
  {
    now+=101;assert.throws(()=>c.renewLease('ex-1','host-a',1),/lease_expired/);ok();
  }
  let b;
  {
    b=c.acquireLease('ex-1','host-b');assert.equal(b.execution.fence,2);assert.equal(b.execution.ownerId,'host-b');ok();
  }
  {
    assert.throws(()=>c.complete('ex-1','host-a',1,{ok:true}),/stale_fencing_token/);assert.throws(()=>c.renewLease('ex-1','host-a',1),/stale_fencing_token/);ok();
  }
  {
    const digestA=computeFencingDigest({...base,fencingToken:1});const digestB=computeFencingDigest({...base,fencingToken:2});assert.notEqual(digestA,digestB);ok();
  }
  {
    const unknown=c.markUnknown('ex-1','host-b',2);assert.equal(unknown.state,STATES.UNKNOWN);assert.throws(()=>c.reconcileUnknown('ex-1','host-a',1,{found:true,status:'SUCCEEDED'}),/reconcile_not_allowed/);ok();
  }
  {
    const pending=c.reconcileUnknown('ex-1','host-b',2,{found:false,status:'UNKNOWN'});assert.equal(pending.state,STATES.UNKNOWN);ok();
  }
  {
    const recovered=c.reconcileUnknown('ex-1','host-b',2,{found:true,status:'SUCCEEDED',resultDigest:'d'.repeat(64)});assert.equal(recovered.state,STATES.SUCCEEDED);assert.equal(recovered.resultDigest,'d'.repeat(64));ok();
  }
  {
    assert.throws(()=>c.acquireLease('ex-1','host-c'),/execution_terminal/);ok();
  }
  {
    const fresh=new InMemorySharedCoordinatorV15({clock:()=>1000});fresh.reserve({executionId:'ex-2',actionDigest:'1',toolBindingDigest:'2',adapterId:'a'});const wrap=makeFailClosedCoordinator({coordinator:fresh});assert.equal(wrap.read('ex-2').state,STATES.RESERVED);ok();
  }
  {
    assert.throws(()=>makeFailClosedCoordinator({coordinator:{reserve(){},acquireLease(){},complete(){},markUnknown(){}}}),/shared_coordinator_required/);ok();
  }
  assert.equal(passed,12);
  console.log('RUMBO Multi-Host Coordinator V15: 12/12 PASS + lease race + fencing + expiry + recovery + fail-closed interface');
}
main().catch(err=>{console.error(err);process.exit(1);});
