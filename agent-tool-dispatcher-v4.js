const crypto=require('node:crypto');
const {prepareAuthorizedAction}=require('./agent-authorized-dispatch.js');

const DEFAULT_LIMITS=Object.freeze({maxDepth:64,maxNodes:10000});

function assertDensePlainArray(value){
  const keys=Object.keys(value);
  if(keys.length!==value.length) throw new Error('sparse_or_decorated_array');
  for(let i=0;i<value.length;i++){
    if(keys[i]!==String(i)||!Object.prototype.hasOwnProperty.call(value,i)) throw new Error('sparse_or_decorated_array');
  }
  if(Object.getOwnPropertySymbols(value).length) throw new Error('symbol_property');
}

function enterNode(state,depth){
  if(depth>state.maxDepth) throw new Error('input_too_deep');
  state.nodes++;
  if(state.nodes>state.maxNodes) throw new Error('input_too_complex');
}

function ownDataEntries(value){
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null) throw new Error('non_plain_object');
  if(Object.getOwnPropertySymbols(value).length) throw new Error('symbol_property');
  return Object.keys(value).sort().map(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor||typeof descriptor.get==='function'||typeof descriptor.set==='function') throw new Error('accessor_property');
    return [key,descriptor.value];
  });
}

function canonicalize(value,seen=new Set(),depth=0,state={nodes:0,...DEFAULT_LIMITS}){
  enterNode(state,depth);
  if(value===null) return 'null';
  const t=typeof value;
  if(t==='string'||t==='boolean') return JSON.stringify(value);
  if(t==='number'){
    if(!Number.isFinite(value)) throw new Error('non_finite_number');
    return JSON.stringify(value);
  }
  if(t==='undefined'||t==='function'||t==='symbol'||t==='bigint') throw new Error('unsupported_input_type');
  if(seen.has(value)) throw new Error('cyclic_input');
  seen.add(value);
  try{
    if(Array.isArray(value)){
      assertDensePlainArray(value);
      const parts=[];
      for(let i=0;i<value.length;i++) parts.push(canonicalize(value[i],seen,depth+1,state));
      return `[${parts.join(',')}]`;
    }
    const entries=ownDataEntries(value);
    return `{${entries.map(([k,v])=>`${JSON.stringify(k)}:${canonicalize(v,seen,depth+1,state)}`).join(',')}}`;
  }finally{
    seen.delete(value);
  }
}

function deepCloneAndFreeze(value,seen=new Set(),depth=0,state={nodes:0,...DEFAULT_LIMITS}){
  enterNode(state,depth);
  if(value===null||typeof value!=='object'){
    if(typeof value==='number'&&!Number.isFinite(value)) throw new Error('non_finite_number');
    if(['undefined','function','symbol','bigint'].includes(typeof value)) throw new Error('unsupported_input_type');
    return value;
  }
  if(seen.has(value)) throw new Error('cyclic_input');
  seen.add(value);
  try{
    if(Array.isArray(value)){
      assertDensePlainArray(value);
      const copy=[];
      for(let i=0;i<value.length;i++) copy.push(deepCloneAndFreeze(value[i],seen,depth+1,state));
      return Object.freeze(copy);
    }
    const copy=Object.create(null);
    for(const [key,entryValue] of ownDataEntries(value)) copy[key]=deepCloneAndFreeze(entryValue,seen,depth+1,state);
    return Object.freeze(copy);
  }finally{
    seen.delete(value);
  }
}

function computeParametersDigest(input){
  return crypto.createHash('sha256').update(canonicalize(input),'utf8').digest('hex');
}

function createToolDispatcher(options={}){
  const defs=new Map();
  for(const raw of options.tools||[]){
    const name=String(raw&&raw.name||'').trim();
    const effect=String(raw&&raw.effect||'').trim().toLowerCase();
    if(!name||typeof raw.handler!=='function') throw new Error('invalid_tool_definition');
    if(defs.has(name)) throw new Error('duplicate_tool_name');
    defs.set(name,Object.freeze({name,effect,handler:raw.handler}));
  }

  function listTools(){
    return [...defs.values()].map(({name,effect})=>Object.freeze({name,effect}));
  }

  async function dispatch(request={}){
    const denied=(stage,reason,extra={})=>({decision:'DENY',authorizationDecision:'DENY',stage,reason,executed:false,invocationAttempted:false,effectOutcome:'NOT_ATTEMPTED',receipt:null,...extra});
    const toolName=String(request.tool||'').trim();
    const def=defs.get(toolName);
    if(!def) return denied('tool_lookup','unknown_tool');

    const claimedEffect=String(request.action&&request.action.effect||'').trim().toLowerCase();
    if(claimedEffect&&claimedEffect!==def.effect) return denied('tool_binding','tool_effect_mismatch');

    let frozenInput,inputDigest;
    try{
      frozenInput=deepCloneAndFreeze(request.input===undefined?null:request.input);
      inputDigest=computeParametersDigest(frozenInput);
    }catch(err){
      return denied('input_binding',String(err&&err.message||'invalid_input'));
    }

    const effectiveAction={...(request.action||{}),effect:def.effect,parametersDigest:inputDigest};
    const preflight=prepareAuthorizedAction(effectiveAction,{
      trustedPublicKeys:options.trustedPublicKeys||{},
      replayStore:options.replayStore,
      gateOptions:options.gateOptions||{}
    });
    if(preflight.decision!=='ALLOW'){
      return {decision:preflight.decision,authorizationDecision:preflight.decision,stage:preflight.stage,reason:'preflight_not_allowed',executed:false,invocationAttempted:false,effectOutcome:'NOT_ATTEMPTED',preflight,receipt:null};
    }

    const receipt={
      tool:toolName,
      effect:def.effect,
      actionId:preflight.ticket.actionId,
      actionDigest:preflight.ticket.actionDigest,
      parametersDigest:inputDigest,
      authorizationId:preflight.ticket.authorizationId,
      authorizerKeyId:preflight.ticket.authorizerKeyId,
      dispatchPolicyVersion:'RUMBO_AGENT_TOOL_DISPATCH_V6_OUTCOME_BOUND'
    };

    try{
      const result=await def.handler(frozenInput,Object.freeze({ticket:Object.freeze({...preflight.ticket}),receipt:Object.freeze({...receipt})}));
      return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'executed',executed:true,invocationAttempted:true,effectOutcome:'SUCCEEDED',result,receipt};
    }catch(err){
      return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'handler_error',executed:true,invocationAttempted:true,effectOutcome:'FAILED',error:String(err&&err.message||'handler_error'),receipt};
    }
  }

  return Object.freeze({dispatch,listTools});
}

module.exports={DEFAULT_LIMITS,canonicalize,computeParametersDigest,createToolDispatcher};
