const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname),port=8766;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8'};

function isWithinRoot(file){
  const relative=path.relative(root,file);
  return relative!==''&&!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative);
}

http.createServer((req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent((req.url||'/').split('?')[0]);}
  catch{res.writeHead(400);return res.end('Bad request');}
  const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
  const file=path.resolve(root,relative);
  if(!isWithinRoot(file)){res.writeHead(403);return res.end('Forbidden');}
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404);return res.end('Not found');}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
}).listen(port,'127.0.0.1',()=>console.log(`RUMBO Guardian V0.3 · http://127.0.0.1:${port}/`));
