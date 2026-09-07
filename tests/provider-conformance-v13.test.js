const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Gate=require('../agent-action-gate.js');
const Auth=require('../agent-authorization-v3.js');
const AuthorizationDispatch=require('../agent-authorized-dispatch.js');
const Dispatch=require('../agent-tool-dispatcher-v4.js');
const Cap=require('../destination-capability-v12.js');
const Conformance=require('../provider-conformance-v13.js');
const {computeIdempotencyKey}=require('../destination-idempotency-v11.js');
const {SQLiteExecutionStoreV11}=require('../sqlite-execution-store-v11.js');

const NOW='2026-09-07T18:00:00Z',OBS='2026-09-07T17:55:00Z',EXP='2026-09-07T18:05:00Z';
const {publicKey:authPublic,privateKey:authPrivate}=crypto.generateKeyPairSync('ed25519');
const {publicKey:evalPublic,privateKey:evalPrivate}=crypto.generateKeyPairSync('ed25519');
const authPub=authPublic.export({type:'spki',format:'pem'}),evalPub=evalPublic.export({type:'spki',format:'pem'});
const POLICY=Object.freeze({schema:Cap.CAPABILITY_SCHEMA,adapterId:'adapter-a',capabilityVersion:'cap-v13',protocolVersion:'provider-proto-v1',idempotencyMode:Cap.IDEMPOTENCY_MODE,reconciliationMode:Cap.RECONCILIATION_MODE,allowedImplementationIds:['send-v13']});
const CAPABILITY=Cap.normalizeTrustedDestinationCapability(POLICY,'adapter-a','send-v13');
const CAPABILITY_DIGEST=Cap.computeDestinationCapabilityDigest(CAPABILITY);
const BASE_PROFILE=Object.freeze({schema:Conformance.PROFILE_SCHEMA,providerId:'provider-test',adapterId:'adapter-a',protocolVersion:'provider-proto-v1',capabilityDigest:CAPABILITY_DIGEST,suiteVersion:'rumbo-provider-suite-v1',evidenceDigest:'e'.repeat(64),result:'PASS'});
const PROFILE_DIGEST=Conformance.computeProviderConformanceProfileDigest(BASE_PROFILE);

function signReceipt(profileDigest=PROFILE_DIGEST,observedAt='2026-09-07T17:50:00Z',expiresAt='2026-09-08T17:50:00Z',keyId='eval-v13',privateKey=evalPrivate){
  const receipt={schema:Conformance.RECEIPT_SCHEMA,profileDigest,observedAt,expiresAt,keyId,signature:''};
  receipt.signature=crypto.sign(null,Buffer.from(Conformance.conformanceReceiptMessage(receipt),'utf8'),privateKey).toString('base64');
  return receipt;
}
function entry(profile=BASE_PROFILE,receipt=signReceipt()){return {profile,receipt};}
function adapter(execute=async(input,ctx)=>({adapterId:'adapter-a',idempotencyKey:ctx.idempotencyKey,status:'SUCCEEDED'}),reconcile=async ctx=>({adapterId:'adapter-a',idempotencyKey:ctx.idempotencyKey,status:'SUCCEEDED'})){
  return {adapterId:'adapter-a',protocolVersion:'provider-proto-v1',supportsIdempotency:true,execute,reconcile};
}
function tool(profileDigest=PROFILE_DIGEST){return {name:'send',effect:'send',implementationId:'send-v13',destinationAdapterId:'adapter-a',destinationCapabilityDigest:CAPABILITY_DIGEST,providerConformanceProfileDigest:profileDigest};}
function signedAction(input,authorizationId,toolDef=tool()){
  const parametersDigest=Dispatch.computeParametersDigest(input),toolBindingDigest=Dispatch.computeToolBindingDigest(toolDef);
  const action={id:`action-${authorizationId}`,effect:'send',target:'recipient@example.com',purpose:'Approved V13 provider-conformant dispatch',explicitAuthorization:true,intentAligned:true,targetVerified:true,evidenceCount:1,authorizationObservedAt:OBS,parametersDigest,toolBindingDigest};
  const actionDigest=Gate.computeActionDigest(action),envelope={authorizationId,actionDigest,expiresAt:EXP,observedAt:OBS,keyId:'operator-v13'};
  envelope.signature=crypto.sign(null,Buffer.from(Auth.authorizationMessage(envelope)),authPrivate).toString('base64');action.authorization=envelope;return action;
}
function dispatcher(store,destinationAdapter=adapter(),conformanceEntry=entry(),extra={}){
  return Dispatch.createToolDispatcher({replayStore:store,trustedPublicKeys:{'operator-v13':authPub},trustedDestinationCapabilities:{'adapter-a':POLICY},trustedProviderConformance:{'adapter-a':conformanceEntry},trustedProviderConformanceKeys:{'eval-v13':evalPub},providerConformanceNow:extra.providerConformanceNow||NOW,gateOptions:{now:NOW},authorizeRecovery:async()=>true,authorizeReconciliation:async()=>true,...extra,tools:[{name:'send',effect:'send',implementationId:'send-v13',destinationAdapter}]});
}
function reserve(store,input,authorizationId,profileDigest=PROFILE_DIGEST){
  const action=signedAction(input,authorizationId,tool(profileDigest)),toolBindingDigest=Dispatch.computeToolBindingDigest(tool(profileDigest));
  const idempotencyKey=computeIdempotencyKey({authorizationId,actionDigest:action.authorization.actionDigest,toolBindingDigest,adapterId:'adapter-a'});
  return AuthorizationDispatch.prepareAuthorizedAction(action,{gateOptions:{now:NOW},trustedPublicKeys:{'operator-v13':authPub},replayStore:store,executionContext:{tool:'send',effect:'send',implementationId:'send-v13',parametersDigest:Dispatch.computeParametersDigest(input),destination:{adapterId:'adapter-a',idempotencyKey,capabilityDigest:CAPABILITY_DIGEST,providerConformanceProfileDigest:profileDigest}}});
}

