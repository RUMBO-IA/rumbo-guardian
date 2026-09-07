const assert=require('node:assert/strict');
const Wire=require('../strict-json-wire-v7.js');
const Runtime=require('../agent-capability-runtime-v5.js');

let passed=0;
const ok=()=>{passed++;};
const rejects=(text,reason,label='wire')=>assert.throws(()=>Wire.strictParseJsonWire(text,label),new RegExp(`${label}_${reason}`));

{
  const value=Wire.strictParseJsonWire('{"a":1,"b":[true,false,null,"x"]}');
  assert.equal(value.a,1);assert.deepEqual(value.b,[true,false,null,'x']);assert.equal(Object.getPrototypeOf(value),null);ok();
}
{
  rejects('{"a":1,"a":2}','duplicate_key');ok();
}
{
  rejects('{"a":1,"\\u0061":2}','duplicate_key');ok();
}
{
  rejects('{"nested":{"x":1,"x":2}}','duplicate_key');ok();
}
{
  const value=Wire.strictParseJsonWire('{"__proto__":{"polluted":true},"constructor":1}');
  assert.equal(Object.getPrototypeOf(value),null);assert.equal(value.__proto__.polluted,true);assert.equal(Object.prototype.polluted,undefined);ok();
}
{
  rejects('{"x":"\\uD800"}','invalid_unicode');
  const value=Wire.strictParseJsonWire('{"x":"\\uD83D\\uDE00"}');assert.equal(value.x,'😀');ok();
}
{
  rejects('{"x":01}','invalid_json');rejects('{"x":1,}','invalid_json');rejects('[1,,2]','invalid_json');ok();
}
{
  const deep='['.repeat(66)+'0'+']'.repeat(66);rejects(deep,'too_deep');ok();
}
{
  const many='['+Array.from({length:10001},()=> '0').join(',')+']';rejects(many,'too_complex');ok();
}
{
  const huge=JSON.stringify('x'.repeat(1024*1024));rejects(huge,'too_large');ok();
}
{
  assert.throws(()=>Runtime.parseJsonWire('{"tool":"safe","tool":"evil"}','tool_proposal'),/tool_proposal_duplicate_key/);ok();
}
{
  assert.throws(()=>Runtime.parseJsonWire('{"a":1,"\\u0061":2}','sandbox_result'),/sandbox_result_duplicate_key/);ok();
}
{
  const vectors=['0','-0','1.5','1e3','true','false','null','"line\\nfeed"','[]','{}',' { "z" : 1 , "a" : 2 } '];
  for(const text of vectors){const parsed=Wire.strictParseJsonWire(text);assert.equal(JSON.stringify(parsed),JSON.stringify(JSON.parse(text)));}ok();
}
{
  let seed=0x5eed1234;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
  const scalar=()=>{const n=Math.floor(rnd()*5);if(n===0)return null;if(n===1)return rnd()<0.5;if(n===2)return Math.floor(rnd()*2000)-1000;if(n===3)return `s${Math.floor(rnd()*10000)}`;return rnd()*100;};
  const gen=depth=>{
    if(depth>=4||rnd()<0.45)return scalar();
    if(rnd()<0.5){const a=[];for(let i=0,n=Math.floor(rnd()*5);i<n;i++)a.push(gen(depth+1));return a;}
    const o={};for(let i=0,n=Math.floor(rnd()*5);i<n;i++)o[`k${i}_${Math.floor(rnd()*1000)}`]=gen(depth+1);return o;
  };
  for(let i=0;i<500;i++){
    const original=gen(0);const text=JSON.stringify(original);const parsed=Wire.strictParseJsonWire(text);
    assert.equal(JSON.stringify(parsed),text);
  }
  ok();
}
{
  const aliases=['a','\\u0061','\\u{0061}'];
  assert.equal(aliases.length,3);
  for(let i=0;i<100;i++){
    const left=i%2===0?'a':'\\u0061';
    const right=i%2===0?'\\u0061':'a';
    rejects(`{"${left}":${i},"${right}":${i+1}}`,'duplicate_key');
  }
  ok();
}

assert.equal(passed,15);
console.log('RUMBO Strict JSON Wire V7: 15/15 PASS + 500 deterministic fuzz round-trips + 100 duplicate-key probes');
