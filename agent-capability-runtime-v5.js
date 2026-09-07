const crypto=require('node:crypto');
const {strictParseJsonWire}=require('./strict-json-wire-v7.js');

const DATA_LIMITS=Object.freeze({maxDepth:64,maxNodes:10000});

function isPlainObject(value){
  if(value===null||typeof value!=='object'||Array.isArray(value)) return false;
  const proto=Object.getPrototypeOf(value);
  return proto===Object.prototype||proto===null;
}

function assertDataOnly(value,seen=new Set(),path='$',depth=0,state={nodes:0,...DATA_LIMITS}){
  if(depth>state.maxDepth) throw new Error(`value_too_deep:${path}`);
  state.nodes++;
  if(state.nodes>state.maxNodes) throw new Error(`value_too_complex:${path}`);
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
      if(Object.getOwnPropertySymbols(value).length) throw new Error(`symbol_property:${path}`);
      for(let i=0;i<value.length;i++){
        if(keys[i]!==String(i)||!Object.prototype.hasOwnProperty.call(value,i)) throw new Error(`sparse_or_decorated_array:${path}`);
        assertDataOnly(value[i],seen,`${path}[${i}]`,depth+1,state);
      }
      return;
    }
    if(!isPlainObject(value)) throw new Error(`non_plain_object:${path}`);
    const symbols=Object.getOwnPropertySymbols(value);
    if(symbols.length) throw new Error(`symbol_property:${path}`);
    for(const key of Object.keys(value)){
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(!descriptor||typeof descriptor.get==='function'||typeof descriptor.set==='function') throw new Error(`accessor_property:${path}.${key}`);
      assertDataOnly(descriptor.value,seen,`${path}.${key}`,depth+1,state);
    }
  }finally{
    seen.delete(value);
  }
}

function cloneDataUnchecked(value){
  if(value===null||typeof value!=='object') return value;
  if(Array.isArray(value)){
    const out=[];
    for(let i=0;i<value.length;i++) out.push(cloneDataUnchecked(value[i]));
    return out;
  }
  const out=Object.create(null);
  for(const key of Object.keys(value)) out[key]=cloneDataUnchecked(Object.getOwnPropertyDescriptor(value,key).value);
  return out;
}

function cloneData(value){
  assertDataOnly(value);
  return cloneDataUnchecked(value);
}

