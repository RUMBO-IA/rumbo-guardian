const Gate=require('./agent-action-gate.js');
const Auth=require('./agent-authorization-v3.js');
const {types}=require('node:util');

function isPlainDataRecord(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||types.isProxy(value)) return false;
  const proto=Object.getPrototypeOf(value);
  return proto===Object.prototype||proto===null;
}

function hasStableAuthorizationBinding(rawAction){
  if(!isPlainDataRecord(rawAction)) return false;
  const authDescriptor=Object.getOwnPropertyDescriptor(rawAction,'authorization');
  if(authDescriptor){
    if(!Object.prototype.hasOwnProperty.call(authDescriptor,'value')) return false;
    const auth=authDescriptor.value;
    if(auth!==undefined&&auth!==null){
      if(!isPlainDataRecord(auth)) return false;
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
  const gate=Gate.assessAgentAction(rawAction,options.gateOptions||{});
  if(gate.decision!=='ALLOW'){
    return {decision:gate.decision,stage:'policy',gate,authorization:null,reservation:null,ticket:null};
  }

  const envelope={
    ...(rawAction.authorization||{}),
    observedAt:rawAction.authorizationObservedAt
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
