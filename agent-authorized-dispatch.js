const Gate=require('./agent-action-gate.js');
const Auth=require('./agent-authorization-v3.js');
const {types}=require('node:util');

function isPlainDataRecord(value){
  if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value)) return false;
  const proto=Object.getPrototypeOf(value);
  return proto===Object.prototype||proto===null;
}

const ACTION_SCALARS=new Set([
  'id','effect','target','purpose','parametersDigest','toolBindingDigest',
  'replayKey','amount','spendLimit','evidenceCount'
]);
const REPLAY_LISTS=new Set(['previouslyExecutedReplayKeys','previouslyExecutedAuthorizationIds']);
const ACTION_READ_FIELDS=[
  'id','effect','target','purpose','explicitAuthorization','authorization',
  'freshConfirmation','intentAligned','targetVerified','reversible',
  'handlesSecrets','destinationTrusted','amount','spendLimit',
  'parametersDigest','toolBindingDigest','authorizationObservedAt','replayKey',
  'previouslyExecutedReplayKeys','previouslyExecutedAuthorizationIds','evidenceCount'
];
const AUTH_READ_FIELDS=['authorizationId','actionDigest','expiresAt','observedAt','keyId','signature'];
function hasInheritedSecurityField(record,fields){
  const own=Object.getOwnPropertyDescriptors(record);
  // The 'in' test does not evaluate inherited getters.
  return fields.some(field=>!Object.prototype.hasOwnProperty.call(own,field)&&field in record);
}
function isStableReplayList(value){
  if(types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype) return false;
  const descriptors=Object.getOwnPropertyDescriptors(value);
  const entries=Object.keys(descriptors).filter(k=>k!=='length');
  if(entries.length!==value.length) return false;
  for(let i=0;i<value.length;i++){
    const d=descriptors[i];
    if(!d||!Object.prototype.hasOwnProperty.call(d,'value')) return false;
    if(typeof d.value!=='string'&&typeof d.value!=='number') return false;
  }
  return entries.every((key,index)=>key===String(index));
}

function hasStableAuthorizationBinding(rawAction){
  if(!isPlainDataRecord(rawAction)||Object.getOwnPropertySymbols(rawAction).length) return false;
  if(hasInheritedSecurityField(rawAction,ACTION_READ_FIELDS)) return false;
  for(const [key,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(rawAction))){
    if(!Object.prototype.hasOwnProperty.call(descriptor,'value')) return false;
    const value=descriptor.value;
    if(ACTION_SCALARS.has(key)&&value!==undefined&&value!==null&&
      typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean') return false;
    if(REPLAY_LISTS.has(key)&&value!==undefined&&value!==null&&!isStableReplayList(value)) return false;
  }
  const authDescriptor=Object.getOwnPropertyDescriptor(rawAction,'authorization');
  if(authDescriptor){
    if(!Object.prototype.hasOwnProperty.call(authDescriptor,'value')) return false;
    const auth=authDescriptor.value;
    if(auth!==undefined&&auth!==null){
      if(!isPlainDataRecord(auth)||Object.getOwnPropertySymbols(auth).length) return false;
      if(hasInheritedSecurityField(auth,AUTH_READ_FIELDS)) return false;
      for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(auth))){
        if(!Object.prototype.hasOwnProperty.call(descriptor,'value')) return false;
        const value=descriptor.value;
        if(value!==undefined&&value!==null&&typeof value!=='string'&&typeof value!=='number') return false;
      }
    }
  }
  const observedDescriptor=Object.getOwnPropertyDescriptor(rawAction,'authorizationObservedAt');
  if(observedDescriptor){
    if(!Object.prototype.hasOwnProperty.call(observedDescriptor,'value')) return false;
    const observed=observedDescriptor.value;
    if(observed!==undefined&&observed!==null&&typeof observed!=='string'&&typeof observed!=='number') return false;
  }
  return true;
}


function prepareAuthorizedAction(rawAction={},options={}){
  if(!hasStableAuthorizationBinding(rawAction)){
    return {decision:'DENY',stage:'authorization_input',gate:null,authorization:{verified:false,reasons:['unstable_authorization_input']},reservation:null,ticket:null};
  }
  const safeAction=Object.assign(Object.create(null),rawAction);
  if(safeAction.authorization!==undefined&&safeAction.authorization!==null)
    safeAction.authorization=Object.assign(Object.create(null),safeAction.authorization);
  const gate=Gate.assessAgentAction(safeAction,options.gateOptions||{});
  if(gate.decision!=='ALLOW'){
    return {decision:gate.decision,stage:'policy',gate,authorization:null,reservation:null,ticket:null};
  }

  const envelope={
    ...(safeAction.authorization||{}),
    observedAt:safeAction.authorizationObservedAt
  };
  const authorization=Auth.verifyAuthorizationProof(envelope,{trustedPublicKeys:options.trustedPublicKeys||{}});
  if(!authorization.verified){
    return {decision:'DENY',stage:'signature',gate,authorization,reservation:null,ticket:null};
  }

  const store=options.replayStore;
  if(!store||typeof store.consume!=='function'){
    return {decision:'REVIEW',stage:'replay_store',gate,authorization,reservation:{consumed:false,reason:'replay_store_unavailable'},ticket:null};
  }

  const metadata={
    actionDigest:gate.actionDigest,
    keyId:authorization.keyId,
    authorizerFingerprint:authorization.fingerprint
  };

  let reservation;
  try{
    if(options.executionContext&&typeof store.consumeWithExecution==='function'){
      reservation=store.consumeWithExecution(envelope.authorizationId,metadata,{
        ...options.executionContext,
        actionId:gate.action.id,
        actionDigest:gate.actionDigest
      });
    }else if(options.executionContext&&options.requireExecutionJournal===true){
      reservation={consumed:false,reason:'execution_journal_unavailable'};
      return {decision:'REVIEW',stage:'execution_journal',gate,authorization,reservation,ticket:null};
    }else{
      reservation=store.consume(envelope.authorizationId,metadata);
    }
  }catch(err){
    reservation={consumed:false,reason:'replay_store_error',errorCode:String(err&&err.message||'unknown')};
    return {decision:'DENY',stage:'replay_store',gate,authorization,reservation,ticket:null};
  }
  if(!reservation.consumed){
    return {decision:'DENY',stage:'replay_store',gate,authorization,reservation,ticket:null};
  }

  const executionReserved=!!reservation.execution;
  return {
    decision:'ALLOW',
    stage:'ready',
    gate,
    authorization,
    reservation,
    ticket:{
      actionId:gate.action.id,
      actionDigest:gate.actionDigest,
      authorizationId:envelope.authorizationId,
      authorizerKeyId:authorization.keyId,
      authorizerFingerprint:authorization.fingerprint,
      executionState:executionReserved?'RESERVED':null,
      policyVersion:gate.policyVersion,
      dispatchPolicyVersion:executionReserved?'RUMBO_AGENT_AUTHORIZATION_DISPATCH_V10_EXECUTION_BOUND':'RUMBO_AGENT_AUTHORIZATION_DISPATCH_V3'
    }
  };
}

module.exports={prepareAuthorizedAction};
