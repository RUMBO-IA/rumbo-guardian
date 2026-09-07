const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname),port=8766;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8'};
const publicAssets=new Map([
  ['/','index.html'],
  ['/index.html','index.html'],
  ['/styles.css','styles.css'],
  ['/guardian-core.js','guardian-core.js'],
  ['/evidence-chain.js','evidence-chain.js'],
  ['/app.js','app.js'],
  ['/manifest.webmanifest','manifest.webmanifest'],
  ['/sw.js','sw.js']
].map(([url,file])=>[url,path.join(root,file)]));

http.createServer((req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent((req.url||'/').split('?')[0]);}
  catch{res.writeHead(400);return res.end('Bad request');}
  if(pathname.split('/').includes('..')){res.writeHead(403);return res.end('Forbidden');}
  const file=publicAssets.get(pathname);
  if(!file){res.writeHead(404);return res.end('Not found');}
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404);return res.end('Not found');}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
}).listen(port,'127.0.0.1',()=>console.log(`RUMBO Guardian V0.3 · http://127.0.0.1:${port}/`));
