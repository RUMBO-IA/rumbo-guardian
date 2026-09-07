const crypto = require('node:crypto');

function clean(value){ return String(value ?? '').trim(); }

function authorizationMessage(envelope={}){
  return JSON.stringify({
    authorizationId: clean(envelope.authorizationId),
    actionDigest: clean(envelope.actionDigest).toLowerCase(),
    observedAt: clean(envelope.observedAt),
    expiresAt: clean(envelope.expiresAt),
    keyId: clean(envelope.keyId)
  });
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
  const keyId=clean(envelope.keyId);
  const signature=typeof envelope.signature==='string'?envelope.signature:'';
  const trustedPublicKeys=options.trustedPublicKeys||{};
  const publicKeyPem=trustedPublicKeys[keyId];
  const reasons=[];

  if(!keyId) reasons.push('missing_key_id');
  if(!signature) reasons.push('missing_signature');
  if(!publicKeyPem) reasons.push('untrusted_authorizer_key');
  if(reasons.length) return {verified:false,keyId,fingerprint:null,reasons};

  let signatureBytes;
  try{
    signatureBytes=decodeCanonicalEd25519Signature(signature);
  }catch{
    return {verified:false,keyId,fingerprint:publicKeyFingerprint(publicKeyPem),reasons:['invalid_signature_encoding']};
  }

  try{
    const ok=crypto.verify(null,Buffer.from(authorizationMessage(envelope),'utf8'),publicKeyPem,signatureBytes);
    return {
      verified:ok,
      keyId,
      fingerprint:publicKeyFingerprint(publicKeyPem),
      reasons:ok?[]:['signature_verification_failed']
    };
  }catch{
    return {verified:false,keyId,fingerprint:null,reasons:['signature_verification_error']};
  }
}

module.exports={authorizationMessage,publicKeyFingerprint,decodeCanonicalEd25519Signature,verifyAuthorizationProof};
