#!/usr/bin/env node
const V14=require('../stripe-conformance-runner-v14.js');

async function main(){
  const secret=process.env.STRIPE_SECRET_KEY||'';
  if(!secret){
    console.log(JSON.stringify({schema:'rumbo.stripe-conformance-cli.v14',result:'LIVE_PROVIDER_NOT_PROVEN',reason:'stripe_test_key_required'}));
    process.exitCode=2;return;
  }
  let transport;
  try{transport=V14.makeStripeFetchTransport({secretKey:secret});}
  catch(err){console.log(JSON.stringify({schema:'rumbo.stripe-conformance-cli.v14',result:'LIVE_PROVIDER_NOT_PROVEN',reason:String(err&&err.message||'invalid_configuration')}));process.exitCode=2;return;}
  try{
    const result=await V14.runStripeConformance({transport});
    console.log(JSON.stringify({schema:'rumbo.stripe-conformance-cli.v14',result:result.result,evidenceDigest:result.evidenceDigest,evidence:result.evidence},null,2));
    process.exitCode=result.result==='PASS'?0:1;
  }catch(err){
    console.log(JSON.stringify({schema:'rumbo.stripe-conformance-cli.v14',result:'FAIL',reason:String(err&&err.message||'conformance_runner_error').slice(0,200)}));
    process.exitCode=1;
  }
}
main();
