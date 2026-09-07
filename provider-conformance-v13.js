const crypto=require('node:crypto');
const {canonicalizeJcs}=require('./jcs-canonicalize-v8.js');
const {decodeCanonicalEd25519Signature,publicKeyFingerprint}=require('./agent-authorization-v3.js');

const PROFILE_SCHEMA='rumbo.provider-conformance-profile.v1';
const RECEIPT_SCHEMA='rumbo.provider-conformance-receipt.v1';
const RESULT='PASS';
const MAX_VALIDITY_MS=7*24*60*60*1000;
const MAX_FUTURE_SKEW_MS=5*60*1000;
const PROFILE_KEYS=Object.freeze(['adapterId','capabilityDigest','evidenceDigest','protocolVersion','providerId','result','schema','suiteVersion']);
const RECEIPT_KEYS=Object.freeze(['expiresAt','keyId','observedAt','profileDigest','schema','signature']);
const ENTRY_KEYS=Object.freeze(['profile','receipt']);
const bounded=(v,n=200)=>typeof v==='string'&&v.length>0&&v.length<=n;
const sha256=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v.toLowerCase());

function dataEntriesExact(raw,expectedKeys,error='invalid_provider_conformance'){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.getPrototypeOf(raw)!==Object.prototype) throw new Error(error);
  if(Object.getOwnPropertySymbols(raw).length) throw new Error(error);
  const keys=Object.keys(raw).sort();
  if(keys.length!==expectedKeys.length||keys.some((key,index)=>key!==expectedKeys[index])) throw new Error(error);
  const out=Object.create(null);
  for(const key of keys){
    const descriptor=Object.getOwnPropertyDescriptor(raw,key);
    if(!descriptor||typeof descriptor.get==='function'||typeof descriptor.set==='function') throw new Error(error);
    out[key]=descriptor.value;
  }
  return out;
}

function requirePrimitiveStrings(data,keys,error){
  if(keys.some(key=>typeof data[key]!=='string')) throw new Error(error);
}

function normalizeProviderConformanceProfile(raw,expected={}){
  const data=dataEntriesExact(raw,PROFILE_KEYS,'invalid_provider_conformance_profile');
  requirePrimitiveStrings(data,PROFILE_KEYS,'invalid_provider_conformance_profile');
  const profile={
    schema:data.schema.trim(),providerId:data.providerId.trim(),adapterId:data.adapterId.trim(),
    protocolVersion:data.protocolVersion.trim(),capabilityDigest:data.capabilityDigest.trim().toLowerCase(),
    suiteVersion:data.suiteVersion.trim(),evidenceDigest:data.evidenceDigest.trim().toLowerCase(),result:data.result.trim().toUpperCase()
  };
  if(profile.schema!==PROFILE_SCHEMA||!bounded(profile.providerId)||!bounded(profile.adapterId)||!bounded(profile.protocolVersion)||!bounded(profile.suiteVersion)) throw new Error('invalid_provider_conformance_profile');
  if(!sha256(profile.capabilityDigest)||!sha256(profile.evidenceDigest)||profile.result!==RESULT) throw new Error('invalid_provider_conformance_profile');
  if(expected.adapterId&&profile.adapterId!==String(expected.adapterId).trim()) throw new Error('provider_conformance_adapter_mismatch');
  if(expected.protocolVersion&&profile.protocolVersion!==String(expected.protocolVersion).trim()) throw new Error('provider_conformance_protocol_mismatch');
  if(expected.capabilityDigest&&profile.capabilityDigest!==String(expected.capabilityDigest).trim().toLowerCase()) throw new Error('provider_conformance_capability_mismatch');
  return Object.freeze(profile);
}

function computeProviderConformanceProfileDigest(profile){
  const normalized=normalizeProviderConformanceProfile(profile);
  return crypto.createHash('sha256').update(canonicalizeJcs(normalized),'utf8').digest('hex');
}

function conformanceReceiptMessage(raw={}){
  const data=dataEntriesExact(raw,RECEIPT_KEYS,'invalid_provider_conformance_receipt');
  requirePrimitiveStrings(data,RECEIPT_KEYS,'invalid_provider_conformance_receipt');
  const message={schema:data.schema.trim(),profileDigest:data.profileDigest.trim().toLowerCase(),observedAt:data.observedAt.trim(),expiresAt:data.expiresAt.trim(),keyId:data.keyId.trim()};
  if(message.schema!==RECEIPT_SCHEMA||!sha256(message.profileDigest)||!bounded(message.keyId)) throw new Error('invalid_provider_conformance_receipt');
  return canonicalizeJcs(message);
}

