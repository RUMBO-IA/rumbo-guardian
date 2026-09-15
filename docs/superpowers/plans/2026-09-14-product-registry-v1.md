# RUMBO Guardian Product Registry v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic Git-native Guardian Product Registry with evidence-honest historical `1.0.0` lineage and candidate `1.1.0-rc.1`, without claiming upgrade/rollback until the exact historical artifact is independently hash-verified.

**Architecture:** Implement the registry policy layer first and keep the Windows upgrade/rollback laboratory as a separate follow-on plan because it depends on external recovery of the exact historical N-1 artifact. The registry validator is Node.js standard-library only, fail-closed, side-effect free, and checks schemas, lineage, state policy, authorization, hashes, and version consistency across Guardian product surfaces.

**Tech Stack:** Node.js 22.23.2 in CI, JSON, GitHub Actions, existing Guardian Tauri 2 / Rust 1.98.1 stack.

**Spec:** `docs/superpowers/specs/2026-09-14-product-registry-upgrade-rollback-v1-design.md`

## Global Constraints

- Product id is exactly `rumbo-guardian`; display name is exactly `RUMBO Guardian`.
- Historical baseline is exactly `1.0.0`; it is `VERIFIED` but not `STABLE`.
- Candidate is exactly `1.1.0-rc.1`; `production_go=false` and `publication_authorized=false` are mandatory.
- Allowed active progression is `DRAFT -> VERIFYING -> VERIFIED -> RC -> APPROVED -> CANARY -> STABLE`; `REVOKED` and `SUPERSEDED` are side/terminal states.
- The validator performs no network, secret, shell, browser, filesystem mutation, or remote-write operations.
- No Authenticode key, Tauri updater key/plugin, Microsoft Store publication, GitHub Release publication, or production promotion is introduced.
- `AUTHENTICODE=NOT_PROVEN`, `TAURI_UPDATER=DISABLED/NOT_PROVEN`, `MICROSOFT_STORE=NO_GO`, `BYTE_REPRODUCIBLE_NSIS=NOT_PROVEN`, `PRODUCTION=NO_GO` remain invariant.
- Real N-1 -> N -> N-1 PASS requires the exact historical artifact hash; a synthetic fixture can never satisfy that gate.

---

### Task 1: Registry records and deterministic validator

**Files:**
- Create: `registry/rumbo-guardian/product.json`
- Create: `registry/rumbo-guardian/state-machine.json`
- Create: `registry/rumbo-guardian/releases/1.0.0.json`
- Create: `registry/rumbo-guardian/releases/1.1.0-rc.1.json`
- Create: `tools/validate-product-registry.mjs`
- Create: `tests/product-registry.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: the historical source/artifact identity in `packaging/release.json` and the policy defined by the spec.
- Produces: CLI `node tools/validate-product-registry.mjs --registry registry/rumbo-guardian --package package.json --product packaging/product.json --extension extension/manifest.json --tauri src-tauri/tauri.conf.json --cargo src-tauri/Cargo.toml`; deterministic JSON result `{ok:boolean, errors:string[]}` and nonzero exit on failure.

- [ ] **Step 1: Write failing policy tests**

Create tests that assert: required files exist; schemas/product id are exact; `1.0.0` equals the known historical commit/tree/artifact SHA and is not `STABLE`; `1.1.0-rc.1` points to predecessor `1.0.0`; production/publication authority are false; malformed SHA, missing predecessor, cycle, unknown state, skipped governed transition, and unauthorized production/publication are rejected. Test fixtures must be created in temporary directories and deleted by the test process.

- [ ] **Step 2: Run RED**

Run: `node tests/product-registry.test.js`

Expected: FAIL because registry files and validator do not exist.

- [ ] **Step 3: Implement minimal records and validator**

Implement pure functions for JSON loading, semantic version validation, SHA validation, predecessor graph validation, state-machine validation, authorization validation, and surface-version validation. Emit errors in deterministic sorted order. Do not execute subprocesses or perform network access.

- [ ] **Step 4: Add package scripts**

Add:

```json
"registry:validate": "node tools/validate-product-registry.mjs --registry registry/rumbo-guardian --package package.json --product packaging/product.json --extension extension/manifest.json --tauri src-tauri/tauri.conf.json --cargo src-tauri/Cargo.toml",
"registry:test": "node tests/product-registry.test.js"
```

- [ ] **Step 5: Run GREEN and inherited policy tests**

Run:

```bash
npm run registry:test
npm run registry:validate
npm run release:validate
npm run desktop:test
node tests/desktop-trust.test.js
node tests/desktop-install-lab.test.js
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add registry/rumbo-guardian tools/validate-product-registry.mjs tests/product-registry.test.js package.json
git commit -m "feat(registry): add fail-closed Guardian product registry"
```

---

### Task 2: Candidate identity consistency

**Files:**
- Modify: `package.json`
- Modify: `packaging/product.json`
- Modify: `extension/manifest.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `registry/rumbo-guardian/releases/1.1.0-rc.1.json`
- Modify: `tests/product-registry.test.js`
- Modify if required by existing version contract: `tests/version-consistency.test.js`

**Interfaces:**
- Consumes: validator and candidate registry record from Task 1.
- Produces: one candidate identity `1.1.0-rc.1` across all surfaces accepted by the registry validator.

- [ ] **Step 1: Add failing version-consistency assertions**

Assert that package, product contract, extension manifest, Tauri config, Cargo package, and candidate registry record all equal `1.1.0-rc.1`. Assert historical `packaging/release.json` remains `1.0.0` and is not rewritten as candidate evidence.

- [ ] **Step 2: Run RED**

