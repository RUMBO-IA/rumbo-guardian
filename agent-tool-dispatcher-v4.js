const crypto=require('node:crypto');
const {prepareAuthorizedAction}=require('./agent-authorized-dispatch.js');
const {canonicalizeJcs}=require('./jcs-canonicalize-v8.js');
const {computeIdempotencyKey,validateDestinationAdapter,normalizeEvidence}=require('./destination-idempotency-v11.js');
const {resolveTrustedDestinationCapability}=require('./destination-capability-v12.js');
const {resolveProviderConformance,verifyProviderConformanceReceipt}=require('./provider-conformance-v13.js');

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
  }finally{seen.delete(value);}
}

function canonicalize(value){return canonicalizeJcs(value,DEFAULT_LIMITS);}
function computeParametersDigest(input){return crypto.createHash('sha256').update(canonicalize(input),'utf8').digest('hex');}
function computeToolBindingDigest(tool){
  const payload={effect:String(tool&&tool.effect||'').trim().toLowerCase(),implementationId:String(tool&&tool.implementationId||'').trim(),tool:String(tool&&tool.name||tool&&tool.tool||'').trim()};
  const adapterId=String(tool&&tool.destinationAdapterId||tool&&tool.adapterId||'').trim();
  const capabilityDigest=String(tool&&tool.destinationCapabilityDigest||tool&&tool.capabilityDigest||'').trim().toLowerCase();
  const providerConformanceProfileDigest=String(tool&&tool.providerConformanceProfileDigest||'').trim().toLowerCase();
  if(adapterId) payload.destinationAdapterId=adapterId;
  if(capabilityDigest) payload.destinationCapabilityDigest=capabilityDigest;
  if(providerConformanceProfileDigest) payload.providerConformanceProfileDigest=providerConformanceProfileDigest;
  return crypto.createHash('sha256').update(canonicalize(payload),'utf8').digest('hex');
}

