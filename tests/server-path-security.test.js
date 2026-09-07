const assert=require('assert');
const fs=require('fs');
const net=require('net');
const path=require('path');
const {spawn}=require('child_process');

const root=path.resolve(__dirname,'..');
const sibling=path.join(path.dirname(root),`${path.basename(root)}-escape-${process.pid}`);
const linkName=`server-link-escape-${process.pid}`;
const linkPath=path.join(root,linkName);
const secret='RUMBO_SERVER_BOUNDARY_TEST_SECRET';
fs.mkdirSync(sibling,{recursive:true});
fs.writeFileSync(path.join(sibling,'secret.txt'),secret);
let symlinkCreated=false;
try{
  fs.symlinkSync(sibling,linkPath,process.platform==='win32'?'junction':'dir');
  symlinkCreated=true;
}catch(error){
  if(process.platform!=='win32')throw error;
}

const child=spawn(process.execPath,['server.js'],{cwd:root,stdio:['ignore','pipe','pipe']});
let stderr='';
child.stderr.on('data',chunk=>{stderr+=chunk});

function rawRequest(requestPath){
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection({host:'127.0.0.1',port:8766});
    let data='';
    socket.setEncoding('utf8');
    socket.on('connect',()=>socket.write(`GET ${requestPath} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`));
    socket.on('data',chunk=>{data+=chunk});
    socket.on('end',()=>resolve(data));
    socket.on('error',reject);
  });
}

async function waitForServer(){
  for(let i=0;i<40;i++){
    try{
      const response=await rawRequest('/');
      if(response.startsWith('HTTP/1.1 200'))return;
    }catch{}
    await new Promise(r=>setTimeout(r,50));
  }
  throw new Error(`server did not become ready: ${stderr}`);
}

(async()=>{
  try{
    await waitForServer();

    const escapedName=path.basename(sibling);
    const traversal=await rawRequest(`/%2e%2e/${encodeURIComponent(escapedName)}/secret.txt`);
    assert.ok(traversal.startsWith('HTTP/1.1 403'),`encoded traversal must be rejected, got: ${traversal.split('\r\n')[0]}`);
    assert.ok(!traversal.includes(secret),'response must not disclose sibling file content');

    if(symlinkCreated){
      const symlinkEscape=await rawRequest(`/${encodeURIComponent(linkName)}/secret.txt`);
      assert.ok(symlinkEscape.startsWith('HTTP/1.1 403'),`symlink escape must be rejected, got: ${symlinkEscape.split('\r\n')[0]}`);
      assert.ok(!symlinkEscape.includes(secret),'response must not disclose symlink target content');
    }

    const malformed=await rawRequest('/%E0');
    assert.ok(malformed.startsWith('HTTP/1.1 400'),`malformed percent-encoding must return 400, got: ${malformed.split('\r\n')[0]}`);

    const afterMalformed=await rawRequest('/');
    assert.ok(afterMalformed.startsWith('HTTP/1.1 200'),'server must remain alive after malformed path input');

    console.log('RUMBO Guardian server path-security tests: PASS');
  }finally{
    child.kill();
    if(symlinkCreated)fs.rmSync(linkPath,{force:true});
    fs.rmSync(sibling,{recursive:true,force:true});
  }
})().catch(error=>{
  child.kill();
  if(symlinkCreated)fs.rmSync(linkPath,{force:true});
  fs.rmSync(sibling,{recursive:true,force:true});
  console.error(error);
  process.exitCode=1;
});
