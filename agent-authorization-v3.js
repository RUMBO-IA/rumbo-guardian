const crypto = require('node:crypto');

const {types}=require('node:util');
const SIGNED_FIELDS=['authorizationId','actionDigest','observedAt','expiresAt','keyId'];

// Reject all accessor/proxy/object-coercion input before any signing or verification.
function stableEnvelope(envelope,includeSignature=false){
  if(!envelope||typeof envelope!=='object'||types.isProxy(envelope)||Array.isArray(envelope)) return null;
  const proto=Object.getPrototypeOf(envelope);
  if(proto!==Object.prototype&&proto!==null) return null;
  if(Object.getOwnPropertySymbols(envelope).length!==0) return null;
  const descriptors=Object.getOwnPropertyDescriptors(envelope);
  if(Object.values(descriptors).some(d=>!Object.prototype.hasOwnProperty.call(d,'value'))) return null;
  const out=Object.create(null);
  for(const field of [...SIGNED_FIELDS,...(includeSignature?['signature']:[])]){
    const value=Object.prototype.hasOwnProperty.call(descriptors,field)?descriptors[field].value:undefined;
    if(value!==null&&value!==undefined&&typeof value!=='string'&&
        !(typeof value==='number'&&Number.isFinite(value))) return null;
    out[field]=value;
  }
  return out;
}

function clean(value){ return String(value ?? '').trim(); }
function signedMessage(snapshot){
  return JSON.stringify({
    authorizationId:clean(snapshot.authorizationId),
    actionDigest:clean(snapshot.actionDigest).toLowerCase(),
    observedAt:clean(snapshot.observedAt),
    expiresAt:clean(snapshot.expiresAt),
    keyId:clean(snapshot.keyId)
  });
}
function authorizationMessage(envelope={}){
  const snapshot=stableEnvelope(envelope);
  if(!snapshot) throw new TypeError('invalid_authorization_envelope');
  return signedMessage(snapshot);
}

function publicKeyFingerprint(publicKeyPem){
  try{
    const key=crypto.createPublicKey(publicKeyPem);
    const der=key.export({type:'spki',format:'der'});
    return crypto.createHash('sha256').update(der).digest('hex');
  }catch{
    return null;
  }
}

function decodeCanonicalEd25519Signature(signature){
  if(typeof signature!=='string'||!signature) throw new Error('invalid_signature_encoding');
  if(signature.length%4!==0) throw new Error('invalid_signature_encoding');
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(signature)) throw new Error('invalid_signature_encoding');
  const bytes=Buffer.from(signature,'base64');
  if(bytes.length!==64||bytes.toString('base64')!==signature) throw new Error('invalid_signature_encoding');
  return bytes;
}

function verifyAuthorizationProof(envelope={},options={}){
  const snapshot=stableEnvelope(envelope,true);
  if(!snapshot) return {verified:false,keyId:null,fingerprint:null,reasons:['invalid_authorization_envelope']};
  const keyId=clean(snapshot.keyId);
  const signature=typeof snapshot.signature==='string'?snapshot.signature:'';
  const trustedPublicKeys=options.trustedPublicKeys||{};
  const stableTable=trustedPublicKeys&&typeof trustedPublicKeys==='object'&&!types.isProxy(trustedPublicKeys);
  const entry=stableTable?Object.getOwnPropertyDescriptor(trustedPublicKeys,keyId):null;
  // Never use prototype-inherited keys or accessor-based keys.
  const publicKeyPem=entry&&Object.prototype.hasOwnProperty.call(entry,'value')?entry.value:null;
  const reasons=[];
  if(!keyId) reasons.push('missing_key_id');
  if(!signature) reasons.push('missing_signature');
  if(!publicKeyPem) reasons.push('untrusted_authorizer_key');
  if(reasons.length) return {verified:false,keyId,fingerprint:null,reasons};

  let signatureBytes;
  try{ signatureBytes=decodeCanonicalEd25519Signature(signature); }
  catch{ return {verified:false,keyId,fingerprint:publicKeyFingerprint(publicKeyPem),reasons:['invalid_signature_encoding']}; }

  try{
    const ok=crypto.verify(null,Buffer.from(signedMessage(snapshot),'utf8'),publicKeyPem,signatureBytes);
    return {verified:ok,keyId,fingerprint:publicKeyFingerprint(publicKeyPem),reasons:ok?[]:['signature_verification_failed']};
  }catch{
    return {verified:false,keyId,fingerprint:null,reasons:['signature_verification_error']};
  }
}

module.exports={authorizationMessage,publicKeyFingerprint,decodeCanonicalEd25519Signature,verifyAuthorizationProof};
