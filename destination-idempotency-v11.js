const crypto=require('node:crypto');
const {canonicalizeJcs}=require('./jcs-canonicalize-v8.js');

const STATES=new Set(['SUCCEEDED','FAILED','PENDING','UNKNOWN']);
const bounded=(v,n=200)=>typeof v==='string'&&v.length>0&&v.length<=n;

function computeIdempotencyKey({authorizationId,actionDigest,toolBindingDigest,adapterId}={}){
  const payload={
    adapterId:String(adapterId||'').trim(),
    authorizationId:String(authorizationId||'').trim(),
    actionDigest:String(actionDigest||'').trim().toLowerCase(),
    toolBindingDigest:String(toolBindingDigest||'').trim().toLowerCase()
  };
  if(!bounded(payload.adapterId)||!bounded(payload.authorizationId)||!/^[a-f0-9]{64}$/.test(payload.actionDigest)||!/^[a-f0-9]{64}$/.test(payload.toolBindingDigest)) throw new Error('invalid_idempotency_binding');
  return `rumbo-v11-${crypto.createHash('sha256').update(canonicalizeJcs(payload),'utf8').digest('hex')}`;
}

function validateDestinationAdapter(adapter){
  if(!adapter||typeof adapter!=='object') throw new Error('invalid_destination_adapter');
  const adapterId=String(adapter.adapterId||'').trim();
  const protocolVersion=String(adapter.protocolVersion||'').trim();
  if(!bounded(adapterId)||adapter.supportsIdempotency!==true||typeof adapter.execute!=='function'||typeof adapter.reconcile!=='function') throw new Error('invalid_destination_adapter');
  if(protocolVersion&&!bounded(protocolVersion)) throw new Error('invalid_destination_adapter');
  return Object.freeze({adapterId,protocolVersion,supportsIdempotency:true,execute:adapter.execute,reconcile:adapter.reconcile});
}

function normalizeEvidence(raw,expected={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.getPrototypeOf(raw)!==Object.prototype) return {valid:false,reason:'invalid_destination_evidence'};
  if(Object.getOwnPropertySymbols(raw).length) return {valid:false,reason:'invalid_destination_evidence'};
  const status=String(raw.status||'').trim().toUpperCase();
  const idempotencyKey=String(raw.idempotencyKey||'').trim();
  const adapterId=String(raw.adapterId||'').trim();
  if(!STATES.has(status)) return {valid:false,reason:'invalid_destination_status'};
  if(idempotencyKey!==expected.idempotencyKey) return {valid:false,reason:'destination_idempotency_key_mismatch'};
  if(adapterId!==expected.adapterId) return {valid:false,reason:'destination_adapter_mismatch'};
  const externalId=raw.externalId==null?null:String(raw.externalId);
  if(externalId!==null&&!bounded(externalId,512)) return {valid:false,reason:'invalid_destination_external_id'};
  const evidence={adapterId,idempotencyKey,status,externalId};
  const evidenceDigest=crypto.createHash('sha256').update(canonicalizeJcs(evidence),'utf8').digest('hex');
  return {valid:true,reason:null,evidence:Object.freeze(evidence),evidenceDigest};
}

module.exports={computeIdempotencyKey,validateDestinationAdapter,normalizeEvidence,STATES};
