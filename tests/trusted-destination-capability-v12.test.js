const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const Gate=require('../agent-action-gate.js');
const Auth=require('../agent-authorization-v3.js');
const AuthorizationDispatch=require('../agent-authorized-dispatch.js');
const Dispatch=require('../agent-tool-dispatcher-v4.js');
const {SQLiteExecutionStoreV11}=require('../sqlite-execution-store-v11.js');
const {computeIdempotencyKey}=require('../destination-idempotency-v11.js');
const Cap=require('../destination-capability-v12.js');

const NOW='2026-09-07T17:20:00Z',OBS='2026-09-07T17:15:00Z',EXP='2026-09-07T17:25:00Z';
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const pub=publicKey.export({type:'spki',format:'pem'});
const POLICY_V1=Object.freeze({schema:Cap.CAPABILITY_SCHEMA,adapterId:'adapter-a',capabilityVersion:'cap-v1',protocolVersion:'provider-proto-v1',idempotencyMode:Cap.IDEMPOTENCY_MODE,reconciliationMode:Cap.RECONCILIATION_MODE,allowedImplementationIds:['send-v12']});
const POLICY_V2=Object.freeze({...POLICY_V1,capabilityVersion:'cap-v2'});
const CAP_V1=Cap.normalizeTrustedDestinationCapability(POLICY_V1,'adapter-a','send-v12');
const CAP_V2=Cap.normalizeTrustedDestinationCapability(POLICY_V2,'adapter-a','send-v12');
const DIGEST_V1=Cap.computeDestinationCapabilityDigest(CAP_V1);
const DIGEST_V2=Cap.computeDestinationCapabilityDigest(CAP_V2);
const TOOL_V1=Object.freeze({name:'send',effect:'send',implementationId:'send-v12',destinationAdapterId:'adapter-a',destinationCapabilityDigest:DIGEST_V1});

function adapter(adapterId='adapter-a',protocolVersion='provider-proto-v1',execute=async(input,ctx)=>({adapterId,idempotencyKey:ctx.idempotencyKey,status:'SUCCEEDED'}),reconcile=async ctx=>({adapterId,idempotencyKey:ctx.idempotencyKey,status:'SUCCEEDED'})){
  return {adapterId,protocolVersion,supportsIdempotency:true,execute,reconcile};
}
function signedAction(input,authorizationId,tool=TOOL_V1){
  const parametersDigest=Dispatch.computeParametersDigest(input);
  const toolBindingDigest=Dispatch.computeToolBindingDigest(tool);
  const action={id:`action-${authorizationId}`,effect:tool.effect,target:'recipient@example.com',purpose:'Approved V12 destination dispatch',explicitAuthorization:true,intentAligned:true,targetVerified:true,evidenceCount:1,authorizationObservedAt:OBS,parametersDigest,toolBindingDigest};
  const actionDigest=Gate.computeActionDigest(action);
  const envelope={authorizationId,actionDigest,expiresAt:EXP,observedAt:OBS,keyId:'operator-v12'};
  envelope.signature=crypto.sign(null,Buffer.from(Auth.authorizationMessage(envelope)),privateKey).toString('base64');
  action.authorization=envelope;
  return action;
}
function strictDispatcher(store,destinationAdapter,policy=POLICY_V1,extra={}){
  return Dispatch.createToolDispatcher({replayStore:store,trustedPublicKeys:{'operator-v12':pub},trustedDestinationCapabilities:{'adapter-a':policy},gateOptions:{now:NOW},authorizeRecovery:async()=>true,authorizeReconciliation:async()=>true,...extra,tools:[{name:'send',effect:'send',implementationId:'send-v12',destinationAdapter}]});
}
function legacyDispatcher(store,destinationAdapter,extra={}){
  return Dispatch.createToolDispatcher({allowLegacySelfAssertedDestinationCapabilities:true,replayStore:store,authorizeRecovery:async()=>true,authorizeReconciliation:async()=>true,...extra,tools:[{name:'send',effect:'send',implementationId:'send-v12',destinationAdapter}]});
}
function reserveStrict(store,input,authorizationId,policy=POLICY_V1){
  const capability=Cap.normalizeTrustedDestinationCapability(policy,'adapter-a','send-v12');
  const capabilityDigest=Cap.computeDestinationCapabilityDigest(capability);
  const tool={name:'send',effect:'send',implementationId:'send-v12',destinationAdapterId:'adapter-a',destinationCapabilityDigest:capabilityDigest};
  const action=signedAction(input,authorizationId,tool);
  const toolBindingDigest=Dispatch.computeToolBindingDigest(tool);
  const idempotencyKey=computeIdempotencyKey({authorizationId,actionDigest:action.authorization.actionDigest,toolBindingDigest,adapterId:'adapter-a'});
  const prepared=AuthorizationDispatch.prepareAuthorizedAction(action,{gateOptions:{now:NOW},trustedPublicKeys:{'operator-v12':pub},replayStore:store,executionContext:{tool:'send',effect:'send',implementationId:'send-v12',parametersDigest:Dispatch.computeParametersDigest(input),destination:{adapterId:'adapter-a',idempotencyKey,capabilityDigest}}});
  return {prepared,idempotencyKey,capabilityDigest};
}

