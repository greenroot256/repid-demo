# RepID

**A decentralized identity & reputation protocol built on Bitcoin Cash — via CashTokens and CashScript.**

> **TL;DR (English):** RepID turns the BCH blockchain into an immutable ledger of *facts* — who you are (identity NFT), what happened between two parties (interaction receipts + rating rights), how they rated each other (1–5), platform confirmations, and person-to-person trust links. The chain stores facts; **all interpretation stays off-chain** (reputation scores, policies, anti-sybil logic). This repo is a fully working reference prototype: the CashScript covenants, an indexer (RFC-006), and a live web console to try the whole flow.

---

## What RepID is

RepID is a decentralized reputation protocol built on **Bitcoin Cash (BCH)**, using **CashTokens** and **CashScript**.

**Architectural principle (non-negotiable):** the blockchain stores immutable *facts*; the interpretation of those facts — scores, weights, anti-sybil policies — stays **off-chain**, in the hands of each application.

The protocol is formalized in 6 RFCs, with SDD specs in `specs/` (SPEC-001 to SPEC-008):

| RFC | Protocol | Status |
|---|---|---|
| RFC-001 | Identity (one NFT per person, minted once, locked in an IdentityVault covenant with BCH collateral) | ✅ Implemented |
| RFC-002 | Interaction (off-chain layer with explicit per-party roles) | ✅ Implemented |
| RFC-003 | Interaction receipt (joint A + B signature → one receipt + 2 Rating Rights) | ✅ Implemented |
| RFC-004 | Rating 1–5 per participant (the Rating Right burns when spent) | ✅ Implemented |
| RFC-005 | BCH reference implementation (real Chipnet, tBCH) | 🟡 Living prototype |
| RFC-006 | Indexer (rebuilds facts from raw transaction hex) | ✅ Implemented |

RepID tackles three classic reputation problems _without_ intermediaries:
1. **Unique identity** — impossible to fake without burning your own account (the identity NFT is single-use).
2. **One rating per person per interaction** — guaranteed by the consumption of the UTXO, no extra covenant logic.
3. **Cold start** — unilateral trust declarations (person → person) without the other party's consent.

It also includes **platform confirmations**: an app can corroborate on-chain that an interaction happened *without* needing an identity of its own.

Identities can be **backed with BCH collateral**: part of the balance stays locked in the covenant while the identity exists — it never decreases on-chain, it can be increased, and when the identity is deleted the collateral returns to its owner.

## Current status

- ✅ **Demo suite**: 73 tests (`npm test`; 4 files) — 35 run unconditionally, 38 are tBCH-gated and only run with `REPID_E2E_FUNDS=1`. 0 failures.
- ✅ **Recognition lives in `@repid/sdk`** (80 tests in the `repid-sdk` repository), which reads its constants and fact schema from the normative `repid-protocol` repository and fails if the two drift apart. This repository no longer contains a second implementation of fact recognition.
- ✅ **Runs on Chipnet** (real test network, tBCH) with all network operations isolated in a child process. The mock/simulated mode was removed (TASK-042).
- ✅ **Validation against the real Bitcoin VM**: E2E run on Chipnet (2026-09-10, wallet funded with 1,015,000 sats of tBCH) — **11/11 PASS**, the 7 facts of the full flow broadcast and verified on-chain. Details and txids in `tasks.md` TASK-026. Reproducible by anyone from the manual **`chipnet-e2e`** GitHub Actions workflow (TASK-032).

## Architecture in one page

```
                    OFF-CHAIN (interpretation)                    ON-CHAIN (facts, BCH)
┌─────────────────────────────────────┐   ┌──────────────────────────────────────┐
│  Application interaction (RFC-002)  │   │  Identity Genesis (RFC-001)          │
│  Reputation / scores: weighting is  │   │  Receipt Genesis (RFC-003/004)       │
│  each app's own decision           │   │  Issued Rating 1–5 (RFC-004)        │
│  Demo UI (server/public)            │   │  Platform Confirmation (RFC-003 RF-06)│
│                                     │   │  Trust Link (RFC-006)                │
└───────▲─────────────────────────────┘   └───────────────▲──────────────────────┘
        │                                                │ raw hex
        │ structured facts                               ▼
        │           ┌─────────────────────────────────────────────┐
        └───────────│  Indexer (RFC-006) — decodeTransactionBCH   │
                    │  store JSON: Rating Rights + Receipts       │
                    └─────────────────────────────────────────────┘
```

