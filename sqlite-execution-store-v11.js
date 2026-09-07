const {SQLiteAuthorizationReplayStore,executionBinding}=require('./sqlite-authorization-replay-store-v9.js');

const validId=value=>/^[A-Za-z0-9._:-]{1,200}$/.test(String(value||''));
const sha256=value=>/^[a-f0-9]{64}$/.test(String(value||'').toLowerCase());
const validKey=value=>/^rumbo-v11-[a-f0-9]{64}$/.test(String(value||''));

class SQLiteExecutionStoreV11 extends SQLiteAuthorizationReplayStore{
  constructor(filePath,options={}){
    super(filePath,options);
    this.db.exec(`CREATE TABLE IF NOT EXISTS destination_idempotency(
      authorization_id TEXT PRIMARY KEY REFERENCES execution_journal(authorization_id),
      adapter_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      capability_digest TEXT,
      provider_conformance_profile_digest TEXT,
      state TEXT NOT NULL CHECK(state IN ('PENDING','SUCCEEDED','FAILED','FAILED_OR_UNKNOWN')),
      evidence_digest TEXT,
      updated_at TEXT NOT NULL
    ) WITHOUT ROWID;`);
    const columns=this.db.prepare(`PRAGMA table_info(destination_idempotency)`).all();
    if(!columns.some(column=>column.name==='capability_digest')) this.db.exec(`ALTER TABLE destination_idempotency ADD COLUMN capability_digest TEXT`);
    if(!columns.some(column=>column.name==='provider_conformance_profile_digest')) this.db.exec(`ALTER TABLE destination_idempotency ADD COLUMN provider_conformance_profile_digest TEXT`);
    this.insertDestination=this.db.prepare(`INSERT INTO destination_idempotency(
      authorization_id,adapter_id,idempotency_key,capability_digest,provider_conformance_profile_digest,state,updated_at
    ) VALUES(?,?,?,?,?,'PENDING',?)`);
    this.selectDestination=this.db.prepare(`SELECT authorization_id AS authorizationId,adapter_id AS adapterId,
      idempotency_key AS idempotencyKey,capability_digest AS capabilityDigest,
      provider_conformance_profile_digest AS providerConformanceProfileDigest,
      state,evidence_digest AS evidenceDigest,updated_at AS updatedAt
      FROM destination_idempotency WHERE authorization_id=?`);
    this.finishDestination=this.db.prepare(`UPDATE destination_idempotency SET state=?,evidence_digest=?,updated_at=?
      WHERE authorization_id=? AND state='PENDING'`);
    this.finishExecutionAny=this.db.prepare(`UPDATE execution_journal SET state=?,finished_at=?,updated_at=?
      WHERE authorization_id=? AND state IN ('STARTED','FAILED_OR_UNKNOWN')`);
    this.markUnknownStmt=this.db.prepare(`UPDATE execution_journal SET state='FAILED_OR_UNKNOWN',finished_at=?,updated_at=?
      WHERE authorization_id=? AND state='STARTED'`);
  }

  consumeWithExecution(authorizationId,metadata={},execution={}){
    if(!execution.destination) return super.consumeWithExecution(authorizationId,metadata,execution);
    const id=String(authorizationId||'').trim();
    const binding=executionBinding(execution);
    const adapterId=String(execution.destination.adapterId||'').trim();
    const idempotencyKey=String(execution.destination.idempotencyKey||'').trim();
    const capabilityDigest=execution.destination.capabilityDigest==null?null:String(execution.destination.capabilityDigest).trim().toLowerCase();
    const providerConformanceProfileDigest=execution.destination.providerConformanceProfileDigest==null?null:String(execution.destination.providerConformanceProfileDigest).trim().toLowerCase();
    if(!validId(id)) return {consumed:false,reason:'invalid_authorization_id'};
    if(!binding) return {consumed:false,reason:'invalid_execution_binding'};
    if(!validId(adapterId)||!validKey(idempotencyKey)||(capabilityDigest!==null&&!sha256(capabilityDigest))||(providerConformanceProfileDigest!==null&&!sha256(providerConformanceProfileDigest))) return {consumed:false,reason:'invalid_destination_binding'};
    const clean=require('./authorization-replay-store.js').sanitizeMetadata(metadata);
    if(clean.actionDigest&&clean.actionDigest!==binding.actionDigest) return {consumed:false,reason:'execution_action_digest_mismatch'};
    const now=new Date().toISOString();
    try{
      this._begin();
      const result=this._consumeInOpenTransaction(id,clean,now);
      if(Number(result.changes)!==1){this._rollback();return {consumed:false,reason:'authorization_replay_detected'};}
      this.insertExecution.run(id,binding.actionId,binding.actionDigest,binding.tool,binding.effect,binding.implementationId,binding.parametersDigest,now,now);
      this.insertDestination.run(id,adapterId,idempotencyKey,capabilityDigest,providerConformanceProfileDigest,now);
      this.db.exec('COMMIT');
      return {consumed:true,reason:null,entry:{...clean,authorizationId:id,consumedAt:now},execution:this.getExecution(id),destination:this.getDestination(id)};
    }catch(err){
      this._rollback();
      if(String(err&&err.code||'').includes('SQLITE_BUSY')||/database is locked/i.test(String(err&&err.message||''))) return {consumed:false,reason:'store_busy_fail_closed'};
      throw err;
    }
  }

