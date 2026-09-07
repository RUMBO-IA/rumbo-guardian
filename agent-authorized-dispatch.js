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

  let reservation;
  try{
    reservation=store.consume(envelope.authorizationId,{
      actionDigest:gate.actionDigest,
      keyId:authorization.keyId,
      authorizerFingerprint:authorization.fingerprint
    });
  }catch(err){
    reservation={consumed:false,reason:'replay_store_error',errorCode:String(err&&err.message||'unknown')};
    return {decision:'DENY',stage:'replay_store',gate,authorization,reservation,ticket:null};
  }
  if(!reservation.consumed){
    return {decision:'DENY',stage:'replay_store',gate,authorization,reservation,ticket:null};
  }

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
      policyVersion:gate.policyVersion,
      dispatchPolicyVersion:'RUMBO_AGENT_AUTHORIZATION_DISPATCH_V3'
    }
  };
}

module.exports={prepareAuthorizedAction};
