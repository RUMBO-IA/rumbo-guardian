const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Gate=require('../agent-action-gate.js');
const Auth=require('../agent-authorization-v3.js');
const AuthorizationDispatch=require('../agent-authorized-dispatch.js');
const Dispatch=require('../agent-tool-dispatcher-v4.js');
const {SQLiteExecutionStoreV11}=require('../sqlite-execution-store-v11.js');
const {computeIdempotencyKey}=require('../destination-idempotency-v11.js');

const NOW='2026-09-07T16:40:00Z',OBS='2026-09-07T16:35:00Z',EXP='2026-09-07T16:45:00Z';
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const pub=publicKey.export({type:'spki',format:'pem'});
const BASE_TOOL={name:'send',effect:'send',implementationId:'send-v11',destinationAdapterId:'adapter-a'};

function signedAction(input,authorizationId,tool=BASE_TOOL){
  const parametersDigest=Dispatch.computeParametersDigest(input);
  const toolBindingDigest=Dispatch.computeToolBindingDigest(tool);
  const action={id:`action-${authorizationId}`,effect:tool.effect,target:'recipient@example.com',purpose:'Approved V11 destination dispatch',explicitAuthorization:true,intentAligned:true,targetVerified:true,evidenceCount:1,authorizationObservedAt:OBS,parametersDigest,toolBindingDigest};
  const actionDigest=Gate.computeActionDigest(action);
  const envelope={authorizationId,actionDigest,expiresAt:EXP,observedAt:OBS,keyId:'operator-v11'};
  envelope.signature=crypto.sign(null,Buffer.from(Auth.authorizationMessage(envelope)),privateKey).toString('base64');
  action.authorization=envelope;
  return action;
}
function adapter(adapterId,execute,reconcile){return {adapterId,supportsIdempotency:true,execute,reconcile};}
function dispatcher(store,destinationAdapter,extra={}){
  return Dispatch.createToolDispatcher({replayStore:store,trustedPublicKeys:{'operator-v11':pub},gateOptions:{now:NOW},authorizeReconciliation:async()=>true,...extra,tools:[{name:'send',effect:'send',implementationId:'send-v11',destinationAdapter}]});
}

