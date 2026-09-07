const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Gate=require('../agent-action-gate.js');
const Auth=require('../agent-authorization-v3.js');
const Dispatch=require('../agent-authorized-dispatch.js');
const {FileAuthorizationReplayStore}=require('../authorization-replay-store.js');

const NOW='2026-09-07T09:40:00Z';
const OBS='2026-09-07T09:35:00Z';
const EXP='2026-09-07T09:45:00Z';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rumbo-auth-v3-'));
const storePath=path.join(tmp,'consumed.jsonl');
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const {publicKey:otherPub,privateKey:otherPriv}=crypto.generateKeyPairSync('ed25519');
const pub=publicKey.export({type:'spki',format:'pem'});
const other=otherPub.export({type:'spki',format:'pem'});

function signedAction(id='auth-1'){
  const action={
    id:'send-1',effect:'send',target:'recipient@example.com',purpose:'Send approved report',
    explicitAuthorization:true,intentAligned:true,targetVerified:true,evidenceCount:1,
    authorizationObservedAt:OBS
  };
  const digest=Gate.computeActionDigest(action);
  const envelope={authorizationId:id,actionDigest:digest,expiresAt:EXP,observedAt:OBS,keyId:'operator-1'};
  envelope.signature=crypto.sign(null,Buffer.from(Auth.authorizationMessage(envelope)),privateKey).toString('base64');
  action.authorization=envelope;
  return action;
}

{
  const store=new FileAuthorizationReplayStore(storePath);
  const result=Dispatch.prepareAuthorizedAction(signedAction('auth-valid'),{gateOptions:{now:NOW},trustedPublicKeys:{'operator-1':pub},replayStore:store});
  assert.equal(result.decision,'ALLOW');
  assert.equal(result.stage,'ready');
  assert.equal(result.ticket.authorizationId,'auth-valid');
}

{
  const action=signedAction('auth-bad-signature');
  const env={...action.authorization};
  env.signature=crypto.sign(null,Buffer.from(Auth.authorizationMessage(env)),otherPriv).toString('base64');
  action.authorization=env;
  const result=Dispatch.prepareAuthorizedAction(action,{gateOptions:{now:NOW},trustedPublicKeys:{'operator-1':pub},replayStore:new FileAuthorizationReplayStore(storePath)});
  assert.equal(result.decision,'DENY');
  assert.equal(result.stage,'signature');
}

{
  const action=signedAction('auth-untrusted-key');
  action.authorization.keyId='attacker';
  const result=Dispatch.prepareAuthorizedAction(action,{gateOptions:{now:NOW},trustedPublicKeys:{'operator-1':pub},replayStore:new FileAuthorizationReplayStore(storePath)});
  assert.equal(result.decision,'DENY');
  assert.ok(result.authorization.reasons.includes('untrusted_authorizer_key'));
}

{
  const action=signedAction('auth-mutated-target');
  action.target='attacker@example.com';
  const result=Dispatch.prepareAuthorizedAction(action,{gateOptions:{now:NOW},trustedPublicKeys:{'operator-1':pub},replayStore:new FileAuthorizationReplayStore(storePath)});
  assert.equal(result.decision,'DENY');
  assert.equal(result.stage,'policy');
  assert.ok(result.gate.reasons.some(r=>r.code==='authorization_action_mismatch'));
}

{
  const action=signedAction('auth-replay');
  const store1=new FileAuthorizationReplayStore(storePath);
  const first=Dispatch.prepareAuthorizedAction(action,{gateOptions:{now:NOW},trustedPublicKeys:{'operator-1':pub},replayStore:store1});
  assert.equal(first.decision,'ALLOW');
  const store2=new FileAuthorizationReplayStore(storePath);
  const second=Dispatch.prepareAuthorizedAction(action,{gateOptions:{now:NOW},trustedPublicKeys:{'operator-1':pub},replayStore:store2});
  assert.equal(second.decision,'DENY');
  assert.equal(second.reservation.reason,'authorization_replay_detected');
}

{
  const action=signedAction('auth-busy');
  fs.writeFileSync(storePath+'.lock','held');
  const result=Dispatch.prepareAuthorizedAction(action,{gateOptions:{now:NOW},trustedPublicKeys:{'operator-1':pub},replayStore:new FileAuthorizationReplayStore(storePath)});
  assert.equal(result.decision,'DENY');
  assert.equal(result.reservation.reason,'store_busy_fail_closed');
  fs.unlinkSync(storePath+'.lock');
}

{
  const corruptPath=path.join(tmp,'corrupt.jsonl');
  fs.writeFileSync(corruptPath,'{bad json}\n');
  const result=Dispatch.prepareAuthorizedAction(signedAction('auth-corrupt'),{gateOptions:{now:NOW},trustedPublicKeys:{'operator-1':pub},replayStore:new FileAuthorizationReplayStore(corruptPath)});
  assert.equal(result.decision,'DENY');
  assert.equal(result.reservation.reason,'replay_store_error');
}

{
  const action=signedAction('auth-key-substitution');
  const result=Dispatch.prepareAuthorizedAction(action,{gateOptions:{now:NOW},trustedPublicKeys:{'operator-1':other},replayStore:new FileAuthorizationReplayStore(storePath)});
  assert.equal(result.decision,'DENY');
  assert.equal(result.stage,'signature');
}

fs.rmSync(tmp,{recursive:true,force:true});
console.log('RUMBO Agent Authorization V3: 8/8 PASS');
