const fs=require('node:fs');
const path=require('node:path');

const workflowsDir=path.join(__dirname,'..','.github','workflows');
const files=fs.readdirSync(workflowsDir)
  .filter(name=>name.endsWith('.yml')||name.endsWith('.yaml'))
  .sort();

if(!files.length) throw new Error('no_github_actions_workflows_found');

const failures=[];
const fullCommitSha=/^[a-f0-9]{40}$/i;

for(const file of files){
  const fullPath=path.join(workflowsDir,file);
  const text=fs.readFileSync(fullPath,'utf8');

  if(!/^permissions:\s*(?:\r?\n|$)/m.test(text)){
    failures.push(`${file}: missing explicit workflow permissions`);
  }

  const usesPattern=/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#.*)?$/gm;
  for(const match of text.matchAll(usesPattern)){
    const spec=match[1];
    if(spec.startsWith('./')||spec.startsWith('docker://')) continue;

    const at=spec.lastIndexOf('@');
    if(at<=0||at===spec.length-1){
      failures.push(`${file}: malformed action reference ${spec}`);
      continue;
    }

    const ref=spec.slice(at+1);
    if(!fullCommitSha.test(ref)){
      failures.push(`${file}: action must be pinned to a full 40-char commit SHA: ${spec}`);
    }
  }
}

if(failures.length){
  console.error('GitHub Actions supply-chain policy violations:');
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`GITHUB_ACTIONS_SUPPLY_CHAIN_PASS ${files.length}/${files.length}`);