async function main(){
  let passed=0;const ok=()=>passed++;
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rumbo-v11-'));
  try{
    {
      const common={authorizationId:'idem-a',actionDigest:'a'.repeat(64),toolBindingDigest:'b'.repeat(64),adapterId:'adapter-a'};
      const a=computeIdempotencyKey(common),b=computeIdempotencyKey(common),c=computeIdempotencyKey({...common,adapterId:'adapter-b'});
      assert.equal(a,b);assert.notEqual(a,c);assert.match(a,/^rumbo-v11-[a-f0-9]{64}$/);ok();
    }

    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'success.sqlite'));let calls=0,seenKey=null;
      const d=dispatcher(store,adapter('adapter-a',async(input,ctx)=>{calls++;seenKey=ctx.idempotencyKey;return {adapterId:'adapter-a',idempotencyKey:ctx.idempotencyKey,status:'SUCCEEDED',externalId:'msg-1'};},async()=>{throw new Error('not-needed');}));
      const input={message:'hello'},result=await d.dispatch({tool:'send',input,action:signedAction(input,'v11-success')});
      assert.equal(result.effectOutcome,'SUCCEEDED');assert.equal(calls,1);assert.equal(result.receipt.idempotencyKey,seenKey);
      assert.equal(store.getExecution('v11-success').state,'SUCCEEDED');assert.equal(store.getDestination('v11-success').state,'SUCCEEDED');assert.match(store.getDestination('v11-success').evidenceDigest,/^[a-f0-9]{64}$/);store.close();ok();
    }

    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'reserved-recovery.sqlite')),input={message:'reserved'};let executeCalls=0,seenKey=null;
      const action=signedAction(input,'v11-reserved-recovery');
      const toolBindingDigest=Dispatch.computeToolBindingDigest(BASE_TOOL);
      const idempotencyKey=computeIdempotencyKey({authorizationId:'v11-reserved-recovery',actionDigest:action.authorization.actionDigest,toolBindingDigest,adapterId:'adapter-a'});
      const prepared=AuthorizationDispatch.prepareAuthorizedAction(action,{gateOptions:{now:NOW},trustedPublicKeys:{'operator-v11':pub},replayStore:store,executionContext:{tool:'send',effect:'send',implementationId:'send-v11',parametersDigest:Dispatch.computeParametersDigest(input),destination:{adapterId:'adapter-a',idempotencyKey}}});
      assert.equal(prepared.decision,'ALLOW');assert.equal(store.getExecution('v11-reserved-recovery').state,'RESERVED');assert.equal(store.getDestination('v11-reserved-recovery').state,'PENDING');
      const d=dispatcher(store,adapter('adapter-a',async(input,ctx)=>{executeCalls++;seenKey=ctx.idempotencyKey;return {adapterId:'adapter-a',idempotencyKey:ctx.idempotencyKey,status:'SUCCEEDED'};},async()=>{throw new Error('not-needed');}),{authorizeRecovery:async()=>true});
      const recovered=await d.resumeReserved({authorizationId:'v11-reserved-recovery',input});
      assert.equal(recovered.effectOutcome,'SUCCEEDED');assert.equal(executeCalls,1);assert.equal(seenKey,idempotencyKey);assert.equal(store.getExecution('v11-reserved-recovery').state,'SUCCEEDED');store.close();ok();
    }

    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'replay.sqlite'));let calls=0;
      const a=adapter('adapter-a',async(input,ctx)=>{calls++;return {adapterId:'adapter-a',idempotencyKey:ctx.idempotencyKey,status:'SUCCEEDED'};},async()=>{throw new Error('not-needed');});
      const d=dispatcher(store,a),input={message:'once'},action=signedAction(input,'v11-replay');
      const first=await d.dispatch({tool:'send',input,action});const second=await d.dispatch({tool:'send',input,action});
      assert.equal(first.effectOutcome,'SUCCEEDED');assert.equal(second.decision,'DENY');assert.equal(calls,1);store.close();ok();
    }

    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'reconcile.sqlite'));let executeCalls=0,reconcileCalls=0,key=null;
      const a=adapter('adapter-a',async(input,ctx)=>{executeCalls++;key=ctx.idempotencyKey;throw new Error('network_lost_after_send');},async ctx=>{reconcileCalls++;assert.equal(ctx.idempotencyKey,key);return {adapterId:'adapter-a',idempotencyKey:ctx.idempotencyKey,status:'SUCCEEDED',externalId:'msg-recovered'};});
      const d=dispatcher(store,a),input={message:'recover'},initial=await d.dispatch({tool:'send',input,action:signedAction(input,'v11-reconcile')});
      assert.equal(initial.effectOutcome,'FAILED_OR_UNKNOWN');assert.equal(store.getExecution('v11-reconcile').state,'STARTED');assert.equal(store.getDestination('v11-reconcile').state,'PENDING');
      const reconciled=await d.reconcileStarted({authorizationId:'v11-reconcile'});
      assert.equal(reconciled.effectOutcome,'SUCCEEDED');assert.equal(executeCalls,1);assert.equal(reconcileCalls,1);assert.equal(store.getExecution('v11-reconcile').state,'SUCCEEDED');store.close();ok();
    }

    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'pending.sqlite'));
      const a=adapter('adapter-a',async(input,ctx)=>({adapterId:'adapter-a',idempotencyKey:ctx.idempotencyKey,status:'PENDING'}),async ctx=>({adapterId:'adapter-a',idempotencyKey:ctx.idempotencyKey,status:'PENDING'}));
      const d=dispatcher(store,a),input={message:'pending'},initial=await d.dispatch({tool:'send',input,action:signedAction(input,'v11-pending')});
      assert.equal(initial.effectOutcome,'FAILED_OR_UNKNOWN');const reconciled=await d.reconcileStarted({authorizationId:'v11-pending'});assert.equal(reconciled.stage,'reconciliation_pending');assert.equal(store.getExecution('v11-pending').state,'STARTED');assert.equal(store.getDestination('v11-pending').state,'PENDING');store.close();ok();
    }

    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'bad-evidence.sqlite'));let correctKey=null,reconcileCalls=0;
      const a=adapter('adapter-a',async(input,ctx)=>{correctKey=ctx.idempotencyKey;return {adapterId:'adapter-a',idempotencyKey:'rumbo-v11-'+'0'.repeat(64),status:'SUCCEEDED'};},async()=>{reconcileCalls++;return {adapterId:'adapter-a',idempotencyKey:correctKey,status:'SUCCEEDED'};});
      const d=dispatcher(store,a),input={message:'bad'},result=await d.dispatch({tool:'send',input,action:signedAction(input,'v11-bad-evidence')});
      assert.equal(result.effectOutcome,'FAILED_OR_UNKNOWN');assert.equal(result.evidence.reason,'destination_idempotency_key_mismatch');assert.equal(store.getExecution('v11-bad-evidence').state,'STARTED');assert.equal(store.getDestination('v11-bad-evidence').state,'PENDING');
      const reconciled=await d.reconcileStarted({authorizationId:'v11-bad-evidence'});assert.equal(reconciled.effectOutcome,'SUCCEEDED');assert.equal(reconcileCalls,1);assert.equal(store.getExecution('v11-bad-evidence').state,'SUCCEEDED');store.close();ok();
    }

    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'adapter-substitution.sqlite'));let calls=0;
      const signedForA=signedAction({message:'same'},'v11-adapter-substitution',BASE_TOOL);
      const toolB={name:'send',effect:'send',implementationId:'send-v11',destinationAdapterId:'adapter-b'};
      const d=Dispatch.createToolDispatcher({replayStore:store,trustedPublicKeys:{'operator-v11':pub},gateOptions:{now:NOW},tools:[{name:'send',effect:'send',implementationId:'send-v11',destinationAdapter:adapter('adapter-b',async()=>{calls++;return {};},async()=>{})}]});
      const result=await d.dispatch({tool:'send',input:{message:'same'},action:signedForA});
      assert.equal(Dispatch.computeToolBindingDigest(BASE_TOOL)===Dispatch.computeToolBindingDigest(toolB),false);assert.equal(result.decision,'DENY');assert.equal(calls,0);assert.equal(store.get('v11-adapter-substitution'),null);store.close();ok();
    }

    {
      const db=path.join(tmp,'reconcile-substitution.sqlite'),store=new SQLiteExecutionStoreV11(db);let key=null;
      const a=adapter('adapter-a',async(input,ctx)=>{key=ctx.idempotencyKey;throw new Error('lost');},async()=>({adapterId:'adapter-a',idempotencyKey:key,status:'SUCCEEDED'}));
      const d=dispatcher(store,a),input={message:'x'};await d.dispatch({tool:'send',input,action:signedAction(input,'v11-reconcile-sub')});
      const d2=Dispatch.createToolDispatcher({replayStore:store,authorizeReconciliation:async()=>true,tools:[{name:'send',effect:'send',implementationId:'send-v11',destinationAdapter:adapter('adapter-b',async()=>{},async()=>({adapterId:'adapter-b',idempotencyKey:key,status:'SUCCEEDED'}))}]});
      const result=await d2.reconcileStarted({authorizationId:'v11-reconcile-sub'});assert.equal(result.reason,'destination_adapter_mismatch');assert.equal(store.getExecution('v11-reconcile-sub').state,'STARTED');store.close();ok();
    }

    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'authority.sqlite'));let reconcileCalls=0;
      const a=adapter('adapter-a',async()=>{throw new Error('lost');},async()=>{reconcileCalls++;return {};});
      const d=Dispatch.createToolDispatcher({replayStore:store,trustedPublicKeys:{'operator-v11':pub},gateOptions:{now:NOW},tools:[{name:'send',effect:'send',implementationId:'send-v11',destinationAdapter:a}]});
      const input={message:'authority'};await d.dispatch({tool:'send',input,action:signedAction(input,'v11-authority')});const result=await d.reconcileStarted({authorizationId:'v11-authority'});
      assert.equal(result.reason,'reconciliation_authority_unavailable');assert.equal(reconcileCalls,0);assert.equal(store.getExecution('v11-authority').state,'STARTED');store.close();ok();
    }

    {
      const store=new SQLiteExecutionStoreV11(path.join(tmp,'atomic.sqlite')),input={message:'atomic'};
      store.db.exec(`CREATE TRIGGER force_destination_failure BEFORE INSERT ON destination_idempotency BEGIN SELECT RAISE(ABORT,'forced_destination_failure'); END;`);
      const d=dispatcher(store,adapter('adapter-a',async()=>{throw new Error('must_not_run');},async()=>{}));
      const result=await d.dispatch({tool:'send',input,action:signedAction(input,'v11-atomic')});
      assert.equal(result.decision,'DENY');assert.equal(result.stage,'replay_store');assert.equal(store.get('v11-atomic'),null);assert.equal(store.getExecution('v11-atomic'),null);assert.equal(store.getDestination('v11-atomic'),null);store.close();ok();
    }

    {
      assert.throws(()=>Dispatch.createToolDispatcher({tools:[{name:'send',effect:'send',implementationId:'x',destinationAdapter:{adapterId:'bad',supportsIdempotency:false,execute:async()=>{},reconcile:async()=>{}}}]}),/invalid_destination_adapter/);ok();
    }

    assert.equal(passed,12);
    console.log('RUMBO Destination Idempotency V11: 12/12 PASS + RESERVED recovery + no blind retry + reconciliation + signed adapter substitution guard');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}

main().catch(err=>{console.error(err);process.exit(1);});
