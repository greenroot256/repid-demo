# constitution.md — RepID
## Supreme Law of the Project

This document contains RepID's non-negotiable principles. **In case of conflict between this document and any `spec.md`, this Constitution prevails.**

---

## Article 1 — Central Architectural Principle

The blockchain stores **immutable facts**. The interpretation of those facts stays **off-chain**. No RepID artifact may introduce subjective interpretation logic (composite scoring, weightings, value judgments) into an on-chain covenant. That is the responsibility of higher layers, not of the base protocol.

## Article 2 — Simplicity over Complexity

The simplest solution that satisfies the current Functional Requirement is always preferred. No speculative logic is added for future use cases that are not documented in an active `spec.md`. Applied example: no commit-reveal scheme is implemented for ratings because the Receipt is already signed before any rating exists — adding it would be complexity without benefit.

## Article 3 — Tests Before Code

Every Functional Requirement (RF) must have a test written based on the Acceptance Criteria of its corresponding `spec.md`, **before** being considered implemented. An RF without an associated test is not complete, no matter how much the code "seems" to work.

## Article 4 — Radical Honesty

- No test, coverage or validation result is reported as true without having actually been verified by running it.
- Tooling limitations (e.g., `MockNetworkProvider` does not execute the VM nor validate signatures) are documented explicitly, never omitted.
- A claim that is not verifiable with the available tooling is **removed** from the artifact instead of being left as a misleading or "almost true" claim.

## Article 5 — Language

- **Code, contract names, technical identifiers:** English.
- **Documentation, specs, RFCs:** English — the repository language, the same as code and comments. The **only exception** is the conversation with the project architect, which continues in Spanish.

## Article 6 — "Out of Scope" is Law

Any functionality marked as "Out of Scope" in a current `spec.md` **is not implemented**, even if it seems trivial to add, until a new version of that spec explicitly incorporates it. This is the main defense against scope creep.

## Article 7 — Mandatory Traceability

Each task in `tasks.md` must reference the RF of the `spec.md` it satisfies. No task is marked as complete without its corresponding RF being validated with a real, executed test.

## Article 8 — Governance for a Non-Programmer Architect

The project architect does not audit the code line by line — it is not their role nor their expertise. They validate through:
1. Review of the specification (`spec.md`) in natural language.
2. Real test results (not accounts of results).
3. Functional demonstrations of the prototype.

Because of this, the AI agent has an **enhanced responsibility** not to mislead: there will be no second line of human defense reviewing the code.

## Article 9 — Mandatory Plan Mode

No modification of CashScript contracts or Indexer logic is made without prior approval of the implementation strategy (Plan Mode / Architect Mode). The code is not touched until the intent is validated.

## Article 10 — Level of Commitment to the Specification

RepID operates under the **Spec Anchored** approach: bidirectional synchronization between code and specification. Every relevant code change (contracts, indexer, server) must be reflected in the corresponding `spec.md` or `plan.md`, and vice versa. The documentation never becomes obsolete by omission.