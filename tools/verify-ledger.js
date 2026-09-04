#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const Chain = require('../evidence-chain.js');

async function main(){
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const fileArg = args.find(arg => arg !== '--json');
  if(!fileArg){
    console.error('Usage: node tools/verify-ledger.js <ledger.json> [--json]');
    process.exit(1);
  }
  let document;
  try{ document = JSON.parse(fs.readFileSync(path.resolve(fileArg),'utf8')); }
  catch(error){ console.error(`Unable to read ledger: ${error.message}`); process.exit(1); }
  if(!Array.isArray(document.history)){
    const summary={valid:false,entries:0,brokenAt:1,rootHash:null,reason:'missing_history'};
    console.log(jsonMode?JSON.stringify(summary):'INVALID · missing history array');
    process.exit(2);
  }
  const result = await Chain.verifyChain(document.history);
  const rootHash = document.history.at(-1)?.entryHash || Chain.GENESIS_HASH;
  const summary={...result,rootHash,product:document.product||null,version:document.version||null};
  if(jsonMode) console.log(JSON.stringify(summary));
  else console.log(result.valid?`VALID · ${result.entries} entries · root ${rootHash}`:`INVALID · broken at entry ${result.brokenAt}`);
  process.exit(result.valid?0:2);
}

main().catch(error=>{ console.error(error); process.exit(1); });