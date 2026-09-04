# Verification Evidence — V0.3.1

Verification date: 2026-09-04

## Automated checks

- JavaScript syntax: PASS for application, shared core, service worker, server, extension and portfolio test.
- V0.3 baseline regression tests: PASS.
- Portfolio portability test: PASS.
- V0.3.1 portfolio-polish test: PASS.
- Web manifest: PASS through repository parsing and serving baseline.
- Extension manifest: RUMBO Guardian 0.3.1.
- Pre-publication secret/path scan remains part of the release gate.

## Browser-extension integration

The repeatable integration harness loaded the unpacked extension in an isolated Brave 152 profile and exercised it against a controlled phishing fixture.

Observed result:
- Extension: RUMBO Guardian 0.3.1.
- Popup: opened successfully.
- Risk score: 88/100.
- Classification: Riesgo Alto.
- Signals: insecure HTTP, direct-IP URL, unusual port, urgency, credential request, payment language and password form.
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