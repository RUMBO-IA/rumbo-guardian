const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const V14=require('../stripe-conformance-runner-v14.js');

function mockStripe({breakReplay=false,acceptMismatch=false,breakLost=false,breakRetrieve=false,live=false}={}){
  let seq=0;const idem=new Map(),objects=new Map();
  const digest=body=>crypto.createHash('sha256').update(require('../jcs-canonicalize-v8.js').canonicalizeJcs(body),'utf8').digest('hex');
  return {
    async request({method,path,form,idempotencyKey,simulateResponseLoss=false}){
      if(method==='GET'){
        const id=decodeURIComponent(path.split('/').pop());
        const body=objects.get(id);
        if(!body) return {status:404,body:{error:{type:'invalid_request_error',code:'resource_missing'}}};
        const out=breakRetrieve?{...body,id:'pi_wrong'}:body;
        return {status:200,requestId:`req-${++seq}`,body:out};
      }
      const canon=JSON.stringify(Object.keys(form).sort().map(k=>[k,form[k]]));
      if(idem.has(idempotencyKey)){
        const prior=idem.get(idempotencyKey);
        if(prior.canon!==canon){
          if(acceptMismatch){const body={id:`pi_${++seq}`,object:'payment_intent',status:'requires_payment_method',amount:Number(form.amount),currency:form.currency,livemode:live,client_secret:'must-not-leak'};objects.set(body.id,body);return {status:200,requestId:`req-${seq}`,body};}
          return {status:400,requestId:`req-${++seq}`,body:{error:{type:'idempotency_error',code:'idempotency_key_in_use',message:'parameters differ'}}};
        }
        if(breakReplay){const body={...prior.body,id:`pi_${++seq}`};objects.set(body.id,body);return {status:200,requestId:`req-${seq}`,body};}
        if(simulateResponseLoss){const err=new Error('simulated_response_loss_after_remote_response');err.code='SIMULATED_RESPONSE_LOSS';err.remoteStatus=200;err.remoteBodyDigest=digest(prior.body);throw err;}
        return {status:200,requestId:`req-${++seq}`,body:prior.body};
      }
      const body={id:`pi_${++seq}`,object:'payment_intent',status:'requires_payment_method',amount:Number(form.amount),currency:form.currency,livemode:live,client_secret:'must-not-leak'};
      idem.set(idempotencyKey,{canon,body});objects.set(body.id,body);
      if(simulateResponseLoss){const err=new Error('simulated_response_loss_after_remote_response');err.code='SIMULATED_RESPONSE_LOSS';err.remoteStatus=200;err.remoteBodyDigest=breakLost?'0'.repeat(64):digest(body);throw err;}
      return {status:200,requestId:`req-${seq}`,body};
    }
  };
}

async function run(options={}){
  let i=0;return V14.runStripeConformance({transport:mockStripe(options),keyFactory:label=>`rumbo-v14-test-${label}-${++i}`,now:()=> '2026-09-07T23:00:00.000Z'});
}

async function main(){
  let passed=0;const ok=()=>passed++;
  assert.throws(()=>V14.validateStripeTestSecret(''),/stripe_test_key_required/);ok();
  assert.throws(()=>V14.validateStripeTestSecret('sk_live_example'),/stripe_live_key_forbidden/);ok();
  assert.equal(V14.validateStripeTestSecret('sk_test_example'),'sk_test_example');ok();
  {
    const result=await run();assert.equal(result.result,'PASS');assert.match(result.evidenceDigest,/^[a-f0-9]{64}$/);assert.equal(result.evidence.checks.length,5);assert.ok(result.evidence.checks.every(c=>c.passed));
    assert.equal(JSON.stringify(result.evidence).includes('must-not-leak'),false);ok();
  }
  {const result=await run({breakReplay:true});assert.equal(result.result,'FAIL');assert.equal(result.evidence.checks.find(c=>c.name==='same_key_same_parameters').passed,false);ok();}
  {const result=await run({acceptMismatch:true});assert.equal(result.result,'FAIL');assert.equal(result.evidence.checks.find(c=>c.name==='same_key_different_parameters_rejected').passed,false);ok();}
  {const result=await run({breakLost:true});assert.equal(result.result,'FAIL');assert.equal(result.evidence.checks.find(c=>c.name==='lost_response_retry_same_result').passed,false);ok();}
  {const result=await run({breakRetrieve:true});assert.equal(result.result,'FAIL');assert.equal(result.evidence.checks.find(c=>c.name==='retrieve_by_id').passed,false);ok();}
  {const result=await run({live:true});assert.equal(result.result,'FAIL');assert.equal(result.evidence.checks.find(c=>c.name==='test_mode_only').passed,false);ok();}
  {
    const result=await run();const profile=V14.buildV13Profile({runResult:result,adapterId:'stripe-payment-intents-v1',capabilityDigest:'a'.repeat(64)});
    assert.equal(profile.providerId,'stripe');assert.equal(profile.evidenceDigest,result.evidenceDigest);assert.equal(profile.result,'PASS');ok();
  }
  {const result=await run({breakReplay:true});assert.throws(()=>V14.buildV13Profile({runResult:result,adapterId:'stripe-payment-intents-v1',capabilityDigest:'a'.repeat(64)}),/live_provider_conformance_not_proven/);ok();}
  {
    let getterCalls=0;const body={id:'pi_1',object:'payment_intent',status:'requires_payment_method',amount:100,currency:'usd',livemode:false};Object.defineProperty(body,'client_secret',{enumerable:true,get(){getterCalls++;return 'secret';}});
    assert.throws(()=>V14.responseDigest(body),/provider_response_accessor/);assert.equal(getterCalls,0);ok();
  }
  assert.equal(passed,12);
  console.log('RUMBO Stripe Conformance Runner V14: 12/12 PASS + test-key-only + loss/replay/mismatch/retrieve + no secret leakage');
}
main().catch(err=>{console.error(err);process.exit(1);});
