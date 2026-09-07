const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const Gate=require('../agent-action-gate.js');
const Auth=require('../agent-authorization-v3.js');
const AuthorizationDispatch=require('../agent-authorized-dispatch.js');
const ToolDispatch=require('../agent-tool-dispatcher-v4.js');
const {SQLiteAuthorizationReplayStore}=require('../sqlite-authorization-replay-store-v9.js');

if(process.argv[2]==='claim-worker'){
  const dbPath=process.argv[3],authorizationId=process.argv[4];
  const binding=JSON.parse(Buffer.from(process.argv[5],'base64').toString('utf8'));
  try{
    const store=new SQLiteAuthorizationReplayStore(dbPath,{timeout:5000});
    const result=store.claimExecution(authorizationId,binding);
    store.close();
    process.stdout.write(JSON.stringify(result));
  }catch(err){ process.stdout.write(JSON.stringify({claimed:false,reason:'worker_error',error:String(err&&err.message||err)})); }
  process.exit(0);
}

function claimWorker(dbPath,authorizationId,binding){
  return new Promise((resolve,reject)=>{
    const encoded=Buffer.from(JSON.stringify(binding)).toString('base64');
    const child=spawn(process.execPath,[__filename,'claim-worker',dbPath,authorizationId,encoded],{stdio:['ignore','pipe','pipe']});
    let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);
    child.on('close',code=>{if(code!==0)return reject(new Error(`worker_exit_${code}:${err}`));try{resolve(JSON.parse(out));}catch(e){reject(new Error(`worker_bad_json:${out}:${err}`));}});
  });
}

const NOW='2026-09-07T16:10:00Z',OBS='2026-09-07T16:05:00Z',EXP='2026-09-07T16:15:00Z';
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const pub=publicKey.export({type:'spki',format:'pem'});

function signedAction(input,authorizationId,actionId='send-v10'){
  const parametersDigest=ToolDispatch.computeParametersDigest(input);
  const action={id:actionId,effect:'send',target:'recipient@example.com',purpose:'Approved V10 dispatch',explicitAuthorization:true,intentAligned:true,targetVerified:true,evidenceCount:1,authorizationObservedAt:OBS,parametersDigest};
  const actionDigest=Gate.computeActionDigest(action);
  const envelope={authorizationId,actionDigest,expiresAt:EXP,observedAt:OBS,keyId:'operator-v10'};
  envelope.signature=crypto.sign(null,Buffer.from(Auth.authorizationMessage(envelope)),privateKey).toString('base64');
  action.authorization=envelope;
  return action;
}
function reserve(store,input,authorizationId,implementationId='send-v1'){
  const action=signedAction(input,authorizationId);
  return AuthorizationDispatch.prepareAuthorizedAction(action,{
    gateOptions:{now:NOW},trustedPublicKeys:{'operator-v10':pub},replayStore:store,
    executionContext:{tool:'send',effect:'send',implementationId,parametersDigest:ToolDispatch.computeParametersDigest(input)}
  });
}

