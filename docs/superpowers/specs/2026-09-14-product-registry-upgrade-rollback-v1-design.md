# RUMBO Guardian Product Registry + Upgrade/Rollback v1 Design

## Status

Design approved in conversation on 2026-09-14. This specification is intentionally architectural: implementation must not begin until this written spec is reviewed and approved.

## Problem

RUMBO Guardian now has evidence for source/release contracts, a Windows Tauri/NSIS build, locked dependencies/toolchains, SPDX SBOM, GitHub/Sigstore provenance, and an isolated clean install/uninstall lab. What it does not yet have is a canonical machine-readable product registry that relates releases to predecessors/successors, nor a real N-1 -> N -> N-1 upgrade/rollback proof.

A build artifact is not a release, and a verified release is not production authorization.

## Goals

1. Add an append-only, Git-versioned Product Registry for Guardian.
2. Represent historical `1.0.0` as N-1 without rewriting its historical evidence.
3. Introduce `1.1.0-rc.1` as the first N candidate.
4. Bind every registry record to product identity, source, artifact/evidence references, predecessor lineage, release state, and authorization state.
5. Add deterministic validation that fails closed on invalid state transitions, missing lineage, version inconsistency, malformed hashes, or unauthorized production/publication claims.
6. Add an isolated Windows lab that proves N-1 install -> N upgrade -> N-1 rollback -> uninstall with machine-readable evidence.
7. Preserve existing security boundaries: no Authenticode key, updater private key, Store publication, GitHub Release publication, or production authorization.

## Non-goals

- No automatic production promotion.
- No remote updater endpoint.
- No Tauri updater key generation.
- No Authenticode certificate acquisition or signing.
- No Microsoft Store submission.
- No migration of unrelated RUMBO products into this registry in v1.
- No claim of byte-for-byte NSIS reproducibility.
- No mutation of the historical `1.0.0` release artifact.

## Chosen architecture

Use a Git-native append-only registry under `registry/rumbo-guardian/`. Git is the authority for registry history in v1. GitHub Releases remain a distribution surface, not the authority. A database/service registry is deferred until multiple products require cross-repository coordination.

```text
registry/rumbo-guardian/
  product.json
  releases/
    1.0.0.json
    1.1.0-rc.1.json
  state-machine.json
```

The validator is deterministic Node.js standard-library code and performs no network, secret, shell, or remote write operations.

## Product record

`registry/rumbo-guardian/product.json` uses schema `rumbo.product-registry.product/v1` and declares:

- product id: `rumbo-guardian`
- display name: `RUMBO Guardian`
- registry schema version
- historical baseline: `1.0.0`
- current stable: `null` until a release is explicitly promoted under this registry
- current candidate: `1.1.0-rc.1`
- allowed release states
- production authority remains false

This distinction prevents the registry from retroactively asserting that the historical `1.0.0` release satisfied the new `STABLE` gate.

## Release record

Each `releases/<version>.json` uses schema `rumbo.product-registry.release/v1` and contains:

```json
{
  "schema": "rumbo.product-registry.release/v1",
  "product": "rumbo-guardian",
  "version": "1.1.0-rc.1",
  "channel": "candidate",
  "state": "RC",
  "predecessor": "1.0.0",
  "source": {
    "repository": "RUMBO-IA/rumbo-guardian",
    "commit_sha": "<40 lowercase hex>"
  },
  "artifact": {
    "platform": "windows-x86_64",
    "format": "nsis",
    "sha256": null
  },
  "evidence": {
    "sbom": "PENDING",
    "provenance": "PENDING",
    "install": "PENDING",
    "upgrade": "PENDING",
    "rollback": "PENDING"
  },
  "authorization": {
    "publication_authorized": false,
    "production_go": false
  }
}
```

A candidate may begin with artifact/evidence fields pending. It cannot transition to `APPROVED`, `CANARY`, or `STABLE` unless the requirements for that state are satisfied. `RC` is allowed to contain pending runtime/distribution evidence because it is the state in which those gates are exercised.

## Historical 1.0.0 treatment

The `1.0.0` record is a historical registry import, not a retroactive claim. It records the already-known source/artifact identity and explicitly marks evidence that did not exist at release time as absent/not-proven. Its state is `VERIFIED` only to reflect the existing historical release contract; it is the `historical_baseline`, not `current_stable`, and it must not be silently upgraded to `STABLE` under the new registry semantics.

Known historical identity:

- source commit: `43bc3354924220ba76161891a1b48108ffda17b4`
- source tree: `c74c58df8fbc7ddd017e4ba18cceee1cfb08b5df`
- artifact: `RUMBO_Guardian_V1.0.0.zip`
- artifact SHA-256: `1d81530ea463a1a59034ed772889712d103237ce6dc588903419eb13234f8eeb`
- production_go: false
- publication_authorized: false in the new control plane

## Release state machine

Allowed states:

```text
DRAFT -> VERIFYING -> VERIFIED -> RC -> APPROVED -> CANARY -> STABLE
```

Terminal/side states:

```text
REVOKED
SUPERSEDED
```

Rules:

