const DEFAULT_WIRE_LIMITS=Object.freeze({maxBytes:1024*1024,maxDepth:64,maxNodes:10000});

function hasUnpairedSurrogate(value){
  for(let i=0;i<value.length;i++){
    const code=value.charCodeAt(i);
    if(code>=0xD800&&code<=0xDBFF){
      const next=value.charCodeAt(i+1);
      if(!(next>=0xDC00&&next<=0xDFFF)) return true;
      i++;
    }else if(code>=0xDC00&&code<=0xDFFF){
      return true;
    }
  }
  return false;
}

function strictParseJsonWire(text,label='wire',limits={}){
  const cfg={...DEFAULT_WIRE_LIMITS,...limits};
  if(typeof text!=='string') throw new Error(`${label}_not_string`);
  if(Buffer.byteLength(text,'utf8')>cfg.maxBytes) throw new Error(`${label}_too_large`);

  let i=0;
  const state={nodes:0};
  const fail=reason=>{throw new Error(`${label}_${reason}`);};
  const ws=()=>{while(i<text.length&&(text[i]===' '||text[i]==='\t'||text[i]==='\n'||text[i]==='\r')) i++;};
  const countNode=()=>{state.nodes++;if(state.nodes>cfg.maxNodes) fail('too_complex');};

  function parseString(){
    if(text[i]!=='"') fail('invalid_json');
    const start=i++;
    let escaped=false;
    while(i<text.length){
      const ch=text[i++];
      if(escaped){
        if(ch==='u'){
          if(i+4>text.length||!/^[0-9A-Fa-f]{4}$/.test(text.slice(i,i+4))) fail('invalid_json');
          i+=4;
        }else if(!'"\\/bfnrt'.includes(ch)){
          fail('invalid_json');
        }
        escaped=false;
        continue;
      }
      if(ch==='\\'){escaped=true;continue;}
      if(ch==='"'){
        const token=text.slice(start,i);
        let value;
        try{value=JSON.parse(token);}catch{fail('invalid_json');}
        if(hasUnpairedSurrogate(value)) fail('invalid_unicode');
        return value;
      }
      if(ch.charCodeAt(0)<0x20) fail('invalid_json');
    }
    fail('invalid_json');
  }

  function parseNumber(){
    const rest=text.slice(i);
    const match=rest.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if(!match) fail('invalid_json');
    const token=match[0];
    i+=token.length;
    const value=Number(token);
    if(!Number.isFinite(value)) fail('non_finite_number');
    return value;
  }

  function parseValue(depth){
    if(depth>cfg.maxDepth) fail('too_deep');
    ws();
    countNode();
    const ch=text[i];
    if(ch==='"') return parseString();
    if(ch==='{') return parseObject(depth);
    if(ch==='[') return parseArray(depth);
    if(text.startsWith('true',i)){i+=4;return true;}
    if(text.startsWith('false',i)){i+=5;return false;}
    if(text.startsWith('null',i)){i+=4;return null;}
    if(ch==='-'||(ch>='0'&&ch<='9')) return parseNumber();
    fail('invalid_json');
  }

  function parseObject(depth){
    i++;
    const out=Object.create(null);
    const seen=new Set();
    ws();
    if(text[i]==='}'){i++;return out;}
    while(true){
      ws();
      const key=parseString();
      if(seen.has(key)) fail('duplicate_key');
      seen.add(key);
      ws();
      if(text[i]!==':') fail('invalid_json');
      i++;
      out[key]=parseValue(depth+1);
      ws();
      if(text[i]==='}'){i++;return out;}
      if(text[i]!==',') fail('invalid_json');
      i++;
    }
  }

  function parseArray(depth){
    i++;
    const out=[];
    ws();
    if(text[i]===']'){i++;return out;}
    while(true){
      out.push(parseValue(depth+1));
      ws();
      if(text[i]===']'){i++;return out;}
      if(text[i]!==',') fail('invalid_json');
      i++;
    }
  }

  ws();
  if(i>=text.length) fail('invalid_json');
  const value=parseValue(0);
  ws();
  if(i!==text.length) fail('invalid_json');
  return value;
}

module.exports={DEFAULT_WIRE_LIMITS,hasUnpairedSurrogate,strictParseJsonWire};
