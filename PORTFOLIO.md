# RUMBO Guardian — Portfolio Brief

**Product family:** RUMBO Security Intelligence  
**Current release:** V0.3.1  
**Status:** Verified local product build

## Problem
Phishing, impersonation and suspicious-navigation decisions are often opaque, outsourced to third-party scoring systems or detached from the operator's actual context.

## Product
RUMBO Guardian is an independent, privacy-first security layer that analyzes messages, URLs and active browser pages, assigns an explainable risk score and preserves evidence locally.

## What V0.3.1 demonstrates
- Shared risk engine used by the web application and browser extension.
- Explainable 0–100 risk scoring with evidence-level reasons.
- Active-page inspection initiated explicitly by the operator.
- Visible-link ranking and suspicious-link prioritization.
- Trusted and blocked domain context stored locally.
- Evidence Ledger and JSON report export.
- High-risk browser alerts and portfolio-oriented product UX.

## Architecture
The web application and Manifest V3 extension consume the same deterministic risk-engine logic. Browser inspection is on-demand and uses active-tab access rather than broad persistent page access. Operator context is separated from technical indicators so trusted-domain decisions remain explicit and auditable.

## Verification evidence
The V0.3.1 verification baseline loaded the unpacked extension in an isolated Brave profile, opened its popup against a controlled phishing fixture and produced an 88/100 high-risk result. Unit tests, JavaScript syntax checks, manifests, HTTP serving and portfolio-copy audits were also verified before packaging.

## Portfolio value
This project demonstrates browser-extension engineering, security heuristics, explainable risk systems, local-first product architecture, evidence handling, automated verification and controlled browser integration under the RUMBO product family.

## Boundary
RUMBO Guardian is a risk-analysis layer, not an antivirus and not a claim that any target is malicious solely because one heuristic fires. High-confidence decisions require multiple signals and operator context.
