const crypto=require('node:crypto');
const {prepareAuthorizedAction}=require('./agent-authorized-dispatch.js');
const {canonicalizeJcs}=require('./jcs-canonicalize-v8.js');

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

function canonicalize(value){ return canonicalizeJcs(value,DEFAULT_LIMITS); }
function computeParametersDigest(input){ return crypto.createHash('sha256').update(canonicalize(input),'utf8').digest('hex'); }
function computeToolBindingDigest(tool){
  const payload={effect:String(tool&&tool.effect||'').trim().toLowerCase(),implementationId:String(tool&&tool.implementationId||'').trim(),tool:String(tool&&tool.name||tool&&tool.tool||'').trim()};
  return crypto.createHash('sha256').update(canonicalize(payload),'utf8').digest('hex');
}

function createToolDispatcher(options={}){
  const defs=new Map();
  for(const raw of options.tools||[]){
    const name=String(raw&&raw.name||'').trim();
    const effect=String(raw&&raw.effect||'').trim().toLowerCase();
    const implementationId=String(raw&&raw.implementationId||'').trim();
    if(!name||typeof raw.handler!=='function') throw new Error('invalid_tool_definition');
    if(defs.has(name)) throw new Error('duplicate_tool_name');
    defs.set(name,Object.freeze({name,effect,implementationId,handler:raw.handler}));
  }

  const store=options.replayStore;
  const journalCapable=!!(store&&typeof store.consumeWithExecution==='function'&&typeof store.claimExecution==='function'&&typeof store.finishExecution==='function'&&typeof store.getExecution==='function');
  const denied=(stage,reason,extra={})=>({decision:'DENY',authorizationDecision:extra.authorizationDecision||'DENY',stage,reason,executed:false,invocationAttempted:false,effectOutcome:'NOT_ATTEMPTED',receipt:null,...extra});

  function listTools(){
    return [...defs.values()].map(({name,effect,implementationId})=>Object.freeze(implementationId?{name,effect,implementationId}:{name,effect}));
  }
  function bindingFor(def,actionId,actionDigest,parametersDigest){
    return {actionId,actionDigest,tool:def.name,effect:def.effect,implementationId:def.implementationId,parametersDigest};
  }
  function receiptFor(def,binding,authorizationId,extra={}){
    const auth=store&&typeof store.get==='function'?store.get(authorizationId):null;
    return {
      tool:def.name,effect:def.effect,implementationId:def.implementationId,toolBindingDigest:computeToolBindingDigest(def),
      actionId:binding.actionId,actionDigest:binding.actionDigest,parametersDigest:binding.parametersDigest,
      authorizationId,authorizerKeyId:extra.authorizerKeyId||auth&&auth.keyId||null,
      recovery:extra.recovery===true,
      dispatchPolicyVersion:journalCapable?'RUMBO_AGENT_TOOL_DISPATCH_V10_CRASH_AWARE_TOOL_BOUND':'RUMBO_AGENT_TOOL_DISPATCH_V8_JCS_BOUND'
    };
  }

  async function invokeClaimed(def,frozenInput,binding,authorizationId,receipt){
    try{
      const result=await def.handler(frozenInput,Object.freeze({ticket:Object.freeze({authorizationId,...binding}),receipt:Object.freeze({...receipt})}));
      if(journalCapable){
        let finalized;
        try{finalized=store.finishExecution(authorizationId,'SUCCEEDED');}catch(err){finalized={finished:false,reason:'execution_journal_error',error:String(err&&err.message||err)};}
        if(!finalized.finished) return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'journal_finalize_error',executed:true,invocationAttempted:true,effectOutcome:'FAILED_OR_UNKNOWN',result,finalization:finalized,receipt};
      }
      return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'executed',executed:true,invocationAttempted:true,effectOutcome:'SUCCEEDED',result,receipt};
    }catch(err){
      let finalized=null;
      if(journalCapable){
        try{finalized=store.finishExecution(authorizationId,'FAILED');}catch(finalErr){finalized={finished:false,reason:'execution_journal_error',error:String(finalErr&&finalErr.message||finalErr)};}
      }
      return {
        decision:'ALLOW',authorizationDecision:'ALLOW',stage:finalized&&finalized.finished===false?'journal_finalize_error':'handler_error',
        executed:true,invocationAttempted:true,effectOutcome:finalized&&finalized.finished===false?'FAILED_OR_UNKNOWN':'FAILED',
        error:String(err&&err.message||'handler_error'),finalization:finalized,receipt
      };
    }
  }

  async function dispatch(request={}){
    const toolName=String(request.tool||'').trim();
    const def=defs.get(toolName);
    if(!def) return denied('tool_lookup','unknown_tool');

    const claimedEffect=String(request.action&&request.action.effect||'').trim().toLowerCase();
    if(claimedEffect&&claimedEffect!==def.effect) return denied('tool_binding','tool_effect_mismatch');
    if(journalCapable&&!def.implementationId) return denied('execution_binding','missing_tool_implementation_id');

    let frozenInput,inputDigest;
    try{
      frozenInput=deepCloneAndFreeze(request.input===undefined?null:request.input);
      inputDigest=computeParametersDigest(frozenInput);
    }catch(err){ return denied('input_binding',String(err&&err.message||'invalid_input')); }

    const toolBindingDigest=journalCapable?computeToolBindingDigest(def):'';
    const effectiveAction={...(request.action||{}),effect:def.effect,parametersDigest:inputDigest,...(journalCapable?{toolBindingDigest}:{})};
    const executionContext=journalCapable?{tool:def.name,effect:def.effect,implementationId:def.implementationId,parametersDigest:inputDigest}:null;
    const preflight=prepareAuthorizedAction(effectiveAction,{
      trustedPublicKeys:options.trustedPublicKeys||{},replayStore:store,gateOptions:options.gateOptions||{},executionContext
    });
    if(preflight.decision!=='ALLOW'){
      return {decision:preflight.decision,authorizationDecision:preflight.decision,stage:preflight.stage,reason:'preflight_not_allowed',executed:false,invocationAttempted:false,effectOutcome:'NOT_ATTEMPTED',preflight,receipt:null};
    }

    const binding=bindingFor(def,preflight.ticket.actionId,preflight.ticket.actionDigest,inputDigest);
    const receipt=receiptFor(def,binding,preflight.ticket.authorizationId,{authorizerKeyId:preflight.ticket.authorizerKeyId});
    if(journalCapable){
      let claim;
      try{claim=store.claimExecution(preflight.ticket.authorizationId,binding);}catch(err){claim={claimed:false,reason:'execution_journal_error',error:String(err&&err.message||err)};}
      if(!claim.claimed) return denied('execution_claim',claim.reason,{authorizationDecision:'ALLOW',claim,receipt});
    }
    return invokeClaimed(def,frozenInput,binding,preflight.ticket.authorizationId,receipt);
  }

  async function resumeReserved(request={}){
    if(!journalCapable) return denied('recovery','execution_journal_unavailable');
    const authorizationId=String(request.authorizationId||'').trim();
    const current=store.getExecution(authorizationId);
    if(!current) return denied('recovery','execution_not_found');
    if(current.state!=='RESERVED') return denied('recovery','execution_not_resumable',{execution:current});
    const def=defs.get(current.tool);
    if(!def) return denied('recovery','recovery_tool_unavailable',{execution:current});
    if(!def.implementationId||def.implementationId!==current.implementationId||def.effect!==current.effect) return denied('recovery','tool_implementation_mismatch',{execution:current});

    let frozenInput,inputDigest;
    try{
      frozenInput=deepCloneAndFreeze(request.input===undefined?null:request.input);
      inputDigest=computeParametersDigest(frozenInput);
    }catch(err){ return denied('recovery_input',String(err&&err.message||'invalid_input')); }
    if(inputDigest!==current.parametersDigest) return denied('recovery','recovery_parameters_mismatch',{execution:current});

    const recoveryContext=Object.freeze({
      authorizationId,currentState:current.state,actionId:current.actionId,actionDigest:current.actionDigest,
      tool:current.tool,effect:current.effect,implementationId:current.implementationId,toolBindingDigest:computeToolBindingDigest(def),parametersDigest:current.parametersDigest
    });
    if(typeof options.authorizeRecovery!=='function') return denied('recovery','recovery_authority_unavailable',{execution:current});
    let approved=false;
    try{ approved=await options.authorizeRecovery(recoveryContext)===true; }catch{}
    if(!approved) return denied('recovery','recovery_not_approved',{execution:current});

    const binding=bindingFor(def,current.actionId,current.actionDigest,inputDigest);
    let claim;
    try{claim=store.claimExecution(authorizationId,binding);}catch(err){claim={claimed:false,reason:'execution_journal_error',error:String(err&&err.message||err)};}
    if(!claim.claimed) return denied('recovery_claim',claim.reason,{authorizationDecision:'ALLOW',claim,execution:current});
    const receipt=receiptFor(def,binding,authorizationId,{recovery:true});
    return invokeClaimed(def,frozenInput,binding,authorizationId,receipt);
  }

  return Object.freeze({dispatch,resumeReserved,listTools});
}

module.exports={DEFAULT_LIMITS,canonicalize,computeParametersDigest,computeToolBindingDigest,createToolDispatcher};
