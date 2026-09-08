const {PROTOCOL_VERSION,STATES,computeFencingDigest}=require('./multihost-coordinator-v15.js');

const SCHEMA_SQL=`CREATE TABLE IF NOT EXISTS rumbo_execution_v15 (execution_id TEXT PRIMARY KEY, action_digest TEXT NOT NULL, tool_binding_digest TEXT NOT NULL, adapter_id TEXT NOT NULL, provider_conformance_profile_digest TEXT, state TEXT NOT NULL CHECK (state IN ('RESERVED','LEASED','SUCCEEDED','FAILED','FAILED_OR_UNKNOWN')), owner_id TEXT, fencing_token BIGINT NOT NULL DEFAULT 0, lease_until_ms BIGINT NOT NULL DEFAULT 0, result_digest TEXT, error TEXT, version BIGINT NOT NULL DEFAULT 1, created_at_ms BIGINT NOT NULL, updated_at_ms BIGINT NOT NULL); CREATE INDEX IF NOT EXISTS rumbo_execution_v15_lease_idx ON rumbo_execution_v15(state,lease_until_ms);`;

function nowMs(clock){const value=Number(clock?clock():Date.now());if(!Number.isFinite(value)) throw new Error('clock_invalid');return value;}
function required(v,name){if(typeof v!=='string'||!v) throw new Error(`${name}_required`);return v;}
function assertFence(v){if(!Number.isInteger(v)||v<=0) throw new Error('fencing_token_invalid');return v;}

function makePostgresCoordinatorV15({client,clock=()=>Date.now(),leaseMs=30000}={}){
  if(!client||typeof client.query!=='function') throw new Error('postgres_client_required');
  if(!Number.isInteger(leaseMs)||leaseMs<=0) throw new Error('lease_ms_invalid');
  async function reserve(input){
    const executionId=required(input&&input.executionId,'execution_id');const ts=nowMs(clock);
    required(input.actionDigest,'action_digest');required(input.toolBindingDigest,'tool_binding_digest');required(input.adapterId,'adapter_id');
    const q={text:'INSERT INTO rumbo_execution_v15(execution_id,action_digest,tool_binding_digest,adapter_id,provider_conformance_profile_digest,state,owner_id,fencing_token,lease_until_ms,version,created_at_ms,updated_at_ms) VALUES($1,$2,$3,$4,$5,$6,NULL,0,0,1,$7,$7) ON CONFLICT (execution_id) DO NOTHING RETURNING *',values:[executionId,input.actionDigest,input.toolBindingDigest,input.adapterId,input.providerConformanceProfileDigest||null,STATES.RESERVED,ts]};
    const r=await client.query(q);if(r.rowCount!==1) throw new Error('execution_exists');return r.rows[0];
  }
  async function acquireLease(executionId,ownerId){
    required(executionId,'execution_id');required(ownerId,'owner_id');const ts=nowMs(clock),until=ts+leaseMs;
    await client.query('BEGIN');try{
      const current=await client.query({text:'SELECT * FROM rumbo_execution_v15 WHERE execution_id=$1 FOR UPDATE',values:[executionId]});
      if(current.rowCount!==1) throw new Error('execution_not_found');const row=current.rows[0];
      if([STATES.SUCCEEDED,STATES.FAILED].includes(row.state)) throw new Error('execution_terminal');
      if(row.state===STATES.LEASED&&Number(row.lease_until_ms)>ts) throw new Error('execution_lease_held');
      const nextFence=Number(row.fencing_token)+1;
      const updated=await client.query({text:'UPDATE rumbo_execution_v15 SET state=$2,owner_id=$3,fencing_token=$4,lease_until_ms=$5,version=version+1,updated_at_ms=$6 WHERE execution_id=$1 RETURNING *',values:[executionId,STATES.LEASED,ownerId,nextFence,until,ts]});
      await client.query('COMMIT');return {execution:updated.rows[0],fencingToken:nextFence};
    }catch(err){try{await client.query('ROLLBACK');}catch{}throw err;}
  }
  async function renewLease(executionId,ownerId,fencingToken){
    assertFence(fencingToken);const ts=nowMs(clock),until=ts+leaseMs;
    const r=await client.query({text:'UPDATE rumbo_execution_v15 SET lease_until_ms=$5,version=version+1,updated_at_ms=$6 WHERE execution_id=$1 AND state=$7 AND owner_id=$2 AND fencing_token=$3 AND lease_until_ms>$6 RETURNING *',values:[executionId,ownerId,fencingToken,0,until,ts,STATES.LEASED]});
    if(r.rowCount!==1) throw new Error('stale_fencing_token');return r.rows[0];
  }
  async function complete(executionId,ownerId,fencingToken,{ok,resultDigest=null,error=null}={}){
    assertFence(fencingToken);const state=ok?STATES.SUCCEEDED:STATES.FAILED;const ts=nowMs(clock);
    const r=await client.query({text:'UPDATE rumbo_execution_v15 SET state=$5,owner_id=NULL,lease_until_ms=0,result_digest=$6,error=$7,version=version+1,updated_at_ms=$8 WHERE execution_id=$1 AND state=$9 AND owner_id=$2 AND fencing_token=$3 RETURNING *',values:[executionId,ownerId,fencingToken,0,state,resultDigest,error,ts,STATES.LEASED]});
    if(r.rowCount!==1) throw new Error('stale_fencing_token');return r.rows[0];
  }
  return Object.freeze({protocolVersion:PROTOCOL_VERSION,schemaSql:SCHEMA_SQL,reserve,acquireLease,renewLease,complete,computeFencingDigest});
}

module.exports={SCHEMA_SQL,makePostgresCoordinatorV15};
