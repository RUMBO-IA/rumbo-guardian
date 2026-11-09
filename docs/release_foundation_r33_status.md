# GUARDIAN — Release Foundation reconciliation R33 (2026-11-08)

The original draft PR #31 was based on an older Guardian `main` and conflicts with the current npm scripts. This candidate ports its release foundation contracts, validator, tests, and historical planning documents to the current `main`, preserving all modern Guardian tests.

## Scope and interpretation

- `packaging/product.json` expresses Guardian identity and browser permissions.
- `packaging/release.json` records a **historical Guardian 1.0.0 artifact**, tied to its own source commit/tree and artifact digest. Its `VERIFIED` state is not an attestation that today's `main` commit has been signed, released, installed, or rolled out.
- The validator only validates declared schema, version consistency, permission policy, presence and syntax of hashes, and publication-state trust flags. It does **not** cryptographically verify the historical artifact bytes, SBOM/provenance, signature, source provenance, or new release production authority.
- Merging the contracts does not publish a release, distribute an installer, change provider credentials, or promote to production.
- The original stacked release/desktop PRs #32, #34, #36 and #38 remain separate and require their own exact-head tests and branch ancestry governance. The original #31 is not merged by a successor.

## CI security

The new `Release Foundation` workflow pins its external actions to immutable full-length SHAs, uses `persist-credentials: false` for checkout, limits runtime to 15 minutes, grants only `contents: read`, and uses a unique job name `release-foundation-verify` instead of colliding with canonical `verify`. It runs only on PRs against `main` and pushes to `main`.

Registered npm scripts: `release:validate`, release tests in `npm test`, `npm run test:unit`, and syntax checks in `npm run check`.

## Verification boundary

Local Node 22: `npm run release:validate`, focused release tests, `npm test`, `npm run test:unit`, `npm run check`, and GitHub Actions supply chain check for five workflows PASS. Python PR auditor 56/56 PASS. Hosted exact-SHA CI/CodeQL must still be established before any merge.
