const {spawnSync}=require('node:child_process');

const PROBE_SOURCE=String.raw`
const fs=require('node:fs');
const cp=require('node:child_process');
const {Worker}=require('node:worker_threads');
const net=require('node:net');
const out={node:process.version,permissionModel:Boolean(process.permission)};
function denied(fn){
  try{fn();return false;}catch(err){return Boolean(err&&err.code==='ERR_ACCESS_DENIED');}
}
out.fsDenied=denied(()=>fs.readFileSync('/etc/hosts','utf8'));
out.childDenied=denied(()=>cp.spawnSync(process.execPath,['-e','process.exit(0)']));
out.workerDenied=denied(()=>new Worker('0',{eval:true}));
const server=net.createServer();
server.once('error',err=>{
  out.networkDenied=Boolean(err&&err.code==='ERR_ACCESS_DENIED');
  out.hardConfinement=out.fsDenied&&out.childDenied&&out.workerDenied&&out.networkDenied;
  console.log(JSON.stringify(out));
});
server.listen(0,'127.0.0.1',()=>{
  out.networkDenied=false;
  out.hardConfinement=false;
  server.close(()=>console.log(JSON.stringify(out)));
});
`;

function runNodePermissionProbe(options={}){
  const executable=options.executable||process.execPath;
  const result=spawnSync(executable,['--permission','-e',PROBE_SOURCE],{
    encoding:'utf8',
    timeout:options.timeoutMs||5000,
    env:{PATH:process.env.PATH||''}
  });
  if(result.error) return {available:false,hardConfinement:false,reason:'probe_spawn_error',error:String(result.error.message||result.error)};
  if(result.status!==0) return {available:false,hardConfinement:false,reason:'permission_probe_failed',status:result.status,stderr:String(result.stderr||'').trim()};
  const lines=String(result.stdout||'').trim().split(/\r?\n/).filter(Boolean);
  if(!lines.length) return {available:false,hardConfinement:false,reason:'permission_probe_no_output'};
  try{
    const parsed=JSON.parse(lines.at(-1));
    return {available:true,...parsed,reason:parsed.hardConfinement?null:'partial_confinement_only'};
  }catch(err){
    return {available:false,hardConfinement:false,reason:'permission_probe_invalid_output',error:String(err.message||err)};
  }
}

module.exports={runNodePermissionProbe,PROBE_SOURCE};
