const DEFAULT_JCS_LIMITS=Object.freeze({maxDepth:64,maxNodes:10000});

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

function assertJcsString(value){
  if(hasUnpairedSurrogate(value)) throw new Error('invalid_unicode');
}

function compareUtf16(a,b){
  const n=Math.min(a.length,b.length);
  for(let i=0;i<n;i++){
    const da=a.charCodeAt(i),db=b.charCodeAt(i);
    if(da!==db) return da<db?-1:1;
  }
  return a.length===b.length?0:(a.length<b.length?-1:1);
}

function canonicalizeJcs(value,options={}){
  const limits={...DEFAULT_JCS_LIMITS,...options};
  const seen=new Set();
  const state={nodes:0};

  function enter(depth){
    if(depth>limits.maxDepth) throw new Error('input_too_deep');
    state.nodes++;
    if(state.nodes>limits.maxNodes) throw new Error('input_too_complex');
  }

  function dataEntries(object){
    const proto=Object.getPrototypeOf(object);
    if(proto!==Object.prototype&&proto!==null) throw new Error('non_plain_object');
    if(Object.getOwnPropertySymbols(object).length) throw new Error('symbol_property');
    const entries=[];
    for(const key of Object.keys(object)){
      assertJcsString(key);
      const descriptor=Object.getOwnPropertyDescriptor(object,key);
      if(!descriptor||typeof descriptor.get==='function'||typeof descriptor.set==='function') throw new Error('accessor_property');
      entries.push([key,descriptor.value]);
    }
    entries.sort((a,b)=>compareUtf16(a[0],b[0]));
    return entries;
  }

  function serialize(node,depth){
    enter(depth);
    if(node===null) return 'null';
    const type=typeof node;
    if(type==='string'){
      assertJcsString(node);
      return JSON.stringify(node);
    }
    if(type==='boolean') return node?'true':'false';
    if(type==='number'){
      if(!Number.isFinite(node)) throw new Error('non_finite_number');
      return JSON.stringify(node);
    }
    if(type==='undefined'||type==='function'||type==='symbol'||type==='bigint') throw new Error('unsupported_input_type');
    if(seen.has(node)) throw new Error('cyclic_input');
    seen.add(node);
    try{
      if(Array.isArray(node)){
        const keys=Object.keys(node);
        if(keys.length!==node.length||Object.getOwnPropertySymbols(node).length) throw new Error('sparse_or_decorated_array');
        const parts=[];
        for(let i=0;i<node.length;i++){
          if(keys[i]!==String(i)||!Object.prototype.hasOwnProperty.call(node,i)) throw new Error('sparse_or_decorated_array');
          const descriptor=Object.getOwnPropertyDescriptor(node,String(i));
          if(!descriptor||typeof descriptor.get==='function'||typeof descriptor.set==='function') throw new Error('accessor_property');
          parts.push(serialize(descriptor.value,depth+1));
        }
        return `[${parts.join(',')}]`;
      }
      return `{${dataEntries(node).map(([key,entryValue])=>`${JSON.stringify(key)}:${serialize(entryValue,depth+1)}`).join(',')}}`;
    }finally{
      seen.delete(node);
    }
  }

  return serialize(value,0);
}

module.exports={DEFAULT_JCS_LIMITS,hasUnpairedSurrogate,compareUtf16,canonicalizeJcs};
