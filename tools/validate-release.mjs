#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const RELEASE_STATES = new Set([
  'DRAFT', 'VERIFIED', 'RC', 'APPROVED', 'CANARY', 'STABLE', 'REVOKED', 'SUPERSEDED',
]);
const PUBLISHED_STATES = new Set(['APPROVED', 'CANARY', 'STABLE']);
const REQUIRED_BROWSER_PERMISSIONS = new Set(['activeTab', 'contextMenus', 'scripting', 'storage']);
const SHA256 = /^[a-f0-9]{64}$/i;
const SHA40 = /^[a-f0-9]{40}$/i;

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`unexpected_argument:${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing_value:${key}`);
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function isString(value) {
  return typeof value === 'string' && value.length > 0;
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function validate(product, release, extension, packageJson) {
  const errors = [];
  const push = (code) => errors.push(code);

  if (product?.schema !== 'rumbo.product/v1') push('product_schema_invalid');
  if (product?.id !== 'rumbo-guardian') push('product_id_invalid');
  if (!isString(product?.version)) push('product_version_missing');

  if (!isString(packageJson?.version)) push('package_version_missing');
  if (packageJson?.version !== product?.version) push('package_version_mismatch');

  if (release?.schema !== 'rumbo.release/v1') push('release_schema_invalid');
  if (release?.product !== product?.id) push('product_mismatch');
  if (release?.version !== product?.version) push('version_mismatch');
  if (!RELEASE_STATES.has(release?.state)) push('release_state_invalid');

  const declaredPermissions = Array.isArray(product?.browser?.permissions)
    ? sortedUnique(product.browser.permissions)
    : [];
  const expectedPermissions = sortedUnique([...REQUIRED_BROWSER_PERMISSIONS]);
  if (JSON.stringify(declaredPermissions) !== JSON.stringify(expectedPermissions)) {
    push('product_permissions_invalid');
  }
  const declaredHosts = Array.isArray(product?.browser?.host_permissions)
    ? product.browser.host_permissions
    : null;
  if (declaredHosts === null) push('product_host_permissions_missing');
  else if (declaredHosts.length !== 0) push('host_permissions_not_allowed');

  const manifestVersion = extension?.manifest_version;
  if (manifestVersion !== product?.browser?.manifest_version) push('extension_manifest_version_mismatch');
  if (!isString(extension?.version)) push('extension_version_missing');
  else if (extension.version !== product?.version) push('extension_version_mismatch');

  const extensionPermissions = Array.isArray(extension?.permissions) ? sortedUnique(extension.permissions) : [];
  if (JSON.stringify(extensionPermissions) !== JSON.stringify(expectedPermissions)) {
    push('extension_permissions_mismatch');
  }
  const extensionHosts = Array.isArray(extension?.host_permissions) ? extension.host_permissions : [];
  if (extensionHosts.length !== 0) push('extension_host_permissions_not_allowed');

  const source = release?.source;
  if (!isString(source?.repository)) push('source_repository_missing');
  if (!SHA40.test(source?.commit_sha ?? '')) push('source_commit_sha_invalid');
  if (!SHA40.test(source?.tree_sha ?? '')) push('source_tree_sha_invalid');

  if (!SHA256.test(release?.artifact?.sha256 ?? '')) push('artifact_sha256_invalid');

  if (!release?.trust || typeof release.trust !== 'object') {
    push('trust_block_missing');
  }
  if (!release?.verification || typeof release.verification !== 'object') {
    push('verification_block_missing');
  }
  if (!release?.distribution || typeof release.distribution !== 'object') {
    push('distribution_block_missing');
  }

  if (PUBLISHED_STATES.has(release?.state)) {
    const trust = release.trust ?? {};
    if (trust.sbom !== true || trust.provenance !== true || trust.signature !== true) {
      push('stable_trust_incomplete');
    }
  }

  return {
    status: errors.length === 0 ? 'VERIFIED' : 'INVALID',
    errors: sortedUnique(errors),
    product: product?.id ?? null,
    release: release?.version ?? null,
  };
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const required = ['product', 'release', 'extension', 'package'];
    for (const key of required) {
      if (!isString(args[key])) throw new Error(`missing_argument:--${key}`);
    }
    const result = validate(
      readJson(args.product),
      readJson(args.release),
      readJson(args.extension),
      readJson(args.package),
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === 'VERIFIED' ? 0 : 1;
  } catch (error) {
    const result = {
      status: 'INVALID',
      errors: [error instanceof Error ? error.message : 'validator_error'],
      product: null,
      release: null,
    };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 2;
  }
}

main();
