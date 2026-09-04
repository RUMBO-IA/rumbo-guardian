# RUMBO Guardian

**Category:** RUMBO Security Intelligence
**Version:** 1.0.0
**Positioning:** Independent security layer for phishing, fraud, impersonation and suspicious-navigation analysis.

## Product principles
- Privacy-first.
- Local-first analysis.
- Private by design.
- Explainable evidence over opaque verdicts.
- Operator-controlled context without suppressing technical indicators.

## Portfolio narrative
RUMBO Guardian demonstrates a modular security architecture: shared deterministic risk logic, an operator-facing web application, a tamper-evident Evidence Ledger with independent verification, domain-context controls and a Manifest V3 extension.

## V0.5.0 scope
The product scores and explains suspicious messages and URLs, ranks visible links, detects URL-deception patterns, stores trusted/blocked domain context locally, exports verifiable evidence, inspects the active tab on demand, and adds explicit right-click analysis for links and selected text.

The context-menu workflow uses ephemeral extension session storage and a random non-sensitive token to move analysis payloads into an internal report page without embedding the selected content in the report URL. No broad host permissions are introduced.

## V0.6.0 scope
Guardian detects external destinations embedded in common redirect parameters and analyzes those nested URLs before navigation. Same-site redirects remain non-penalized, and unrelated URL-valued parameters are ignored to reduce false positives.

## V0.7.0 scope
Guardian analyzes form submission destinations during explicit active-tab inspection. External form targets become visible evidence, password-bearing cross-origin forms receive a stronger signal, and same-site/self-submit forms remain non-penalized.

## V0.9.0 scope
Guardian detects multi-encoded external destinations inside recognized redirect parameters using bounded local decoding. The destination is not fetched or followed.

## V1.0.0 scope
Guardian performs bounded local redirect-chain analysis for up to three recognized hops. It preserves nested destination evidence, inherits material downstream risk, detects repeated routes, and caps redirect parameters to prevent unbounded local analysis.
