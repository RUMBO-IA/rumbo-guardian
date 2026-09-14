# RUMBO Release Foundation v1

## Goal
Establish the first productization layer for RUMBO Guardian without changing its security engine: a canonical product contract, release manifest, deterministic validator, and CI gate that separates build verification from publication authority.

## Scope
This phase deliberately does not add the desktop shell, store submission, code signing, auto-update, or cloud services. It establishes the contracts those later phases must consume.

## Architecture
The product contract declares identity, version, surface, permissions, and trust requirements. A release manifest binds a product version to an exact source commit/tree, artifact metadata, verification results, and distribution readiness. A Node-only validator consumes the product/release contracts and fails closed on missing fields, version drift, broad browser permissions, missing artifact identity, or an invalid release state.

The validator is advisory for build preparation only: it cannot authorize publication, modify credentials, or perform external side effects.

## Requirements
1. Product metadata must be machine-readable.
2. Version must be explicit and consistent across package, browser manifest, product contract, and release manifest.
3. Browser permission policy must declare the allowed permission set and reject broad `host_permissions` for Guardian.
4. Release manifests must bind to an exact commit SHA and tree SHA.
5. Artifact SHA-256, SBOM status, provenance status, and test status must be explicit.
6. Release state must be one of `DRAFT`, `VERIFIED`, `RC`, `APPROVED`, `CANARY`, `STABLE`, `REVOKED`, or `SUPERSEDED`.
7. `APPROVED`, `CANARY`, and `STABLE` require signed/provenance fields to be present; the validator must never claim that it performed the signing.
8. The validator must produce deterministic JSON and a non-zero exit code on failure.
9. The CI gate must run on Node 22 and must not require secrets.
10. No existing Guardian detection or authorization behavior is modified in this phase.

## Security boundaries
- No arbitrary shell execution.
- No network calls from the validator.
- No secret material.
- No publication side effects.
- No production authorization.

## Future compatibility
The manifest schema must be extensible for desktop, extension, PWA, CLI, MCP and plugin artifacts without changing the core identity fields.
