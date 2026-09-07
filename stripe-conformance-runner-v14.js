const crypto=require('node:crypto');
const {canonicalizeJcs}=require('./jcs-canonicalize-v8.js');
const Conformance=require('./provider-conformance-v13.js');

const STRIPE_API_VERSION='2026-02-25.clover';
const SUITE_VERSION='rumbo.stripe.payment-intent-idempotency.v14';
const PROVIDER_ID='stripe';
const EVIDENCE_SCHEMA='rumbo.stripe-conformance-evidence.v14';
const MAX_BODY_BYTES=1024*1024;
const verifiedRunResults=new WeakSet();

function sha256Text(value){return crypto.createHash('sha256').update(String(value),'utf8').digest('hex');}
function isSha256(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
function validateStripeTestSecret(secret){
  if(typeof secret!=='string'||!secret) throw new Error('stripe_test_key_required');
  if(secret.startsWith('sk_live_')) throw new Error('stripe_live_key_forbidden');
  if(!secret.startsWith('sk_test_')||secret.length>512||/\s/.test(secret)) throw new Error('invalid_stripe_test_key');
  return secret;
}
function assertPlainJson(value,seen=new Set(),depth=0,state={nodes:0}){
  if(depth>64) throw new Error('provider_response_too_deep');
  state.nodes++;if(state.nodes>10000) throw new Error('provider_response_too_complex');
  if(value===null||['string','boolean'].includes(typeof value)) return;
  if(typeof value==='number'){if(!Number.isFinite(value)) throw new Error('provider_response_non_finite');return;}
  if(typeof value!=='object') throw new Error('provider_response_invalid_type');
  if(seen.has(value)) throw new Error('provider_response_cycle');seen.add(value);
  try{
    if(Array.isArray(value)){
      if(Object.keys(value).length!==value.length||Object.getOwnPropertySymbols(value).length) throw new Error('provider_response_invalid_array');
      for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||d.get||d.set) throw new Error('provider_response_accessor');assertPlainJson(d.value,seen,depth+1,state);}return;
    }
    if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null) throw new Error('provider_response_non_plain');
    if(Object.getOwnPropertySymbols(value).length) throw new Error('provider_response_symbol');
    for(const key of Object.keys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||d.get||d.set) throw new Error('provider_response_accessor');assertPlainJson(d.value,seen,depth+1,state);}
  }finally{seen.delete(value);}
}
function responseDigest(body){assertPlainJson(body);return sha256Text(canonicalizeJcs(body));}
function safeField(body,key){
  if(!body||typeof body!=='object'||Array.isArray(body)) return null;
  const d=Object.getOwnPropertyDescriptor(body,key);if(!d||d.get||d.set) return null;
  return ['string','number','boolean'].includes(typeof d.value)||d.value===null?d.value:null;
}
function sanitizeResult(response){
  const body=response&&response.body;
  return Object.freeze({
    status:Number(response&&response.status)||0,
    requestId:typeof response?.requestId==='string'&&response.requestId.length<=200?response.requestId:null,
    bodyDigest:body===undefined?null:responseDigest(body),
    id:safeField(body,'id'),object:safeField(body,'object'),providerStatus:safeField(body,'status'),
    amount:safeField(body,'amount'),currency:safeField(body,'currency'),livemode:safeField(body,'livemode'),
    errorType:body&&body.error?safeField(body.error,'type'):null,
    errorCode:body&&body.error?safeField(body.error,'code'):null
  });
}
function encodeForm(form){
  const out=new URLSearchParams();
  for(const [key,value] of Object.entries(form||{})) out.append(key,String(value));
  return out.toString();
}
function makeStripeFetchTransport({secretKey,fetchImpl=globalThis.fetch,baseUrl='https://api.stripe.com',apiVersion=STRIPE_API_VERSION}={}){
  const secret=validateStripeTestSecret(secretKey);
  if(typeof fetchImpl!=='function') throw new Error('fetch_unavailable');
  return Object.freeze({
    async request({method,path,form,idempotencyKey,simulateResponseLoss=false}){
      const headers={Authorization:`Bearer ${secret}`,'Stripe-Version':apiVersion};
      let body;
      if(method==='POST'){
        headers['Content-Type']='application/x-www-form-urlencoded';
        if(typeof idempotencyKey!=='string'||!idempotencyKey||idempotencyKey.length>255) throw new Error('invalid_idempotency_key');
        headers['Idempotency-Key']=idempotencyKey;body=encodeForm(form);
      }
      const response=await fetchImpl(`${baseUrl}${path}`,{method,headers,body});
      const text=await response.text();if(Buffer.byteLength(text,'utf8')>MAX_BODY_BYTES) throw new Error('stripe_response_too_large');
      let parsed;try{parsed=text?JSON.parse(text):{};}catch{throw new Error('stripe_non_json_response');}
      assertPlainJson(parsed);
      const result={status:response.status,requestId:response.headers&&response.headers.get?response.headers.get('request-id'):null,body:parsed};
      if(simulateResponseLoss){const err=new Error('simulated_response_loss_after_remote_response');err.code='SIMULATED_RESPONSE_LOSS';err.remoteStatus=result.status;err.remoteBodyDigest=responseDigest(parsed);throw err;}
      return result;
    }
  });
}
function defaultKeyFactory(){return `rumbo-v14-${crypto.randomUUID()}`;}
function passHttp(response){return response&&response.status>=200&&response.status<300;}
function idempotencyError(response){
  if(!response||response.status<400) return false;
  const type=String(response.errorType||'').toLowerCase(),code=String(response.errorCode||'').toLowerCase();
  return type.includes('idempot')||code.includes('idempot');
}
async function runStripeConformance({transport,keyFactory=defaultKeyFactory,now=()=>new Date().toISOString(),amount=1099,currency='usd'}={}){
  if(!transport||typeof transport.request!=='function') throw new Error('stripe_transport_required');
  const runId=`v14-${crypto.randomUUID()}`,observedAt=String(typeof now==='function'?now():now);
  const checks=[];const note=(name,passed,details={})=>checks.push(Object.freeze({name,passed:passed===true,...details}));
  let create1,create2,mismatch,lostRetry,retrieve,lostDigest=null,primaryId=null;
  const key1=keyFactory('replay'),key2=keyFactory('lost-response');
  const form={amount:String(amount),currency:String(currency),'automatic_payment_methods[enabled]':'true'};
  try{
    create1=sanitizeResult(await transport.request({method:'POST',path:'/v1/payment_intents',form,idempotencyKey:key1}));
    create2=sanitizeResult(await transport.request({method:'POST',path:'/v1/payment_intents',form,idempotencyKey:key1}));
    primaryId=typeof create1.id==='string'?create1.id:null;
    note('same_key_same_parameters',passHttp(create1)&&passHttp(create2)&&!!primaryId&&create1.id===create2.id&&create1.bodyDigest===create2.bodyDigest,{firstStatus:create1.status,retryStatus:create2.status,sameObject:create1.id===create2.id,sameBodyDigest:create1.bodyDigest===create2.bodyDigest});
  }catch(err){note('same_key_same_parameters',false,{error:String(err&&err.code||err&&err.message||'request_failed').slice(0,120)});}
  try{
    mismatch=sanitizeResult(await transport.request({method:'POST',path:'/v1/payment_intents',form:{...form,amount:String(Number(amount)+1)},idempotencyKey:key1}));
    note('same_key_different_parameters_rejected',idempotencyError(mismatch),{status:mismatch.status,errorType:mismatch.errorType,errorCode:mismatch.errorCode});
  }catch(err){note('same_key_different_parameters_rejected',false,{error:String(err&&err.code||err&&err.message||'request_failed').slice(0,120)});}
  try{
    await transport.request({method:'POST',path:'/v1/payment_intents',form,idempotencyKey:key2,simulateResponseLoss:true});
    note('lost_response_retry_same_result',false,{error:'loss_not_simulated'});
  }catch(err){
    if(err&&err.code==='SIMULATED_RESPONSE_LOSS'&&isSha256(err.remoteBodyDigest)) lostDigest=err.remoteBodyDigest;
    else note('lost_response_retry_same_result',false,{error:String(err&&err.code||err&&err.message||'request_failed').slice(0,120)});
  }
  if(lostDigest){
    try{lostRetry=sanitizeResult(await transport.request({method:'POST',path:'/v1/payment_intents',form,idempotencyKey:key2}));note('lost_response_retry_same_result',passHttp(lostRetry)&&lostRetry.bodyDigest===lostDigest,{retryStatus:lostRetry.status,sameBodyDigest:lostRetry.bodyDigest===lostDigest});}
    catch(err){note('lost_response_retry_same_result',false,{error:String(err&&err.code||err&&err.message||'request_failed').slice(0,120)});}
  }
  if(primaryId){
    try{retrieve=sanitizeResult(await transport.request({method:'GET',path:`/v1/payment_intents/${encodeURIComponent(primaryId)}`}));note('retrieve_by_id',passHttp(retrieve)&&retrieve.id===primaryId&&retrieve.object==='payment_intent',{status:retrieve.status,sameObject:retrieve.id===primaryId,providerStatus:retrieve.providerStatus});}
    catch(err){note('retrieve_by_id',false,{error:String(err&&err.code||err&&err.message||'request_failed').slice(0,120)});}
  }else note('retrieve_by_id',false,{error:'primary_object_unavailable'});
  const testMode=[create1,create2,lostRetry,retrieve].filter(Boolean).every(r=>r.livemode===false);
  note('test_mode_only',testMode,{livemodeValues:[create1,create2,lostRetry,retrieve].filter(Boolean).map(r=>r.livemode)});
  const passed=checks.length===5&&checks.every(c=>c.passed===true);
  const evidence=Object.freeze({schema:EVIDENCE_SCHEMA,providerId:PROVIDER_ID,apiVersion:STRIPE_API_VERSION,suiteVersion:SUITE_VERSION,runId,observedAt,result:passed?'PASS':'FAIL',checks:Object.freeze([...checks])});
  const evidenceDigest=sha256Text(canonicalizeJcs(evidence));
  const runResult=Object.freeze({result:evidence.result,evidence,evidenceDigest});
  if(runResult.result==='PASS') verifiedRunResults.add(runResult);
  return runResult;
}
function buildV13Profile({runResult,adapterId,capabilityDigest,protocolVersion=STRIPE_API_VERSION}={}){
  if(!runResult||!verifiedRunResults.has(runResult)||runResult.result!=='PASS'||!isSha256(runResult.evidenceDigest)) throw new Error('live_provider_conformance_not_proven');
  if(!runResult.evidence||runResult.evidence.schema!==EVIDENCE_SCHEMA||runResult.evidence.providerId!==PROVIDER_ID||runResult.evidence.apiVersion!==STRIPE_API_VERSION||runResult.evidence.suiteVersion!==SUITE_VERSION||runResult.evidence.result!=='PASS') throw new Error('invalid_stripe_conformance_evidence');
  const recomputed=sha256Text(canonicalizeJcs(runResult.evidence));
  if(recomputed!==runResult.evidenceDigest) throw new Error('stripe_conformance_evidence_digest_mismatch');
  const profile={schema:Conformance.PROFILE_SCHEMA,providerId:PROVIDER_ID,adapterId,protocolVersion,capabilityDigest,suiteVersion:SUITE_VERSION,evidenceDigest:runResult.evidenceDigest,result:Conformance.RESULT};
  return Conformance.normalizeProviderConformanceProfile(profile,{adapterId,protocolVersion,capabilityDigest});
}
module.exports={STRIPE_API_VERSION,SUITE_VERSION,PROVIDER_ID,EVIDENCE_SCHEMA,MAX_BODY_BYTES,validateStripeTestSecret,responseDigest,sanitizeResult,makeStripeFetchTransport,runStripeConformance,buildV13Profile};
