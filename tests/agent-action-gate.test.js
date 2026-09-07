const assert = require('node:assert/strict');
const Gate = require('../agent-action-gate.js');

const NOW='2026-09-07T09:30:00Z';
const recent='2026-09-07T09:25:00Z';
const expires='2026-09-07T09:35:00Z';
const stale='2026-09-07T09:00:00Z';

const base={
  id:'act-1',
  purpose:'Complete the user-requested workflow',
  intentAligned:true,
  targetVerified:true,
  evidenceCount:1
};

function bind(action,overrides={}){
  return {
    ...action,
    explicitAuthorization:true,
    authorizationObservedAt:recent,
    authorization:{
      authorizationId:overrides.authorizationId||'auth-1',
      actionDigest:overrides.actionDigest||Gate.computeActionDigest(action),
      expiresAt:overrides.expiresAt||expires
    }
  };
}

{
  const r=Gate.assessAgentAction({...base,effect:'read',target:'local-report.json'},{now:NOW});
  assert.equal(r.decision,'ALLOW','ordinary read-only work should be allowed');
}

{
  const {intentAligned,...withoutIntent}=base;
  const r=Gate.assessAgentAction({...withoutIntent,effect:'read',target:'local-report.json'},{now:NOW});
  assert.equal(r.decision,'DENY','missing intent alignment must fail closed');
  assert.ok(r.reasons.some(x=>x.code==='intent_not_explicitly_aligned'));
}

{
  const r=Gate.assessAgentAction({...base,effect:'send',target:'recipient@example.com'},{now:NOW});
  assert.equal(r.decision,'DENY','sending without explicit authorization must fail closed');
}

{
  const action={...base,effect:'send',target:'recipient@example.com'};
  const r=Gate.assessAgentAction({...action,explicitAuthorization:true,authorizationObservedAt:recent},{now:NOW});
  assert.equal(r.decision,'REVIEW','unbound authorization must not be executable');
  assert.ok(r.requiredGates.includes('authorization_binding'));
}

{
  const action={...base,effect:'send',target:'recipient@example.com'};
  const r=Gate.assessAgentAction(bind(action),{now:NOW});
  assert.equal(r.decision,'ALLOW','fresh authorization bound to the exact action should pass');
  assert.match(r.actionDigest,/^[a-f0-9]{64}$/);
}

{
  const action={...base,effect:'send',target:'recipient@example.com'};
  const authorized=bind(action);
  authorized.target='attacker@example.com';
  const r=Gate.assessAgentAction(authorized,{now:NOW});
  assert.equal(r.decision,'DENY','changing target after authorization must invalidate the binding');
  assert.ok(r.reasons.some(x=>x.code==='authorization_action_mismatch'));
}

{
  const action={...base,effect:'send',target:'recipient@example.com'};
  const authorized=bind(action);
  authorized.purpose='Different purpose after approval';
  const r=Gate.assessAgentAction(authorized,{now:NOW});
  assert.equal(r.decision,'DENY','changing purpose after authorization must invalidate the binding');
}

{
  const action={...base,effect:'purchase',target:'vendor',freshConfirmation:true,amount:50,spendLimit:100};
  const authorized=bind(action);
  authorized.amount=99;
  const r=Gate.assessAgentAction(authorized,{now:NOW});
  assert.equal(r.decision,'DENY','changing purchase amount after authorization must invalidate the binding');
}

{
  const action={...base,effect:'send',target:'recipient@example.com'};
  const r=Gate.assessAgentAction(bind(action,{expiresAt:'2026-09-07T09:29:59Z'}),{now:NOW});
  assert.equal(r.decision,'DENY','expired bound authorization must be denied');
  assert.ok(r.reasons.some(x=>x.code==='authorization_expired'));
}

{
  const action={...base,effect:'send',target:'recipient@example.com'};
  const r=Gate.assessAgentAction(bind(action,{expiresAt:'2026-09-07T10:00:00Z'}),{now:NOW});
  assert.equal(r.decision,'DENY','authorization window longer than policy maximum must be denied');
  assert.ok(r.reasons.some(x=>x.code==='authorization_window_too_long'));
}

{
  const action={...base,effect:'send',target:'recipient@example.com'};
  const authorized=bind(action,{authorizationId:'auth-replay'});
  authorized.previouslyExecutedAuthorizationIds=['auth-replay'];
  const r=Gate.assessAgentAction(authorized,{now:NOW});
  assert.equal(r.decision,'DENY','reusing an executed authorization id must be denied');
  assert.ok(r.reasons.some(x=>x.code==='authorization_replay_detected'));
}