async function main(){
  let passed=0;const ok=()=>passed++;const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rumbo-v13-'));
  try{
    { assert.throws(()=>Dispatch.createToolDispatcher({trustedDestinationCapabilities:{'adapter-a':POLICY},tools:[{name:'send',effect:'send',implementationId:'send-v13',destinationAdapter:adapter()}]}),/trusted_provider_conformance_required/);ok(); }
    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'success.sqlite'));let calls=0;
      const d=dispatcher(store,adapter(async(input,ctx)=>{calls++;assert.equal(ctx.providerConformanceProfileDigest,PROFILE_DIGEST);return {adapterId:'adapter-a',idempotencyKey:ctx.idempotencyKey,status:'SUCCEEDED'};}));
      const input={message:'verified'},result=await d.dispatch({tool:'send',input,action:signedAction(input,'v13-success')});
      assert.equal(result.effectOutcome,'SUCCEEDED');assert.equal(calls,1);assert.equal(result.receipt.providerConformanceProfileDigest,PROFILE_DIGEST);assert.equal(result.receipt.dispatchPolicyVersion,'RUMBO_AGENT_TOOL_DISPATCH_V13_PROVIDER_CONFORMANCE');assert.equal(store.getDestination('v13-success').providerConformanceProfileDigest,PROFILE_DIGEST);store.close();ok();
    }
    {
      const bad=signReceipt();bad.signature=bad.signature.slice(0,-4)+'AAAA';
      assert.throws(()=>dispatcher(null,adapter(),entry(BASE_PROFILE,bad)),/provider_conformance_signature_failed|invalid_provider_conformance_signature_encoding/);ok();
    }
    {
      const mismatch={...BASE_PROFILE,capabilityDigest:'a'.repeat(64)};
      assert.throws(()=>dispatcher(null,adapter(),entry(mismatch,signReceipt(Conformance.computeProviderConformanceProfileDigest(mismatch)))),/provider_conformance_capability_mismatch/);ok();
    }
    {
      let clock=NOW;const d=dispatcher(null,adapter(),entry(),{providerConformanceNow:()=>clock});clock='2026-09-09T00:00:00Z';
      const result=await d.dispatch({tool:'send',input:{message:'expired'},action:{}});assert.equal(result.decision,'DENY');assert.equal(result.stage,'provider_conformance');assert.equal(result.reason,'provider_conformance_expired');ok();
    }
    {
      const long=signReceipt(PROFILE_DIGEST,'2026-09-01T00:00:00Z','2026-09-20T00:00:00Z');
      assert.throws(()=>dispatcher(null,adapter(),entry(BASE_PROFILE,long)),/invalid_provider_conformance_window/);ok();
    }
    {
      const future=signReceipt(PROFILE_DIGEST,'2026-09-08T00:00:00Z','2026-09-09T00:00:00Z');
      assert.throws(()=>dispatcher(null,adapter(),entry(BASE_PROFILE,future)),/provider_conformance_not_yet_valid/);ok();
    }
    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'renew-recovery.sqlite')),input={message:'resume'};assert.equal(reserve(store,input,'v13-renew-recovery').decision,'ALLOW');
      const renewed=signReceipt(PROFILE_DIGEST,'2026-09-07T17:59:00Z','2026-09-10T17:59:00Z');let calls=0;
      const d=dispatcher(store,adapter(async(input,ctx)=>{calls++;return {adapterId:'adapter-a',idempotencyKey:ctx.idempotencyKey,status:'SUCCEEDED'};}),entry(BASE_PROFILE,renewed));
      const result=await d.resumeReserved({authorizationId:'v13-renew-recovery',input});assert.equal(result.effectOutcome,'SUCCEEDED');assert.equal(calls,1);store.close();ok();
    }
    {
      const changedProfile={...BASE_PROFILE,evidenceDigest:'f'.repeat(64)},changedDigest=Conformance.computeProviderConformanceProfileDigest(changedProfile);
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'changed-profile.sqlite')),input={message:'resume'};reserve(store,input,'v13-changed-profile');let calls=0;
      const d=dispatcher(store,adapter(async()=>{calls++;return {};}),entry(changedProfile,signReceipt(changedDigest)));
      const result=await d.resumeReserved({authorizationId:'v13-changed-profile',input});assert.equal(result.reason,'provider_conformance_profile_mismatch');assert.equal(calls,0);assert.equal(store.getExecution('v13-changed-profile').state,'RESERVED');store.close();ok();
    }
    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'downgrade-recovery.sqlite')),input={message:'resume'};reserve(store,input,'v13-downgrade-recovery');let calls=0;
      const v12=Dispatch.createToolDispatcher({allowCapabilityWithoutProviderConformance:true,replayStore:store,trustedDestinationCapabilities:{'adapter-a':POLICY},authorizeRecovery:async()=>true,tools:[{name:'send',effect:'send',implementationId:'send-v13',destinationAdapter:adapter(async()=>{calls++;return {};})}]});
      const result=await v12.resumeReserved({authorizationId:'v13-downgrade-recovery',input});assert.equal(result.reason,'provider_conformance_downgrade');assert.equal(calls,0);store.close();ok();
    }
    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'renew-reconcile.sqlite'));let key=null,reconcileCalls=0;
      const d1=dispatcher(store,adapter(async(input,ctx)=>{key=ctx.idempotencyKey;throw new Error('lost_after_accept');}));const input={message:'unknown'};
      const first=await d1.dispatch({tool:'send',input,action:signedAction(input,'v13-renew-reconcile')});assert.equal(first.effectOutcome,'FAILED_OR_UNKNOWN');
      const renewed=signReceipt(PROFILE_DIGEST,'2026-09-07T17:59:30Z','2026-09-10T17:59:30Z');
      const d2=dispatcher(store,adapter(async()=>{throw new Error('must_not_execute');},async ctx=>{reconcileCalls++;return {adapterId:'adapter-a',idempotencyKey:key||ctx.idempotencyKey,status:'SUCCEEDED'};}),entry(BASE_PROFILE,renewed));
      const result=await d2.reconcileUnknown({authorizationId:'v13-renew-reconcile'});assert.equal(result.effectOutcome,'SUCCEEDED');assert.equal(reconcileCalls,1);store.close();ok();
    }
    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'downgrade-reconcile.sqlite'));const d1=dispatcher(store,adapter(async()=>{throw new Error('lost');}));const input={message:'unknown'};await d1.dispatch({tool:'send',input,action:signedAction(input,'v13-downgrade-reconcile')});let reconcileCalls=0;
      const v12=Dispatch.createToolDispatcher({allowCapabilityWithoutProviderConformance:true,replayStore:store,trustedDestinationCapabilities:{'adapter-a':POLICY},authorizeReconciliation:async()=>true,tools:[{name:'send',effect:'send',implementationId:'send-v13',destinationAdapter:adapter(async()=>{},async()=>{reconcileCalls++;return {};})}]});
      const result=await v12.reconcileUnknown({authorizationId:'v13-downgrade-reconcile'});assert.equal(result.reason,'provider_conformance_downgrade');assert.equal(reconcileCalls,0);store.close();ok();
    }
    {
      const differentProfile={...BASE_PROFILE,suiteVersion:'rumbo-provider-suite-v2'},differentDigest=Conformance.computeProviderConformanceProfileDigest(differentProfile);
      assert.notEqual(Dispatch.computeToolBindingDigest(tool(PROFILE_DIGEST)),Dispatch.computeToolBindingDigest(tool(differentDigest)));ok();
    }
    {
      let getterCalls=0;const bad={...BASE_PROFILE,futureConstraint:'x'};assert.throws(()=>Conformance.normalizeProviderConformanceProfile(bad,{adapterId:'adapter-a'}),/invalid_provider_conformance_profile/);
      const accessor={...BASE_PROFILE};Object.defineProperty(accessor,'providerId',{enumerable:true,get(){getterCalls++;return 'provider-test';}});assert.throws(()=>Conformance.normalizeProviderConformanceProfile(accessor,{adapterId:'adapter-a'}),/invalid_provider_conformance_profile/);assert.equal(getterCalls,0);ok();
    }

    assert.equal(passed,14);
    console.log('RUMBO Provider Conformance V13: 14/14 PASS + signed fresh receipts + renewal-safe recovery/reconciliation + profile rotation + downgrade guards');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
main().catch(err=>{console.error(err);process.exit(1);});