  getDestination(authorizationId){
    const id=String(authorizationId||'').trim();
    if(!validId(id)) return null;
    return this.selectDestination.get(id)||null;
  }

  markExecutionUnknown(authorizationId){
    const id=String(authorizationId||'').trim();
    if(!validId(id)) return {marked:false,reason:'invalid_authorization_id'};
    const now=new Date().toISOString();
    try{
      this._begin();
      const execution=this.getExecution(id),destination=this.getDestination(id);
      if(!execution||!destination){this._rollback();return {marked:false,reason:'destination_execution_not_found'};}
      if(execution.state==='FAILED_OR_UNKNOWN'&&destination.state==='PENDING'){this._rollback();return {marked:true,reason:null,execution,destination};}
      const changed=this.markUnknownStmt.run(now,now,id);
      if(Number(changed.changes)!==1){this._rollback();return {marked:false,reason:'execution_not_started',execution,destination};}
      this.db.exec('COMMIT');
      return {marked:true,reason:null,execution:this.getExecution(id),destination:this.getDestination(id)};
    }catch(err){
      this._rollback();
      if(String(err&&err.code||'').includes('SQLITE_BUSY')||/database is locked/i.test(String(err&&err.message||''))) return {marked:false,reason:'store_busy_fail_closed'};
      throw err;
    }
  }

  finishDestinationExecution(authorizationId,outcome,evidenceDigest=null){
    const id=String(authorizationId||'').trim();
    const state=String(outcome||'').trim().toUpperCase();
    if(!validId(id)||!['SUCCEEDED','FAILED','FAILED_OR_UNKNOWN'].includes(state)) return {finished:false,reason:'invalid_destination_outcome'};
    if(evidenceDigest!==null&&!sha256(evidenceDigest)) return {finished:false,reason:'invalid_evidence_digest'};
    const now=new Date().toISOString();
    try{
      this._begin();
      const execution=this.getExecution(id),destination=this.getDestination(id);
      if(!execution||!destination){this._rollback();return {finished:false,reason:'destination_execution_not_found'};}
      if(['SUCCEEDED','FAILED'].includes(execution.state)||destination.state!=='PENDING'){this._rollback();return {finished:false,reason:'destination_execution_already_terminal',execution,destination};}
      if(!['STARTED','FAILED_OR_UNKNOWN'].includes(execution.state)){this._rollback();return {finished:false,reason:'destination_execution_not_finishable',execution,destination};}
      const e=this.finishExecutionAny.run(state,now,now,id);
      const d=this.finishDestination.run(state,evidenceDigest,now,id);
      if(Number(e.changes)!==1||Number(d.changes)!==1){this._rollback();return {finished:false,reason:'destination_finalize_race_lost'};}
      this.db.exec('COMMIT');
      return {finished:true,reason:null,execution:this.getExecution(id),destination:this.getDestination(id)};
    }catch(err){
      this._rollback();
      if(String(err&&err.code||'').includes('SQLITE_BUSY')||/database is locked/i.test(String(err&&err.message||''))) return {finished:false,reason:'store_busy_fail_closed'};
      throw err;
    }
  }
}

module.exports={SQLiteExecutionStoreV11};