{
  const action={...base,effect:'delete',target:'record-7',reversible:false};
  const r=Gate.assessAgentAction(bind(action),{now:NOW});
  assert.equal(r.decision,'REVIEW','irreversible deletion requires fresh confirmation');
  assert.ok(r.requiredGates.includes('fresh_confirmation'));
}

{
  const action={...base,effect:'delete',target:'record-7',reversible:false,freshConfirmation:true};
  const r=Gate.assessAgentAction(bind(action),{now:NOW});
  assert.equal(r.decision,'ALLOW','freshly confirmed irreversible deletion with bound authorization should pass');
}

{
  const action={...base,effect:'credential',target:'third-party',handlesSecrets:true,destinationTrusted:false,freshConfirmation:true};
  const r=Gate.assessAgentAction(bind(action),{now:NOW});
  assert.equal(r.decision,'DENY','secrets to untrusted destinations must be denied');
}

{
  const action={...base,effect:'execute',target:'sandbox',evidenceCount:0};
  const r=Gate.assessAgentAction(bind(action),{now:NOW});
  assert.equal(r.decision,'REVIEW','high-risk execution without evidence should require review');
}

{
  const action={...base,effect:'send',target:'recipient@example.com'};
  const authorized=bind(action);
  authorized.authorizationObservedAt=stale;
  const r=Gate.assessAgentAction(authorized,{now:NOW});
  assert.equal(r.decision,'REVIEW','stale authorization observation should require refresh');
}

{
  const action={...base,effect:'send',target:'recipient@example.com'};
  const authorized=bind(action);
  authorized.authorizationObservedAt=Date.parse(recent);
  const r=Gate.assessAgentAction(authorized,{now:Date.parse(NOW)});
  assert.equal(r.decision,'ALLOW','numeric timestamps should preserve freshness semantics');
}

{
  const action={...base,effect:'purchase',target:'vendor',freshConfirmation:true,amount:120,spendLimit:100};
  const r=Gate.assessAgentAction(bind(action),{now:NOW});
  assert.equal(r.decision,'DENY','spend above explicit limit must be denied');
  assert.ok(r.reasons.some(x=>x.code==='spend_limit_exceeded'));
}

{
  const action={...base,effect:'send',target:'recipient@example.com',replayKey:'send-1',previouslyExecutedReplayKeys:['send-1']};
  const r=Gate.assessAgentAction(bind(action),{now:NOW});
  assert.equal(r.decision,'DENY','legacy replay key protection remains enforced');
}

{
  const action={...base,effect:'teleport'};
  const r=Gate.assessAgentAction(action,{now:NOW});
  assert.equal(r.decision,'DENY','unknown effects must fail closed');
}

{
  const payloadA=Gate.canonicalActionPayload({...base,effect:'send',target:'a@example.com'});
  const payloadB=Gate.canonicalActionPayload({...base,effect:'send',target:'b@example.com'});
  assert.notEqual(payloadA,payloadB,'authorization payload must include target');
  assert.notEqual(Gate.computeActionDigest({...base,effect:'send',target:'a@example.com'}),Gate.computeActionDigest({...base,effect:'send',target:'b@example.com'}));
}

{
  const action={...base,effect:'send',target:'recipient@example.com'};
  const authorized=bind(action);
  const r=Gate.assessAgentAction(authorized,{now:NOW,digestFn:()=>null});
  assert.equal(r.decision,'REVIEW','runtime without digest verification must fail closed to review');
  assert.ok(r.reasons.some(x=>x.code==='digest_verification_unavailable'));
}

{
  const safe={...base,id:'p1',effect:'read',target:'report'};
  const unsafe={...base,id:'p2',effect:'send',target:'outside@example.com'};
  const plan=Gate.assessPlan([safe,unsafe],{now:NOW});
  assert.equal(plan.decision,'DENY','a denied child action must deny the compound plan');
}

{
  const safe={...base,id:'p1',effect:'read',target:'report'};
  const action={...base,id:'p2',effect:'execute',target:'sandbox',evidenceCount:0};
  const plan=Gate.assessPlan([safe,bind(action,{authorizationId:'auth-plan'})],{now:NOW});
  assert.equal(plan.decision,'REVIEW','a review child action must propagate review to the plan');
}

console.log('RUMBO Agent Action Gate V2: 24/24 PASS');