async function main(){
  let passed=0;const ok=()=>passed++;
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rumbo-execution-v10-'));
  try{
    {
      const db=path.join(tmp,'success.sqlite'),store=new SQLiteAuthorizationReplayStore(db);let calls=0;
      const dispatcher=ToolDispatch.createToolDispatcher({replayStore:store,trustedPublicKeys:{'operator-v10':pub},gateOptions:{now:NOW},tools:[{name:'send',effect:'send',implementationId:'send-v1',handler:async input=>{calls++;return {echo:input.message};}}]});
      const input={message:'hello'};const result=await dispatcher.dispatch({tool:'send',input,action:signedAction(input,'v10-success')});
      assert.equal(result.effectOutcome,'SUCCEEDED');assert.equal(calls,1);assert.equal(store.getExecution('v10-success').state,'SUCCEEDED');store.close();ok();
    }

    {
      const db=path.join(tmp,'failure.sqlite'),store=new SQLiteAuthorizationReplayStore(db);
      const dispatcher=ToolDispatch.createToolDispatcher({replayStore:store,trustedPublicKeys:{'operator-v10':pub},gateOptions:{now:NOW},tools:[{name:'send',effect:'send',implementationId:'send-v1',handler:async()=>{throw new Error('boom');}}]});
      const input={message:'fail'};const result=await dispatcher.dispatch({tool:'send',input,action:signedAction(input,'v10-fail')});
      assert.equal(result.effectOutcome,'FAILED');assert.equal(store.getExecution('v10-fail').state,'FAILED');store.close();ok();
    }

    {
      const db=path.join(tmp,'resume.sqlite'),store=new SQLiteAuthorizationReplayStore(db),input={message:'resume'};
      const prepared=reserve(store,input,'v10-resume');assert.equal(prepared.decision,'ALLOW');assert.equal(store.getExecution('v10-resume').state,'RESERVED');let calls=0;
      const dispatcher=ToolDispatch.createToolDispatcher({replayStore:store,authorizeRecovery:async()=>true,tools:[{name:'send',effect:'send',implementationId:'send-v1',handler:async()=>{calls++;return 'recovered';}}]});
      const result=await dispatcher.resumeReserved({authorizationId:'v10-resume',input});
      assert.equal(result.effectOutcome,'SUCCEEDED');assert.equal(result.receipt.recovery,true);assert.equal(calls,1);assert.equal(store.getExecution('v10-resume').state,'SUCCEEDED');
      const again=await dispatcher.resumeReserved({authorizationId:'v10-resume',input});assert.equal(again.decision,'DENY');assert.equal(calls,1);store.close();ok();
    }

    {
      const db=path.join(tmp,'mismatch.sqlite'),store=new SQLiteAuthorizationReplayStore(db),input={message:'original'};reserve(store,input,'v10-mismatch');
      const dispatcher=ToolDispatch.createToolDispatcher({replayStore:store,authorizeRecovery:async()=>true,tools:[{name:'send',effect:'send',implementationId:'send-v1',handler:async()=>{throw new Error('must_not_run');}}]});
      const result=await dispatcher.resumeReserved({authorizationId:'v10-mismatch',input:{message:'mutated'}});
      assert.equal(result.reason,'recovery_parameters_mismatch');assert.equal(store.getExecution('v10-mismatch').state,'RESERVED');store.close();ok();
    }

    {
      const db=path.join(tmp,'implementation.sqlite'),store=new SQLiteAuthorizationReplayStore(db),input={message:'same'};reserve(store,input,'v10-impl','send-v1');
      const dispatcher=ToolDispatch.createToolDispatcher({replayStore:store,authorizeRecovery:async()=>true,tools:[{name:'send',effect:'send',implementationId:'send-v2',handler:async()=>{throw new Error('must_not_run');}}]});
      const result=await dispatcher.resumeReserved({authorizationId:'v10-impl',input});assert.equal(result.reason,'tool_implementation_mismatch');assert.equal(store.getExecution('v10-impl').state,'RESERVED');store.close();ok();
    }

    {
      const db=path.join(tmp,'authority.sqlite'),store=new SQLiteAuthorizationReplayStore(db),input={message:'authority'};reserve(store,input,'v10-authority');
      const dispatcher=ToolDispatch.createToolDispatcher({replayStore:store,tools:[{name:'send',effect:'send',implementationId:'send-v1',handler:async()=>{throw new Error('must_not_run');}}]});
      const result=await dispatcher.resumeReserved({authorizationId:'v10-authority',input});assert.equal(result.reason,'recovery_authority_unavailable');assert.equal(store.getExecution('v10-authority').state,'RESERVED');store.close();ok();
    }

    {
      const db=path.join(tmp,'unknown.sqlite'),store=new SQLiteAuthorizationReplayStore(db),input={message:'unknown'};const prepared=reserve(store,input,'v10-unknown');
      const binding={actionId:prepared.ticket.actionId,actionDigest:prepared.ticket.actionDigest,tool:'send',effect:'send',implementationId:'send-v1',parametersDigest:ToolDispatch.computeParametersDigest(input)};
      assert.equal(store.claimExecution('v10-unknown',binding).claimed,true);assert.equal(store.getExecution('v10-unknown').state,'STARTED');
      const recovery=store.recoverInterruptedStarted('2100-01-01T00:00:00Z');assert.equal(recovery.count,1);assert.equal(store.getExecution('v10-unknown').state,'FAILED_OR_UNKNOWN');
      const dispatcher=ToolDispatch.createToolDispatcher({replayStore:store,authorizeRecovery:async()=>true,tools:[{name:'send',effect:'send',implementationId:'send-v1',handler:async()=>{throw new Error('must_not_run');}}]});
      const resumed=await dispatcher.resumeReserved({authorizationId:'v10-unknown',input});assert.equal(resumed.reason,'execution_not_resumable');store.close();ok();
    }

    {
      const db=path.join(tmp,'race.sqlite'),store=new SQLiteAuthorizationReplayStore(db),input={message:'race'};const prepared=reserve(store,input,'v10-race');
      const binding={actionId:prepared.ticket.actionId,actionDigest:prepared.ticket.actionDigest,tool:'send',effect:'send',implementationId:'send-v1',parametersDigest:ToolDispatch.computeParametersDigest(input)};store.close();
      const results=await Promise.all(Array.from({length:16},()=>claimWorker(db,'v10-race',binding)));
      assert.equal(results.filter(x=>x.claimed).length,1);assert.equal(results.filter(x=>!x.claimed).length,15);
      const verify=new SQLiteAuthorizationReplayStore(db);assert.equal(verify.getExecution('v10-race').state,'STARTED');verify.close();ok();
    }

    {
      const db=path.join(tmp,'terminal.sqlite'),store=new SQLiteAuthorizationReplayStore(db),input={message:'terminal'};const prepared=reserve(store,input,'v10-terminal');
      const binding={actionId:prepared.ticket.actionId,actionDigest:prepared.ticket.actionDigest,tool:'send',effect:'send',implementationId:'send-v1',parametersDigest:ToolDispatch.computeParametersDigest(input)};
      assert.equal(store.claimExecution('v10-terminal',binding).claimed,true);assert.equal(store.finishExecution('v10-terminal','SUCCEEDED').finished,true);
      const second=store.finishExecution('v10-terminal','FAILED');assert.equal(second.finished,false);assert.equal(second.reason,'execution_already_terminal');assert.equal(store.getExecution('v10-terminal').state,'SUCCEEDED');store.close();ok();
    }

    {
      const db=path.join(tmp,'atomic.sqlite'),store=new SQLiteAuthorizationReplayStore(db),input={message:'atomic'};const action=signedAction(input,'v10-atomic');
      store.db.exec(`CREATE TRIGGER force_execution_failure BEFORE INSERT ON execution_journal BEGIN SELECT RAISE(ABORT,'forced_execution_failure'); END;`);
      assert.throws(()=>AuthorizationDispatch.prepareAuthorizedAction(action,{gateOptions:{now:NOW},trustedPublicKeys:{'operator-v10':pub},replayStore:store,executionContext:{tool:'send',effect:'send',implementationId:'send-v1',parametersDigest:ToolDispatch.computeParametersDigest(input)}}),/./);
      assert.equal(store.get('v10-atomic'),null);assert.equal(store.getExecution('v10-atomic'),null);store.close();ok();
    }

    assert.equal(passed,10);
    console.log('RUMBO Execution Journal V10: 10/10 PASS + 16-way claim race + crash-safe RESERVED recovery');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}

if(process.argv[2]!=='claim-worker') main().catch(err=>{console.error(err);process.exit(1);});