Run: `npm run registry:test`

Expected: FAIL with explicit version disagreement for current `1.0.0` surfaces.

- [ ] **Step 3: Apply candidate version bump only to candidate surfaces**

Set exact candidate identity to `1.1.0-rc.1` in package/product/extension/Tauri/Cargo and candidate registry record. Preserve historical release record and historical artifact hashes unchanged.

- [ ] **Step 4: Run version and build-contract tests**

Run:

```bash
npm run registry:test
npm run registry:validate
npm run desktop:test
cargo check --locked --manifest-path src-tauri/Cargo.toml
npm run check
npm test
```

Expected: all PASS. If Cargo.lock changes only because the root package version changed, commit that exact lockfile change and verify dependency versions are otherwise unchanged.

- [ ] **Step 5: Commit**

```bash
git add package.json packaging/product.json extension/manifest.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock registry/rumbo-guardian/releases/1.1.0-rc.1.json tests/product-registry.test.js tests/version-consistency.test.js
git commit -m "chore(version): establish Guardian 1.1.0-rc.1 candidate identity"
```

---

### Task 3: CI registry gate and attestation-consumption policy

**Files:**
- Create: `.github/workflows/product-registry.yml`
- Create: `tests/product-registry-ci.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: registry validator and candidate identity from Tasks 1-2.
- Produces: read-only CI gate that runs registry validation plus inherited regressions; policy contract for later `gh attestation verify` consumption without generating or publishing new release artifacts in this PR.

- [ ] **Step 1: Write failing CI-policy test**

Assert workflow uses `permissions: contents: read`, exact Node `22.23.2`, Rust `1.98.1`, runs `registry:test`, `registry:validate`, release validation, desktop/trust/install policy suites, locked Cargo check, syntax, and full regression. Assert workflow contains no `contents: write`, release publication, updater, signing key, Store action, `git push`, or production promotion.

Also assert the policy/documentation lane records the exact future consumption commands:

```bash
gh attestation verify <candidate-exe> -R RUMBO-IA/rumbo-guardian
gh attestation verify <candidate-exe> -R RUMBO-IA/rumbo-guardian --predicate-type https://spdx.dev/Document/v2.3
```

These commands are not allowed to produce PASS in this registry-only PR unless an exact candidate artifact is present.

- [ ] **Step 2: Run RED**

Run: `node tests/product-registry-ci.test.js`

Expected: FAIL because workflow is absent.

- [ ] **Step 3: Implement read-only workflow**

Create PR/push workflow for `packaging/product-registry-v1` with only the permissions and test/build checks above. Do not add attestation-generation permissions to this workflow.

- [ ] **Step 4: Run local policy verification**

Run:

```bash
node tests/product-registry-ci.test.js
npm run registry:test
npm run registry:validate
npm run check
npm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/product-registry.yml tests/product-registry-ci.test.js package.json
git commit -m "ci(registry): enforce Guardian registry policy"
```

---

### Task 4: PR evidence and fail-closed N-1 recovery gate

**Files:**
- Create: `docs/release/product-registry-v1-evidence.md`
- Modify: none of the production/runtime source files.

**Interfaces:**
- Consumes: green CI results and known historical SHA-256 `1d81530ea463a1a59034ed772889712d103237ce6dc588903419eb13234f8eeb`.
- Produces: explicit registry technical status and a separate upgrade/rollback readiness decision.

- [ ] **Step 1: Search repository/GitHub release assets for the exact historical artifact**

Look for `RUMBO_Guardian_V1.0.0.zip`. If recovered, download without execution and verify SHA-256 before any installer extraction/execution. If unavailable or mismatched, record `HISTORICAL_N_MINUS_1_ARTIFACT=NOT_PROVEN` and stop the real upgrade/rollback lane.

- [ ] **Step 2: Record registry evidence**

Document exact branch/head SHA, workflow run id, registry validator result, inherited regression result, historical record identity, candidate identity, and N-1 artifact recovery result. Explicitly retain all NO_GO/NOT_PROVEN states from Global Constraints.

- [ ] **Step 3: Self-audit evidence language**

Reject wording that equates registry PASS with release approval, production authorization, updater proof, signing proof, Store readiness, or byte reproducibility.

- [ ] **Step 4: Commit evidence document**

```bash
git add docs/release/product-registry-v1-evidence.md
git commit -m "docs(registry): record Product Registry v1 evidence"
```

---

## Follow-on boundary: Upgrade/Rollback Lab v1

Do not implement the real Windows N-1 -> N -> N-1 laboratory in this plan unless Task 4 proves the exact historical N-1 artifact with SHA-256 `1d81530ea463a1a59034ed772889712d103237ce6dc588903419eb13234f8eeb`.

Once that prerequisite is PASS, write a separate `docs/superpowers/plans/2026-09-14-upgrade-rollback-lab-v1.md` plan covering: hash-before-execution, N-1 silent install, controlled state fixture, N upgrade, identity/state verification, N uninstall/reinstall N-1 rollback, final cleanup, JSON receipt, artifact upload, and explicit distinction from Tauri remote updater behavior.

## Self-review result

- Spec coverage: registry structure, historical honesty, candidate versioning, lineage/state/authorization validation, CI policy, attestation consumption policy, and N-1 fail-closed prerequisite are covered.
- Scope correction: the real upgrade/rollback lab is deliberately split into a follow-on plan because it depends on an external exact historical artifact; this prevents a synthetic fixture from being promoted to evidence.
- Placeholder scan: no implementation placeholders are used; contingent external evidence is represented as an explicit gate.
- Type/interface consistency: validator CLI and deterministic `{ok, errors}` contract are used consistently across tasks.
