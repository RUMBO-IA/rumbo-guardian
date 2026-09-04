# Security Model

RUMBO Guardian V0.8.0 is designed as a local-first, operator-controlled analysis layer.

## Data handling
- Message and URL analysis runs in the local application.
- Browser-page inspection occurs only after an explicit extension action.
- Link and selected-text context analysis occurs only after an explicit context-menu action.
- The extension uses `activeTab`, `scripting`, `storage` and `contextMenus` without broad persistent host permissions.
- Context-menu payloads use short-lived `storage.session` records and are deleted when the report consumes them.
- Trusted and blocked domain context is stored locally.
- Evidence exports are created only when requested by the operator.

## Detection model
The current engine combines explainable heuristics such as transport security, direct-IP URLs, encoded domains, suspicious TLDs, URL shorteners, sensitive URL paths, credential requests, urgency, payment language and password forms.

## Safety boundary
A risk score is an analytical signal, not a definitive malware verdict. Single weak indicators are insufficient to classify a site as malicious. The interface preserves reasons so an operator can independently evaluate the evidence.

## Evidence Ledger integrity boundary

V0.4.0 chains local evidence entries with SHA-256 to expose in-place mutation and broken sequence continuity. This is tamper-evidence inside the local dataset, not remote attestation, notarization, trusted timestamping or immutable custody. An actor with complete control of browser storage can replace the entire ledger and recompute a new chain.
## Nested redirect boundary
V0.6.0 inspects only a bounded allowlist of common redirect-parameter names and only absolute HTTP(S) targets. It does not follow network redirects, fetch remote content, or claim that every external redirect is malicious. Same-site targets are not penalized as external redirects.

## Form destination boundary
V0.7.0 inspects form action URLs only during explicit active-tab analysis. Guardian does not submit forms, type credentials, navigate to the target, or perform remote reputation lookups. Cross-origin submission is a risk signal, not proof of malicious intent.
