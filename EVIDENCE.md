# Verification Evidence — V0.3.0

Verification date: 2026-09-04

## Automated checks

- JavaScript syntax: PASS for application, shared core, service worker, server, extension and tests.
- Unit tests: `RUMBO Guardian V0.3 tests: PASS`.
- Portfolio portability test: PASS.
- Web manifest: PASS.
- Extension manifest: PASS.
- HTTP serving: PASS (200) for application, shared core, app script and stylesheet.
- Portfolio positioning audit: PASS.
- Pre-publication secret/path scan: no publishable-source matches.

## Browser-extension integration

The extension was loaded in an isolated Brave 152 profile and exercised against a controlled phishing fixture through the repeatable integration harness.

Observed result:
- Extension: RUMBO Guardian 0.3.0.
- Popup: opened successfully.
- Risk score: 88/100.
- Classification: Riesgo Alto.
- Signals: insecure HTTP, direct-IP URL, unusual port, urgency, credential request, payment language and password form.
- Integration test: PASS.
- Test profile: removed after execution.
## Release provenance

The canonical ZIP is generated from Git-tracked files after the release commit is finalized. Its SHA-256 is recorded in the external release metadata rather than embedded here, avoiding a self-referential package digest.

Git history is the source of truth for commit-level provenance.