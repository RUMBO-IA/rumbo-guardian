const assert=require('node:assert/strict');
const {InMemoryFencingStore,computeFencingBinding,createFencedDestination}=require('../distributed-execution-fencing-v15.js');

async function main(){
 let passed=0;const ok=()=>passed++;
 const store=new InMemoryFencingStore();
 const a=await store.acquire({resourceId:'r1',executionId:'e1',ownerId:'host-a'},{nowMs:0,ttlMs:100});assert.equal(a.acquired,true);assert.equal(a.fencingToken,1);ok();
 const busy=await store.acquire({resourceId:'r1',executionId:'e2',ownerId:'host-b'},{nowMs:50,ttlMs:100});assert.equal(busy.acquired,false);ok();
 const b=await store.acquire({resourceId:'r1',executionId:'e2',ownerId:'host-b'},{nowMs:100,ttlMs:100});assert.equal(b.acquired,true);assert.equal(b.fencingToken,2);ok();
 assert.equal((await store.validate(a,{nowMs:101})).valid,false);assert.equal((await store.validate(a,{nowMs:101})).reason,'stale_fencing_token');ok();
 assert.equal((await store.validate(b,{nowMs:101})).valid,true);ok();
 const binding1=computeFencingBinding(a),binding2=computeFencingBinding(b);assert.notEqual(binding1,binding2);ok();
 let executed=0;const destination=createFencedDestination({fencingStore:store,execute:async(_input,ctx)=>{executed++;return {token:ctx.fencingToken};}});
 const stale=await destination.executeWithLease(a,{}, {}, {nowMs:101});assert.equal(stale.decision,'DENY');assert.equal(executed,0);ok();
 const fresh=await destination.executeWithLease(b,{}, {}, {nowMs:101});assert.equal(fresh.decision,'ALLOW');assert.equal(fresh.fencingToken,2);assert.equal(executed,1);ok();
 const expired=await destination.executeWithLease(b,{}, {}, {nowMs:201});assert.equal(expired.decision,'DENY');assert.equal(expired.reason,'lease_expired');assert.equal(executed,1);ok();
 assert.equal((await store.renew(a,{nowMs:101,ttlMs:100})).renewed,false);ok();
 const released=await store.release(b);assert.equal(released.released,true);ok();
 const reacquired=await store.acquire({resourceId:'r1',executionId:'e3',ownerId:'host-c'},{nowMs:202,ttlMs:100});assert.equal(reacquired.acquired,true);assert.equal(reacquired.fencingToken,3);ok();
 const staleRelease=await store.release(b);assert.equal(staleRelease.released,false);ok();
 assert.equal(passed,13);
 console.log('RUMBO Distributed Execution Fencing V15: 13/13 PASS + stale-token rejection + lease expiry + reacquisition fencing');
}
main().catch(err=>{console.error(err);process.exit(1);});
