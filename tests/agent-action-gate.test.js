const assert = require('node:assert/strict');
const Gate = require('../agent-action-gate.js');

const NOW='2026-09-07T09:30:00Z';
const recent='2026-09-07T09:25:00Z';
const stale='2026-09-07T09:00:00Z';

const base={
  id:'act-1',
  purpose:'Complete the user-requested workflow',
  intentAligned:true,
  targetVerified:true,
  evidenceCount:1
};

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
  assert.ok(r.reasons.some(x=>x.code==='missing_explicit_authorization'));
}

{
  const r=Gate.assessAgentAction({...base,effect:'send',target:'recipient@example.com',explicitAuthorization:true},{now:NOW});
  assert.equal(r.decision,'REVIEW','external authorization without a freshness timestamp must not be executable');
  assert.ok(r.requiredGates.includes('fresh_authorization'));
}

{
  const r=Gate.assessAgentAction({...base,effect:'send',target:'recipient@example.com',explicitAuthorization:true,authorizationObservedAt:recent},{now:NOW});
  assert.equal(r.decision,'ALLOW','authorized, verified, intent-aligned send should pass');
}

{
  const r=Gate.assessAgentAction({...base,effect:'delete',target:'record-7',explicitAuthorization:true,authorizationObservedAt:recent,reversible:false},{now:NOW});
  assert.equal(r.decision,'REVIEW','irreversible deletion requires fresh confirmation');
  assert.ok(r.requiredGates.includes('fresh_confirmation'));
}

{
  const r=Gate.assessAgentAction({...base,effect:'delete',target:'record-7',explicitAuthorization:true,authorizationObservedAt:recent,reversible:false,freshConfirmation:true},{now:NOW});
  assert.equal(r.decision,'ALLOW','freshly confirmed irreversible deletion should pass the policy gate');
}

{
  const r=Gate.assessAgentAction({...base,effect:'credential',target:'third-party',explicitAuthorization:true,authorizationObservedAt:recent,handlesSecrets:true,destinationTrusted:false,freshConfirmation:true},{now:NOW});
  assert.equal(r.decision,'DENY','secrets to untrusted destinations must be denied');
  assert.ok(r.reasons.some(x=>x.code==='secret_to_untrusted_destination'));
}

{
  const r=Gate.assessAgentAction({...base,effect:'execute',target:'sandbox',explicitAuthorization:true,authorizationObservedAt:recent,evidenceCount:0},{now:NOW});
  assert.equal(r.decision,'REVIEW','high-risk execution without evidence should require review');
  assert.ok(r.requiredGates.includes('evidence'));
}

{
  const r=Gate.assessAgentAction({...base,effect:'send',target:'recipient@example.com',explicitAuthorization:true,authorizationObservedAt:stale},{now:NOW});
  assert.equal(r.decision,'REVIEW','stale authorization should require refresh');
  assert.ok(r.reasons.some(x=>x.code==='stale_authorization'));
}

{
  const numericRecent=Date.parse(recent);
  const r=Gate.assessAgentAction({...base,effect:'send',target:'recipient@example.com',explicitAuthorization:true,authorizationObservedAt:numericRecent},{now:Date.parse(NOW)});
  assert.equal(r.decision,'ALLOW','numeric timestamps should preserve freshness semantics');
}

{
  const r=Gate.assessAgentAction({...base,effect:'purchase',target:'vendor',explicitAuthorization:true,authorizationObservedAt:recent,freshConfirmation:true,amount:120,spendLimit:100},{now:NOW});
  assert.equal(r.decision,'DENY','spend above explicit limit must be denied');
  assert.ok(r.reasons.some(x=>x.code==='spend_limit_exceeded'));
}

{
  const r=Gate.assessAgentAction({...base,effect:'send',target:'recipient@example.com',explicitAuthorization:true,authorizationObservedAt:recent,replayKey:'send-1',previouslyExecutedReplayKeys:['send-1']},{now:NOW});
  assert.equal(r.decision,'DENY','replay of an already executed action must be denied');
  assert.ok(r.reasons.some(x=>x.code==='replay_detected'));
}

{
  const r=Gate.assessAgentAction({...base,effect:'teleport',explicitAuthorization:true,authorizationObservedAt:recent},{now:NOW});
  assert.equal(r.decision,'DENY','unknown effects must fail closed');
  assert.ok(r.reasons.some(x=>x.code==='unknown_effect'));
}

{
  const plan=Gate.assessPlan([
    {...base,id:'p1',effect:'read',target:'report'},
    {...base,id:'p2',effect:'send',target:'outside@example.com'}
  ],{now:NOW});
  assert.equal(plan.decision,'DENY','a denied child action must deny the compound plan');
}

{
  const plan=Gate.assessPlan([
    {...base,id:'p1',effect:'read',target:'report'},
    {...base,id:'p2',effect:'execute',target:'sandbox',explicitAuthorization:true,authorizationObservedAt:recent,evidenceCount:0}
  ],{now:NOW});
  assert.equal(plan.decision,'REVIEW','a review child action must propagate review to the plan');
}

console.log('RUMBO Agent Action Gate: 16/16 PASS');
