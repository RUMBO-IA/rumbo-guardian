# RUMBO Guardian — Portfolio Brief

**Product family:** RUMBO Security Intelligence
**Current release:** V1.0.0
**Status:** Verified local product build

## Problem
Phishing, impersonation and suspicious-navigation decisions are often opaque, outsourced to third-party scoring systems or detached from the operator's actual context.

## Product
RUMBO Guardian is an independent, privacy-first security layer that analyzes messages, URLs and browser context, assigns an explainable risk score and preserves evidence locally.

## What V1.0.0 demonstrates
- Shared risk engine used by the web application and browser extension.
- Explainable 0–100 scoring for messages, URLs and active-page context.
- Active-page inspection initiated explicitly by the operator.
- Right-click analysis of links before navigation and selected text before follow-up action.
- Ephemeral `storage.session` handoff for context-menu payloads, removed after consumption.
- No broad extension `host_permissions` for the new workflow.
- URL-deception signals, bounded three-hop redirect-chain analysis and local trusted/blocked domain context.
- Form destination integrity analysis for cross-origin submissions and password-bearing external forms.
- Tamper-evident Evidence Ledger plus independent offline verification.

## Architecture
The web application and Manifest V3 extension consume the same deterministic risk engine. Page inspection uses `activeTab`; context analysis uses explicit `contextMenus`. Sensitive context is handed to an extension report through a short-lived random-token session record rather than a content-bearing URL.

## Verification evidence
The V1.0.0 integration baseline loaded the unpacked extension in an isolated Brave 152 profile, produced 100/100 on a controlled phishing fixture, then invoked the context-analysis service-worker path on `http://openai.com.evil.test/login`. Guardian opened the internal report and classified it 46/100, Riesgo Medio. Unit, syntax, evidence, URL-deception and context-menu regressions also pass.

## Portfolio value
This project demonstrates browser-extension engineering, privacy-aware data flow, security heuristics, explainable risk systems, local-first product architecture, evidence integrity, automated verification and controlled browser integration.

## Boundary
RUMBO Guardian is a risk-analysis layer, not an antivirus and not a definitive malicious-site verdict. Context-menu analysis is local and user initiated; it does not provide external reputation or malware execution analysis.

## V0.6.0 material capability
The shared app/extension core can now expose deceptive redirect wrappers before navigation by parsing common redirect parameters, comparing outer and nested domains, and reusing the deterministic local risk engine on the nested destination.

## V0.7.0 material capability
Active-tab inspection now evaluates where forms submit, not only how many forms or password fields exist. The controlled Brave fixture exposes an external password-form destination without submitting any data.

## V0.9.0 material capability
Bounded multi-encoding analysis closes a practical evasive redirect case while preserving deterministic app/extension parity and explicit decode evidence.

## V1.0.0 material capability
The shared deterministic core now exposes multi-hop redirect chains before navigation while bounding recursion, repeated routes and parameter fan-out. This extends the redirect defense without adding network requests or broad extension host permissions.
