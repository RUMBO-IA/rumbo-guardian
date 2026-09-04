# Verification Evidence — V0.3.0

Verification date: 2026-09-04

## Automated checks
- JavaScript syntax: PASS for application, shared core, service worker, server, extension and tests.
- Unit tests: `RUMBO Guardian V0.3 tests: PASS`.
- Web manifest: PASS.
- Extension manifest: PASS.
- Shared core parity between app and extension: verified before integration testing.
- HTTP serving: PASS (200) for application, shared core, app script and stylesheet.
- Portfolio positioning audit: PASS.

## Browser-extension integration
The extension was loaded in an isolated Brave 152 profile and exercised against a controlled phishing fixture.

Observed result:
- Extension: RUMBO Guardian 0.3.0
- Popup: opened successfully
- Risk score: 88/100
- Classification: Riesgo Alto
- Signals included insecure HTTP, direct-IP URL, unusual port, urgency, credential request, payment language and password form.
- Integration test: PASS

## Canonical package
`RUMBO_Guardian_V0.3.zip`

SHA-256: `33A95611E29790331E6E7733B132A486DE24030A667D0E356ECD68E6D7E2A835`
