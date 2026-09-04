# RUMBO Guardian

**RUMBO Security Intelligence** · v0.6.0

[![Guardian CI](https://github.com/fscfede-beep/rumbo-guardian/actions/workflows/ci.yml/badge.svg)](https://github.com/fscfede-beep/rumbo-guardian/actions/workflows/ci.yml)
[![Guardian Pages](https://github.com/fscfede-beep/rumbo-guardian/actions/workflows/pages.yml/badge.svg)](https://github.com/fscfede-beep/rumbo-guardian/actions/workflows/pages.yml)
[![Release](https://img.shields.io/github/v/release/fscfede-beep/rumbo-guardian)](https://github.com/fscfede-beep/rumbo-guardian/releases)

RUMBO Guardian is an independent security intelligence layer for detecting and explaining signals associated with phishing, fraud, impersonation and suspicious navigation.

It follows a **privacy-first, local-first** architecture: technical analysis runs on the operator's device, evidence remains inspectable, and contextual trust decisions never erase underlying technical indicators.

**Portfolio demo:** https://fscfede-beep.github.io/rumbo-guardian/

**RUMBO public surfaces:** [rumbo.verso.fans](https://rumbo.verso.fans/) · [@RumboAGI on X](https://x.com/RumboAGI)

![RUMBO Guardian dashboard showing an explainable high-risk analysis](portfolio/dashboard-v031.png)

## Core capabilities

- Explainable 0–100 risk scoring for messages and URLs.
- Detection of urgency, credential requests, payment signals and suspicious domains.
- Local trusted / blocked domain context.
- Tamper-evident Evidence Ledger with SHA-256 hash chaining, local integrity verification and JSON export.
- Individual risk-report export.
- Installable PWA for desktop use.
- Brave / Chrome extension for explicit, on-demand inspection of the active tab.
- Context-menu analysis for links and selected text before navigation or follow-up action.
- Cross-origin form destination analysis, with stronger evidence when password fields submit off-site.
- Ranking of visible links by risk.
- High-risk local alerts.

## Architecture
The shared risk engine is separated from the operator-facing web UI and browser extension. Trusted-domain context changes operator context, not the technical evidence: a trusted entry does not automatically convert a technically suspicious signal into a safe result.

## Run locally

On Windows, run `START_GUARDIAN.cmd` and open `http://127.0.0.1:8766/`.

The application can also be served with the included Node.js local server.

## Browser extension

1. Open `brave://extensions` or `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select the `extension` directory.
5. Open Guardian from a normal web page and choose **Analizar esta pestaña**.
6. Or right-click a link / selected text and choose **Analizar … con RUMBO Guardian**.

The extension requests `activeTab`, `scripting`, `storage` and `contextMenus`, with no broad `host_permissions`. Page inspection and context analysis are initiated explicitly by the operator. Context-menu payloads are passed through ephemeral `storage.session` entries and removed after the report consumes them.

## Verification

The repository includes repeatable unit, portability, portfolio, real-browser extension and real-browser Evidence Ledger integrity tests. The integration harness uses an isolated Brave profile and a controlled high-risk fixture.

Run `npm run check` and `npm test`. On Windows, `tests/run-extension-integration.ps1` exercises the extension and `tests/run-ledger-browser-integration.ps1` verifies ledger integrity and tamper detection in isolated Brave sessions.

The portfolio screenshot is reproducible with `scripts/capture-portfolio.ps1` and uses synthetic test data only.

See `EVIDENCE.md` for the verified baseline and `SECURITY.md` for security boundaries.

## Product documentation
- `PRODUCT.md` — product principles and scope.
- `PORTFOLIO.md` — portfolio narrative and demonstrated engineering capabilities.
- `SECURITY.md` — defensive scope and security boundaries.
- `EVIDENCE.md` — verification evidence and reproducibility notes.

## Offline evidence verification

V0.4.2 introduced a standalone Node.js verifier for exported Evidence Ledgers. It recalculates the SHA-256 chain without opening Guardian or trusting the embedded integrity field.

```powershell
node tools/verify-ledger.js portfolio/demo-ledger-v042.json
node tools/verify-ledger.js <exported-ledger.json> --json
```

Exit code `0` means the chain is valid, `2` means the ledger is structurally invalid or tampered, and `1` means the file could not be read. The committed demo ledger is synthetic and reproducible.
## Licensing status

This portfolio release does not grant an open-source license. Source is published for evaluation and demonstration; all rights remain reserved unless a later release states otherwise.




## V0.6.0 - Nested redirect analysis

Guardian now inspects common redirect parameters such as `url`, `redirect`, `continue`, `next`, `target` and `destination`. When one of those parameters contains an absolute HTTP(S) destination on a different domain, Guardian analyzes that nested destination locally and surfaces both the cross-domain redirect and any risk signals found inside it. Ordinary query parameters that merely contain URL-shaped text are not treated as redirects.

## V0.7.0 - Form Destination Integrity

Guardian now inspects form submission destinations during explicit active-tab analysis. Cross-origin form actions are surfaced as explainable evidence, and password-bearing forms that submit to another site receive a stronger signal. Empty and same-site form actions remain non-penalized. No form is submitted by Guardian.

## V0.8.0 - Active-content scheme detection

Guardian now identifies `javascript:`, `data:` and `vbscript:` URL schemes as active-content navigation rather than treating them as ordinary low-risk URLs. The shared app/extension engine raises an explicit `active_content_scheme` signal while leaving normal HTTPS and non-active schemes such as `mailto:` outside this rule.
