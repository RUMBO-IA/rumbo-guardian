#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a,v,i,x)=>{ if(v.startsWith('--')) a.push([v.slice(2),x[i+1]]); return a; },[]));
const errors=[];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hex40=v=>typeof v==='string'&&/^[0-9a-f]{40}$/.test(v);
const hex64=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const semver=v=>typeof v==='string'&&/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(v);
const add=e=>errors.push(e);
try {
 const root=args.registry; if(!root) throw new Error('missing --registry');
 const product=read(path.join(root,'product.json')); const sm=read(path.join(root,'state-machine.json'));
 const releasesDir=path.join(root,'releases'); const files=fs.readdirSync(releasesDir).filter(f=>f.endsWith('.json')).sort();
 const releases=new Map(files.map(f=>{const r=read(path.join(releasesDir,f));return [r.version,r];}));
 if(product.schema!=='rumbo.product-registry.product/v1'||product.id!=='rumbo-guardian') add('invalid product registry identity');
 if(product.production_authority!==false) add('production authority must be false');
 if(!Array.isArray(sm.active_progression)) add('invalid state machine');
 for(const [v,r] of releases){
  if(r.schema!=='rumbo.product-registry.release/v1'||r.product!=='rumbo-guardian') add(`invalid release identity: ${v}`);
  if(!semver(v)) add(`invalid semantic version: ${v}`);
  if(!sm.active_progression?.includes(r.state)&&!sm.terminal_states?.includes(r.state)) add(`unknown state: ${v}:${r.state}`);
  if(!hex40(r.source?.commit_sha)) add(`invalid source commit: ${v}`);
  if(r.source?.tree_sha!==undefined&&!hex40(r.source.tree_sha)) add(`invalid source tree: ${v}`);
  if(r.artifact?.sha256!==null&&r.artifact?.sha256!==undefined&&!hex64(r.artifact.sha256)) add(`invalid artifact sha256: ${v}`);
  if(r.authorization?.production_go!==false) add(`production_go must be false: ${v}`);
  if(r.authorization?.publication_authorized!==false) add(`publication_authorized must be false: ${v}`);
  if(r.predecessor!==null&&!releases.has(r.predecessor)) add(`missing predecessor: ${v}:${r.predecessor}`);
 }
 for(const [v] of releases){let seen=new Set();let cur=v;while(cur!==null){if(seen.has(cur)){add(`lineage cycle: ${v}`);break;}seen.add(cur);cur=releases.get(cur)?.predecessor??null;}}
 const hist=releases.get('1.0.0'); if(!hist) add('missing historical baseline 1.0.0'); else {
  if(hist.state==='STABLE') add('historical baseline must not be STABLE');
  if(hist.source.commit_sha!=='43bc3354924220ba76161891a1b48108ffda17b4') add('historical commit mismatch');
  if(hist.source.tree_sha!=='c74c58df8fbc7ddd017e4ba18cceee1cfb08b5df') add('historical tree mismatch');
  if(hist.artifact.sha256!=='1d81530ea463a1a59034ed772889712d103237ce6dc588903419eb13234f8eeb') add('historical artifact mismatch');
 }
 const cand=releases.get(product.current_candidate); if(!cand) add('current candidate missing'); else if(cand.predecessor!=='1.0.0') add('candidate predecessor mismatch');
 if(args.package&&args.product&&args.extension&&args.tauri&&args.cargo){
  const pkg=read(args.package), pc=read(args.product), ext=read(args.extension), tauri=read(args.tauri); const cargo=fs.readFileSync(args.cargo,'utf8').match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const expected=product.current_candidate; for(const [name,val] of [['package',pkg.version],['product',pc.version],['extension',ext.version],['tauri',tauri.version],['cargo',cargo]]) if(val!==expected) add(`candidate version mismatch: ${name}=${val} expected=${expected}`);
 }
} catch(e){add(`validator error: ${e.message}`);}
errors.sort(); console.log(JSON.stringify({ok:errors.length===0,errors},null,2)); if(errors.length) process.exit(1);
