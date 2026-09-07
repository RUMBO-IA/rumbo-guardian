const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {validId,sanitizeMetadata}=require('./authorization-replay-store.js');

class SQLiteAuthorizationReplayStore{
  constructor(filePath,options={}){
    this.filePath=path.resolve(filePath);
    this.timeout=Number.isFinite(options.timeout)?Math.max(0,options.timeout):5000;
    fs.mkdirSync(path.dirname(this.filePath),{recursive:true});
    this.db=new DatabaseSync(this.filePath,{timeout:this.timeout});
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS consumed_authorizations(
      authorization_id TEXT PRIMARY KEY,
      consumed_at TEXT NOT NULL,
      action_digest TEXT,
      key_id TEXT,
      authorizer_fingerprint TEXT,
      correlation_id TEXT
    ) WITHOUT ROWID;`);
    this.insert=this.db.prepare(`INSERT INTO consumed_authorizations(
      authorization_id,consumed_at,action_digest,key_id,authorizer_fingerprint,correlation_id
    ) VALUES(?,?,?,?,?,?) ON CONFLICT(authorization_id) DO NOTHING`);
    this.select=this.db.prepare(`SELECT authorization_id AS authorizationId,consumed_at AS consumedAt,
      action_digest AS actionDigest,key_id AS keyId,authorizer_fingerprint AS authorizerFingerprint,
      correlation_id AS correlationId FROM consumed_authorizations WHERE authorization_id=?`);
  }

  consume(authorizationId,metadata={}){
    const id=String(authorizationId||'').trim();
    if(!validId(id)) return {consumed:false,reason:'invalid_authorization_id'};
    const clean=sanitizeMetadata(metadata);
    const consumedAt=new Date().toISOString();
    try{
      this.db.exec('BEGIN IMMEDIATE');
      const result=this.insert.run(id,consumedAt,clean.actionDigest??null,clean.keyId??null,clean.authorizerFingerprint??null,clean.correlationId??null);
      if(Number(result.changes)!==1){
        this.db.exec('ROLLBACK');
        return {consumed:false,reason:'authorization_replay_detected'};
      }
      this.db.exec('COMMIT');
      return {consumed:true,reason:null,entry:{...clean,authorizationId:id,consumedAt}};
    }catch(err){
      try{this.db.exec('ROLLBACK');}catch{}
      if(String(err&&err.code||'').includes('SQLITE_BUSY')||/database is locked/i.test(String(err&&err.message||''))) return {consumed:false,reason:'store_busy_fail_closed'};
      throw err;
    }
  }

  get(authorizationId){
    const id=String(authorizationId||'').trim();
    if(!validId(id)) return null;
    return this.select.get(id)||null;
  }

  close(){ this.db.close(); }
}

module.exports={SQLiteAuthorizationReplayStore};
