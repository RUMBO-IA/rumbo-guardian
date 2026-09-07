const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {validId,sanitizeMetadata}=require('./authorization-replay-store.js');

const TERMINAL_EXECUTION_STATES=new Set(['SUCCEEDED','FAILED','FAILED_OR_UNKNOWN']);
const sha256=value=>/^[a-f0-9]{64}$/.test(String(value||'').toLowerCase());
const bounded=value=>typeof value==='string'&&value.length>0&&value.length<=200;

function busyResult(err){
  return String(err&&err.code||'').includes('SQLITE_BUSY')||/database is locked/i.test(String(err&&err.message||''));
}
function executionBinding(value={}){
  const binding={
    actionId:String(value.actionId||'').trim(),
    actionDigest:String(value.actionDigest||'').trim().toLowerCase(),
    tool:String(value.tool||'').trim(),
    effect:String(value.effect||'').trim().toLowerCase(),
    parametersDigest:String(value.parametersDigest||'').trim().toLowerCase()
  };
  if(!validId(binding.actionId)||!sha256(binding.actionDigest)||!bounded(binding.tool)||!bounded(binding.effect)||!sha256(binding.parametersDigest)) return null;
  return binding;
}
function sameBinding(row,binding){
  return !!row&&row.actionId===binding.actionId&&row.actionDigest===binding.actionDigest&&row.tool===binding.tool&&row.effect===binding.effect&&row.parametersDigest===binding.parametersDigest;
}

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
    this.db.exec(`CREATE TABLE IF NOT EXISTS execution_journal(
      authorization_id TEXT PRIMARY KEY REFERENCES consumed_authorizations(authorization_id),
      action_id TEXT NOT NULL,
      action_digest TEXT NOT NULL,
      tool TEXT NOT NULL,
      effect TEXT NOT NULL,
      parameters_digest TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('RESERVED','STARTED','SUCCEEDED','FAILED','FAILED_OR_UNKNOWN')),
      reserved_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      updated_at TEXT NOT NULL
    ) WITHOUT ROWID;`);
    this.insert=this.db.prepare(`INSERT INTO consumed_authorizations(
      authorization_id,consumed_at,action_digest,key_id,authorizer_fingerprint,correlation_id
    ) VALUES(?,?,?,?,?,?) ON CONFLICT(authorization_id) DO NOTHING`);
    this.select=this.db.prepare(`SELECT authorization_id AS authorizationId,consumed_at AS consumedAt,
      action_digest AS actionDigest,key_id AS keyId,authorizer_fingerprint AS authorizerFingerprint,
      correlation_id AS correlationId FROM consumed_authorizations WHERE authorization_id=?`);
    this.insertExecution=this.db.prepare(`INSERT INTO execution_journal(
      authorization_id,action_id,action_digest,tool,effect,parameters_digest,state,reserved_at,updated_at
    ) VALUES(?,?,?,?,?,?,'RESERVED',?,?)`);
    this.selectExecution=this.db.prepare(`SELECT authorization_id AS authorizationId,action_id AS actionId,
      action_digest AS actionDigest,tool,effect,parameters_digest AS parametersDigest,state,
      reserved_at AS reservedAt,started_at AS startedAt,finished_at AS finishedAt,updated_at AS updatedAt
      FROM execution_journal WHERE authorization_id=?`);
    this.claimExecutionStmt=this.db.prepare(`UPDATE execution_journal SET state='STARTED',started_at=?,updated_at=?
      WHERE authorization_id=? AND state='RESERVED'`);
    this.finishExecutionStmt=this.db.prepare(`UPDATE execution_journal SET state=?,finished_at=?,updated_at=?
      WHERE authorization_id=? AND state='STARTED'`);
    this.recoverInterruptedStmt=this.db.prepare(`UPDATE execution_journal SET state='FAILED_OR_UNKNOWN',finished_at=?,updated_at=?
      WHERE state='STARTED' AND started_at<=?`);
  }

  _begin(){ this.db.exec('BEGIN IMMEDIATE'); }
  _rollback(){ try{this.db.exec('ROLLBACK');}catch{} }
  _consumeInOpenTransaction(id,clean,consumedAt){
    return this.insert.run(id,consumedAt,clean.actionDigest??null,clean.keyId??null,clean.authorizerFingerprint??null,clean.correlationId??null);
  }

  consume(authorizationId,metadata={}){
    const id=String(authorizationId||'').trim();
    if(!validId(id)) return {consumed:false,reason:'invalid_authorization_id'};
    const clean=sanitizeMetadata(metadata);
    const consumedAt=new Date().toISOString();
    try{
      this._begin();
      const result=this._consumeInOpenTransaction(id,clean,consumedAt);
      if(Number(result.changes)!==1){
        this._rollback();
        return {consumed:false,reason:'authorization_replay_detected'};
      }
      this.db.exec('COMMIT');
      return {consumed:true,reason:null,entry:{...clean,authorizationId:id,consumedAt}};
    }catch(err){
      this._rollback();
      if(busyResult(err)) return {consumed:false,reason:'store_busy_fail_closed'};
      throw err;
    }
  }

  consumeWithExecution(authorizationId,metadata={},execution={}){
    const id=String(authorizationId||'').trim();
    if(!validId(id)) return {consumed:false,reason:'invalid_authorization_id'};
    const clean=sanitizeMetadata(metadata);
    const binding=executionBinding(execution);
    if(!binding) return {consumed:false,reason:'invalid_execution_binding'};
    if(clean.actionDigest&&clean.actionDigest!==binding.actionDigest) return {consumed:false,reason:'execution_action_digest_mismatch'};
    const now=new Date().toISOString();
    try{
      this._begin();
      const result=this._consumeInOpenTransaction(id,clean,now);
      if(Number(result.changes)!==1){
        this._rollback();
        return {consumed:false,reason:'authorization_replay_detected'};
      }
      this.insertExecution.run(id,binding.actionId,binding.actionDigest,binding.tool,binding.effect,binding.parametersDigest,now,now);
      this.db.exec('COMMIT');
      return {consumed:true,reason:null,entry:{...clean,authorizationId:id,consumedAt:now},execution:this.getExecution(id)};
    }catch(err){
      this._rollback();
      if(busyResult(err)) return {consumed:false,reason:'store_busy_fail_closed'};
      throw err;
    }
  }

  claimExecution(authorizationId,expectedBinding={}){
    const id=String(authorizationId||'').trim();
    const binding=executionBinding(expectedBinding);
    if(!validId(id)||!binding) return {claimed:false,reason:'invalid_execution_binding',execution:null};
    const now=new Date().toISOString();
    try{
      this._begin();
      const current=this.selectExecution.get(id)||null;
      if(!current){ this._rollback(); return {claimed:false,reason:'execution_not_found',execution:null}; }
      if(!sameBinding(current,binding)){ this._rollback(); return {claimed:false,reason:'execution_binding_mismatch',execution:current}; }
      const changed=this.claimExecutionStmt.run(now,now,id);
      if(Number(changed.changes)!==1){
        this._rollback();
        return {claimed:false,reason:current.state==='RESERVED'?'execution_claim_race_lost':'execution_not_resumable',execution:current};
      }
      this.db.exec('COMMIT');
      return {claimed:true,reason:null,execution:this.getExecution(id)};
    }catch(err){
      this._rollback();
      if(busyResult(err)) return {claimed:false,reason:'store_busy_fail_closed',execution:null};
      throw err;
    }
  }

  finishExecution(authorizationId,outcome){
    const id=String(authorizationId||'').trim();
    const state=String(outcome||'').trim().toUpperCase();
    if(!validId(id)||!['SUCCEEDED','FAILED'].includes(state)) return {finished:false,reason:'invalid_execution_outcome',execution:null};
    const now=new Date().toISOString();
    try{
      this._begin();
      const current=this.selectExecution.get(id)||null;
      if(!current){ this._rollback(); return {finished:false,reason:'execution_not_found',execution:null}; }
      const changed=this.finishExecutionStmt.run(state,now,now,id);
      if(Number(changed.changes)!==1){
        this._rollback();
        return {finished:false,reason:TERMINAL_EXECUTION_STATES.has(current.state)?'execution_already_terminal':'execution_not_started',execution:current};
      }
      this.db.exec('COMMIT');
      return {finished:true,reason:null,execution:this.getExecution(id)};
    }catch(err){
      this._rollback();
      if(busyResult(err)) return {finished:false,reason:'store_busy_fail_closed',execution:null};
      throw err;
    }
  }

  recoverInterruptedStarted(before){
    const beforeMs=Date.parse(String(before||''));
    if(!Number.isFinite(beforeMs)) return {recovered:false,reason:'invalid_recovery_cutoff',count:0};
    const cutoff=new Date(beforeMs).toISOString();
    const now=new Date().toISOString();
    try{
      this._begin();
      const changed=this.recoverInterruptedStmt.run(now,now,cutoff);
      this.db.exec('COMMIT');
      return {recovered:true,reason:null,count:Number(changed.changes)||0};
    }catch(err){
      this._rollback();
      if(busyResult(err)) return {recovered:false,reason:'store_busy_fail_closed',count:0};
      throw err;
    }
  }

  get(authorizationId){
    const id=String(authorizationId||'').trim();
    if(!validId(id)) return null;
    return this.select.get(id)||null;
  }

  getExecution(authorizationId){
    const id=String(authorizationId||'').trim();
    if(!validId(id)) return null;
    return this.selectExecution.get(id)||null;
  }

  close(){ this.db.close(); }
}

module.exports={SQLiteAuthorizationReplayStore,executionBinding,sameBinding,TERMINAL_EXECUTION_STATES};
