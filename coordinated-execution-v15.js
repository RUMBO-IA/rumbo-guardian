const {computeFencingDigest,STATES}=require('./multihost-coordinator-v15.js');

function required(v,name){if(typeof v!=='string'||!v) throw new Error(`${name}_required`);return v;}
function sha256Result(value){if(value===undefined||value===null) return null;return require('node:crypto').createHash('sha256').update(JSON.stringify(value),'utf8').digest('hex');}

async function coordinatedExecute({coordinator,executionId,ownerId,actionDigest,toolBindingDigest,adapterId,providerConformanceProfileDigest=null,input,effect,existingExecution=null}={}){
  if(!coordinator||typeof coordinator.reserve!=='function'||typeof coordinator.acquireLease!=='function'||typeof coordinator.complete!=='function'||typeof coordinator.markUnknown!=='function') throw new Error('shared_coordinator_required');
  required(executionId,'execution_id');required(ownerId,'owner_id');required(actionDigest,'action_digest');required(toolBindingDigest,'tool_binding_digest');required(adapterId,'adapter_id');
  if(typeof effect!=='function') throw new Error('effect_function_required');
  let current=existingExecution||coordinator.read(executionId);
  if(!current){current=coordinator.reserve({executionId,actionDigest,toolBindingDigest,adapterId,providerConformanceProfileDigest});}
  if(current.action_digest&&current.action_digest!==actionDigest) throw new Error('action_digest_mismatch');
  if(current.actionDigest&&current.actionDigest!==actionDigest) throw new Error('action_digest_mismatch');
  if(current.tool_binding_digest&&current.tool_binding_digest!==toolBindingDigest) throw new Error('tool_binding_digest_mismatch');
  if(current.toolBindingDigest&&current.toolBindingDigest!==toolBindingDigest) throw new Error('tool_binding_digest_mismatch');
  const lease=coordinator.acquireLease(executionId,ownerId);const fenceDigest=computeFencingDigest({executionId,actionDigest,toolBindingDigest,adapterId,fencingToken:lease.fencingToken});
  const context=Object.freeze({executionId,ownerId,actionDigest,toolBindingDigest,adapterId,providerConformanceProfileDigest,fencingToken:lease.fencingToken,fencingDigest});
  try{
    const result=await effect(input,context);
    const completed=coordinator.complete(executionId,ownerId,lease.fencingToken,{ok:true,resultDigest:sha256Result(result)});
    return Object.freeze({decision:'ALLOW',state:completed.state,effectOutcome:STATES.SUCCEEDED,result,context});
  }catch(err){
    try{const unknown=coordinator.markUnknown(executionId,ownerId,lease.fencingToken);return Object.freeze({decision:'ALLOW',state:unknown.state,effectOutcome:STATES.UNKNOWN,error:String(err&&err.message||'effect_error'),context});}
    catch(markErr){return Object.freeze({decision:'DENY',state:STATES.LEASED,effectOutcome:'EXECUTION_STATE_UNCERTAIN',error:String(markErr&&markErr.message||'unknown_state'),context});}
  }
}

module.exports={coordinatedExecute};
