const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const V14=require('../stripe-conformance-runner-v14.js');
const {canonicalizeJcs}=require('../jcs-canonicalize-v8.js');

function sha(value){return crypto.createHash('sha256').update(canonicalizeJcs(value),'utf8').digest('hex');}

async function passRun(){
  let n=0;const idem=new Map(),objects=new Map();
  const transport={async request({method,path,form,idempotencyKey,simulateResponseLoss=false}){
    if(method==='GET'){const id=decodeURIComponent(path.split('/').pop());return {status:200,body:objects.get(id)};}
    const canon=JSON.stringify(Object.keys(form).sort().map(k=>[k,form[k]]));
    if(idem.has(idempotencyKey)){
      const prior=idem.get(idempotencyKey);
      if(prior.canon!==canon) return {status:400,body:{error:{type:'idempotency_error',code:'idempotency_key_in_use'}}};
      if(simulateResponseLoss){const err=new Error('lost');err.code='SIMULATED_RESPONSE_LOSS';err.remoteBodyDigest=crypto.createHash('sha256').update(canonicalizeJcs(prior.body),'utf8').digest('hex');throw err;}
      return {status:200,body:prior.body};
    }
    const body={id:`pi_${++n}`,object:'payment_intent',status:'requires_payment_method',amount:Number(form.amount),currency:form.currency,livemode:false};idem.set(idempotencyKey,{canon,body});objects.set(body.id,body);
    if(simulateResponseLoss){const err=new Error('lost');err.code='SIMULATED_RESPONSE_LOSS';err.remoteBodyDigest=crypto.createHash('sha256').update(canonicalizeJcs(body),'utf8').digest('hex');throw err;}
    return {status:200,body};
  }};
  let i=0;return V14.runStripeConformance({transport,keyFactory:label=>`rumbo-v14-prov-${label}-${++i}`,now:()=> '2026-09-07T23:20:00.000Z'});
}

async function main(){
  let passed=0;const ok=()=>passed++;
  const capability='b'.repeat(64),adapterId='stripe-payment-intents-v1';
  {
    const forgedEvidence={schema:V14.EVIDENCE_SCHEMA,providerId:'stripe',apiVersion:V14.STRIPE_API_VERSION,suiteVersion:V14.SUITE_VERSION,runId:'forged',observedAt:'2026-09-07T23:20:00.000Z',result:'PASS',checks:[]};
    const forged={result:'PASS',evidence:forgedEvidence,evidenceDigest:sha(forgedEvidence)};
    assert.throws(()=>V14.buildV13Profile({runResult:forged,adapterId,capabilityDigest:capability}),/live_provider_conformance_not_proven/);ok();
  }
  {
    const real=await passRun();const cloned=JSON.parse(JSON.stringify(real));
    assert.equal(cloned.result,'PASS');assert.throws(()=>V14.buildV13Profile({runResult:cloned,adapterId,capabilityDigest:capability}),/live_provider_conformance_not_proven/);ok();
  }
  {
    const real=await passRun();const profile=V14.buildV13Profile({runResult:real,adapterId,capabilityDigest:capability});assert.equal(profile.evidenceDigest,real.evidenceDigest);ok();
  }
  {
    const real=await passRun();assert.ok(Object.isFrozen(real));assert.ok(Object.isFrozen(real.evidence));assert.ok(Object.isFrozen(real.evidence.checks));assert.throws(()=>{real.evidence.checks.push({name:'fake',passed:true});},TypeError);ok();
  }
  assert.equal(passed,4);
  console.log('RUMBO Stripe Conformance Provenance V14: 4/4 PASS + forged/cloned PASS rejection + frozen evidence');
}
main().catch(err=>{console.error(err);process.exit(1);});
