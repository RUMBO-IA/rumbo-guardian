# Verification Evidence - V0.7.0

Verification date: 2026-09-04

## Automated checks

- JavaScript syntax: PASS for application, shared core, service worker, server, extension and portfolio test.
- V0.3 baseline regression tests: PASS.
- Portfolio portability test: PASS.
- V0.4.0 portfolio-polish test: PASS.
- Web manifest: PASS through repository parsing and serving baseline.
- Extension manifest: RUMBO Guardian 0.7.0.
- Pre-publication secret/path scan remains part of the release gate.

## Browser-extension integration

The repeatable integration harness loaded the unpacked extension in an isolated Brave 152 profile and exercised it against a controlled phishing fixture.

Observed result:
- Extension: RUMBO Guardian 0.7.0.
- Popup: opened successfully.
- Risk score: 100/100.
- Classification: Riesgo Alto.
- Signals: insecure HTTP, direct-IP URL, unusual port, urgency, credential request, payment language, password form and cross-origin form destination.
- Integration test: PASS.
- Test profile: isolated and disposable.

## Portfolio evidence
- Reproducible dashboard capture: `scripts/capture-portfolio.ps1`.
- Synthetic dashboard fixture only; no personal or customer data.
- Screenshot: `portfolio/dashboard-v031.png`.
- Screenshot SHA-256: `DC40D1A941AC5EBA3740CB248C1C24581C9D60833535838015B07A5E4C495985`.
- Captured dashboard result: 91/100, Riesgo Alto.

## Release provenance

Git history is the source of truth for commit-level provenance. The release ZIP is generated from Git-tracked files after the release commit is finalized, and its digest is recorded in GitHub Release metadata to avoid a self-referential package digest.

## Tamper-evident Evidence Ledger

V0.4.0 adds SHA-256 hash chaining to local analysis history. Each event stores a sequence number, the previous entry hash and its own deterministic entry hash. Existing V0.3 history is migrated locally into a verified chain.

Fresh isolated-Brave integration evidence:
- Two analysis events appended successfully.
- Integrity badge: `Integridad verificada · 2`.
- Programmatic chain verification: `valid=true`.
- Controlled mutation of event 1 score from its stored value to `99`.
- Integrity badge after mutation: `Integridad comprometida · evento 1`.
- Browser integration test: PASS.

The chain is tamper-evident, not an external timestamp or remote attestation. A party with full local-storage control can replace the complete ledger; V0.4.0 detects mutations relative to the stored chain structure but does not claim immutable remote custody.
## V0.4.1 — URL deception hardening

V0.4.1 adds structural URL-deception signals while preserving the local-first architecture.

Verified behaviors:
- Detects a canonical brand domain used as a misleading prefix inside a different host (`brand_shadow`).
- Detects authority confusion where domain-like text appears before `@` while navigation resolves to another host (`authority_confusion`).
- Official canonical domains do not trigger either structural signal.
- Web-app and extension cores are exercised against the same deception cases to prevent behavioral drift.
- Existing URL, message, domain-context and Evidence Ledger regressions remain green.

Integration reliability was also hardened: both Brave integration runners now provision and verify the local Guardian server when it is not already running, then clean it up after the run. This removes an implicit dependency on an operator-started server that previously caused false browser-integration failures.

Fresh isolated-Brave verification:
- Extension loaded as RUMBO Guardian 0.4.1.
- Controlled phishing fixture: 88/100, Riesgo Alto.
- Extension integration: PASS.
- Evidence Ledger: `Integridad verificada · 2` before mutation.
- Controlled ledger mutation: `Integridad comprometida · evento 1`.
- Ledger browser integration: PASS.



## V0.4.2 — Independent offline ledger verification

V0.4.2 adds `tools/verify-ledger.js`, a standalone verifier for exported Guardian Evidence Ledgers. The verifier ignores any claimed integrity result inside the export and recomputes sequence continuity, previous-hash linkage and every SHA-256 entry hash from the actual history payload.

Verification evidence:
- TDD red phase: CLI test failed because the verifier did not exist.
- Green phase: valid two-event ledger exits `0` and emits a deterministic root hash.
- Controlled mutation of event 1 exits `2` and reports `brokenAt=1`.
- Missing/unreadable input uses a distinct operational error path.
- Synthetic committed fixture: `portfolio/demo-ledger-v042.json`.
- Synthetic fixture root hash: `907d7915d5946bd8f06a47731bca9914f4ab4ba190589650d79cb2cec02a8484`.

This closes an evidence-portability gap: a reviewer can now verify an exported ledger independently of the browser UI and localStorage state.

## V0.5.0 - Context-menu pre-navigation analysis

V0.5.0 adds an explicit browser context workflow for analyzing links and selected text without first navigating to the target.

Verification evidence:
- TDD red phase: `tests/context-menu.test.js` failed before `contextMenus` permission and background/report files existed.
- Static contract: exactly two context actions (`link`, `selection`), no broad `host_permissions`, no fetch/XHR/WebSocket in the new background/report path.
- Payload transport: random UUID token in the internal report URL; selected content is stored under `chrome.storage.session` and removed after consumption.
- Full Node regression suite: PASS.
- JavaScript syntax gate: PASS.
- Isolated Brave 152 extension load: PASS as RUMBO Guardian 0.5.0.
- Existing controlled phishing fixture: 88/100, Riesgo Alto.
- Real extension service-worker context path invoked against `http://openai.com.evil.test/login`.
- Internal Context Analysis report opened and preserved the subject.
- Context result: 46/100, Riesgo Medio, with URL-deception evidence.
- Real-browser integration: PASS.

The context workflow is user initiated and local. It is designed for pre-navigation inspection, not for automatic browsing interception or remote reputation lookup.

## V0.6.0 - Nested redirect detection

TDD red phase reproduced the missing capability against `https://trusted.example/redirect?url=https%3A%2F%2Fopenai.com.evil.example%2Flogin`. The implementation now detects the external redirect target, independently scores the nested destination, preserves app/extension parity, does not penalize same-site redirects, and ignores URL-shaped values in unrelated parameters such as `text`.

## V0.7.0 - Form Destination Integrity

TDD and verification evidence:
- RED: `tests/form-destination.test.js` failed because `analyzeFormDestination` did not exist.
- GREEN: shared app/extension form-destination analysis passes deterministic parity tests.
- Popup integration RED then GREEN: active-tab scanning now collects form actions, methods and per-form password-field counts.
- Full Node regression suite: PASS.
- JavaScript syntax gate: PASS.
- Isolated Brave 152 extension load: PASS as RUMBO Guardian 0.7.0.
- Controlled fixture: 100/100, Riesgo Alto.
- Popup exposed `Formulario hacia dominio externo` without submitting the form.
- Existing context-menu path remained 46/100, Riesgo Medio.
- Evidence Ledger browser tamper integration: PASS.

Boundary: Guardian inspects form destinations only during explicit active-tab analysis. It does not submit forms or transmit captured form data.
