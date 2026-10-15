'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../ops/windows/desktop-commander-remote.ps1'),'utf8');
let pass=0;
function present(re,label){assert.match(src,re,label);pass++;}
function absent(re,label){assert.doesNotMatch(src,re,label);pass++;}
present(/\$_\.Name\s+-eq\s+'node\.exe'\s+-and/, 'only terminate node.exe');
absent(/\$_\.Name\s+-in\s+@\('node\.exe','cmd\.exe'\)/, 'never enumerate and terminate generic cmd.exe');
present(/function Assert-RemoteAgentIdentity\s*\{/, 'recheck function');
present(/Get-CimInstance\s+Win32_Process\s+-Filter\s+\("ProcessId=\{0\}"\s+-f\s+\$Candidate\.ProcessId\)\s+-ErrorAction\s+Stop/, 'fresh PID query fails closed');
present(/process_identity_recheck_failed/, 'recheck failure receipt');
present(/process_identity_drift/, 'identity drift receipt');
present(/CreationDate\s+-ne\s+\$Candidate\.CreationDate/, 'creation date distinguishes recycled PID');
present(/CommandLine\s+-ne\s+\$Candidate\.CommandLine/, 'same full command line');
present(/Name\s+-ne\s+\$Candidate\.Name/, 'same executable name');
present(/Assert-RemoteAgentIdentity\s+-Candidate\s+\$proc[\s\S]*?&\s+taskkill\.exe\s+\/PID\s+\$proc\.ProcessId/, 'assert before taskkill');
present(/\$LASTEXITCODE\s+-ne\s+0[\s\S]*?process_termination_failed/, 'taskkill failure is fatal');
present(/throw 'Refusing process termination: target process identity changed'/, 'drift denies termination');
console.log('RUMBO Guardian PID-identity source checks: '+pass+'/'+pass+' PASS (static; no Windows effect)');
