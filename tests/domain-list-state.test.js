'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const Vault=require('../domain-vault.js');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const start=source.indexOf('function getLists(){');
const end=source.indexOf('\nfunction setVaultStatus(',start);
assert.ok(start>=0&&end>start,'getLists must remain present');
const getLists=Function('Vault','state','return ('+source.slice(start,end)+');')(Vault,{
  domainLists:{trusted:['safe.example',null,5,'safe.example'],blocked:['bad.example',{}]}
});
assert.deepStrictEqual(getLists(),{trusted:['safe.example'],blocked:['bad.example']});
assert.deepStrictEqual(Vault.cleanLists({trusted:['one.example','two.example'],blocked:['two.example']}),
  {trusted:['one.example'],blocked:['two.example']});
assert.doesNotMatch(source,/localStorage\.setItem\s*\(\s*LIST_KEY\s*,/,'legacy cleartext writes must be absent');
assert.match(source,/localStorage\.removeItem\s*\(\s*LIST_KEY\s*\)/,'legacy key must be cleared after migration');
console.log('RUMBO Guardian domain-list state tests: PASS');
