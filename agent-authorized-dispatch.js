const Gate=require('./agent-action-gate.js');
const Auth=require('./agent-authorization-v3.js');

function prepareAuthorizedAction(rawAction={},options={}){
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
