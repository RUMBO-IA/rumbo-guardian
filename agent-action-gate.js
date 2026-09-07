(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.RumboAgentActionGate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const EFFECTS=new Set(['read','write','send','delete','execute','purchase','credential','external']);
  const EXTERNAL_EFFECTS=new Set(['write','send','delete','execute','purchase','credential','external']);
  const DESTRUCTIVE_EFFECTS=new Set(['delete','purchase','credential']);
  const HIGH_RISK_EFFECTS=new Set(['execute','purchase','credential','external']);
  const MAX_AUTH_AGE_MS=15*60*1000;
  let nodeCrypto=null;
  try{ if(typeof require==='function') nodeCrypto=require('node:crypto'); }catch{}

  const uniq=a=>[...new Set((a||[]).filter(Boolean))];
  const asBool=v=>v===true;
  const asFinite=v=>Number.isFinite(Number(v))?Number(v):null;
  const parseTimeMs=v=>{
    if(v===undefined||v===null||v==='') return null;
    if(typeof v==='number') return Number.isFinite(v)?v:null;
    const parsed=Date.parse(String(v));
    return Number.isFinite(parsed)?parsed:null;
  };
  const nowMs=v=>{
    const parsed=parseTimeMs(v);
    return parsed===null?Date.now():parsed;
  };

  function reason(code,detail,severity='review'){
    return {code,detail,severity};
  }

  function normalizeAuthorization(value={}){
    return {
      authorizationId:String(value.authorizationId||'').trim(),
      actionDigest:String(value.actionDigest||'').trim().toLowerCase(),
      expiresAt:value.expiresAt??null
    };
  }

  function normalizeAction(action={}){
    return {
      id:String(action.id||'').trim(),
      effect:String(action.effect||'').trim().toLowerCase(),
      target:String(action.target||'').trim(),
      purpose:String(action.purpose||'').trim(),
      explicitAuthorization:asBool(action.explicitAuthorization),
      authorization:normalizeAuthorization(action.authorization||{}),
      freshConfirmation:asBool(action.freshConfirmation),
      intentAligned:action.intentAligned===true,
      targetVerified:asBool(action.targetVerified),
      reversible:action.reversible===true,
      handlesSecrets:asBool(action.handlesSecrets),
      destinationTrusted:asBool(action.destinationTrusted),
      amount:asFinite(action.amount),
      spendLimit:asFinite(action.spendLimit),
      authorizationObservedAt:action.authorizationObservedAt??null,
      replayKey:String(action.replayKey||'').trim(),
      previouslyExecutedReplayKeys:uniq(action.previouslyExecutedReplayKeys||[]),
      previouslyExecutedAuthorizationIds:uniq(action.previouslyExecutedAuthorizationIds||[]),
      evidenceCount:Math.max(0,Number.parseInt(action.evidenceCount??0,10)||0)
    };
  }

  function canonicalActionPayload(rawAction={}){
    const action=normalizeAction(rawAction);
    return JSON.stringify({
      id:action.id,
      effect:action.effect,
      target:action.target,
      purpose:action.purpose,
      reversible:action.reversible,
      handlesSecrets:action.handlesSecrets,
      destinationTrusted:action.destinationTrusted,
      amount:action.amount,
      spendLimit:action.spendLimit
    });
  }

  function computeActionDigest(rawAction={},options={}){
    const payload=canonicalActionPayload(rawAction);
    if(typeof options.digestFn==='function'){
      const value=options.digestFn(payload);
      return typeof value==='string'?value.trim().toLowerCase():null;
    }
    if(nodeCrypto) return nodeCrypto.createHash('sha256').update(payload,'utf8').digest('hex');
    return null;
  }

  function assessAgentAction(rawAction={},options={}){
    const action=normalizeAction(rawAction);
    const now=nowMs(options.now);
    const reasons=[];
    const requiredGates=[];
    let decision='ALLOW';

    const deny=(code,detail)=>{
      decision='DENY';
      reasons.push(reason(code,detail,'deny'));
    };
    const review=(code,detail,gate)=>{
      if(decision!=='DENY') decision='REVIEW';
      reasons.push(reason(code,detail,'review'));
      if(gate) requiredGates.push(gate);
    };

    if(!action.effect||!EFFECTS.has(action.effect)){
      deny('unknown_effect','Unknown or missing action effect; fail closed.');
    }

    if(!action.id) review('missing_action_id','Action has no stable identifier.','stable_action_id');
    if(!action.purpose) review('missing_purpose','Action purpose is not explicit.','purpose');
    if(!action.intentAligned) deny('intent_not_explicitly_aligned','Action intent alignment is missing or false.');

    if(action.replayKey&&action.previouslyExecutedReplayKeys.includes(action.replayKey)){
      deny('replay_detected','The replay key was already executed.');
    }

    if(EXTERNAL_EFFECTS.has(action.effect)&&!action.explicitAuthorization){
      deny('missing_explicit_authorization','External-effect actions require explicit authorization.');
    }

    if(EXTERNAL_EFFECTS.has(action.effect)){
      const observed=parseTimeMs(action.authorizationObservedAt);
      const expires=parseTimeMs(action.authorization.expiresAt);
      const digest=computeActionDigest(action,options);

      if(observed===null) review('missing_or_invalid_authorization_time','External-effect authorization freshness cannot be validated.','fresh_authorization');
      else if(now-observed>MAX_AUTH_AGE_MS) review('stale_authorization','Authorization is older than the allowed freshness window.','fresh_authorization');
      else if(observed-now>60*1000) review('future_authorization_time','Authorization timestamp is unexpectedly in the future.','fresh_authorization');

      if(!action.authorization.authorizationId){
        review('missing_authorization_id','Bound authorization has no stable identifier.','authorization_binding');
      } else if(action.previouslyExecutedAuthorizationIds.includes(action.authorization.authorizationId)){
        deny('authorization_replay_detected','The bound authorization identifier was already executed.');
      }

      if(!action.authorization.actionDigest){
        review('missing_action_digest','Authorization is not bound to an action digest.','authorization_binding');
      } else if(!digest){
        review('digest_verification_unavailable','Action digest cannot be independently recomputed in this runtime.','authorization_binding');
      } else if(action.authorization.actionDigest!==digest){
        deny('authorization_action_mismatch','Authorization digest does not match the proposed action.');
      }

      if(expires===null){
        review('missing_or_invalid_authorization_expiry','Bound authorization expiry cannot be validated.','authorization_binding');
      } else {
        if(expires<=now) deny('authorization_expired','Bound authorization has expired.');
        if(observed!==null&&expires-observed>MAX_AUTH_AGE_MS) deny('authorization_window_too_long','Bound authorization exceeds the maximum authorization window.');
        if(observed!==null&&expires<observed) deny('authorization_expiry_before_observation','Authorization expiry predates its observation time.');
      }
    }

    if(EXTERNAL_EFFECTS.has(action.effect)&&!action.target){
      review('missing_target','External-effect action has no explicit target.','target');
    }

    if(EXTERNAL_EFFECTS.has(action.effect)&&!action.targetVerified){
      review('unverified_target','External-effect action target has not been verified.','target_verification');
    }

    if(HIGH_RISK_EFFECTS.has(action.effect)&&action.evidenceCount<1){
      review('insufficient_evidence','High-risk action has no supporting evidence.','evidence');
    }

    if(DESTRUCTIVE_EFFECTS.has(action.effect)&&!action.reversible&&!action.freshConfirmation){
      review('irreversible_without_fresh_confirmation','Irreversible or destructive action needs fresh confirmation.','fresh_confirmation');
    }

    if(action.handlesSecrets&&!action.destinationTrusted){
      deny('secret_to_untrusted_destination','Secrets may not be sent to an untrusted destination.');
    }

    if(action.effect==='purchase'){
      if(action.amount===null) review('missing_amount','Purchase amount is missing or invalid.','amount');
      if(action.spendLimit===null) review('missing_spend_limit','Purchase has no explicit spend limit.','spend_limit');
      if(action.amount!==null&&action.spendLimit!==null&&action.amount>action.spendLimit){
        deny('spend_limit_exceeded',`Purchase amount ${action.amount} exceeds spend limit ${action.spendLimit}.`);
      }
    }

    if(action.effect==='read'&&action.handlesSecrets&&!action.explicitAuthorization){
      review('sensitive_read_without_authorization','Reading secret-bearing data requires explicit authorization.','explicit_authorization');
    }

    return {
      decision,
      action,
      actionDigest:computeActionDigest(action,options),
      reasons,
      requiredGates:uniq(requiredGates),
      policyVersion:'RUMBO_AGENT_ACTION_GATE_V2',
      failClosed:true
    };
  }

  function assessPlan(actions=[],options={}){
    const assessments=(actions||[]).map(action=>assessAgentAction(action,options));
    let decision='ALLOW';
    if(assessments.some(x=>x.decision==='DENY')) decision='DENY';
    else if(assessments.some(x=>x.decision==='REVIEW')) decision='REVIEW';
    return {
      decision,
      assessments,
      requiredGates:uniq(assessments.flatMap(x=>x.requiredGates)),
      policyVersion:'RUMBO_AGENT_ACTION_GATE_V2',
      failClosed:true
    };
  }

  return {assessAgentAction,assessPlan,normalizeAction,canonicalActionPayload,computeActionDigest};
});
