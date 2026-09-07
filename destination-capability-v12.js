const crypto=require('node:crypto');
const {canonicalizeJcs}=require('./jcs-canonicalize-v8.js');

const CAPABILITY_SCHEMA='rumbo.destination-capability.v1';
const IDEMPOTENCY_MODE='destination-key';
const RECONCILIATION_MODE='lookup-by-idempotency-key';
const bounded=(v,n=200)=>typeof v==='string'&&v.length>0&&v.length<=n;

function normalizeTrustedDestinationCapability(raw,expectedAdapterId,implementationId){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.getPrototypeOf(raw)!==Object.prototype) throw new Error('invalid_destination_capability');
  if(Object.getOwnPropertySymbols(raw).length) throw new Error('invalid_destination_capability');
  const adapterId=String(raw.adapterId||'').trim();
  const capabilityVersion=String(raw.capabilityVersion||'').trim();
  const protocolVersion=String(raw.protocolVersion||'').trim();
  const idempotencyMode=String(raw.idempotencyMode||'').trim();
  const reconciliationMode=String(raw.reconciliationMode||'').trim();
  const schema=String(raw.schema||'').trim();
  if(adapterId!==String(expectedAdapterId||'').trim()) throw new Error('destination_capability_adapter_mismatch');
  if(!bounded(adapterId)||!bounded(capabilityVersion)||!bounded(protocolVersion)||schema!==CAPABILITY_SCHEMA) throw new Error('invalid_destination_capability');
  if(idempotencyMode!==IDEMPOTENCY_MODE||reconciliationMode!==RECONCILIATION_MODE) throw new Error('unsupported_destination_capability');
  if(!Array.isArray(raw.allowedImplementationIds)||raw.allowedImplementationIds.length<1||raw.allowedImplementationIds.length>128) throw new Error('invalid_destination_capability');
  const allowedImplementationIds=[...new Set(raw.allowedImplementationIds.map(v=>String(v||'').trim()))].sort();
  if(allowedImplementationIds.some(v=>!bounded(v))) throw new Error('invalid_destination_capability');
  if(!allowedImplementationIds.includes(String(implementationId||'').trim())) throw new Error('destination_implementation_not_trusted');
  return Object.freeze({schema,adapterId,capabilityVersion,protocolVersion,idempotencyMode,reconciliationMode,allowedImplementationIds:Object.freeze(allowedImplementationIds)});
}

function computeDestinationCapabilityDigest(capability){
  const payload={
    schema:capability.schema,
    adapterId:capability.adapterId,
    capabilityVersion:capability.capabilityVersion,
    protocolVersion:capability.protocolVersion,
    idempotencyMode:capability.idempotencyMode,
    reconciliationMode:capability.reconciliationMode,
    allowedImplementationIds:[...capability.allowedImplementationIds]
  };
  return crypto.createHash('sha256').update(canonicalizeJcs(payload),'utf8').digest('hex');
}

function resolveTrustedDestinationCapability(adapter,implementationId,policies){
  if(!policies||typeof policies!=='object'||Array.isArray(policies)) throw new Error('trusted_destination_capability_required');
  const raw=policies[adapter.adapterId];
  if(!raw) throw new Error('trusted_destination_capability_required');
  const capability=normalizeTrustedDestinationCapability(raw,adapter.adapterId,implementationId);
  if(String(adapter.protocolVersion||'').trim()!==capability.protocolVersion) throw new Error('destination_protocol_mismatch');
  return Object.freeze({...capability,capabilityDigest:computeDestinationCapabilityDigest(capability)});
}

module.exports={CAPABILITY_SCHEMA,IDEMPOTENCY_MODE,RECONCILIATION_MODE,normalizeTrustedDestinationCapability,computeDestinationCapabilityDigest,resolveTrustedDestinationCapability};
