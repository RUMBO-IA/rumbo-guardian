# Guardian Product Registry — governed successor to PR #38

This source-only registry captures historical 1.0.0 evidence and a DRAFT, non-current 1.1.0-rc.1 record from the former stacked branch.

- Runtime version remains 1.0.0 in package, browser extension, product manifest, Tauri and Cargo.
- Registry declared_version=1.0.0, current_stable=null, current_candidate=null; proposed_candidate=1.1.0-rc.1 is not an approved release or deployable artifact.
- Historical checksum is a manifest receipt, not a present-tense binary re-verification or production approval.
- SBOM, provenance, install, upgrade and rollback for historical and candidate records are NOT_PROVEN; candidate installer digest absent.
- Validator rejects lineage cycles, invalid release identifiers, unauthorized pointers/promotions and false evidence.
- CI is read-only, uses SHA-pinned external actions and keeps production closed. No signing, installer delivery, auto-update, secrets or spend changes.

Source: https://github.com/RUMBO-IA/rumbo-guardian/pull/38. Do not merge its obsolete stacked branch.
