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

  const uniq=a=>[...new Set((a||[]).filter(Boolean))];
  const asBool=v=>v===true;
  const asFinite=v=>Number.isFinite(Number(v))?Number(v):null;
  const nowMs=v=>{
    if(v===undefined||v===null) return Date.now();
    const n=Number(v);
    if(Number.isFinite(n)) return n;
    const parsed=Date.parse(String(v));
    return Number.isFinite(parsed)?parsed:Date.now();
  };

  function reason(code,detail,severity='review'){
    return {code,detail,severity};
  }

  function normalizeAction(action={}){
    return {
      id:String(action.id||'').trim(),
      effect:String(action.effect||'').trim().toLowerCase(),
      target:String(action.target||'').trim(),
      purpose:String(action.purpose||'').trim(),
      explicitAuthorization:asBool(action.explicitAuthorization),
      freshConfirmation:asBool(action.freshConfirmation),
      intentAligned:action.intentAligned!==false,
      targetVerified:asBool(action.targetVerified),
      reversible:action.reversible===true,
      handlesSecrets:asBool(action.handlesSecrets),
      destinationTrusted:asBool(action.destinationTrusted),
      amount:asFinite(action.amount),
      spendLimit:asFinite(action.spendLimit),
      authorizationObservedAt:action.authorizationObservedAt??null,
      replayKey:String(action.replayKey||'').trim(),
      previouslyExecutedReplayKeys:uniq(action.previouslyExecutedReplayKeys||[]),
      evidenceCount:Math.max(0,Number.parseInt(action.evidenceCount??0,10)||0)
    };
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
    if(!action.intentAligned) deny('intent_mismatch','Action is not aligned with the user intent.');

    if(action.replayKey&&action.previouslyExecutedReplayKeys.includes(action.replayKey)){
      deny('replay_detected','The replay key was already executed.');
    }

    if(EXTERNAL_EFFECTS.has(action.effect)&&!action.explicitAuthorization){
      deny('missing_explicit_authorization','External-effect actions require explicit authorization.');
    }

    if(action.authorizationObservedAt!==null&&EXTERNAL_EFFECTS.has(action.effect)){
      const observed=Date.parse(String(action.authorizationObservedAt));
      if(!Number.isFinite(observed)) review('invalid_authorization_time','Authorization timestamp cannot be validated.','fresh_authorization');
      else if(now-observed>MAX_AUTH_AGE_MS) review('stale_authorization','Authorization is older than the allowed freshness window.','fresh_authorization');
      else if(observed-now>60*1000) review('future_authorization_time','Authorization timestamp is unexpectedly in the future.','fresh_authorization');
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
      reasons,
      requiredGates:uniq(requiredGates),
      policyVersion:'RUMBO_AGENT_ACTION_GATE_V1',
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
      policyVersion:'RUMBO_AGENT_ACTION_GATE_V1',
      failClosed:true
    };
  }

  return {assessAgentAction,assessPlan,normalizeAction};
});