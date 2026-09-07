const crypto=require('node:crypto');
const {prepareAuthorizedAction}=require('./agent-authorized-dispatch.js');

function assertDensePlainArray(value){
  const keys=Object.keys(value);
  if(keys.length!==value.length) throw new Error('sparse_or_decorated_array');
  for(let i=0;i<value.length;i++){
    if(keys[i]!==String(i)||!Object.prototype.hasOwnProperty.call(value,i)) throw new Error('sparse_or_decorated_array');
  }
}

function canonicalize(value,seen=new Set()){
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
      for(let i=0;i<value.length;i++) parts.push(canonicalize(value[i],seen));
      return `[${parts.join(',')}]`;
    }
    const proto=Object.getPrototypeOf(value);
    if(proto!==Object.prototype&&proto!==null) throw new Error('non_plain_object');
    const keys=Object.keys(value).sort();
    return `{${keys.map(k=>`${JSON.stringify(k)}:${canonicalize(value[k],seen)}`).join(',')}}`;
  }finally{
    seen.delete(value);
  }
}

function deepCloneAndFreeze(value){
  if(value===null||typeof value!=='object') return value;
  if(Array.isArray(value)){
    assertDensePlainArray(value);
    const copy=[];
    for(let i=0;i<value.length;i++) copy.push(deepCloneAndFreeze(value[i]));
    return Object.freeze(copy);
  }
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null) throw new Error('non_plain_object');
  const copy=Object.fromEntries(Object.keys(value).map(k=>[k,deepCloneAndFreeze(value[k])]));
  return Object.freeze(copy);
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
    const toolName=String(request.tool||'').trim();
    const def=defs.get(toolName);
    if(!def) return {decision:'DENY',stage:'tool_lookup',reason:'unknown_tool',executed:false,receipt:null};

    const claimedEffect=String(request.action&&request.action.effect||'').trim().toLowerCase();
    if(claimedEffect&&claimedEffect!==def.effect){
      return {decision:'DENY',stage:'tool_binding',reason:'tool_effect_mismatch',executed:false,receipt:null};
    }

    let frozenInput,inputDigest;
    try{
      frozenInput=deepCloneAndFreeze(request.input===undefined?null:request.input);
      inputDigest=computeParametersDigest(frozenInput);
    }catch(err){
      return {decision:'DENY',stage:'input_binding',reason:String(err&&err.message||'invalid_input'),executed:false,receipt:null};
    }

    const effectiveAction={...(request.action||{}),effect:def.effect,parametersDigest:inputDigest};
    const preflight=prepareAuthorizedAction(effectiveAction,{
      trustedPublicKeys:options.trustedPublicKeys||{},
      replayStore:options.replayStore,
      gateOptions:options.gateOptions||{}
    });
    if(preflight.decision!=='ALLOW'){
      return {decision:preflight.decision,stage:preflight.stage,reason:'preflight_not_allowed',executed:false,preflight,receipt:null};
    }

    const receipt={
      tool:toolName,
      effect:def.effect,
      actionId:preflight.ticket.actionId,
      actionDigest:preflight.ticket.actionDigest,
      parametersDigest:inputDigest,
      authorizationId:preflight.ticket.authorizationId,
      authorizerKeyId:preflight.ticket.authorizerKeyId,
      dispatchPolicyVersion:'RUMBO_AGENT_TOOL_DISPATCH_V4'
    };

    try{
      const result=await def.handler(frozenInput,Object.freeze({ticket:Object.freeze({...preflight.ticket}),receipt:Object.freeze({...receipt})}));
      return {decision:'ALLOW',stage:'executed',executed:true,result,receipt};
    }catch(err){
      return {decision:'ALLOW',stage:'handler_error',executed:true,error:String(err&&err.message||'handler_error'),receipt};
    }
  }

  return Object.freeze({dispatch,listTools});
}

module.exports={canonicalize,computeParametersDigest,createToolDispatcher};
