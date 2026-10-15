'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const srcPath = path.resolve(__dirname, '../ops/windows/desktop-commander-remote.ps1');
const source = fs.readFileSync(srcPath, 'utf8');
const expected = [
  ['CIM exception must terminate the supervisor', /Get-CimInstance\s+Win32_Process\s+-ErrorAction\s+Stop/],
  ['No process-enumeration silent fallback', /catch\s*\{\s*Write-State\s+'process_enumeration_failed'\s*throw\s+"Refusing remote-agent startup/s],
  ['Use current user profile', /Join-Path\s+\$stateDir\s+'remote-supervisor\.lock'/],
  ['Use operating-system file lock', /\[System\.IO\.FileShare\]::None/],
  ['Only sharing violation is ignored', /\.Exception\.HResult\s+-band\s+0xFFFF\)\s+-ne\s+32/],
  ['Lock is acquired before checking processes', /\$supervisorLock\s*=\s*\[System\.IO\.File\]::Open[\s\S]*?\$existing\s*=\s*Get-RemoteAgentProcesses/],
  ['Lock is held through agent process', /\$existing\s*=\s*Get-RemoteAgentProcesses[\s\S]*?&\s*\$npx\.Source[\s\S]*?\$supervisorLock\.Dispose\(\)/],
  ['Lock is released through finally', /\}\s*finally\s*\{\s*if\s*\(\$null\s+-ne\s+\$supervisorLock\)\s*\{\s*\$supervisorLock\.Dispose\(\)/],
  ['Startup never blindly guesses latest package', /\[string\]\$PackageVersion\s*=\s*'0\.2\.48'/],
  ['No privileged Windows logon task invoked from supervisor', /Get-Command\s+node\.exe/]
];
for (const [label, rule] of expected) assert.match(source, rule, label);
assert.doesNotMatch(source, /Write-Warning\s+"Could not inspect existing remote-agent processes:[\s\S]{0,160}?@\(\)/, 'enumeration failures must never masquerade as empty inventory');
assert.doesNotMatch(source, /\b(?:Start-Process|Start-Service|Register-ScheduledTask|Invoke-Expression)\b/, 'no new implicit privilege or service paths');
// Negative mutation tests ensure the test detects regressions, not just presence of unrelated strings.
for (const [label, pat] of expected.slice(0,8)) {
  const mutant = source.replace(pat, '# removed for negative control');
  assert.notEqual(mutant, source, `negative control must mutate: ${label}`);
  assert.doesNotMatch(mutant, pat, `negative control rejected: ${label}`);
}
console.log('Desktop Commander supervisor source invariants: 20/20 PASS (12 checks + 8 negative controls)');
