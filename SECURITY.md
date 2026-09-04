# Security Model

RUMBO Guardian V0.3 is designed as a local-first, operator-controlled analysis layer.

## Data handling
- Message and URL analysis runs in the local application.
- Browser-page inspection occurs only after an explicit extension action.
- The extension uses `activeTab` and `scripting` permissions rather than persistent host access.
- Trusted and blocked domain context is stored locally.
- Evidence exports are created only when requested by the operator.

## Detection model
The current engine combines explainable heuristics such as transport security, direct-IP URLs, encoded domains, suspicious TLDs, URL shorteners, sensitive URL paths, credential requests, urgency, payment language and password forms.

## Safety boundary
A risk score is an analytical signal, not a definitive malware verdict. Single weak indicators are insufficient to classify a site as malicious. The interface preserves reasons so an operator can independently evaluate the evidence.
