(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.RumboGuardianEvidenceChain=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const GENESIS_HASH='0'.repeat(64);

  function stable(value){
    if(Array.isArray(value))return value.map(stable);
    if(value&&typeof value==='object'){
      return Object.keys(value).sort().reduce((out,key)=>{out[key]=stable(value[key]);return out;},{});
    }
    return value;
  }

  function payload(entry){
    const copy={...entry};
    delete copy.entryHash;
    return JSON.stringify(stable(copy));
  }

  async function sha256(text){
    const bytes=new TextEncoder().encode(text);
    const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  }

  async function appendEntry(chain,entry){
    const current=Array.isArray(chain)?chain.slice():[];
    const previous=current.at(-1)?.entryHash||GENESIS_HASH;
    const record={...entry,sequence:current.length+1,previousHash:previous};
    record.entryHash=await sha256(payload(record));
    current.push(record);
    return current;
  }

  async function buildChain(entries){
    let chain=[];
    for(const source of (Array.isArray(entries)?entries:[])){
      const clean={...source};
      delete clean.sequence;delete clean.previousHash;delete clean.entryHash;
      chain=await appendEntry(chain,clean);
    }
    return chain;
  }

  async function verifyChain(chain){
    if(!Array.isArray(chain))return {valid:false,entries:0,brokenAt:1};
    let previous=GENESIS_HASH;
    for(let i=0;i<chain.length;i++){
      const entry=chain[i];
      const expectedHash=await sha256(payload(entry));
      if(entry.sequence!==i+1||entry.previousHash!==previous||entry.entryHash!==expectedHash){
        return {valid:false,entries:chain.length,brokenAt:i+1};
      }
      previous=entry.entryHash;
    }
    return {valid:true,entries:chain.length,brokenAt:null};
  }

  return {GENESIS_HASH,appendEntry,buildChain,verifyChain};
});
