const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {SQLiteAuthorizationReplayStore}=require('../sqlite-authorization-replay-store-v9.js');

if(process.argv[2]==='worker'){
  const dbPath=process.argv[3];
  const id=process.argv[4];
  const timeout=Number(process.argv[5]||5000);
  try{
    const store=new SQLiteAuthorizationReplayStore(dbPath,{timeout});
    const result=store.consume(id,{actionDigest:'a'.repeat(64),keyId:'operator-1',correlationId:`pid-${process.pid}`});
    store.close();
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  }catch(err){
    process.stdout.write(JSON.stringify({consumed:false,reason:'worker_error',error:String(err&&err.message||err)}));
    process.exit(0);
  }
}

function runWorker(dbPath,id,timeout=5000){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[__filename,'worker',dbPath,id,String(timeout)],{stdio:['ignore','pipe','pipe']});
    let out='',err='';
    child.stdout.on('data',d=>out+=d);
    child.stderr.on('data',d=>err+=d);
    child.on('error',reject);
    child.on('close',code=>{
      if(code!==0) return reject(new Error(`worker_exit_${code}:${err}`));
      try{resolve(JSON.parse(out));}catch(e){reject(new Error(`worker_bad_json:${out}:${err}`));}
    });
  });
}

async function main(){
  let passed=0;const ok=()=>passed++;
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rumbo-replay-v9-'));
  try{
    const dbPath=path.join(tmp,'replay.sqlite');
    const init=new SQLiteAuthorizationReplayStore(dbPath);init.close();

    {
      const results=await Promise.all(Array.from({length:16},()=>runWorker(dbPath,'same-authorization')));
      assert.equal(results.filter(x=>x.consumed).length,1);
      assert.equal(results.filter(x=>!x.consumed&&x.reason==='authorization_replay_detected').length,15);
      const verify=new SQLiteAuthorizationReplayStore(dbPath);
      assert.equal(verify.get('same-authorization').authorizationId,'same-authorization');
      verify.close();ok();
    }

    {
      const ids=Array.from({length:16},(_,i)=>`distinct-${i}`);
      const results=await Promise.all(ids.map(id=>runWorker(dbPath,id)));
      assert.equal(results.filter(x=>x.consumed).length,16);ok();
    }

    {
      const store=new SQLiteAuthorizationReplayStore(dbPath);
      const result=store.consume('authoritative',{authorizationId:'overwrite',consumedAt:'1900-01-01',actionDigest:'abc',evil:'persist'});
      assert.equal(result.consumed,true);
      assert.equal(result.entry.authorizationId,'authoritative');
      assert.notEqual(result.entry.consumedAt,'1900-01-01');
      assert.equal(result.entry.actionDigest,'abc');
      assert.equal('evil' in result.entry,false);
      store.close();ok();
    }

    {
      const blocker=new DatabaseSync(dbPath,{timeout:0});
      blocker.exec('BEGIN IMMEDIATE');
      const result=await runWorker(dbPath,'busy-id',0);
      blocker.exec('ROLLBACK');blocker.close();
      assert.equal(result.consumed,false);
      assert.equal(result.reason,'store_busy_fail_closed');ok();
    }

    {
      const store=new SQLiteAuthorizationReplayStore(dbPath);
      assert.deepEqual(store.consume('bad id with spaces'),{consumed:false,reason:'invalid_authorization_id'});
      store.close();ok();
    }

    assert.equal(passed,5);
    console.log('RUMBO SQLite Replay V9: 5/5 PASS + 16-way same-ID race + 16 distinct-ID writers');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}

if(process.argv[2]!=='worker') main().catch(err=>{console.error(err);process.exit(1);});
