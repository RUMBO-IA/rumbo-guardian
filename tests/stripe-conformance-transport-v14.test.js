const assert=require('node:assert/strict');
const V14=require('../stripe-conformance-runner-v14.js');

async function main(){
  let passed=0;const ok=()=>passed++;
  let observed=null;
  const fetchImpl=async(url,options)=>{
    observed={url,options};
    return {status:200,headers:{get:()=> 'req_test'},text:async()=>JSON.stringify({id:'pi_123',object:'payment_intent',status:'requires_payment_method',amount:1099,currency:'usd',livemode:false})};
  };
  const transport=V14.makeStripeFetchTransport({secretKey:'sk_test_transport',fetchImpl,baseUrl:'https://evil.example',apiVersion:'old'});
  await transport.request({method:'POST',path:'/v1/payment_intents',form:{amount:'1099',currency:'usd'},idempotencyKey:'rumbo-v14-transport'});
  assert.equal(observed.url,'https://api.stripe.com/v1/payment_intents');assert.equal(observed.options.headers['Stripe-Version'],V14.STRIPE_API_VERSION);assert.equal(observed.options.redirect,'error');assert.equal(observed.options.headers.Authorization,'Bearer sk_test_transport');ok();
  await assert.rejects(()=>transport.request({method:'POST',path:'/v1/customers',form:{description:'x'},idempotencyKey:'rumbo-v14-other'}),/invalid_stripe_conformance_request/);ok();
  await assert.rejects(()=>transport.request({method:'DELETE',path:'/v1/payment_intents/pi_123'}),/invalid_stripe_conformance_request/);ok();
  await assert.rejects(()=>transport.request({method:'GET',path:'/v1/payment_intents/../../accounts'}),/invalid_stripe_conformance_request/);ok();
  assert.equal(passed,4);
  console.log('RUMBO Stripe Conformance Transport V14: 4/4 PASS + pinned origin/version + redirect denial + endpoint allowlist');
}
main().catch(err=>{console.error(err);process.exit(1);});
