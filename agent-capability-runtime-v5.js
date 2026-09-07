const crypto=require('node:crypto');

function isPlainObject(value){
  if(value===null||typeof value!=='object'||Array.isArray(value)) return false;
  const proto=Object.getPrototypeOf(value);
  return proto===Object.prototype||proto===null;
}

function assertDataOnly(value,seen=new Set(),path='$'){
  if(value===null) return;
  const t=typeof value;
  if(t==='string'||t==='boolean') return;
  if(t==='number'){
    if(!Number.isFinite(value)) throw new Error(`non_finite_number:${path}`);
    return;
  }
  if(t==='undefined'||t==='function'||t==='symbol'||t==='bigint') throw new Error(`unsupported_type:${path}`);
  if(seen.has(value)) throw new Error(`cyclic_value:${path}`);
  seen.add(value);
  try{
    if(Array.isArray(value)){
      const keys=Object.keys(value);
      if(keys.length!==value.length) throw new Error(`sparse_or_decorated_array:${path}`);
      for(let i=0;i<value.length;i++){
        if(keys[i]!==String(i)||!Object.prototype.hasOwnProperty.call(value,i)) throw new Error(`sparse_or_decorated_array:${path}`);
        assertDataOnly(value[i],seen,`${path}[${i}]`);
      }
      return;
    }
    if(!isPlainObject(value)) throw new Error(`non_plain_object:${path}`);
    for(const key of Object.keys(value)) assertDataOnly(value[key],seen,`${path}.${key}`);
  }finally{
    seen.delete(value);
  }
}

function cloneData(value){
  assertDataOnly(value);
  if(value===null||typeof value!=='object') return value;
  if(Array.isArray(value)) return value.map(cloneData);
  const out=Object.create(null);
  for(const key of Object.keys(value)) out[key]=cloneData(value[key]);
  return out;
}

function validAttestation(attestation,adapterId,nonce){
  return Boolean(
    attestation&&
    attestation.adapterId===adapterId&&
    attestation.nonce===nonce&&
    attestation.hardIsolation===true&&
    attestation.networkIsolation===true&&
    attestation.filesystemIsolation===true&&
    attestation.processIsolation===true&&
    attestation.hostProcessDenied===true&&
    attestation.toolAccessMode==='mediated-only'
  );
}

function createCapabilityRuntime(options={}){
  const dispatcher=options.dispatcher;
  if(!dispatcher||typeof dispatcher.dispatch!=='function'||typeof dispatcher.listTools!=='function') throw new Error('dispatcher_required');
  const sandboxAdapter=options.sandboxAdapter||null;
  const trustedAdapterIds=new Set(options.trustedSandboxAdapterIds||[]);
  const verifyAttestation=typeof options.verifySandboxAttestation==='function'?options.verifySandboxAttestation:null;

  async function dispatchProposal(proposal={}){
    try{assertDataOnly(proposal);}catch(err){
      return {decision:'DENY',stage:'proposal_validation',reason:String(err.message||err),executed:false,receipt:null};
    }
    const request=cloneData(proposal);
    return dispatcher.dispatch(request);
  }

  async function runUntrustedCode(request={}){
    try{assertDataOnly(request);}catch(err){
      return {decision:'DENY',stage:'sandbox_request_validation',reason:String(err.message||err),executed:false,toolCalls:[]};
    }
    if(!sandboxAdapter||typeof sandboxAdapter.attest!=='function'||typeof sandboxAdapter.run!=='function'){
      return {decision:'DENY',stage:'sandbox_gate',reason:'hard_sandbox_unavailable',executed:false,toolCalls:[]};
    }
    const adapterId=String(sandboxAdapter.id||'').trim();
    if(!adapterId||!trustedAdapterIds.has(adapterId)){
      return {decision:'DENY',stage:'sandbox_gate',reason:'untrusted_sandbox_adapter',executed:false,toolCalls:[]};
    }
    if(!verifyAttestation){
      return {decision:'DENY',stage:'sandbox_gate',reason:'sandbox_attestation_verifier_missing',executed:false,toolCalls:[]};
    }

    const nonce=crypto.randomBytes(32).toString('hex');
    let attestation;
    try{attestation=await sandboxAdapter.attest({nonce,profile:'RUMBO_AGENT_CAPABILITY_RUNTIME_V5'});}
    catch(err){return {decision:'DENY',stage:'sandbox_attestation',reason:'sandbox_attestation_error',error:String(err&&err.message||err),executed:false,toolCalls:[]};}

    if(!validAttestation(attestation,adapterId,nonce)){
      return {decision:'DENY',stage:'sandbox_attestation',reason:'sandbox_isolation_requirements_not_met',executed:false,toolCalls:[]};
    }
    let verified=false;
    try{verified=await verifyAttestation(attestation,{adapterId,nonce});}catch{}
    if(verified!==true){
      return {decision:'DENY',stage:'sandbox_attestation',reason:'sandbox_attestation_unverified',executed:false,toolCalls:[]};
    }

    const toolCalls=[];
    const invokeTool=async proposal=>{
      const result=await dispatchProposal(proposal);
      toolCalls.push({tool:String(proposal&&proposal.tool||''),decision:result.decision,stage:result.stage,executed:result.executed===true,receipt:result.receipt||null});
      return result;
    };
    const capabilities=Object.freeze({
      tools:Object.freeze(dispatcher.listTools().map(x=>Object.freeze({name:x.name,effect:x.effect}))),
      invokeTool
    });

    let result;
    try{
      result=await sandboxAdapter.run({request:cloneData(request),nonce,attestation:cloneData(attestation),capabilities});
    }catch(err){
      return {decision:'DENY',stage:'sandbox_error',reason:'sandbox_execution_error',error:String(err&&err.message||err),executed:true,toolCalls};
    }
    try{assertDataOnly(result);}catch(err){
      return {decision:'DENY',stage:'sandbox_result_validation',reason:String(err.message||err),executed:true,toolCalls};
    }
    return {
      decision:'ALLOW',
      stage:'sandbox_completed',
      executed:true,
      adapterId,
      result:cloneData(result),
      toolCalls,
      runtimePolicyVersion:'RUMBO_AGENT_CAPABILITY_RUNTIME_V5'
    };
  }

  return Object.freeze({dispatchProposal,runUntrustedCode,policyVersion:'RUMBO_AGENT_CAPABILITY_RUNTIME_V5'});
}

module.exports={assertDataOnly,cloneData,validAttestation,createCapabilityRuntime};
