# SPEC-002: Interaction Protocol

> ✅ Status: implemented (TASK-005 to TASK-007). The "Interaction" data model is formalized in `plan.md` §2; role validation and metadata generation are implemented with 9 passing tests in `test/interaction.test.js`.

## 1. Context and Objective

Before an Interaction Receipt (RFC-003) signed on-chain exists, there must be a clear, application-level definition of what interaction two parties are having and what role each one plays. The Interaction Protocol is the metadata layer — mostly off-chain — that an external application uses to describe that interaction before requesting its registration as a Receipt.

## 2. User Stories

- As an integrating external application, I want to define an interaction between two parties so I can later generate a jointly signed Interaction Receipt.
- As a party in an interaction, I want my role to be explicit from the start, so that the subsequent rating has context.

## 3. Functional Requirements (EARS Syntax)

- **RF-01** (Ubiquity): The system must allow an external application to define an interaction between exactly two parties (`partyA`, `partyB`).
- **RF-02** (Ubiquity): The system must require each interaction to specify an explicit role for each party.
- **RF-03** (Events): When an interaction is defined, the system must generate the metadata needed for the subsequent issuance of an Interaction Receipt (RFC-003).
- **RF-04** (Undesired Behavior): If an interaction does not specify roles for both parties, then the system must reject the interaction definition.

## 4. Non-Functional Requirements

- The Interaction Protocol operates mainly at the application level (off-chain); it does not impose its own on-chain transaction.
- It must remain agnostic to the specific business domain of the integrating application (buying/selling, freelancing, rentals, etc.).

## 5. Edge Cases and Constraints

- Interactions with more than two parties: not supported. `ReceiptGenesisValidator` (RFC-003) fixes participation at exactly two signers, a decision confirmed in `tasks.md` (TASK-001). Group interactions are modeled as multiple pairwise receipts at the application layer.
- Ambiguous or empty roles → rejected per RF-04.

## 6. Out of Scope

- Multi-party interactions (>2).
- Cancellation or dispute flow for an interaction before it becomes a Receipt: **deliberately deferred** (Section A of `tasks.md`, TASK-028, 2026-09-10). Its absence does not block the MVP: at the application layer, an interaction without agreement simply never issues its Receipt.
- On-chain persistence of the interaction definition (only the resulting Receipt is anchored on-chain, via RFC-003).

## 7. Acceptance Criteria (Definition of Done)

- [x] "Interaction" data model formalized in `plan.md` §2 (TASK-005).
- [x] Explicit-role validation implemented and tested (TASK-006).
- [x] The project architect's confirmation of the "exactly 2 parties" assumption (TASK-001).
- [ ] The code complies with `constitution.md`.