function normalizeConformanceReceipt(raw){
  const data=dataEntriesExact(raw,RECEIPT_KEYS,'invalid_provider_conformance_receipt');
  requirePrimitiveStrings(data,RECEIPT_KEYS,'invalid_provider_conformance_receipt');
  const receipt={schema:data.schema.trim(),profileDigest:data.profileDigest.trim().toLowerCase(),observedAt:data.observedAt.trim(),expiresAt:data.expiresAt.trim(),keyId:data.keyId.trim(),signature:data.signature};
  if(receipt.schema!==RECEIPT_SCHEMA||!sha256(receipt.profileDigest)||!bounded(receipt.keyId)||!receipt.signature) throw new Error('invalid_provider_conformance_receipt');
  return Object.freeze(receipt);
}

function verifyProviderConformanceReceipt(raw,options={}){
  let receipt;
  try{receipt=normalizeConformanceReceipt(raw);}catch(err){return {verified:false,reason:String(err&&err.message||'invalid_provider_conformance_receipt')};}
  const expectedProfileDigest=typeof options.profileDigest==='string'?options.profileDigest.trim().toLowerCase():'';
  if(!sha256(expectedProfileDigest)||receipt.profileDigest!==expectedProfileDigest) return {verified:false,reason:'provider_conformance_profile_mismatch'};
  const observed=Date.parse(receipt.observedAt),expires=Date.parse(receipt.expiresAt);
  const nowInput=typeof options.now==='function'?options.now():options.now;
  const now=nowInput===undefined||nowInput===null?Date.now():(typeof nowInput==='number'?nowInput:typeof nowInput==='string'?Date.parse(nowInput):NaN);
  if(!Number.isFinite(observed)||!Number.isFinite(expires)||!Number.isFinite(now)||expires<=observed||expires-observed>MAX_VALIDITY_MS) return {verified:false,reason:'invalid_provider_conformance_window'};
  if(observed>now+MAX_FUTURE_SKEW_MS) return {verified:false,reason:'provider_conformance_not_yet_valid'};
  if(now>=expires) return {verified:false,reason:'provider_conformance_expired'};
  const trusted=options.trustedPublicKeys||{};
  const keyDescriptor=trusted&&typeof trusted==='object'?Object.getOwnPropertyDescriptor(trusted,receipt.keyId):null;
  if(!keyDescriptor||typeof keyDescriptor.get==='function'||typeof keyDescriptor.set==='function'||!keyDescriptor.value) return {verified:false,reason:'untrusted_provider_conformance_key'};
  let signatureBytes;
  try{signatureBytes=decodeCanonicalEd25519Signature(receipt.signature);}catch{return {verified:false,reason:'invalid_provider_conformance_signature_encoding',keyId:receipt.keyId,fingerprint:publicKeyFingerprint(keyDescriptor.value)};}
  try{
    const ok=crypto.verify(null,Buffer.from(conformanceReceiptMessage(receipt),'utf8'),keyDescriptor.value,signatureBytes);
    return {verified:ok,reason:ok?null:'provider_conformance_signature_failed',keyId:receipt.keyId,fingerprint:publicKeyFingerprint(keyDescriptor.value),receipt};
  }catch{return {verified:false,reason:'provider_conformance_signature_error',keyId:receipt.keyId,fingerprint:null};}
}

function resolveProviderConformance(adapter,capability,policies,options={}){
  if(!policies||typeof policies!=='object'||Array.isArray(policies)) throw new Error('trusted_provider_conformance_required');
  const descriptor=Object.getOwnPropertyDescriptor(policies,adapter.adapterId);
  if(!descriptor||typeof descriptor.get==='function'||typeof descriptor.set==='function'||!descriptor.value) throw new Error('trusted_provider_conformance_required');
  const entry=dataEntriesExact(descriptor.value,ENTRY_KEYS,'invalid_provider_conformance_entry');
  const profile=normalizeProviderConformanceProfile(entry.profile,{adapterId:adapter.adapterId,protocolVersion:adapter.protocolVersion,capabilityDigest:capability.capabilityDigest});
  const profileDigest=computeProviderConformanceProfileDigest(profile);
  const verification=verifyProviderConformanceReceipt(entry.receipt,{profileDigest,trustedPublicKeys:options.trustedPublicKeys||{},now:options.now});
  if(!verification.verified) throw new Error(verification.reason||'provider_conformance_unverified');
  return Object.freeze({profile,profileDigest,receipt:verification.receipt,keyId:verification.keyId,fingerprint:verification.fingerprint});
}

module.exports={PROFILE_SCHEMA,RECEIPT_SCHEMA,RESULT,MAX_VALIDITY_MS,MAX_FUTURE_SKEW_MS,normalizeProviderConformanceProfile,computeProviderConformanceProfileDigest,conformanceReceiptMessage,normalizeConformanceReceipt,verifyProviderConformanceReceipt,resolveProviderConformance};
