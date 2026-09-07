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

function verifyAuthorizationProof(envelope={},options={}){
  const keyId=clean(envelope.keyId);
  const signature=clean(envelope.signature);
  const trustedPublicKeys=options.trustedPublicKeys||{};
  const publicKeyPem=trustedPublicKeys[keyId];
  const reasons=[];

  if(!keyId) reasons.push('missing_key_id');
  if(!signature) reasons.push('missing_signature');
  if(!publicKeyPem) reasons.push('untrusted_authorizer_key');
  if(reasons.length) return {verified:false,keyId,fingerprint:null,reasons};

  let signatureBytes;
  try{
    signatureBytes=Buffer.from(signature,'base64');
    if(!signatureBytes.length) throw new Error('empty');
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

module.exports={authorizationMessage,publicKeyFingerprint,verifyAuthorizationProof};
