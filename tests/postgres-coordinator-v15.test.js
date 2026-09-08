const assert=require('node:assert/strict');
const {SCHEMA_SQL,makePostgresCoordinatorV15}=require('../postgres-coordinator-v15.js');

async function main(){
  let passed=0;const ok=()=>passed++;let seq=0;const queries=[];
  const client={
    async query(q){queries.push(typeof q==='string'?q:q.text);if(q==='BEGIN'||q==='COMMIT'||q==='ROLLBACK')return {rowCount:0,rows:[]};if(String(q.text).startsWith('INSERT')) return {rowCount:1,rows:[{execution_id:q.values[0],state:'RESERVED',fencing_token:0}]};if(String(q.text).startsWith('SELECT')) return {rowCount:1,rows:[{execution_id:q.values[0],state:'RESERVED',fencing_token:0}]};if(String(q.text).startsWith('UPDATE')) return {rowCount:1,rows:[{execution_id:q.values[0],state:'LEASED',fencing_token:++seq,owner_id:q.values[1],lease_until_ms:q.values[5]||0}]};throw new Error('unexpected_query');}
  };
  {
    assert.match(SCHEMA_SQL,/PRIMARY KEY \(execution_id\)/);assert.match(SCHEMA_SQL,/fencing_token BIGINT NOT NULL/);assert.match(SCHEMA_SQL,/lease_until_ms BIGINT NOT NULL/);ok();
  }
  const c=makePostgresCoordinatorV15({client,clock:()=>1000,leaseMs:100});
  {
    const row=await c.reserve({executionId:'pg-1',actionDigest:'a',toolBindingDigest:'b',adapterId:'adapter'});assert.equal(row.execution_id,'pg-1');ok();
  }
  {
    const lease=await c.acquireLease('pg-1','host-a');assert.equal(lease.execution.state,'LEASED');assert.ok(queries.includes('BEGIN'));assert.ok(queries.some(q=>q.includes('FOR UPDATE')));assert.ok(queries.some(q=>q.includes('fencing_token=$4')));ok();
  }
  {
    await c.renewLease('pg-1','host-a',1);assert.ok(queries.some(q=>q.includes('owner_id=$2')&&q.includes('fencing_token=$3')&&q.includes('lease_until_ms>$6')));ok();
  }
  {
    await c.complete('pg-1','host-a',2,{ok:true,resultDigest:'d'.repeat(64)});assert.ok(queries.some(q=>q.includes('state=$5')&&q.includes('owner_id=$2')&&q.includes('fencing_token=$3')));ok();
  }
  {
    assert.throws(()=>makePostgresCoordinatorV15({client,leaseMs:0}),/lease_ms_invalid/);assert.throws(()=>makePostgresCoordinatorV15({client:null}),/postgres_client_required/);ok();
  }
  assert.equal(passed,5);
  console.log('RUMBO PostgreSQL Coordinator V15: 5/5 PASS + schema uniqueness + row lock + CAS fencing + fail-closed construction');
}
main().catch(err=>{console.error(err);process.exit(1);});