function parseJsonWire(text,label='wire'){
  const value=strictParseJsonWire(text,label,{maxBytes:1024*1024,maxDepth:DATA_LIMITS.maxDepth,maxNodes:DATA_LIMITS.maxNodes});
  assertDataOnly(value);
  return value;
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
      return {decision:'DENY',stage:'proposal_validation',reason:String(err.message||err),executed:false,invocationAttempted:false,effectOutcome:'NOT_ATTEMPTED',receipt:null};
    }
    const request=cloneDataUnchecked(proposal);
    return dispatcher.dispatch(request);
  }

  async function runUntrustedCode(request={}){
    try{assertDataOnly(request);}catch(err){
      return {decision:'DENY',stage:'sandbox_request_validation',reason:String(err.message||err),executed:false,executionOutcome:'NOT_ATTEMPTED',toolCalls:[]};
    }
    if(!sandboxAdapter||typeof sandboxAdapter.attest!=='function'||typeof sandboxAdapter.run!=='function'){
      return {decision:'DENY',stage:'sandbox_gate',reason:'hard_sandbox_unavailable',executed:false,executionOutcome:'NOT_ATTEMPTED',toolCalls:[]};
    }
    const adapterId=String(sandboxAdapter.id||'').trim();
    if(!adapterId||!trustedAdapterIds.has(adapterId)){
      return {decision:'DENY',stage:'sandbox_gate',reason:'untrusted_sandbox_adapter',executed:false,executionOutcome:'NOT_ATTEMPTED',toolCalls:[]};
    }
    if(!verifyAttestation){
      return {decision:'DENY',stage:'sandbox_gate',reason:'sandbox_attestation_verifier_missing',executed:false,executionOutcome:'NOT_ATTEMPTED',toolCalls:[]};
    }

    const nonce=crypto.randomBytes(32).toString('hex');
    let attestation;
    try{attestation=await sandboxAdapter.attest({nonce,profile:'RUMBO_AGENT_CAPABILITY_RUNTIME_V7_STRICT_WIRE'});}
    catch(err){return {decision:'DENY',stage:'sandbox_attestation',reason:'sandbox_attestation_error',error:String(err&&err.message||err),executed:false,executionOutcome:'NOT_ATTEMPTED',toolCalls:[]};}

    if(!validAttestation(attestation,adapterId,nonce)){
      return {decision:'DENY',stage:'sandbox_attestation',reason:'sandbox_isolation_requirements_not_met',executed:false,executionOutcome:'NOT_ATTEMPTED',toolCalls:[]};
    }
    let verified=false;
    try{verified=await verifyAttestation(attestation,{adapterId,nonce});}catch{}
    if(verified!==true){
      return {decision:'DENY',stage:'sandbox_attestation',reason:'sandbox_attestation_unverified',executed:false,executionOutcome:'NOT_ATTEMPTED',toolCalls:[]};
    }

    const toolCalls=[];
    const invokeToolJson=async proposalJson=>{
      let proposal;
      try{proposal=parseJsonWire(proposalJson,'tool_proposal');}
      catch(err){
        const denied={decision:'DENY',stage:'tool_wire_validation',reason:String(err.message||err),executed:false,invocationAttempted:false,effectOutcome:'NOT_ATTEMPTED',receipt:null};
        toolCalls.push({tool:'',decision:'DENY',stage:'tool_wire_validation',executed:false,invocationAttempted:false,effectOutcome:'NOT_ATTEMPTED',receipt:null});
        return JSON.stringify(denied);
      }
      const result=await dispatchProposal(proposal);
      toolCalls.push({tool:String(proposal.tool||''),decision:result.decision,stage:result.stage,executed:result.executed===true,invocationAttempted:result.invocationAttempted===true,effectOutcome:result.effectOutcome||null,receipt:result.receipt||null});
      return JSON.stringify(result);
    };
    const capabilities=Object.freeze({
      toolsJson:JSON.stringify(dispatcher.listTools().map(x=>({name:x.name,effect:x.effect}))),
      invokeToolJson
    });

    let resultJson;
    try{
      resultJson=await sandboxAdapter.run({requestJson:JSON.stringify(cloneDataUnchecked(request)),nonce,attestation:cloneData(attestation),capabilities});
    }catch(err){
      return {decision:'DENY',stage:'sandbox_error',reason:'sandbox_execution_error',error:String(err&&err.message||err),executed:true,executionOutcome:'FAILED_OR_UNKNOWN',toolCalls};
    }
    let result;
    try{result=parseJsonWire(resultJson,'sandbox_result');}
    catch(err){return {decision:'DENY',stage:'sandbox_result_validation',reason:String(err.message||err),executed:true,executionOutcome:'FAILED_OR_UNKNOWN',toolCalls};}
    return {
      decision:'ALLOW',
      stage:'sandbox_completed',
      executed:true,
      executionOutcome:'COMPLETED',
      adapterId,
      result,
      toolCalls,
      runtimePolicyVersion:'RUMBO_AGENT_CAPABILITY_RUNTIME_V7_STRICT_WIRE'
    };
  }

  return Object.freeze({dispatchProposal,runUntrustedCode,policyVersion:'RUMBO_AGENT_CAPABILITY_RUNTIME_V7_STRICT_WIRE'});
}

module.exports={DATA_LIMITS,assertDataOnly,cloneData,parseJsonWire,validAttestation,createCapabilityRuntime};
