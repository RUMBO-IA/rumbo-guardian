const fs=require('node:fs');
const path=require('node:path');

function validId(value){ return /^[A-Za-z0-9._:-]{1,200}$/.test(String(value||'')); }
function boundedText(value,max=512){
  if(value===undefined||value===null) return null;
  const text=String(value);
  return text.length<=max?text:null;
}
function sanitizeMetadata(metadata={}){
  const out={};
  for(const key of ['actionDigest','keyId','authorizerFingerprint','correlationId']){
    const value=boundedText(metadata[key]);
    if(value!==null) out[key]=value;
  }
  return out;
}

class FileAuthorizationReplayStore{
  constructor(filePath){
    this.filePath=path.resolve(filePath);
    this.lockPath=this.filePath+'.lock';
  }

  _readEntries(){
    let text='';
    try{text=fs.readFileSync(this.filePath,'utf8');}
    catch(err){ if(err.code==='ENOENT') return []; throw err; }
    if(!text) return [];
    const entries=[];
    for(const [index,line] of text.split('\n').entries()){
      if(!line.trim()) continue;
      let parsed;
      try{parsed=JSON.parse(line);}catch{throw new Error(`replay_store_corrupt_line_${index+1}`);}
      if(!parsed||!validId(parsed.authorizationId)) throw new Error(`replay_store_invalid_entry_${index+1}`);
      entries.push(parsed);
    }
    return entries;
  }

  consume(authorizationId,metadata={}){
    const id=String(authorizationId||'').trim();
    if(!validId(id)) return {consumed:false,reason:'invalid_authorization_id'};
    fs.mkdirSync(path.dirname(this.filePath),{recursive:true});
    let lockFd;
    try{
      lockFd=fs.openSync(this.lockPath,'wx',0o600);
      fs.writeFileSync(lockFd,JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));
      fs.fsyncSync(lockFd);
    }catch(err){
      if(lockFd!==undefined) try{fs.closeSync(lockFd);}catch{}
      if(err.code==='EEXIST') return {consumed:false,reason:'store_busy_fail_closed'};
      throw err;
    }

    try{
      const entries=this._readEntries();
      if(entries.some(entry=>entry.authorizationId===id)) return {consumed:false,reason:'authorization_replay_detected'};
      const entry={...sanitizeMetadata(metadata),authorizationId:id,consumedAt:new Date().toISOString()};
      const fd=fs.openSync(this.filePath,'a',0o600);
      try{
        fs.writeSync(fd,JSON.stringify(entry)+'\n',null,'utf8');
        fs.fsyncSync(fd);
      }finally{fs.closeSync(fd);}
      return {consumed:true,reason:null,entry};
    }finally{
      try{fs.closeSync(lockFd);}catch{}
      try{fs.unlinkSync(this.lockPath);}catch{}
    }
  }
}

module.exports={FileAuthorizationReplayStore,validId,sanitizeMetadata};
