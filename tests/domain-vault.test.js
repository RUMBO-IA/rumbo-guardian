'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const Vault = require('../domain-vault.js');
const root = path.join(__dirname, '..');
const vaultSource = fs.readFileSync(path.join(root,'domain-vault.js'),'utf8');
const appSource = fs.readFileSync(path.join(root,'app.js'),'utf8');
const password = 'correct horse battery staple RUMBO!';

function browser(initial={}) {
  const items = new Map(Object.entries(initial));
  const nodes = new Map();
  const element = id => {
    if(!nodes.has(id)){
      const handlers = {};
      nodes.set(id,{
        id, value:'',innerHTML:'',textContent:'',className:'',dataset:{},
        disabled:false,handlers,style:{},
        classList:{add(){},remove(){}},
        addEventListener(name,fn){handlers[name]=fn;},
        focus(){},click(){}
      });
    }
    return nodes.get(id);
  };
  const ctx = vm.createContext({
    crypto:webcrypto, TextEncoder,TextDecoder, atob,btoa,
    setTimeout,clearTimeout,console,
    localStorage:{
      getItem:k=>items.has(k)?items.get(k):null,
      setItem:(k,v)=>items.set(k,String(v)),
      removeItem:k=>items.delete(k)
    },
    document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>({click(){}})},
    window:{confirm:()=>true,addEventListener(){}},
    navigator:{},
    location:{search:'',protocol:'file:'},
    URL,URLSearchParams, Blob,
    RumboGuardianCore:{
      normalizeDomain:x=>String(x).trim().toLowerCase(),
      analyzeMessage:()=>({score:0,level:'safe',label:'Seguro',reasons:[],links:[],guide:'',verdict:''})
    },
    RumboGuardianEvidenceChain:{
      verifyChain:async()=>({valid:true}),
      buildChain:async entries=>entries,
      appendEntry:async(entries,item)=>[...entries,item]
    }
  });
  // The production browser loads the vault script before app.js.
  vm.runInContext(vaultSource,ctx,{filename:'domain-vault.js'});
  vm.runInContext(appSource,ctx,{filename:'app.js'});
  return {items,nodes,ctx,element,eval:code=>vm.runInContext(code,ctx)};
}

