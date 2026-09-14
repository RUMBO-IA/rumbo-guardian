# RUMBO Guardian Desktop Foundation v1

## Goal
Add a Windows-first Tauri 2 desktop shell for RUMBO Guardian that reuses the existing local-first web UI and core without granting new privileged capabilities, and that can be built in GitHub Actions into an unsigned NSIS installer for verification purposes.

## Scope
This phase adds a minimal Tauri shell, deterministic desktop asset staging, packaging tests, and a Windows build workflow. It deliberately does not enable updater functionality, code-signing, native messaging, arbitrary shell execution, filesystem plugins, credential access, browser control, or Store publication.

## Architecture
Guardian remains a shared deterministic web/core product. A Node staging script copies only the approved static runtime files into `desktop-dist/`. Tauri loads that directory as local application assets. The Rust shell contains no custom commands and exposes only the default core capability required to render the app. The build target is Windows NSIS on GitHub Actions.

## Static asset boundary
Approved desktop runtime files:
- `index.html`
- `styles.css`
- `guardian-core.js`
- `evidence-chain.js`
- `app.js`
- `manifest.webmanifest`
- `sw.js`

The existing `app.js` already registers the service worker only for HTTP(S), so the desktop asset protocol does not attempt PWA service-worker registration. Browser-install UI remains dormant because `beforeinstallprompt` will not fire in the Tauri shell.

## Security boundaries
- No `shell` plugin.
- No filesystem plugin.
- No updater plugin in v1.
- No custom Tauri `invoke` commands.
- No secrets or signing material in source.
- No remote navigation configured.
- No production authorization.
- Packaging success must not change `PRODUCTION=NO_GO`.

## Build contract
- Tauri major version: 2.
- Rust edition: 2021.
- Windows target: x86_64-pc-windows-msvc.
- Bundle target in this phase: NSIS only.
- Product name: `RUMBO Guardian`.
- Application identifier: `com.rumbo.guardian`.
- Version: `1.0.0`, matching package/extension/product contracts.
- Frontend assets: `desktop-dist/`, generated before build.

## CI contract
A Windows GitHub Actions workflow must:
1. checkout source;
2. install Node 22;
3. install stable Rust with the Windows MSVC target;
4. run existing release validation;
5. run desktop packaging tests;
6. stage desktop assets;
7. run `cargo check` for `src-tauri`;
8. run `cargo tauri build --bundles nsis`;
9. upload the generated NSIS installer as a workflow artifact.

The workflow does not publish a GitHub Release and does not sign the installer.

## Verification states
Desktop source/config can become `PASS` when tests and CI prove them. Code signing, updater signing, clean-machine install, upgrade, rollback, Store readiness, and production stay `NOT_PROVEN`/`NO_GO` until separate evidence exists.

## Future phases
A later phase may add code signing, updater signing, install/upgrade/rollback labs, native messaging, and Store packaging. Each requires its own trust and authorization gates.