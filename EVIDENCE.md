# Verification Evidence — V0.4.0

Verification date: 2026-09-04

## Automated checks

- JavaScript syntax: PASS for application, shared core, service worker, server, extension and portfolio test.
- V0.3 baseline regression tests: PASS.
- Portfolio portability test: PASS.
- V0.4.0 portfolio-polish test: PASS.
- Web manifest: PASS through repository parsing and serving baseline.
- Extension manifest: RUMBO Guardian 0.4.0.
- Pre-publication secret/path scan remains part of the release gate.

## Browser-extension integration

The repeatable integration harness loaded the unpacked extension in an isolated Brave 152 profile and exercised it against a controlled phishing fixture.

Observed result:
- Extension: RUMBO Guardian 0.4.0.
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