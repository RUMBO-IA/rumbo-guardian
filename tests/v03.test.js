const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

const corePath = path.join(root,'guardian-core.js');
assert.ok(fs.existsSync(corePath), 'guardian-core.js debe existir en V0.3');
const core = require(corePath);

assert.equal(core.classifyDomain('openai.com',{trusted:['openai.com'],blocked:[]}), 'trusted');
assert.equal(core.classifyDomain('evil.test',{trusted:[],blocked:['evil.test']}), 'blocked');
const blocked = core.analyzeUrl('https://evil.test/login',{trusted:[],blocked:['evil.test']});
assert.ok(blocked.score >= 90, 'un dominio bloqueado debe quedar en riesgo alto');
assert.equal(blocked.domainStatus, 'blocked');

const ranked = core.rankLinks([
  'https://example.com/',
  'http://198.51.100.10/login',
  'https://safe.example/'
],{trusted:['safe.example'],blocked:[]});
assert.equal(ranked.length, 3);
assert.ok(ranked[0].score >= ranked[1].score);
assert.ok(ranked[1].score >= ranked[2].score);
const html = read('index.html').toLowerCase();
for (const banned of ['gratis','sin suscripción','sin api paga']) {
  assert.ok(!html.includes(banned), `la UI no debe posicionarse como ${banned}`);
}
assert.ok(html.includes('rumbo security intelligence'));
assert.ok(html.includes('privacy-first'));
assert.ok(html.includes('private by design'));
assert.ok(html.includes('domainlists'));

const manifest = JSON.parse(read('extension/manifest.json'));
assert.equal(manifest.version, '0.3.0');
assert.ok(manifest.permissions.includes('storage'));
const popup = read('extension/popup.html');
assert.ok(popup.includes('rankedLinks'));
assert.ok(popup.includes('trustDomainBtn'));
assert.ok(popup.includes('blockDomainBtn'));
console.log('RUMBO Guardian V0.3 tests: PASS');