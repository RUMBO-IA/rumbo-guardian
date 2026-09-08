const assert=require('node:assert/strict');
const {InMemoryFencingStore,MAX_TTL_MS,computeFencingBinding,createFencedDestination,createAtomicFencedDestination}=require('../distributed-execution-fencing-v15.js');

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
 {
   assert.equal(MAX_TTL_MS,300000);
   await assert.rejects(()=>store.renew(reacquired,{nowMs:203,ttlMs:MAX_TTL_MS+1}),/lease_ttl_invalid/);
   ok();
 }
 {
   const store2=new InMemoryFencingStore();const leaseA=await store2.acquire({resourceId:'r2',executionId:'e1',ownerId:'host-a'},{nowMs:0,ttlMs:10});let applied=0;
   const atomic=createAtomicFencedDestination({fencingStore:store2,apply:async(_input,ctx)=>{applied++;const valid=await store2.validate({...leaseA,fencingToken:ctx.fencingToken},{nowMs:0});return {fencingAccepted:valid.valid};}});
   const okApply=await atomic.applyWithLease(leaseA,{}, {}, {nowMs:0});assert.equal(okApply.decision,'ALLOW');assert.equal(applied,1);ok();
 }
 {
   const store3=new InMemoryFencingStore();const lease=await store3.acquire({resourceId:'r3',executionId:'e1',ownerId:'host-a'},{nowMs:0,ttlMs:10});let applied=0;
   const atomic=createAtomicFencedDestination({fencingStore:store3,apply:async(_input)=>{applied++;return {fencingAccepted:false};}});
   const denied=await atomic.applyWithLease(lease,{}, {}, {nowMs:0});assert.equal(denied.decision,'DENY');assert.equal(denied.reason,'fencing_not_enforced_at_mutation_boundary');assert.equal(applied,1);ok();
 }
 assert.equal(passed,16);
 console.log('RUMBO Distributed Execution Fencing V15: 16/16 PASS + stale-token rejection + lease expiry + atomic mutation-boundary fencing');
}
main().catch(err=>{console.error(err);process.exit(1);});
