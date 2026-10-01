# Contributing to RepID

Thanks for your interest in RepID. This document summarizes how to run the project locally and what rules govern changes — the same ones that govern the AI agent working with the project architect (`constitution.md`).

## 1. What this is (and what it isn't)

RepID is a **decentralized reputation protocol** on Bitcoin Cash (CashTokens + CashScript). The blockchain stores immutable facts; the interpretation (reputation) lives off-chain. The repository contains a **working prototype** that demonstrates the protocol: CashScript contracts, an indexer that reads raw transactions, and a demo web server with two modes (mock and Chipnet).

## 2. Requirements

- Node.js 22+ and npm.
- No network required to run the test suite (it runs on the simulated network).

## 3. Commands

| Command | What it does |
|---|---|
| `npm install` | Installs dependencies. |
| `npm test` | Runs the full suite (protocol + server). |
| `npm run test:e2e` | Only the server end-to-end suite. |
| `npm start` | Starts the prototype at `http://localhost:3787` (mock mode). |
| `REPID_NETWORK=chipnet npm start` | Real test network mode (requires tBCH; see `docs/TESTING.md` §7). |

## 4. Architecture in 3 rules

1. **The chain stores facts; the interpretation stays off-chain.** Don't mix the two layers.
2. **Simplicity over complexity.** If something can be done without its own covenant, it's done without a covenant.
3. **Tests before code.** A Functional Requirement (RF) from a spec isn't complete until it has a real test backing it.

## 5. Conventions

- **English everywhere** (identifiers, technical comments, specs and documentation — `AGENTS.md` §5).
- The normative specifications live in the `repid-protocol` repository, not here. This repository owns only SPEC-002 and SPEC-007; see `specs/README.md`. Protocol behavior changes must be reflected in the protocol repository first (spec-anchored).
- The full suite must stay green before any PR (`npx vitest run`).
- Task status and decisions live in `tasks.md` with `TASK-NNN` format.
- Fact recognition is the `@repid/sdk` package, consumed by name. There is no second recognizer in this repository, and there must not be one.

## 6. What NOT to do without an approved Plan

- **Don't modify CashScript contracts or the Indexer logic** without first going through plan mode (design → approval → test).
- **Don't resolve the open assumptions of the specs** on your own: they are the architect's design decisions.
- **Don't claim a test passes without having run it.**
- Don't version keys or local persistence (`data/`, `data_chipnet_e2e/` stay out of the repo).

## 7. Suggested flow for a contribution

1. Read the spec of the area you're touching (`specs/` here, or the protocol repository for protocol behavior) and the corresponding technical finding in `AGENTS.md` u{FFFD}7 (there are known tooling traps that must not be rediscovered).
2. Implement it with its test.
3. Run `npm test` (the whole suite).
4. Open the PR; the CI runs the same suite.

## 8. Repository structure

- `specs/` -> the two specifications this application owns, plus `README.md` explaining the split. The protocol specifications are in the `repid-protocol` repository.
- `@repid/sdk` -> in the `repid-sdk` repository, resolved as `file:../repid-sdk` until it is published. It is not vendored here, and its test suite is not duplicated here.
- `test/` — root suite (covenants, interaction, reputation, server E2E); it imports the packages by name.