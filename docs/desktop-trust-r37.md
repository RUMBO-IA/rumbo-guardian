# GUARDIAN desktop trust candidate (R37)

This is a successor to historical stacked PR #34, on modern `main`. It updates the **source/build workflow only**, not signing, installer distribution, auto-update or a production release.

## Architecture and least privilege

- `windows-nsis` runs for PRs targeting `main` and on authorized manual dispatch. It retains top-level `contents: read` permissions. It compiles an **unsigned** NSIS installer and generates `build/guardian.spdx.json` with a SHA-pinned Anchore action.
- The installer and SBOM are uploaded as one CI artifact. This requires no repo write, id-token or attestation permission in the PR job.
- `attest-windows` depends on the build and runs **only for `workflow_dispatch`**. This separate job alone receives `id-token: write`, `attestations: write`, and `artifact-metadata: write`. It downloads the artifact and verifies the installer and SBOM paths before producing provenance and SPDX SBOM attestations using a pinned GitHub action.
- `workflow_dispatch` is a **manual operation**. No attestation execution is claimed merely because PR CI passes. Signing, release publishing, deployment, and installer distribution remain disabled.

## Validation and limits

The static regression test `tests/desktop-trust.test.js` ensures job-permission isolation, branch triggers, pinned actions, SBOM format, artifact paths and restricted deployment behavior. It is invoked in `npm test` / `npm run test:unit` / `npm run check`.

An attestation signs provenance of the downloaded unsigned artifact, **not a code-signing certificate**. It is not proof of production quality, desktop installation correctness or a successful manual attestation run. The latter requires an explicitly dispatched workflow and separate evidence for its exact SHA.

The original stacked PR #34 is retained for traceability. It should not be merged directly because its branch targets and workflow permissions conflict with the updated build foundation.
