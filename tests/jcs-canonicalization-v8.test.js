const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const JCS=require('../jcs-canonicalize-v8.js');
const Dispatch=require('../agent-tool-dispatcher-v4.js');

let passed=0;
const ok=()=>{passed++;};

{
  const input={numbers:[333333333.33333329,1E30,4.50,2e-3,1e-27],string:"€$\u000f\nA'B\"\\\\\"/",literals:[null,true,false]};
  const expected="{\"literals\":[null,true,false],\"numbers\":[333333333.3333333,1e+30,4.5,0.002,1e-27],\"string\":\"€$\\u000f\\nA'B\\\"\\\\\\\\\\\"/\"}";
  assert.equal(JCS.canonicalizeJcs(input),expected);ok();
}
{
  const input={"€":"Euro Sign","\r":"Carriage Return","\n":"Newline","1":"One","\u0080":"Control\u007f","😂":"Smiley","ö":"Latin Small Letter O With Diaeresis","דּ":"Hebrew Letter Dalet With Dagesh","</script>":"Browser Challenge"};
  const expected="{\"\\n\":\"Newline\",\"\\r\":\"Carriage Return\",\"1\":\"One\",\"</script>\":\"Browser Challenge\",\"\":\"Control\",\"ö\":\"Latin Small Letter O With Diaeresis\",\"€\":\"Euro Sign\",\"😂\":\"Smiley\",\"דּ\":\"Hebrew Letter Dalet With Dagesh\"}";
  assert.equal(JCS.canonicalizeJcs(input),expected);ok();
}
{
  const decomposed='A\u030a';
  assert.equal(JCS.canonicalizeJcs({'Unnormalized Unicode':decomposed}),`{\"Unnormalized Unicode\":\"${decomposed}\"}`);
  assert.notEqual(decomposed,decomposed.normalize('NFC'));ok();
}
{
  assert.throws(()=>JCS.canonicalizeJcs('\uD800'),/invalid_unicode/);
  assert.throws(()=>JCS.canonicalizeJcs({'\uDFFF':1}),/invalid_unicode/);ok();
}
{
  const values=[0,-0,5e-324,-5e-324,1.7976931348623157e+308,-1.7976931348623157e+308,9007199254740992,295147905179352830000];
  const expected=['0','0','5e-324','-5e-324','1.7976931348623157e+308','-1.7976931348623157e+308','9007199254740992','295147905179352830000'];
  assert.deepEqual(values.map(JCS.canonicalizeJcs),expected);ok();
}
{
  assert.throws(()=>JCS.canonicalizeJcs(NaN),/non_finite_number/);
  assert.throws(()=>JCS.canonicalizeJcs(Infinity),/non_finite_number/);ok();
}
{
  const keys=['€','\r','דּ','1','😀','\u0080','ö'];
  keys.sort(JCS.compareUtf16);
  assert.deepEqual(keys,['\r','1','\u0080','ö','€','😀','דּ']);ok();
}
{
  assert.equal(JCS.canonicalizeJcs({b:1,a:{d:4,c:3}}),'{"a":{"c":3,"d":4},"b":1}');ok();
}
{
  const sparse=new Array(2);sparse[1]=1;
  assert.throws(()=>JCS.canonicalizeJcs(sparse),/sparse_or_decorated_array/);ok();
}
{
  const obj={};Object.defineProperty(obj,'x',{enumerable:true,get(){throw new Error('getter_executed');}});
  assert.throws(()=>JCS.canonicalizeJcs(obj),/accessor_property/);ok();
}
{
  const deep={};let p=deep;for(let i=0;i<66;i++){p.x={};p=p.x;}
  assert.throws(()=>JCS.canonicalizeJcs(deep),/input_too_deep/);ok();
}
{
  const a={z:[3,2,1],a:{β:true,α:false}};
  const b={a:{α:false,β:true},z:[3,2,1]};
  assert.equal(Dispatch.computeParametersDigest(a),Dispatch.computeParametersDigest(b));
  assert.equal(Dispatch.computeParametersDigest(a),crypto.createHash('sha256').update(JCS.canonicalizeJcs(a),'utf8').digest('hex'));ok();
}
{
  assert.throws(()=>Dispatch.computeParametersDigest({message:'bad\uD800'}),/invalid_unicode/);ok();
}
{
  let seed=0x8785cafe;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
  for(let i=0;i<500;i++){
    const obj={};
    for(let j=0,n=Math.floor(rnd()*8);j<n;j++) obj[`k${Math.floor(rnd()*1000)}`]=Math.floor(rnd()*1e6)/100;
    const c1=JCS.canonicalizeJcs(obj);
    const reversed=Object.fromEntries(Object.entries(obj).reverse());
    assert.equal(c1,JCS.canonicalizeJcs(reversed));
  }
  ok();
}

assert.equal(passed,14);
console.log('RUMBO JCS Canonicalization V8: 14/14 PASS + 500 deterministic order probes');
