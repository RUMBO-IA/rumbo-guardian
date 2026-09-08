const crypto=require('node:crypto');

const PROTOCOL_VERSION='rumbo.multihost-coordinator.v15';
const STATES=Object.freeze({RESERVED:'RESERVED',LEASED:'LEASED',SUCCEEDED:'SUCCEEDED',FAILED:'FAILED',UNKNOWN:'FAILED_OR_UNKNOWN'});

function sha256(value){return crypto.createHash('sha256').update(String(value),'utf8').digest('hex');}
function id(){return crypto.randomUUID();}
function assertString(v,name){if(typeof v!=='string'||!v) throw new Error(`${name}_required`);return v;}
function assertPositiveInt(v,name){if(!Number.isInteger(v)||v<=0) throw new Error(`${name}_invalid`);return v;}

class InMemorySharedCoordinatorV15{
  constructor({leaseMs=30000,clock=()=>Date.now(),nodeId='coordinator'}={}){
    this.leaseMs=assertPositiveInt(leaseMs,'lease_ms');this.clock=clock;this.nodeId=assertString(nodeId,'node_id');this.rows=new Map();this.nextFence=0;
  }
  _now(){const n=Number(this.clock());if(!Number.isFinite(n)) throw new Error('clock_invalid');return n;}
  reserve({executionId= id(),actionDigest,toolBindingDigest,adapterId,providerConformanceProfileDigest=null}={}){
    assertString(executionId,'execution_id');assertString(actionDigest,'action_digest');assertString(toolBindingDigest,'tool_binding_digest');assertString(adapterId,'adapter_id');
    if(this.rows.has(executionId)) throw new Error('execution_exists');
    const row=Object.freeze({executionId,actionDigest,toolBindingDigest,adapterId,providerConformanceProfileDigest,state:STATES.RESERVED,ownerId:null,fence:0,leaseUntil:0,version:1,createdAt:this._now(),updatedAt:this._now(),resultDigest:null,error:null});
    this.rows.set(executionId,row);return row;
  }
  acquireLease(executionId,ownerId){
    assertString(executionId,'execution_id');assertString(ownerId,'owner_id');const current=this.rows.get(executionId);if(!current) throw new Error('execution_not_found');
    const now=this._now();if(current.state===STATES.LEASED&&current.leaseUntil>now) throw new Error('execution_lease_held');
    if([STATES.SUCCEEDED,STATES.FAILED].includes(current.state)) throw new Error('execution_terminal');
    const fence=++this.nextFence;const row=Object.freeze({...current,state:STATES.LEASED,ownerId,fence,leaseUntil:now+this.leaseMs,version:current.version+1,updatedAt:now});this.rows.set(executionId,row);return {execution:row,fencingToken:fence};
  }
  renewLease(executionId,ownerId,fencingToken){
    const current=this.rows.get(executionId);if(!current) throw new Error('execution_not_found');
    if(current.state!==STATES.LEASED||current.ownerId!==ownerId||current.fence!==fencingToken) throw new Error('stale_fencing_token');
    const now=this._now();if(current.leaseUntil<=now) throw new Error('lease_expired');
    const row=Object.freeze({...current,leaseUntil:now+this.leaseMs,version:current.version+1,updatedAt:now});this.rows.set(executionId,row);return row;
  }
  markUnknown(executionId,ownerId,fencingToken){return this._transition(executionId,ownerId,fencingToken,STATES.UNKNOWN,null,'execution_outcome_unknown');}
  complete(executionId,ownerId,fencingToken,{ok,resultDigest=null,error=null}={}){
    return this._transition(executionId,ownerId,fencingToken,ok?STATES.SUCCEEDED:STATES.FAILED,resultDigest,error);
  }
  _transition(executionId,ownerId,fencingToken,state,resultDigest,error){
    const current=this.rows.get(executionId);if(!current) throw new Error('execution_not_found');
    if(current.state!==STATES.LEASED||current.ownerId!==ownerId||current.fence!==fencingToken) throw new Error('stale_fencing_token');
    const row=Object.freeze({...current,state,leaseUntil:0,version:current.version+1,updatedAt:this._now(),resultDigest,error});this.rows.set(executionId,row);return row;
  }
  reconcileUnknown(executionId,ownerId,fencingToken,{found,status,resultDigest=null,error=null}={}){
    const current=this.rows.get(executionId);if(!current) throw new Error('execution_not_found');
    if(current.state!==STATES.UNKNOWN||current.ownerId!==ownerId||current.fence!==fencingToken) throw new Error('reconcile_not_allowed');
    const terminal=found&&(status==='SUCCEEDED'||status==='FAILED');
    if(!terminal) return current;
    const state=status==='SUCCEEDED'?STATES.SUCCEEDED:STATES.FAILED;
    const row=Object.freeze({...current,state,ownerId:null,fence:current.fence,leaseUntil:0,version:current.version+1,updatedAt:this._now(),resultDigest,error});this.rows.set(executionId,row);return row;
  }
  read(executionId){return this.rows.get(executionId)||null;}
}

function computeFencingDigest({executionId,actionDigest,toolBindingDigest,adapterId,fencingToken}){
  return sha256(JSON.stringify([executionId,actionDigest,toolBindingDigest,adapterId,String(fencingToken)]));
}

function makeFailClosedCoordinator(options={}){
  const coordinator=options.coordinator;
  if(!coordinator||typeof coordinator.reserve!=='function'||typeof coordinator.acquireLease!=='function'||typeof coordinator.complete!=='function'||typeof coordinator.markUnknown!=='function'||typeof coordinator.reconcileUnknown!=='function') throw new Error('shared_coordinator_required');
  return Object.freeze({
    reserve:args=>coordinator.reserve(args),
    acquireLease:(executionId,ownerId)=>coordinator.acquireLease(executionId,ownerId),
    renewLease:(executionId,ownerId,fencingToken)=>coordinator.renewLease(executionId,ownerId,fencingToken),
    markUnknown:(executionId,ownerId,fencingToken)=>coordinator.markUnknown(executionId,ownerId,fencingToken),
    complete:(executionId,ownerId,fencingToken,result)=>coordinator.complete(executionId,ownerId,fencingToken,result),
    reconcileUnknown:(executionId,ownerId,fencingToken,result)=>coordinator.reconcileUnknown(executionId,ownerId,fencingToken,result),
    read:executionId=>coordinator.read(executionId)
  });
}

module.exports={PROTOCOL_VERSION,STATES,InMemorySharedCoordinatorV15,computeFencingDigest,makeFailClosedCoordinator};
