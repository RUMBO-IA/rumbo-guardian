'use strict';
const assert = require('node:assert/strict');
const {runNodePermissionProbe} = require('../node-permission-probe-v5.js');
const result = runNodePermissionProbe();
assert.equal(result.available, true,
  'Node permission probe must return structured evidence on denied network bind');
assert.equal(result.permissionModel, true);
assert.equal(result.fsDenied, true);
assert.equal(result.childDenied, true);
assert.equal(result.workerDenied, true);
if (Number(process.versions.node.split('.')[0]) >= 25) {
  assert.equal(result.networkDenied, true);
  assert.equal(result.hardConfinement, true);
  const {spawnSync} = require('node:child_process');
  const granted = spawnSync(process.execPath, [
    '--permission', '--allow-net', '-e',
    "console.log(process.permission.has('net'))",
  ], {encoding:'utf8', timeout:5000, env:{PATH:process.env.PATH||''}});
  assert.equal(granted.status, 0, granted.stderr);
  assert.equal(granted.stdout.trim(), 'true', 'explicit network grant must be observable');
} else {
  assert.equal(result.hardConfinement, false);
}
console.log('Node permission probe runtime compatible: PASS');
