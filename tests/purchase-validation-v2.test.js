'use strict';
const assert=require('node:assert/strict');
const Gate=require('../agent-action-gate.js');
const NOW='2026-09-07T09:30:00Z',OBS='2026-09-07T09:25:00Z',EXPIRES='2026-09-07T09:35:00Z';
function assess(amount,spendLimit){
  const action={id:'purchase-1',effect:'purchase',target:'vendor',purpose:'Buy approved service',intentAligned:true,targetVerified:true,evidenceCount:1,freshConfirmation:true,amount,spendLimit};
  const signed={...action,explicitAuthorization:true,authorizationObservedAt:OBS,authorization:{authorizationId:'auth-purchase-1',actionDigest:Gate.computeActionDigest(action),expiresAt:EXPIRES}};
  return Gate.assessAgentAction(signed,{now:NOW});
}
let passed=0;
function check(name,condition){condition();passed++;console.log('PASS '+name)}
check('negative purchase amount DENY',()=>{const r=assess(-5,10);assert.equal(r.decision,'DENY');assert.ok(r.reasons.some(x=>x.code==='invalid_purchase_amount'));});
check('negative spend limit DENY',()=>{const r=assess(5,-10);assert.equal(r.decision,'DENY');assert.ok(r.reasons.some(x=>x.code==='invalid_spend_limit'));});
check('negative numeric strings DENY',()=>{const r=assess('-5','10');assert.equal(r.decision,'DENY');assert.ok(r.reasons.some(x=>x.code==='invalid_purchase_amount'));});
check('boolean values cannot authorize a purchase',()=>{const r=assess(false,false);assert.notEqual(r.decision,'ALLOW');assert.ok(r.reasons.some(x=>x.code==='missing_amount'));});
check('objects cannot authorize a purchase or invoke valueOf',()=>{let called=0;const hostile={valueOf(){called++;return 1}};const r=assess(hostile,10);assert.notEqual(r.decision,'ALLOW');assert.equal(called,0);});
check('valid positive bounded purchase remains ALLOW',()=>assert.equal(assess(50,100).decision,'ALLOW'));
check('valid zero cost remains ALLOW',()=>assert.equal(assess(0,0).decision,'ALLOW'));
check('positive overspend remains DENY',()=>{const r=assess(120,100);assert.equal(r.decision,'DENY');assert.ok(r.reasons.some(x=>x.code==='spend_limit_exceeded'));});
console.log(`Guardian purchase nonnegative validation: ${passed}/8 PASS`);
