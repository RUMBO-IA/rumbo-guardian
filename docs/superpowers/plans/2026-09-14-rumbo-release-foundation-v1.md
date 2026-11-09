# RUMBO Release Foundation v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, secret-free release foundation to RUMBO Guardian that validates product identity, version consistency, permissions, source binding, artifact trust fields, and release state.

**Architecture:** Add machine-readable product/release contracts under `packaging/`, a Node standard-library validator under `tools/`, focused tests under `tests/`, and a reusable CI workflow under `.github/workflows/`. The validator has no network or shell side effects and only evaluates supplied files/arguments.

**Tech Stack:** Node.js 22, JSON Schema documents, Node built-in `assert`/`child_process`/`fs`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-14-rumbo-release-foundation-design.md`

## Global Constraints

- Node runtime: `>=22.16.0`
- Browser permissions: `activeTab`, `scripting`, `storage`, `contextMenus`
- Guardian `host_permissions`: empty
- Release states: `DRAFT`, `VERIFIED`, `RC`, `APPROVED`, `CANARY`, `STABLE`, `REVOKED`, `SUPERSEDED`
- No network calls, secrets, shell execution, credential changes, or publication side effects in the validator
- Exact source commit SHA and tree SHA are required in a release manifest

---

### Task 1: Add machine-readable product contract

**Files:**
- Create: `packaging/product.json`
- Test: `tests/release-foundation.test.js`

**Interfaces:**
- Produces a product contract for `rumbo-guardian` consumed by the release validator.

- [ ] **Step 1: Write the failing test**

Add tests that load `packaging/product.json` and assert product id, version, surface declarations, exact extension permission set, empty host permissions, and required trust capabilities.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/release-foundation.test.js`
Expected: FAIL because `packaging/product.json` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create JSON with:

```json
{
  "schema": "rumbo.product/v1",
  "id": "rumbo-guardian",
  "name": "RUMBO Guardian",
  "version": "1.0.0",
  "surfaces": ["web", "browser-extension", "desktop-windows"],
  "browser": {
    "manifest_version": 3,
    "permissions": ["activeTab", "contextMenus", "scripting", "storage"],
    "host_permissions": []
  },
  "trust": {
    "sbom": "required",
    "provenance": "required",
    "artifact_sha256": "required"
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/release-foundation.test.js`
Expected: PASS for the product contract assertions.

- [ ] **Step 5: Commit**

```bash
git add packaging/product.json tests/release-foundation.test.js
git commit -m "feat: add guardian product contract"
```

### Task 2: Add release manifest contract and validator tests

**Files:**
- Create: `packaging/release.json`
- Modify: `tests/release-foundation.test.js`
- Create: `tools/validate-release.mjs`

**Interfaces:**
- `tools/validate-release.mjs --product packaging/product.json --release packaging/release.json --extension extension/manifest.json`
- Validator returns JSON with `{status, errors, product, release}` and exits non-zero when invalid.

- [ ] **Step 1: Write the failing test**

Add assertions for:

1. version mismatch between product and release => invalid
2. missing commit/tree SHA => invalid
3. broad host permissions => invalid
4. `STABLE` without signed/provenance/sha256 fields => invalid
5. valid `DRAFT` release => valid

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/release-foundation.test.js`
Expected: FAIL because validator is missing.

- [ ] **Step 3: Write minimal implementation**

Create `packaging/release.json` using the current HEAD commit and tree values supplied as placeholders only in the test fixture, not in production source. Define the validator to:

```text
load JSON
validate required identity fields
compare product.version === release.version
compare extension.manifest_version and permission set
require release.source.commit_sha and tree_sha
require release.artifact.sha256
if release.state in APPROVED/CANARY/STABLE:
  require trust.sbom, trust.provenance, trust.signature
emit deterministic sorted errors
exit 0 only when valid
```

Use only Node standard library; do not invoke child processes, fetch URLs, or inspect environment secrets.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/release-foundation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packaging/release.json tools/validate-release.mjs tests/release-foundation.test.js
git commit -m "feat: add deterministic release validator"
```

### Task 3: Add CI gate

**Files:**
- Create: `.github/workflows/release-foundation.yml`
- Modify: `package.json`

**Interfaces:**
- New script: `release:validate`
- CI workflow invokes `npm ci`, `npm run release:validate`, and existing `npm test`.

- [ ] **Step 1: Write the failing test**

Extend `tests/release-foundation.test.js` to assert `package.json` has the `release:validate` script and that the workflow file references Node 22 and the validator command.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/release-foundation.test.js`
Expected: FAIL because the script/workflow are absent.

- [ ] **Step 3: Write minimal implementation**

Add:

```json
"release:validate": "node tools/validate-release.mjs --product packaging/product.json --release packaging/release.json --extension extension/manifest.json"
```

Create workflow:

```yaml
name: Release Foundation
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run release:validate
      - run: npm test
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/release-foundation.test.js && npm run release:validate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release-foundation.yml package.json tests/release-foundation.test.js
git commit -m "ci: gate guardian releases on release foundation"
```

### Task 4: Full verification and PR

**Files:**
- Test: `tests/release-foundation.test.js`

- [ ] **Step 1: Run focused tests**

Run: `node tests/release-foundation.test.js`
Expected: PASS.

- [ ] **Step 2: Run syntax and full regression**

Run: `npm run check && npm test`
Expected: PASS.

- [ ] **Step 3: Validate release output**

Run: `npm run release:validate`
Expected: JSON status `VERIFIED` and exit code `0`.

- [ ] **Step 4: Commit final verification metadata if needed**

Only commit files required by the implementation; do not add logs containing environment data or secrets.

- [ ] **Step 5: Open pull request**

Create a PR from the implementation branch to `main` with:
- scope limited to release foundation
- explicit note that signing, updater, desktop packaging, and store publication are not yet implemented
- test evidence from the commands above
