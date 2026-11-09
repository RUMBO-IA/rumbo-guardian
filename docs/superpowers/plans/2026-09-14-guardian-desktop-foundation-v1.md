# Guardian Desktop Foundation v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal Windows-first Tauri 2 shell for Guardian, package the existing local-first UI into approved desktop assets, and produce an unsigned NSIS installer in CI without granting new privileged capabilities.

**Architecture:** A Node staging script copies an explicit allowlist of static Guardian files into `desktop-dist/`. Tauri 2 loads that directory with no custom commands/plugins. Windows CI validates the release contract, checks desktop packaging policy, runs Rust checks, builds NSIS, and uploads the installer artifact without publishing or signing it.

**Tech Stack:** Node.js 22, Rust stable, Tauri 2, Cargo, GitHub Actions, NSIS.

**Spec:** `docs/superpowers/specs/2026-09-14-guardian-desktop-foundation-v1-design.md`

## Global Constraints
- Tauri major version: 2.
- Rust edition: 2021.
- Windows target: `x86_64-pc-windows-msvc`.
- Bundle target: `nsis` only.
- Product name: `RUMBO Guardian`.
- Identifier: `com.rumbo.guardian`.
- Version: `1.0.0`.
- No shell/filesystem/updater plugins.
- No custom Tauri commands.
- No signing secrets.
- Production remains `NO_GO`.

---

### Task 1: Desktop packaging policy and RED test

**Files:**
- Create: `tests/desktop-packaging.test.js`
- Modify: `packaging/product.json`

**Interfaces:**
- Test reads `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/src/main.rs`, and workflow/config files.
- Product contract gains `desktop.windows` metadata only after implementation.

- [ ] **Step 1: Write failing test**

The test must assert:
- product surface contains `desktop-windows`;
- Tauri config product name/identifier/version are exact;
- `frontendDist` is `../desktop-dist`;
- bundle target is only `nsis`;
- Cargo uses Tauri 2 and edition 2021;
- Rust main contains no `invoke_handler`, shell plugin, filesystem plugin, or updater plugin;
- desktop build script/workflow exists.

- [ ] **Step 2: Run test and observe RED**

Run: `node tests/desktop-packaging.test.js`
Expected: FAIL because `src-tauri/` does not exist.

- [ ] **Step 3: Implement only product contract metadata needed by later tasks**

Add `desktop-windows` to surfaces and:

```json
"desktop": {
  "windows": {
    "framework": "tauri-2",
    "target": "x86_64-pc-windows-msvc",
    "bundle": "nsis",
    "signing": "not-proven",
    "updater": "disabled"
  }
}
```

- [ ] **Step 4: Keep test RED until Tauri files exist**

Run: `node tests/desktop-packaging.test.js`
Expected: FAIL on missing Tauri files, not product metadata.

---

### Task 2: Deterministic desktop asset staging

**Files:**
- Create: `tools/build-desktop-assets.mjs`
- Modify: `tests/desktop-packaging.test.js`
- Modify: `package.json`

**Interfaces:**
- New script: `desktop:assets` -> `node tools/build-desktop-assets.mjs`.
- Staging script copies exactly: `index.html`, `styles.css`, `guardian-core.js`, `evidence-chain.js`, `app.js`, `manifest.webmanifest`, `sw.js`.

- [ ] **Step 1: Extend failing test**
Assert exact allowlist and that the script rejects missing source files.

- [ ] **Step 2: Run test and observe RED**
Run: `node tests/desktop-packaging.test.js`
Expected: FAIL because staging script is missing.

- [ ] **Step 3: Implement staging script**
Use only Node standard library (`fs`, `path`). Remove/recreate `desktop-dist`, copy exact allowlist, and write `desktop-dist/desktop-build.json` with product/version/source file list.

- [ ] **Step 4: Verify GREEN for staging assertions**
Run: `npm run desktop:assets && node tests/desktop-packaging.test.js`
Expected: remaining failures only for missing Tauri/workflow files.

---

### Task 3: Minimal Tauri 2 shell

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`

**Interfaces:**
- `main.rs` initializes `tauri::Builder::default()` and runs generated context only.
- No custom commands or plugins.

- [ ] **Step 1: Use the existing RED assertions from Task 1**

- [ ] **Step 2: Implement minimal Cargo project**
Dependencies:
```toml
[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
```

- [ ] **Step 3: Implement `main.rs`**
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running RUMBO Guardian desktop");
}
```

- [ ] **Step 4: Implement locked-down Tauri config**
Set productName/version/identifier, `beforeBuildCommand` to `node tools/build-desktop-assets.mjs`, `frontendDist` to `../desktop-dist`, one main window, and bundle targets `["nsis"]`. Do not configure updater.

- [ ] **Step 5: Run desktop packaging tests**
Run: `node tests/desktop-packaging.test.js`
Expected: failures only for workflow/package script if not yet added.

---

### Task 4: Windows CI build artifact

**Files:**
- Create: `.github/workflows/desktop-build.yml`
- Modify: `package.json`
- Modify: `tests/desktop-packaging.test.js`

**Interfaces:**
- `desktop:check`: `cargo check --manifest-path src-tauri/Cargo.toml`.
- `desktop:build`: `cargo tauri build --manifest-path src-tauri/Cargo.toml --bundles nsis` (or equivalent supported CLI invocation).

- [ ] **Step 1: Extend test for workflow policy**
Assert `windows-latest`, Node 22, release validation, desktop test, Rust setup, Cargo/Tauri build, artifact upload, and absence of GitHub Release publication/signing secrets.

- [ ] **Step 2: Run test and observe RED**
Run: `node tests/desktop-packaging.test.js`
Expected: FAIL because workflow is missing.

- [ ] **Step 3: Implement workflow**
Use checkout, setup-node, `dtolnay/rust-toolchain@stable`, install `tauri-cli` v2 via Cargo, run validation/tests/assets/check/build, then `actions/upload-artifact@v4` for `src-tauri/target/release/bundle/nsis/*-setup.exe`.

- [ ] **Step 4: Run local static tests**
Run: `node tests/desktop-packaging.test.js && npm run release:validate && npm run check && npm test`
Expected: PASS locally for all non-Windows-build checks.

---

### Task 5: CI verification and draft PR

**Files:** no new functional files unless CI exposes a real defect.

- [ ] **Step 1: Push branch / open draft PR against `packaging/rf-foundation`**
The PR must explicitly state that it is stacked on Release Foundation and must not merge before PR #31.

- [ ] **Step 2: Inspect Windows workflow**
Require successful `desktop:assets`, desktop policy tests, Cargo check, and NSIS build.

- [ ] **Step 3: Inspect artifact list**
Require an uploaded NSIS `.exe`; record artifact metadata. Do not call it signed.

- [ ] **Step 4: Re-run full Guardian regression**
Require `npm run check` and `npm test` PASS.

- [ ] **Step 5: Report exact state**
Desktop build may become `BUILD_PASS`; code signing, updater, install/upgrade/rollback, Store and production remain `NOT_PROVEN`/`NO_GO`.