(async()=>{
  assert.rejects(Vault.create('short',{trusted:[],blocked:[]}),/al menos 12/);
  const initial={trusted:['example.private'],blocked:['phishing.example']};
  const first=await Vault.create(password,initial);
  assert.equal(first.record.version,1);
  assert.equal(first.record.kdf,'PBKDF2-SHA256');
  assert.equal(first.record.iterations,310000);
  assert.equal(first.key.extractable,false);
  assert.equal(JSON.stringify(first.record).includes('example.private'),false);
  assert.equal(JSON.stringify(first.record).includes(password),false);
  assert.deepStrictEqual((await Vault.open(password,first.record)).lists,initial);
  await assert.rejects(Vault.open('wrong password 123',first.record));
  const tampered={...first.record,ciphertext:first.record.ciphertext.slice(0,-4)+'AAAA'};
  await assert.rejects(Vault.open(password,tampered));
  assert.notEqual((await Vault.seal(initial,first.key,first.salt)).iv,first.record.iv);
  await assert.rejects(Vault.open(password,{...first.record,iterations:1}),/Versión/);
  await assert.rejects(Vault.open(password,{...first.record,salt:'AA=='}),/Estructura/);
  assert.deepStrictEqual(Vault.cleanLists({trusted:['same.test'],blocked:['same.test']}),{trusted:[],blocked:['same.test']});

  const legacy='rumboGuardianDomainListsV03';
  const encrypted='rumboGuardianDomainVaultV1';
  const b=browser({[legacy]:JSON.stringify(initial)});
  assert.equal(b.items.has(legacy),true,'migration must not erase legacy before encrypted readback');
  assert.equal(b.eval('getLists().trusted[0]'),'example.private');
  assert.match(b.element('vaultStatus').textContent,/antiguas sin cifrar/);
  b.element('vaultPassphrase').value='invalid';
  await b.eval('unlockOrCreateVault()');
  assert.equal(b.items.has(legacy),true,'short passphrase must not erase legacy');
  assert.equal(b.items.has(encrypted),false);
  b.element('vaultPassphrase').value=password;
  await b.eval('unlockOrCreateVault()');
  assert.equal(b.items.has(legacy),false,'plaintext removed only after round-trip verification');
  assert.ok(b.items.has(encrypted));
  const persisted=b.items.get(encrypted);
  assert.equal(persisted.includes('example.private'),false);
  assert.deepStrictEqual((await Vault.open(password,JSON.parse(persisted))).lists,initial);
  assert.equal(b.element('vaultPassphrase').value,'','passphrase input wiped');
  assert.equal(b.eval('getLists().trusted[0]'),'example.private');

  b.element('domainInput').value='added.example';
  b.eval("addDomain('trusted')");
  await b.eval('state.vaultQueue');
  assert.deepStrictEqual((await Vault.open(password,JSON.parse(b.items.get(encrypted)))).lists.trusted,
    ['added.example','example.private']);
  await b.eval('lockVault()');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(b.eval('getLists()'))),{trusted:[],blocked:[]});
  assert.ok(b.items.has(encrypted),'lock must not destroy ciphertext');

  // A new tab cannot recover plaintext without the user passphrase.
  const c=browser(Object.fromEntries(b.items));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c.eval('getLists()'))),{trusted:[],blocked:[]});
  c.element('vaultPassphrase').value='wrong passphrase';
  await c.eval('unlockOrCreateVault()');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c.eval('getLists()'))),{trusted:[],blocked:[]});
  assert.equal(c.items.get(encrypted),b.items.get(encrypted),'wrong password must not overwrite ciphertext');
  c.element('vaultPassphrase').value=password;
  await c.eval('unlockOrCreateVault()');
  assert.ok(c.eval("getLists().trusted.includes('added.example')"));
  // A pending asynchronous save must complete before the user clears the data.
  c.element('domainInput').value='pending.example';
  c.eval("addDomain('trusted')");
  await c.eval('clearDomainVault()');
  await c.eval('state.vaultQueue');
  assert.equal(c.items.has(encrypted),false,'pending write must not recreate deleted vault');
  assert.equal(c.items.has(legacy),false);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c.eval('getLists()'))),{trusted:[],blocked:[]});

  // An existing encrypted store plus legacy plaintext is merged and migrated atomically.
  const d=browser({[encrypted]:persisted,[legacy]:JSON.stringify({trusted:['old-legacy.test'],blocked:[]})});
  d.element('vaultPassphrase').value=password;
  await d.eval('unlockOrCreateVault()');
  assert.equal(d.items.has(legacy),false);
  const combined=(await Vault.open(password,JSON.parse(d.items.get(encrypted)))).lists;
  assert.ok(combined.trusted.includes('old-legacy.test'));
  assert.ok(combined.trusted.includes('example.private'));
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const pages=fs.readFileSync(path.join(root,'.github/workflows/pages.yml'),'utf8');
  const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  assert.match(html,/<script src="domain-vault.js"><\/script>/);
  assert.match(html,/id="vaultPassphrase"/);
  assert.ok(html.indexOf('domain-vault.js')<html.indexOf('src="app.js"'));
  assert.match(sw,/\.\/domain-vault\.js/);
  assert.match(pages,/evidence-chain\.js domain-vault\.js app\.js/);
  assert.match(server,/\['\/domain-vault\.js','domain-vault\.js'\]/);
  console.log('RUMBO Guardian encrypted domain vault + app migration: PASS (crypto, tamper, wrong key, legacy, persistence, races, deployment assets)');
})().catch(e=>{console.error(e);process.exitCode=1;});
