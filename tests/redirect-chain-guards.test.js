const assert = require('node:assert/strict');
const Core = require('../guardian-core.js');

const backToA = 'https://a.example/redirect';
const b = `https://b.example/redirect?url=${encodeURIComponent(backToA)}`;
const cycleUrl = `https://a.example/redirect?url=${encodeURIComponent(b)}`;
const cycle = Core.analyzeUrl(cycleUrl);
const cycleCodes = cycle.redirectTargets.flatMap(x => x.chain || []).flatMap(x => x.reasons || []);
assert.ok(cycleCodes.includes('redirect_cycle'), 'debe detectar repetición de ruta y cortar el ciclo');

const e = 'https://openai.com.evil.example/login';
const d = `https://d.example/redirect?url=${encodeURIComponent(e)}`;
const c = `https://c.example/redirect?url=${encodeURIComponent(d)}`;
const b2 = `https://b.example/redirect?url=${encodeURIComponent(c)}`;
const deep = `https://a.example/redirect?url=${encodeURIComponent(b2)}`;
const deepResult = Core.analyzeUrl(deep);
assert.equal(deepResult.redirectTargets[0].chain.length, 3, 'debe limitar la cadena a tres saltos');
assert.ok(deepResult.redirectTargets[0].chain.at(-1).reasons.includes('redirect_depth_limit'), 'debe explicar el corte por profundidad');

const params = ['url','next','target','dest','continue','return'].map((p,i)=>`${p}=${encodeURIComponent(`https://x${i}.example/path`)}`).join('&');
const many = Core.analyzeUrl(`https://hub.example/redirect?${params}`);
assert.ok(many.redirectTargets.length <= 4, 'debe acotar destinos de redirección por URL');
assert.ok(many.reasons.some(r => r.code === 'redirect_target_limit'), 'debe explicar el límite de parámetros');

console.log('RUMBO Guardian redirect chain guards: PASS');