Full diagram in `diagram/repid-architecture.svg` (open it in any browser).

## Repository structure

```
├── contracts/            CashScript covenants (identity_vault, identity_genesis legacy, receipt_genesis) + ABI
├── interaction/          off-chain interaction layer (RFC-002)
├── context/              isolated worker for real-network operations (Chipnet)
├── server/               Express prototype + two-column web console
├── scripts/              Chipnet smoke tests + Chipnet E2E
├── specs/                specs owned by this application (see specs/README.md)
├── test/                 root test suite (vitest)
├── diagram/              architecture diagram (SVG)
├── docs/                 design conventions, testing guide, pitch
├── constitution.md       non-negotiable project principles
└── plan.md, tasks.md     technical design and task breakdown
```

RepID is split across three repositories, and this is the one that runs the
demo:

| Repository | Holds | Status |
|---|---|---|
| `repid-protocol` | the specifications, the covenants, the constants, the fact schema | **normative** |
| `repid-sdk` | recognizing facts from raw transaction hex | reference implementation |
| this one | the demo server, the web console and the interpretation layer | reference implementation |

Fact recognition is not in this repository. It lives in `@repid/sdk`, which reads
the normative constants and schema from `repid-protocol` and fails if the two
repositories ever disagree. The specifications that used to sit under
`packages/` are in the protocol repository, which prevails over anything here.

## How to get started

Requirements: **Node.js** (`npm` is used).

This repository depends on `@repid/sdk`, which is currently resolved from the
sibling directory `../repid-sdk`:

```bash
git clone <this repository>
git clone <repid-sdk>            # must sit next to this one
cd "RepID 1.2"
npm install
npm start        # opens http://localhost:3787
```

A bare clone without the SDK alongside it will not install. That is a known
temporary state, not a design: the dependency spec in `package.json` is
`file:../repid-sdk` and becomes a published version as soon as the package has a
name on npm.

