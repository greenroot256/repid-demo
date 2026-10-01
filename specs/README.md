# Specifications in this repository

> RepID is split across three repositories. This directory holds only what
> belongs to the **demo and interoperability application**. The normative
> protocol lives in `repid-protocol`, and fact recognition is implemented in
> `repid-sdk`.

## What lives here (demo repository)

| Spec | Status | Why it is here |
|---|---|---|
| `SPEC-002-interaction-protocol.md` | draft | The off-chain metadata layer that the Example app exercises, with its 9 tests. Application level, not on-chain. |
| `SPEC-007-confidence-index.md` | draft | **Application layer.** Reputation and the Confidence Index are interpretations *of* RepID facts, not facts. The protocol defines neither. |

## What lives in `repid-protocol` (normative)

`SPEC-001` Identity · `SPEC-003` Receipt · `SPEC-004` Rating ·
`SPEC-005` Fact recognition · `SPEC-006` Trust · `SPEC-008` Protocol core ·
`SPEC-009` Wire format · `SPEC-010` Versioning

The copies of `SPEC-001`, `SPEC-003`, `SPEC-004` and `SPEC-006` that used to sit
here have been deleted. They were the same documents at an earlier stage of
editing, and keeping them meant two files that claimed to be the same
specification. When they differed, there was no principled way to say which one
was right, which is the failure this split exists to prevent.

Historical task entries in `tasks.md` still cite paths such as
`specs/SPEC-006-trust-protocol.md`. Those records are left as written: they
describe what was done at the time, and rewriting a task log to match the
present is how a task log stops being evidence.

## What lives in `repid-sdk`

Fact recognition. The specifications say which transaction shapes are facts;
the SDK is the reference implementation of that recognition, with its own
42-test suite. It is not specified here and is not specified in
`repid-protocol` either: the protocol states the requirement, the SDK satisfies
it, and `repid-protocol/REFERENCE-IMPLEMENTATION.md` records the mapping from
each requirement to the test that covers it.

## Two decisions govern the boundary

- **Facts are protocol; interpretation is application.** Anything that changes
  when the criterion changes — reputation, confidence, weights — is not a
  protocol fact and cannot be one.
- **Recognition is protocol; persistence is implementation.** Which transaction
  shapes are facts is normative. How the resulting state is stored or served is
  the SDK's business, and how it is presented is this repository's.

## Precedence

`constitution.md` > `SPEC-008` > `SPEC-009` > the other specifications. Where
this repository and the protocol repository disagree, **the protocol repository
wins**, and the copy here is stale and should be deleted.
