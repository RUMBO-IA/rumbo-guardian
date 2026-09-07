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
  rejects('{"__proto__":{"polluted":true},"constructor":1}','invalid_json_should_not_match');
}