- No state skipping for new transitions governed by this registry.
- Historical import at `VERIFIED` is a declared migration exception, not a replayed transition history.
- `REVOKED` cannot return to an active state.
- `SUPERSEDED` cannot become current candidate/stable.
- `APPROVED`, `CANARY`, and `STABLE` require human/policy authority outside the validator.
- `production_go=false` blocks production regardless of technical evidence.
- Technical PASS never creates authorization.

## Versioning

Guardian moves from historical baseline `1.0.0` to candidate `1.1.0-rc.1`. The version must be consistent across the candidate registry record, `package.json`, browser extension manifest, Tauri config, and release/product contracts that represent the candidate.

The version bump is a candidate identity change, not a production release. It must not create a GitHub Release or publish to any store.

## Upgrade/rollback lab

The lab runs only on an ephemeral GitHub-hosted Windows runner.

Sequence:

```text
obtain exact N-1 1.0.0 artifact
-> verify historical hash before execution
-> install N-1 silently/currentUser
-> verify N-1 executable identity
-> create controlled user-state fixture
-> build N 1.1.0-rc.1 from the exact tested source SHA
-> install N over N-1 using the supported NSIS path
-> verify N executable identity
-> verify controlled user-state preservation
-> uninstall N as needed for rollback semantics
-> reinstall N-1
-> verify N-1 identity
-> verify rollback state contract
-> uninstall N-1
-> assert install directory has no residual files
-> emit JSON receipt with hashes, source SHAs, versions, steps, and outcomes
```

The lab must distinguish application upgrade/rollback from Tauri remote updater behavior. Passing this lab does not prove the updater plugin or updater signing.

## N-1 source integrity

The lab must never rebuild `1.0.0` from current source and call that N-1. It must consume the exact historical artifact and verify SHA-256 `1d81530ea463a1a59034ed772889712d103237ce6dc588903419eb13234f8eeb` before executing it. If that artifact cannot be obtained and verified, `HISTORICAL_N_MINUS_1_ARTIFACT=NOT_PROVEN` and the full real upgrade/rollback claim remains blocked. A synthetic fixture may be used only for plumbing tests and can never satisfy the real upgrade/rollback gate.

## Evidence receipt

Schema: `rumbo.desktop.upgrade-rollback-lab/v1`.

Required fields:

- source SHA for N
- immutable identity/hash for N-1
- N and N-1 versions
- installer SHA-256 values
- install mode
- N-1 install result
- N upgrade result
- state preservation result
- rollback result
- final uninstall result
- residual file count
- runner identity
- timestamps for observations

The receipt is uploaded as a CI artifact. It is evidence, not authorization.

## Attestation verification

Existing provenance/SBOM attestations must be consumed, not merely generated. The release verification lane will add `gh attestation verify` against the expected repository/workflow identity before evidence can satisfy a registry verification gate. GitHub documentation states that attestations provide provenance but must be verified to realize the security benefit; attestations alone do not guarantee that an artifact is secure.

## Security boundaries

The implementation must preserve:

- `contents: read` for ordinary build/test jobs.
- `id-token: write` and `attestations: write` only in the attestation-producing job/workflow that needs them.
- no private signing material in source, artifacts, logs, or test fixtures.
- no shell/filesystem/updater Tauri plugins added by this project.
- no browser automation or user-PC access.
- no remote writes outside GitHub source/PR operations explicitly performed during development.

## Failure policy

Fail closed on:

- unknown schema or product id
- malformed semantic version/candidate version
- missing predecessor for non-root releases
- predecessor not found
- lineage cycles
- state skipping for governed transitions
- artifact hash malformed when present
- source SHA malformed
- candidate version disagreement across product surfaces
- evidence marked PASS without required identity/reference
- `production_go=true`
- `publication_authorized=true` in this v1 project
- attempt to label updater/signing/Store as proven

## Testing strategy

1. Unit/policy tests for registry schemas and state transitions.
2. Negative fixtures for invalid hashes, missing predecessor, cycles, skipped states, and unauthorized production/publication.
3. Version consistency test across registry/package/extension/Tauri contracts.
4. Existing release/desktop/trust/install regression suites remain mandatory.
5. Windows upgrade/rollback lab is separate from policy tests and produces a receipt.
6. Artifact attestation verification is a separate gate from attestation generation.

## Acceptance criteria

Product Registry v1 is technically PASS only when:

- registry validator is deterministic and green;
- historical 1.0.0 record is evidence-honest and is not represented as `STABLE`;
- candidate 1.1.0-rc.1 identity is consistent across required surfaces;
- invalid transitions/lineage/authorization fail closed;
- all inherited regression suites pass.

Upgrade/Rollback v1 is PASS only when the exact historical N-1 artifact is hash-verified and the Windows lab proves N-1 -> N -> N-1 with the required receipt. If the historical artifact is unavailable, the registry can pass while the real upgrade/rollback gate remains `NOT_PROVEN`.

## Explicit post-implementation state

Even if all technical acceptance criteria pass:

```text
AUTHENTICODE=NOT_PROVEN
TAURI_UPDATER=DISABLED/NOT_PROVEN
MICROSOFT_STORE=NO_GO
BYTE_REPRODUCIBLE_NSIS=NOT_PROVEN
PRODUCTION=NO_GO
```

No implementation step may silently change those values.