function createToolDispatcher(options={}){
  const defs=new Map();
  const allowLegacy=options.allowLegacySelfAssertedDestinationCapabilities===true;
  const allowCapabilityWithoutProviderConformance=options.allowCapabilityWithoutProviderConformance===true;
  for(const raw of options.tools||[]){
    const name=String(raw&&raw.name||'').trim();
    const effect=String(raw&&raw.effect||'').trim().toLowerCase();
    const implementationId=String(raw&&raw.implementationId||'').trim();
    let destinationAdapter=null,destinationCapability=null,providerConformance=null;
    if(raw&&raw.destinationAdapter!==undefined){
      destinationAdapter=validateDestinationAdapter(raw.destinationAdapter);
      if(!allowLegacy){
        destinationCapability=resolveTrustedDestinationCapability(destinationAdapter,implementationId,options.trustedDestinationCapabilities);
        if(!allowCapabilityWithoutProviderConformance){
          providerConformance=resolveProviderConformance(destinationAdapter,destinationCapability,options.trustedProviderConformance,{trustedPublicKeys:options.trustedProviderConformanceKeys||{},now:options.providerConformanceNow});
        }
      }
    }
    if(!name||(!destinationAdapter&&typeof raw.handler!=='function')) throw new Error('invalid_tool_definition');
    if(defs.has(name)) throw new Error('duplicate_tool_name');
    defs.set(name,Object.freeze({
      name,effect,implementationId,handler:raw.handler||null,destinationAdapter,
      destinationAdapterId:destinationAdapter&&destinationAdapter.adapterId||'',
      destinationCapabilityDigest:destinationCapability&&destinationCapability.capabilityDigest||'',
      destinationCapabilityVersion:destinationCapability&&destinationCapability.capabilityVersion||'',
      providerConformanceProfileDigest:providerConformance&&providerConformance.profileDigest||'',
      providerConformanceProviderId:providerConformance&&providerConformance.profile.providerId||'',
      providerConformanceSuiteVersion:providerConformance&&providerConformance.profile.suiteVersion||'',
      providerConformanceReceipt:providerConformance&&providerConformance.receipt||null
    }));
  }

  const store=options.replayStore;
  const journalCapable=!!(store&&typeof store.consumeWithExecution==='function'&&typeof store.claimExecution==='function'&&typeof store.finishExecution==='function'&&typeof store.getExecution==='function');
  const destinationCapable=!!(journalCapable&&typeof store.getDestination==='function'&&typeof store.finishDestinationExecution==='function'&&typeof store.markExecutionUnknown==='function');
  const denied=(stage,reason,extra={})=>({decision:'DENY',authorizationDecision:extra.authorizationDecision||'DENY',stage,reason,executed:false,invocationAttempted:false,effectOutcome:'NOT_ATTEMPTED',receipt:null,...extra});
  function capabilityBindingError(def,destination){
    const current=String(def&&def.destinationCapabilityDigest||'').trim().toLowerCase();
    const persisted=String(destination&&destination.capabilityDigest||'').trim().toLowerCase();
    if(persisted&&!current) return 'destination_capability_downgrade';
    if(current&&!persisted) return 'destination_capability_binding_missing';
    if(current&&persisted!==current) return 'destination_capability_mismatch';
    return null;
  }
  function providerConformanceBindingError(def,destination){
    const current=String(def&&def.providerConformanceProfileDigest||'').trim().toLowerCase();
    const persisted=String(destination&&destination.providerConformanceProfileDigest||'').trim().toLowerCase();
    if(persisted&&!current) return 'provider_conformance_downgrade';
    if(current&&!persisted) return 'provider_conformance_binding_missing';
    if(current&&persisted!==current) return 'provider_conformance_profile_mismatch';
    return null;
  }
  function providerConformanceFreshnessError(def){
    if(!def.providerConformanceProfileDigest) return null;
    const verification=verifyProviderConformanceReceipt(def.providerConformanceReceipt,{profileDigest:def.providerConformanceProfileDigest,trustedPublicKeys:options.trustedProviderConformanceKeys||{},now:options.providerConformanceNow});
    return verification.verified?null:(verification.reason||'provider_conformance_unverified');
  }

  function listTools(){
    return [...defs.values()].map(({name,effect,implementationId,destinationAdapterId,destinationCapabilityDigest,destinationCapabilityVersion,providerConformanceProfileDigest,providerConformanceProviderId,providerConformanceSuiteVersion})=>Object.freeze({
      name,effect,...(implementationId?{implementationId}:{}),...(destinationAdapterId?{destinationAdapterId}:{}),
      ...(destinationCapabilityDigest?{destinationCapabilityDigest,destinationCapabilityVersion}:{}),
      ...(providerConformanceProfileDigest?{providerConformanceProfileDigest,providerConformanceProviderId,providerConformanceSuiteVersion}:{})
    }));
  }
  function bindingFor(def,actionId,actionDigest,parametersDigest){return {actionId,actionDigest,tool:def.name,effect:def.effect,implementationId:def.implementationId,parametersDigest};}
  function receiptFor(def,binding,authorizationId,extra={}){
    const auth=store&&typeof store.get==='function'?store.get(authorizationId):null;
    return {
      tool:def.name,effect:def.effect,implementationId:def.implementationId,toolBindingDigest:computeToolBindingDigest(def),
      actionId:binding.actionId,actionDigest:binding.actionDigest,parametersDigest:binding.parametersDigest,
      authorizationId,authorizerKeyId:extra.authorizerKeyId||auth&&auth.keyId||null,recovery:extra.recovery===true,
      destinationAdapterId:def.destinationAdapterId||null,destinationCapabilityDigest:def.destinationCapabilityDigest||null,
      destinationCapabilityVersion:def.destinationCapabilityVersion||null,
      providerConformanceProfileDigest:def.providerConformanceProfileDigest||null,providerConformanceProviderId:def.providerConformanceProviderId||null,
      providerConformanceSuiteVersion:def.providerConformanceSuiteVersion||null,idempotencyKey:extra.idempotencyKey||null,
      dispatchPolicyVersion:def.providerConformanceProfileDigest?'RUMBO_AGENT_TOOL_DISPATCH_V13_PROVIDER_CONFORMANCE':def.destinationCapabilityDigest?'RUMBO_AGENT_TOOL_DISPATCH_V12_TRUSTED_DESTINATION_CAPABILITY':def.destinationAdapter?'RUMBO_AGENT_TOOL_DISPATCH_V11_LEGACY_SELF_ASSERTED':'RUMBO_AGENT_TOOL_DISPATCH_V10_CRASH_AWARE_TOOL_BOUND'
    };
  }

  async function invokeLegacy(def,frozenInput,binding,authorizationId,receipt){
    try{
      const result=await def.handler(frozenInput,Object.freeze({ticket:Object.freeze({authorizationId,...binding}),receipt:Object.freeze({...receipt})}));
      if(journalCapable){
        let finalized;try{finalized=store.finishExecution(authorizationId,'SUCCEEDED');}catch(err){finalized={finished:false,reason:'execution_journal_error',error:String(err&&err.message||err)};}
        if(!finalized.finished) return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'journal_finalize_error',executed:true,invocationAttempted:true,effectOutcome:'FAILED_OR_UNKNOWN',result,finalization:finalized,receipt};
      }
      return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'executed',executed:true,invocationAttempted:true,effectOutcome:'SUCCEEDED',result,receipt};
    }catch(err){
      let finalized=null;
      if(journalCapable){try{finalized=store.finishExecution(authorizationId,'FAILED');}catch(finalErr){finalized={finished:false,reason:'execution_journal_error',error:String(finalErr&&finalErr.message||finalErr)};}}
      return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:finalized&&finalized.finished===false?'journal_finalize_error':'handler_error',executed:true,invocationAttempted:true,effectOutcome:finalized&&finalized.finished===false?'FAILED_OR_UNKNOWN':'FAILED',error:String(err&&err.message||'handler_error'),finalization:finalized,receipt};
    }
  }

  function markUnknown(authorizationId){
    try{return store.markExecutionUnknown(authorizationId);}catch(err){return {marked:false,reason:'execution_journal_error',error:String(err&&err.message||err)};}
  }
  async function invokeDestination(def,frozenInput,binding,authorizationId,receipt,idempotencyKey){
    let rawEvidence;
    try{
      rawEvidence=await def.destinationAdapter.execute(frozenInput,Object.freeze({authorizationId,idempotencyKey,actionId:binding.actionId,actionDigest:binding.actionDigest,parametersDigest:binding.parametersDigest,tool:def.name,effect:def.effect,implementationId:def.implementationId,destinationCapabilityDigest:def.destinationCapabilityDigest||null,providerConformanceProfileDigest:def.providerConformanceProfileDigest||null}));
    }catch(err){
      const unknown=markUnknown(authorizationId);
      return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'destination_execute_unknown',executed:true,invocationAttempted:true,effectOutcome:'FAILED_OR_UNKNOWN',error:String(err&&err.message||'destination_execute_error'),unknown,receipt};
    }
    const evidence=normalizeEvidence(rawEvidence,{adapterId:def.destinationAdapterId,idempotencyKey});
    if(!evidence.valid){
      const unknown=markUnknown(authorizationId);
      return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'destination_evidence_invalid',executed:true,invocationAttempted:true,effectOutcome:'FAILED_OR_UNKNOWN',evidence,unknown,receipt};
    }
    if(evidence.evidence.status==='PENDING'||evidence.evidence.status==='UNKNOWN'){
      const unknown=markUnknown(authorizationId);
      return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'destination_pending',executed:true,invocationAttempted:true,effectOutcome:'FAILED_OR_UNKNOWN',destinationEvidence:evidence.evidence,unknown,receipt};
    }
    const terminal=evidence.evidence.status;
    let finalized;try{finalized=store.finishDestinationExecution(authorizationId,terminal,evidence.evidenceDigest);}catch(err){finalized={finished:false,reason:'execution_journal_error',error:String(err&&err.message||err)};}
    if(!finalized.finished){
      const unknown=markUnknown(authorizationId);
      return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'destination_finalize_error',executed:true,invocationAttempted:true,effectOutcome:'FAILED_OR_UNKNOWN',destinationEvidence:evidence.evidence,finalization:finalized,unknown,receipt};
    }
    return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'destination_terminal',executed:true,invocationAttempted:true,effectOutcome:terminal,destinationEvidence:evidence.evidence,finalization:finalized,receipt};
  }

  async function dispatch(request={}){
    const toolName=String(request.tool||'').trim();
    const def=defs.get(toolName);
    if(!def) return denied('tool_lookup','unknown_tool');
    const claimedEffect=String(request.action&&request.action.effect||'').trim().toLowerCase();
    if(claimedEffect&&claimedEffect!==def.effect) return denied('tool_binding','tool_effect_mismatch');
    if(journalCapable&&!def.implementationId) return denied('execution_binding','missing_tool_implementation_id');
    if(def.destinationAdapter&&!destinationCapable) return denied('destination_binding','destination_store_unavailable');
    const conformanceFreshnessError=providerConformanceFreshnessError(def);
    if(conformanceFreshnessError) return denied('provider_conformance',conformanceFreshnessError);

    let frozenInput,inputDigest;
    try{frozenInput=deepCloneAndFreeze(request.input===undefined?null:request.input);inputDigest=computeParametersDigest(frozenInput);}catch(err){return denied('input_binding',String(err&&err.message||'invalid_input'));}
    const toolBindingDigest=journalCapable?computeToolBindingDigest(def):'';
    const effectiveAction={...(request.action||{}),effect:def.effect,parametersDigest:inputDigest,...(journalCapable?{toolBindingDigest}:{})};
    let destination=null;
    if(def.destinationAdapter){
      try{
        destination={adapterId:def.destinationAdapterId,idempotencyKey:computeIdempotencyKey({authorizationId:effectiveAction.authorization&&effectiveAction.authorization.authorizationId,actionDigest:effectiveAction.authorization&&effectiveAction.authorization.actionDigest,toolBindingDigest,adapterId:def.destinationAdapterId}),...(def.destinationCapabilityDigest?{capabilityDigest:def.destinationCapabilityDigest}:{}),...(def.providerConformanceProfileDigest?{providerConformanceProfileDigest:def.providerConformanceProfileDigest}:{})};
      }catch(err){return denied('destination_binding',String(err&&err.message||'invalid_idempotency_binding'));}
    }
    const executionContext=journalCapable?{tool:def.name,effect:def.effect,implementationId:def.implementationId,parametersDigest:inputDigest,...(destination?{destination}:{})}:null;
    const preflight=prepareAuthorizedAction(effectiveAction,{trustedPublicKeys:options.trustedPublicKeys||{},replayStore:store,gateOptions:options.gateOptions||{},executionContext});
    if(preflight.decision!=='ALLOW') return {decision:preflight.decision,authorizationDecision:preflight.decision,stage:preflight.stage,reason:'preflight_not_allowed',executed:false,invocationAttempted:false,effectOutcome:'NOT_ATTEMPTED',preflight,receipt:null};

    const binding=bindingFor(def,preflight.ticket.actionId,preflight.ticket.actionDigest,inputDigest);
    const receipt=receiptFor(def,binding,preflight.ticket.authorizationId,{authorizerKeyId:preflight.ticket.authorizerKeyId,idempotencyKey:destination&&destination.idempotencyKey});
    if(journalCapable){
      let claim;try{claim=store.claimExecution(preflight.ticket.authorizationId,binding);}catch(err){claim={claimed:false,reason:'execution_journal_error',error:String(err&&err.message||err)};}
      if(!claim.claimed) return denied('execution_claim',claim.reason,{authorizationDecision:'ALLOW',claim,receipt});
    }
    return def.destinationAdapter?invokeDestination(def,frozenInput,binding,preflight.ticket.authorizationId,receipt,destination.idempotencyKey):invokeLegacy(def,frozenInput,binding,preflight.ticket.authorizationId,receipt);
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
    let destination=null;
    if(def.destinationAdapter){
      if(!destinationCapable) return denied('recovery','destination_store_unavailable',{execution:current});
      destination=store.getDestination(authorizationId);
      if(!destination||destination.state!=='PENDING'||destination.adapterId!==def.destinationAdapterId) return denied('recovery','destination_adapter_mismatch',{execution:current,destination});
      const capabilityError=capabilityBindingError(def,destination);
      if(capabilityError) return denied('recovery',capabilityError,{execution:current,destination});
      const conformanceBindingError=providerConformanceBindingError(def,destination);
      if(conformanceBindingError) return denied('recovery',conformanceBindingError,{execution:current,destination});
      const conformanceFreshnessError=providerConformanceFreshnessError(def);
      if(conformanceFreshnessError) return denied('recovery',conformanceFreshnessError,{execution:current,destination});
    }
    let frozenInput,inputDigest;
    try{frozenInput=deepCloneAndFreeze(request.input===undefined?null:request.input);inputDigest=computeParametersDigest(frozenInput);}catch(err){return denied('recovery_input',String(err&&err.message||'invalid_input'));}
    if(inputDigest!==current.parametersDigest) return denied('recovery','recovery_parameters_mismatch',{execution:current,destination});
    const recoveryContext=Object.freeze({authorizationId,currentState:current.state,actionId:current.actionId,actionDigest:current.actionDigest,tool:current.tool,effect:current.effect,implementationId:current.implementationId,toolBindingDigest:computeToolBindingDigest(def),parametersDigest:current.parametersDigest,...(destination?{destinationAdapterId:destination.adapterId,idempotencyKey:destination.idempotencyKey,destinationCapabilityDigest:destination.capabilityDigest||null,providerConformanceProfileDigest:destination.providerConformanceProfileDigest||null}:{})});
    if(typeof options.authorizeRecovery!=='function') return denied('recovery','recovery_authority_unavailable',{execution:current,destination});
    let approved=false;try{approved=await options.authorizeRecovery(recoveryContext)===true;}catch{}
    if(!approved) return denied('recovery','recovery_not_approved',{execution:current,destination});
    const binding=bindingFor(def,current.actionId,current.actionDigest,inputDigest);
    let claim;try{claim=store.claimExecution(authorizationId,binding);}catch(err){claim={claimed:false,reason:'execution_journal_error',error:String(err&&err.message||err)};}
    if(!claim.claimed) return denied('recovery_claim',claim.reason,{authorizationDecision:'ALLOW',claim,execution:current,destination});
    const receipt=receiptFor(def,binding,authorizationId,{recovery:true,idempotencyKey:destination&&destination.idempotencyKey});
    return def.destinationAdapter?invokeDestination(def,frozenInput,binding,authorizationId,receipt,destination.idempotencyKey):invokeLegacy(def,frozenInput,binding,authorizationId,receipt);
  }

  async function reconcileUnknown(request={}){
    if(!destinationCapable) return denied('reconciliation','destination_store_unavailable');
    const authorizationId=String(request.authorizationId||'').trim();
    const execution=store.getExecution(authorizationId),destination=store.getDestination(authorizationId);
    if(!execution||!destination) return denied('reconciliation','destination_execution_not_found');
    if(execution.state!=='FAILED_OR_UNKNOWN'||destination.state!=='PENDING') return denied('reconciliation','destination_execution_not_reconcilable',{execution,destination});
    const def=defs.get(execution.tool);
    if(!def||!def.destinationAdapter||def.destinationAdapterId!==destination.adapterId||def.implementationId!==execution.implementationId) return denied('reconciliation','destination_adapter_mismatch',{execution,destination});
    const capabilityError=capabilityBindingError(def,destination);
    if(capabilityError) return denied('reconciliation',capabilityError,{execution,destination});
    const conformanceBindingError=providerConformanceBindingError(def,destination);
    if(conformanceBindingError) return denied('reconciliation',conformanceBindingError,{execution,destination});
    const conformanceFreshnessError=providerConformanceFreshnessError(def);
    if(conformanceFreshnessError) return denied('reconciliation',conformanceFreshnessError,{execution,destination});
    if(typeof options.authorizeReconciliation!=='function') return denied('reconciliation','reconciliation_authority_unavailable',{execution,destination});
    let approved=false;try{approved=await options.authorizeReconciliation(Object.freeze({authorizationId,idempotencyKey:destination.idempotencyKey,adapterId:destination.adapterId,tool:execution.tool,effect:execution.effect,implementationId:execution.implementationId,destinationCapabilityDigest:destination.capabilityDigest||null,providerConformanceProfileDigest:destination.providerConformanceProfileDigest||null}))===true;}catch{}
    if(!approved) return denied('reconciliation','reconciliation_not_approved',{execution,destination});
    let rawEvidence;
    try{rawEvidence=await def.destinationAdapter.reconcile(Object.freeze({authorizationId,idempotencyKey:destination.idempotencyKey,actionId:execution.actionId,actionDigest:execution.actionDigest,parametersDigest:execution.parametersDigest,tool:execution.tool,effect:execution.effect,implementationId:execution.implementationId,destinationCapabilityDigest:destination.capabilityDigest||null,providerConformanceProfileDigest:destination.providerConformanceProfileDigest||null}));}
    catch(err){return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'reconciliation_error',executed:false,invocationAttempted:false,effectOutcome:'FAILED_OR_UNKNOWN',error:String(err&&err.message||'reconciliation_error'),execution,destination,receipt:null};}
    const evidence=normalizeEvidence(rawEvidence,{adapterId:destination.adapterId,idempotencyKey:destination.idempotencyKey});
    if(!evidence.valid) return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'reconciliation_evidence_invalid',executed:false,invocationAttempted:false,effectOutcome:'FAILED_OR_UNKNOWN',evidence,execution,destination,receipt:null};
    if(evidence.evidence.status==='PENDING') return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:'reconciliation_pending',executed:false,invocationAttempted:false,effectOutcome:'FAILED_OR_UNKNOWN',destinationEvidence:evidence.evidence,execution,destination,receipt:null};
    const terminal=evidence.evidence.status==='UNKNOWN'?'FAILED_OR_UNKNOWN':evidence.evidence.status;
    let finalized;try{finalized=store.finishDestinationExecution(authorizationId,terminal,evidence.evidenceDigest);}catch(err){finalized={finished:false,reason:'execution_journal_error',error:String(err&&err.message||err)};}
    return {decision:'ALLOW',authorizationDecision:'ALLOW',stage:finalized.finished?'reconciled':'reconciliation_finalize_error',executed:false,invocationAttempted:false,effectOutcome:finalized.finished?terminal:'FAILED_OR_UNKNOWN',destinationEvidence:evidence.evidence,finalization:finalized,receipt:null};
  }

  return Object.freeze({dispatch,resumeReserved,reconcileUnknown,listTools});
}

module.exports={DEFAULT_LIMITS,canonicalize,computeParametersDigest,computeToolBindingDigest,createToolDispatcher};