async function main(){
  let passed=0;const ok=()=>passed++;
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rumbo-v12-'));
  try{
    {
      assert.throws(()=>Dispatch.createToolDispatcher({tools:[{name:'send',effect:'send',implementationId:'send-v12',destinationAdapter:adapter()}]}),/trusted_destination_capability_required/);ok();
    }
    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'success.sqlite'));let calls=0;
      const d=strictDispatcher(store,adapter('adapter-a','provider-proto-v1',async(input,ctx)=>{calls++;assert.equal(ctx.destinationCapabilityDigest,DIGEST_V1);return {adapterId:'adapter-a',idempotencyKey:ctx.idempotencyKey,status:'SUCCEEDED',externalId:'remote-1'};}));
      const input={message:'trusted'},result=await d.dispatch({tool:'send',input,action:signedAction(input,'v12-success')});
      assert.equal(result.effectOutcome,'SUCCEEDED');assert.equal(calls,1);assert.equal(result.receipt.destinationCapabilityDigest,DIGEST_V1);assert.equal(result.receipt.dispatchPolicyVersion,'RUMBO_AGENT_TOOL_DISPATCH_V12_TRUSTED_DESTINATION_CAPABILITY');
      assert.equal(store.getDestination('v12-success').capabilityDigest,DIGEST_V1);store.close();ok();
    }
    { assert.throws(()=>strictDispatcher(null,adapter('adapter-a','provider-proto-v2')),/destination_protocol_mismatch/);ok(); }
    {
      const badPolicy={...POLICY_V1,allowedImplementationIds:['other-v1']};
      assert.throws(()=>strictDispatcher(null,adapter(),badPolicy),/destination_implementation_not_trusted/);ok();
    }
    {
      const futurePolicy={...POLICY_V1,futureRestriction:'must-not-be-ignored'};
      assert.throws(()=>Cap.normalizeTrustedDestinationCapability(futurePolicy,'adapter-a','send-v12'),/invalid_destination_capability/);ok();
    }
    {
      let getterCalls=0;
      const accessorPolicy={...POLICY_V1};
      Object.defineProperty(accessorPolicy,'capabilityVersion',{enumerable:true,configurable:true,get(){getterCalls++;return 'cap-v1';}});
      assert.throws(()=>Cap.normalizeTrustedDestinationCapability(accessorPolicy,'adapter-a','send-v12'),/invalid_destination_capability/);
      assert.equal(getterCalls,0);ok();
    }
    {
      let mapGetterCalls=0;
      const policyMap={};
      Object.defineProperty(policyMap,'adapter-a',{enumerable:true,get(){mapGetterCalls++;return POLICY_V1;}});
      assert.throws(()=>Dispatch.createToolDispatcher({trustedDestinationCapabilities:policyMap,tools:[{name:'send',effect:'send',implementationId:'send-v12',destinationAdapter:adapter()}]}),/trusted_destination_capability_required/);
      assert.equal(mapGetterCalls,0);ok();
    }
    {
      const dbPath=path.join(tmp,'v11-migration.sqlite');
      const db=new DatabaseSync(dbPath);
      db.exec(`CREATE TABLE consumed_authorizations(authorization_id TEXT PRIMARY KEY,consumed_at TEXT NOT NULL,action_digest TEXT,key_id TEXT,authorizer_fingerprint TEXT,correlation_id TEXT) WITHOUT ROWID;
        CREATE TABLE execution_journal(authorization_id TEXT PRIMARY KEY REFERENCES consumed_authorizations(authorization_id),action_id TEXT NOT NULL,action_digest TEXT NOT NULL,tool TEXT NOT NULL,effect TEXT NOT NULL,implementation_id TEXT NOT NULL,parameters_digest TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('RESERVED','STARTED','SUCCEEDED','FAILED','FAILED_OR_UNKNOWN')),reserved_at TEXT NOT NULL,started_at TEXT,finished_at TEXT,updated_at TEXT NOT NULL) WITHOUT ROWID;
        CREATE TABLE destination_idempotency(authorization_id TEXT PRIMARY KEY REFERENCES execution_journal(authorization_id),adapter_id TEXT NOT NULL,idempotency_key TEXT NOT NULL UNIQUE,state TEXT NOT NULL CHECK(state IN ('PENDING','SUCCEEDED','FAILED','FAILED_OR_UNKNOWN')),evidence_digest TEXT,updated_at TEXT NOT NULL) WITHOUT ROWID;`);
      db.close();
      const migrated=new SQLiteExecutionStoreV11(dbPath);
      const columns=migrated.db.prepare('PRAGMA table_info(destination_idempotency)').all().map(c=>c.name);
      assert.ok(columns.includes('capability_digest'));migrated.close();ok();
    }
    {
      assert.notEqual(DIGEST_V1,DIGEST_V2);
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'policy-substitution.sqlite'));let calls=0;
      const signedForV1=signedAction({message:'same'},'v12-policy-substitution');
      const d=strictDispatcher(store,adapter('adapter-a','provider-proto-v1',async()=>{calls++;return {};}),POLICY_V2);
      const result=await d.dispatch({tool:'send',input:{message:'same'},action:signedForV1});
      assert.equal(result.decision,'DENY');assert.equal(result.stage,'policy');assert.equal(calls,0);assert.ok(result.preflight.gate.reasons.some(r=>r.code==='authorization_action_mismatch'));assert.equal(store.get('v12-policy-substitution'),null);store.close();ok();
    }
    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'recovery-rotation.sqlite')),input={message:'reserved'};
      const {prepared}=reserveStrict(store,input,'v12-recovery-rotation',POLICY_V1);assert.equal(prepared.decision,'ALLOW');assert.equal(store.getDestination('v12-recovery-rotation').capabilityDigest,DIGEST_V1);
      let calls=0;const d=strictDispatcher(store,adapter('adapter-a','provider-proto-v1',async()=>{calls++;return {};}),POLICY_V2);
      const result=await d.resumeReserved({authorizationId:'v12-recovery-rotation',input});assert.equal(result.reason,'destination_capability_mismatch');assert.equal(calls,0);assert.equal(store.getExecution('v12-recovery-rotation').state,'RESERVED');store.close();ok();
    }
    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'reconcile-rotation.sqlite'));let key=null,reconcileCalls=0;
      const d1=strictDispatcher(store,adapter('adapter-a','provider-proto-v1',async(input,ctx)=>{key=ctx.idempotencyKey;throw new Error('lost_after_remote_accept');},async()=>{throw new Error('not-used-v1');}),POLICY_V1);
      const input={message:'unknown'};const first=await d1.dispatch({tool:'send',input,action:signedAction(input,'v12-reconcile-rotation')});assert.equal(first.effectOutcome,'FAILED_OR_UNKNOWN');assert.equal(store.getExecution('v12-reconcile-rotation').state,'FAILED_OR_UNKNOWN');assert.equal(store.getDestination('v12-reconcile-rotation').capabilityDigest,DIGEST_V1);
      const d2=strictDispatcher(store,adapter('adapter-a','provider-proto-v1',async()=>{throw new Error('must_not_execute');},async ctx=>{reconcileCalls++;return {adapterId:'adapter-a',idempotencyKey:key||ctx.idempotencyKey,status:'SUCCEEDED'};}),POLICY_V2);
      const result=await d2.reconcileUnknown({authorizationId:'v12-reconcile-rotation'});assert.equal(result.reason,'destination_capability_mismatch');assert.equal(reconcileCalls,0);assert.equal(store.getExecution('v12-reconcile-rotation').state,'FAILED_OR_UNKNOWN');store.close();ok();
    }
    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'recovery-downgrade.sqlite')),input={message:'reserved'};reserveStrict(store,input,'v12-recovery-downgrade');let calls=0;
      const legacy=legacyDispatcher(store,adapter('adapter-a','',async()=>{calls++;return {};}));
      const result=await legacy.resumeReserved({authorizationId:'v12-recovery-downgrade',input});assert.equal(result.reason,'destination_capability_downgrade');assert.equal(calls,0);assert.equal(store.getExecution('v12-recovery-downgrade').state,'RESERVED');store.close();ok();
    }
    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'reconcile-downgrade.sqlite'));let reconcileCalls=0;
      const d1=strictDispatcher(store,adapter('adapter-a','provider-proto-v1',async()=>{throw new Error('lost');}));const input={message:'unknown'};await d1.dispatch({tool:'send',input,action:signedAction(input,'v12-reconcile-downgrade')});
      const legacy=legacyDispatcher(store,adapter('adapter-a','',async()=>{throw new Error('must_not_execute');},async()=>{reconcileCalls++;return {};}));
      const result=await legacy.reconcileUnknown({authorizationId:'v12-reconcile-downgrade'});assert.equal(result.reason,'destination_capability_downgrade');assert.equal(reconcileCalls,0);assert.equal(store.getExecution('v12-reconcile-downgrade').state,'FAILED_OR_UNKNOWN');store.close();ok();
    }
    {
      const legacy=Dispatch.createToolDispatcher({allowLegacySelfAssertedDestinationCapabilities:true,tools:[{name:'send',effect:'send',implementationId:'legacy-v11',destinationAdapter:{adapterId:'legacy',supportsIdempotency:true,execute:async()=>({}),reconcile:async()=>({})}}]});
      const listed=legacy.listTools();assert.equal(listed[0].destinationAdapterId,'legacy');assert.equal('destinationCapabilityDigest' in listed[0],false);ok();
    }
    {
      const listed=strictDispatcher(null,adapter()).listTools()[0];assert.equal(listed.destinationCapabilityDigest,DIGEST_V1);assert.equal(listed.destinationCapabilityVersion,'cap-v1');ok();
    }

    assert.equal(passed,15);
    console.log('RUMBO Trusted Destination Capability V12: 15/15 PASS + fail-closed exact-schema manifests + V11 DB migration + signed capability rotation + legacy downgrade guards');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
main().catch(err=>{console.error(err);process.exit(1);});