The console includes an **"Example app"** tab with a mini delivery platform (client ⇄ rider → a request carrying the client's signature → the rider gets the notification and upon **accepting** the Receipt is anchored on-chain → platform confirmation → rating → reputation) that runs on the protocol's raw API. The **"Indexer"** view is the reputation lab: for each identity it shows **two separate numbers** — the **Reputation** (the star average, always the same) and the **Confidence Index** (CI): the confidence this indexer assigns by choosing and weighting **on-chain signals** (`collateral`, `tenure`, `confirmed`, `endorsements` and `ratings`, each with a 0–1 weight) plus an anti-sybil toggle — no predefined formulas —, saved with a name (a read-only **"Sample"** preset is included) and, from the **Profile**, pick an identity + configuration to see reputation + CI auditable down to the txid. The CI doesn't modify the facts or the stars: it's local indexer interpretation (SPEC-007). The **"Identities"** view is the IdentityVault covenant's account (mint with collateral, active, burned, top-up and burn) and each active identity shows the **"Validated by:"** note — its endorsers, those who declared trust in it — with a **validator filter** that trims the list of active identities, also local interpretation.

### 2) Fund the wallets (test tBCH)

The prototype runs on Chipnet, so the wallets are born empty: ask for tBCH from the faucet (manual) and use the **"Balance"** button of the first **Wallets** view / `scripts/chipnet-e2e.mjs` to validate the full flow against the real network. The identity collateral (the IdentityVault covenant: mint with locked sats, increase and delete) is validated against the real VM with `scripts/chipnet-vault-e2e.mjs`. The **Wallets** view has **3 columns**: **Create wallet** with **Import Wallet** right below (your own base wallet, hex or WIF key), **Transfer sats** and **Manage Wallets** (an aligned wallet table with alias, balance, a **star ★** marking the primary and returning the sats of the test wallets to the primary with one click). Each wallet can be given a **reference name** (a local off-chain alias, handy when testing with several wallets) shown in the selectors, the Ledger and the reputation. Step-by-step guide for non-programmers in `docs/TESTING.md` §7.

### 3) Hosted demo — not available in this checkout

Earlier versions of this README advertised a one-click deploy on **Render.com**
via a `render.yaml` blueprint, with `REPID_AUTO_DEMO=1` starting the prototype
already populated. **Neither exists here anymore**, and the claim is being
retracted rather than left in place:

- `render.yaml` was deleted in TASK-044.
- `REPID_AUTO_DEMO` is **not implemented**. The server reads only `PORT` and
  `REPID_DATA_DIR`; nothing inspects that variable at startup. The auto-demo was
  specified as mock-only, and mock mode was removed in TASK-042, so it could
  not work as written.
- The test that exercised it (`test/e2e_server.test.js`, "auto-demo at
  startup") is gated on tBCH funds and therefore never runs in a normal
  `npm test`. It is dead coverage of a dead feature, and it is still in the
  suite.

What *is* alive is `POST /api/demo/run` (and its **"Play demo"** button), which
populates the full flow. It needs funded tBCH wallets, so on an unfunded
machine it answers `409` with a faucet hint rather than failing obscurely.

Whether to bring the hosted demo back — and if so, against which platform, and
whether the auto-demo should run on Chipnet instead of the removed mock — is an
open design decision, not a documentation fix.

### 4) Tests

```bash
npm test             # this repository's suite: 73 tests, 35 run unconditionally
npm run test:e2e     # server end-to-end flow only
```

38 of those 70 are tBCH-gated: they mint a genesis on Chipnet and only run with
`REPID_E2E_FUNDS=1` against funded wallets.

The tests that cover protocol recognition live in the `repid-sdk` repository (80
of them), next to the implementation. They are not duplicated here, because a
copy of a test that runs against a copy of the code it tests proves nothing about
either.

## More documentation

- **Manual testing guide** (for non-programmers): `docs/TESTING.md`.
- **One-page pitch**: `docs/PITCH.md`.
- **External indexer guide**: `docs/EXTERNAL-INDEXER-GUIDE.md` — a self-contained handoff for indexing all RepID facts on Chipnet, with a known-good acceptance dataset.
- **Specs**: `specs/README.md` explains what this repository owns and what the
  protocol repository owns. The normative specifications — SPEC-008 the protocol
  core, SPEC-009 the wire format, SPEC-005 the recognition rules — live in
  `repid-protocol` and prevail over anything here. SPEC-007, the Confidence
  Index, is the opposite case: reputation interpretation belongs to the
  application and is specified here.
- **Conventions and operating context for AI agents**: `constitution.md`, `agents.md`.
- **Internal planning documentation**: `plan.md`, `tasks.md`.

## Honest notes

- The prototype runs on Chipnet with test keys persisted in `data/` (valueless tBCH) — it is **not** a production implementation and holds no real wallets.
- Validation against the **real Bitcoin VM** (that the covenants are accepted by the network) **has been run**: Chipnet E2E 11/11 PASS on 2026-09-10 (`scripts/chipnet-e2e.mjs`, txids in `tasks.md` TASK-026). The archival run is reproducible at any time by requesting tBCH from the faucet.
- **Identities are reversible only by burning**: each identity is minted once and stays tied to its key. It can be **deleted** (the NFT burns and the collateral returns to the wallet), but a minted identity is never transferred or edited. If the key is lost, the identity is lost forever (accepted MVP risk, decision TASK-028); keeping custody of the keys is each user's responsibility.
- The specs, internal documentation and code comments are written in **English**; only the conversation with the project owner stays in Spanish (per `constitution.md`, Art. 5).