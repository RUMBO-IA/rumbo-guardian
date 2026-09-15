#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const root=path.resolve('registry/rumbo-guardian');
for(const f of ['product.json','state-machine.json','releases/1.0.0.json','releases/1.1.0-rc.1.json']) assert.ok(fs.existsSync(path.join(root,f)),`missing ${f}`);
const product=JSON.parse(fs.readFileSync(path.join(root,'product.json'),'utf8'));
const hist=JSON.parse(fs.readFileSync(path.join(root,'releases/1.0.0.json'),'utf8'));
const cand=JSON.parse(fs.readFileSync(path.join(root,'releases/1.1.0-rc.1.json'),'utf8'));
assert.equal(product.current_stable,null); assert.equal(product.current_candidate,'1.1.0-rc.1'); assert.notEqual(hist.state,'STABLE'); assert.equal(cand.predecessor,'1.0.0');
assert.equal(hist.source.commit_sha,'43bc3354924220ba76161891a1b48108ffda17b4'); assert.equal(hist.source.tree_sha,'c74c58df8fbc7ddd017e4ba18cceee1cfb08b5df'); assert.equal(hist.artifact.sha256,'1d81530ea463a1a59034ed772889712d103237ce6dc588903419eb13234f8eeb');
for(const r of [hist,cand]){assert.equal(r.authorization.production_go,false);assert.equal(r.authorization.publication_authorized,false);}
const run=(dir)=>spawnSync(process.execPath,['tools/validate-product-registry.mjs','--registry',dir],{encoding:'utf8'});
const fixture=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'rumbo-reg-'));fs.cpSync(root,d,{recursive:true});return d;};
for(const mutate of [
 d=>{const p=path.join(d,'releases/1.1.0-rc.1.json'),x=JSON.parse(fs.readFileSync(p));x.source.commit_sha='bad';fs.writeFileSync(p,JSON.stringify(x));},
 d=>{const p=path.join(d,'releases/1.1.0-rc.1.json'),x=JSON.parse(fs.readFileSync(p));x.predecessor='9.9.9';fs.writeFileSync(p,JSON.stringify(x));},
 d=>{const p=path.join(d,'releases/1.0.0.json'),x=JSON.parse(fs.readFileSync(p));x.predecessor='1.1.0-rc.1';fs.writeFileSync(p,JSON.stringify(x));},
 d=>{const p=path.join(d,'releases/1.1.0-rc.1.json'),x=JSON.parse(fs.readFileSync(p));x.state='MAGIC';fs.writeFileSync(p,JSON.stringify(x));},
 d=>{const p=path.join(d,'releases/1.1.0-rc.1.json'),x=JSON.parse(fs.readFileSync(p));x.authorization.production_go=true;fs.writeFileSync(p,JSON.stringify(x));},
 d=>{const p=path.join(d,'releases/1.1.0-rc.1.json'),x=JSON.parse(fs.readFileSync(p));x.authorization.publication_authorized=true;fs.writeFileSync(p,JSON.stringify(x));}
]){const d=fixture();try{mutate(d);assert.notEqual(run(d).status,0);}finally{fs.rmSync(d,{recursive:true,force:true});}}
console.log('product-registry policy PASS');
