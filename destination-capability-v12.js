const crypto=require('node:crypto');
const {canonicalizeJcs}=require('./jcs-canonicalize-v8.js');

const CAPABILITY_SCHEMA='rumbo.destination-capability.v1';
const IDEMPOTENCY_MODE='destination-key';
const RECONCILIATION_MODE='lookup-by-idempotency-key';
const CAPABILITY_KEYS=Object.freeze(['adapterId','allowedImplementationIds','capabilityVersion','idempotencyMode','protocolVersion','reconciliationMode','schema']);
const bounded=(v,n=200)=>typeof v==='string'&&v.length>0&&v.length<=n;

function plainDataObject(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return null;
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null) return null;
  if(Object.getOwnPropertySymbols(raw).length) return null;
  const descriptors=Object.getOwnPropertyDescriptors(raw);
  for(const descriptor of Object.values(descriptors)) if(typeof descriptor.get==='function'||typeof descriptor.set==='function') return null;
  return descriptors;
}
function exactKeys(descriptors,expected){
  const keys=Object.keys(descriptors).sort();
  return keys.length===expected.length&&keys.every((key,index)=>key===expected[index]);
}
function denseStringArray(raw){
  if(!Array.isArray(raw)||Object.getOwnPropertySymbols(raw).length) return null;
  const keys=Object.keys(raw);
  if(keys.length!==raw.length) return null;
  const values=[];
  for(let i=0;i<raw.length;i++){
    if(keys[i]!==String(i)) return null;
    const descriptor=Object.getOwnPropertyDescriptor(raw,String(i));
    if(!descriptor||typeof descriptor.get==='function'||typeof descriptor.set==='function'||typeof descriptor.value!=='string') return null;
    values.push(descriptor.value.trim());
  }
  return values;
}

function normalizeTrustedDestinationCapability(raw,expectedAdapterId,implementationId){
  const descriptors=plainDataObject(raw);
  if(!descriptors||!exactKeys(descriptors,CAPABILITY_KEYS)) throw new Error('invalid_destination_capability');
  const adapterId=String(descriptors.adapterId.value||'').trim();
  const capabilityVersion=String(descriptors.capabilityVersion.value||'').trim();
  const protocolVersion=String(descriptors.protocolVersion.value||'').trim();
  const idempotencyMode=String(descriptors.idempotencyMode.value||'').trim();
  const reconciliationMode=String(descriptors.reconciliationMode.value||'').trim();
  const schema=String(descriptors.schema.value||'').trim();
  if(adapterId!==String(expectedAdapterId||'').trim()) throw new Error('destination_capability_adapter_mismatch');
  if(!bounded(adapterId)||!bounded(capabilityVersion)||!bounded(protocolVersion)||schema!==CAPABILITY_SCHEMA) throw new Error('invalid_destination_capability');
  if(idempotencyMode!==IDEMPOTENCY_MODE||reconciliationMode!==RECONCILIATION_MODE) throw new Error('unsupported_destination_capability');
  const rawImplementations=denseStringArray(descriptors.allowedImplementationIds.value);
  if(!rawImplementations||rawImplementations.length<1||rawImplementations.length>128||rawImplementations.some(v=>!bounded(v))) throw new Error('invalid_destination_capability');
  const allowedImplementationIds=[...new Set(rawImplementations)].sort();
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
  const policyDescriptors=plainDataObject(policies);
  if(!policyDescriptors) throw new Error('trusted_destination_capability_required');
  const descriptor=policyDescriptors[adapter.adapterId];
  if(!descriptor) throw new Error('trusted_destination_capability_required');
  const raw=descriptor.value;
  const capability=normalizeTrustedDestinationCapability(raw,adapter.adapterId,implementationId);
  if(String(adapter.protocolVersion||'').trim()!==capability.protocolVersion) throw new Error('destination_protocol_mismatch');
  return Object.freeze({...capability,capabilityDigest:computeDestinationCapabilityDigest(capability)});
}

module.exports={CAPABILITY_SCHEMA,IDEMPOTENCY_MODE,RECONCILIATION_MODE,CAPABILITY_KEYS,normalizeTrustedDestinationCapability,computeDestinationCapabilityDigest,resolveTrustedDestinationCapability};
