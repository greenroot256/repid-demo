# tasks.md — RepID

> Rule of the 20-30 minutes: each task must be auditable in a single sitting. No task is marked as done without its corresponding RF being validated with a real test (Constitution, Article 7).

---

## Section A — Design Assumption Confirmations
*(the project architect's decisions, require no code — do these first; they condition Section B)*

- [x] **TASK-001** [SPEC-003 / RF-03] Confirmed decision: `ReceiptGenesisValidator` **stays fixed at 2 parties**. Group interactions are modeled as multiple pairwise Receipts (one per pair). The extension to N parties stays out of scope. "Confirming platform" case (C) → separate attestation (future task), not a covenant extension. *— 20 min*
- [x] **TASK-002** [SPEC-003 / RF-04] Confirmed decision: the Receipt's lock to `partyA` **becomes a covenant-enforced rule** (on-chain enforcement). It is already implemented in `receipt_genesis.cash:53`; the spec (RFC-003) will be updated in TASK-010 to reflect that it stops being a mere convention. — *20 min*
- [x] **TASK-003** [SPEC-004 / RF-05] Confirmed decision: the Rating Right commitment **uses the owner's pkh** (current option), not the full Identity NFT category. The pkh → Identity link is resolved in the upper layer (off-chain). It will be reflected in RFC-004 (TASK-010). — *30 min*
- [x] **TASK-004** [plan.md §5] Confirmed decision: Indexer persistence for the prototype = **local JSON file** (load the store at startup, re-write after each indexed tx). Real production is deferred to a DB (SQLite or other), out of the MVP scope. — *30 min*

## Section B — Pending Implementation

- [x] **TASK-005** [SPEC-002 / RF-01, RF-02] Formalize the "Interaction" data model (partyA, partyB, roles) in `plan.md` §2. — *30 min*

> ✅ Closed together with TASK-006/007. Interaction model formalized in `plan.md §2`, module `interaction/repid-interaction.mjs`, 9 new tests in `test/interaction.test.js`. Executed and verified: `npx vitest run` → 28 tests passing.

- [x] **TASK-006** [SPEC-002 / RF-04] Implement explicit role validation when defining an interaction (reject if role is missing). — *30 min*
- [x] **TASK-007** [SPEC-002 / RF-03] Implement generation of interaction metadata ready to feed the Receipt genesis (RFC-003). — *30 min*
- [x] **TASK-008** [SPEC-004 / RF-04] Add explicit score range validation (1–5) with a dedicated test covering out-of-range values. — *20 min*

> Implemented in `indexer/repid-indexer.mjs` (`tryDecodeIssuedRating`): an out-of-range score (1-5) is recognized but marked `valid: false` (the transaction is considered invalid, not ignored). Dedicated test covers 0, 6, 200. Executed → 29 tests passing.
- [x] **TASK-009** [SPEC-001, SPEC-003, SPEC-004] Apply the decisions made in Section A to the corresponding contracts and Indexer (one task per confirmed assumption). — *30 min each*

> Verified: contracts already comply with TASK-001 (fixed to 2 parties, `receipt_genesis.cash:48`), TASK-002 (Receipt locked to partyA, `:53`) and TASK-003 (commitments with pkhs, `:57,:62`) — no code changes.
>
> Implemented in the Indexer: `createJsonFileStore(filePath)` persists Rating Rights in local JSON (TASK-004, Option A), loads at startup (ignores `ENOENT`), re-writes after each record. Tests added in `test/issued_rating_and_indexer.test.js` (3 persistence tests). Executed → 32 tests passing.

## Section C — Documentation (Spec Anchored)

- [x] **TASK-010** Update RFC-003 and RFC-004 reflecting the decisions made in Section A. — *20 min*

> SPEC-003 updated: RF-04 moves from "Option/convention" to a covenant rule; section 5 with confirmed decisions (TASK-001/002); out of scope updated (separate attestation for platform).
>
> SPEC-004 updated: section 5 assumption confirmed (commitment with pkh, TASK-003); RF-04 with test marked as done (TASK-008).
>
> SPEC-002 updated (Spec Anchored, Art. 10): marked as implemented, the 2-parties assumption resolved, acceptance criteria completed.
- [x] **TASK-011** Sync the existing architecture SVG diagram with any change resulting from TASK-009. — *30 min*

> Diagram updated: the Receipt moves from "locked to A's P2PKH (convention)" to "(covenant rule)" (TASK-002); the Indexer incorporates the line "persistent store: Rating Rights in JSON file" (TASK-009).
- [x] **TASK-012** Review that `agents.md` still reflects the real implementation state (section 1 table) after closing Section B. — *20 min*

> `agents.md` updated: RFC-002 → ✅ (9 tests), RFC-004 → ✅ (range 1–5), RFC-006 → ✅ (score validation + JSON persistence), RFC-005 flagged with interaction layer + persistence. Section 2 adds the Interaction layer and the `createJsonFileStore`. Total: 32 tests.
- [ ] **TASK-012b** Re-establish the "Layla upgrade loop" pattern mentioned in previous sessions (it was lost in an environment reset). Confirm with the project architect exactly what it covered before attempting to reconstruct it. — *20 min*

> ⛔ **BLOCKED — pending original information.** the project architect does not keep the pattern's content and there is no source in the repo. Per the Constitution (Art. 4), **it is not reconstructed from memory**: reconstructing it blindly would produce an invented artifact. It stays open for a future session; the natural anchor point is `plan.md` §6 (BCH Layla upgrade) and `AGENTS.md` §9.
- [x] **TASK-043** [SPEC-009 / RF-W01–RF-W44] Publish `packages/protocol/spec/SPEC-009-repid-wire-format-and-recognition.md`: the normative byte-level contract of the `OP_RETURN` facts and the recognition algorithm, closing the gap where recognition existed only implicitly in `packages/indexer/src/repid-indexer.mjs`. — *60 min*

> Written. Nine normative sections plus Annex A (reference decoder map) and Annex B (conformance vectors). Verified against the reference decoder: direct-push-only encoding (`0x01`–`0x4b`, payload 1–75 B, `PUSHDATA1/2/4` and `OP_0` rejected — `parseOpReturn`, line 319); per-tag payloads (rating 1 B, platform 32 B, trust 20 B); declarer `pkh` derived from the first input's `unlockingBytecode` via the `0x21` compressed-key marker read from the tail (`extractPkhFromUnlocking`, line 336); `RATING_ISSUED` parties resolved from the tracked Rating Right, not the payload; first-match-wins precedence with the identity **spend** before the identity **genesis** (`indexRawTransaction`, lines 376–407); store transitions for all four fact families.
>
> **Honest coverage (Art. 4):** the §10.1 matrix marks two rows as **not yet covered** — the push-encoding vectors (RF-W01–RF-W05) and the receipt genesis structural rules (RF-W38–RF-W40). Annex B records all 12 missing vectors as open obligations, **not** as passing results. The static test inventory is 23 tests in `packages/indexer/test/`; the Annex B claim was verified by counting `it(` blocks per file. Full-suite counts in other documents were **not** re-verified in this task (see TASK-044).
>
> Synchronized in the same cycle (Spec Anchored, Art. 10): SPEC-008's status note and §5 now point to SPEC-009, and the precedence chain is `constitution.md` > SPEC-008 > SPEC-009 > SPEC-001..007.

- [x] **TASK-044** [SPEC-008 / Art. 10] Reconcile the test-count drift in `README.md`, `docs/PITCH.md` and SPEC-008 §B.2. — *30 min*

  > **Decision taken by the project architect (build phase)**: the three deleted test files are **intentionally not restored**. The matrix is updated to the real count instead of pretending the coverage still exists.
  >
  > **What was changed**: SPEC-008 §B.2 rewritten so every row points at evidence that really exists. The real count is now **93 tests / 7 files** in SPEC-008, `README.md`, `docs/PITCH.md` and `agents.md`; `README.md` no longer claims Spanish specs; `agents.md` no longer claims a dual mock/chipnet mode. `docs/PITCH.md` E2E claim corrected from "in progress" to the real 11/11 PASS.
  >
  > **What the matrix now says about the covenants (RF-O03–RF-O11), and why it is defensible**: the 35 removed tests relied on `MockNetworkProvider`, which does **not** run the Bitcoin VM, so they never provided VM-level evidence either. What was lost is **ABI-shape regression coverage**, not real-VM evidence. The covenant rules are backed by the two real-network E2E scripts — `scripts/chipnet-vault-e2e.mjs` (TASK-037, real VM, checks mint-with-collateral, top-up `value >= oldCollateral`, burn returning the collateral and not re-issuing the category, re-mint) and `scripts/chipnet-e2e.mjs` (TASK-026, 11/11 PASS) — plus contract-source inspection. The matrix states the loss explicitly in those words; nothing is hidden behind an old number.
  >
  > **Correction to an earlier claim in this session**: a corrupted character was reported at `server/index.js:43`. On inspection with a byte-level read the file is **intact** — the em-dash is a proper U+2014 and the file contains zero U+FFFD replacement characters. The corruption was an artifact of the PowerShell console output, not of the file. No edit was made and none was needed.
  >
  > **Deliberately left open**: `README.md` and `agents.md` still advertise a 1-click Render deploy via `render.yaml`, but that file is deleted in the working tree. the project architect chose "nothing for now" on cleanup, so the stale claim is **not** silently rewritten; it is registered here as known drift.

- [x] **TASK-045** [SPEC-005 / Art. 3, 4] Fix the red server E2E suite: 26 of 41 tests in `test/e2e_server.test.js` fail. — *30 min*

  > **Root cause (verified by real execution)**: the suite spawns the server with a temporary `REPID_DATA_DIR` and **never funds the wallets**. Since the mock mode was removed (TASK-042) the prototype is Chipnet-only, so the wallets are born empty and the API answers **409** (*"Insufficient tBCH funds…"*, `server/index.js:439`), cascading into `expected 409 to be 201`, `Cannot read properties of undefined (reading 'outpoint')` and the empty-ledger assertions. TASK-042 updated the server but not this suite.
  >
  > **Confirmed pre-existing, not caused by TASK-043**: the markdown changes were stashed (`git stash push -- README.md docs/PITCH.md tasks.md packages/protocol/spec/SPEC-008-repid-protocol.md`) and the suite re-run; the same 26 failures reproduced with the documentation reverted. The changes were then restored with `git stash pop`.
  >
  > **Decision taken by the project architect**: **gate the suite on funds and document it** — no mock, no reintroduction of the simulation. Implemented with `describe.skipIf(!FUNDS)` behind `REPID_E2E_FUNDS=1` on the five blocks that mint a genesis; the block that only saves interpretation configurations still runs unconditionally. A console notice names the env var and points to `docs/TESTING.md` §9.
  >
  > **Verified by real execution** (`npx vitest run`): `Test Files 7 passed (7)`, `Tests 55 passed | 38 skipped (93)` — **0 failures**. Note the gate closes 38 blocks, not 26: twelve of those tests were passing before, but they live inside the same chained blocks, and at least one of them still asserts a leftover mock-era value (`balanceSats === '100000'`, verified against `server/index.js` — there is no synthetic balance injection any more), so it was passing in name only.
  >
  > **Honest limitation, declared in `docs/TESTING.md` §9 and here**: the 38 gated blocks have **not** been executed since the gate was added, because that needs a funded tBCH wallet. They are *unverified*, not *verified*. The real-network coverage is the two E2E scripts of §7, which broadcast to Chipnet and are checked by the actual Bitcoin VM.

- [x] **TASK-046** [SPEC-009 / Art. 3, 4, 10] Write `docs/EXTERNAL-INDEXER-GUIDE.md`: a self-contained handoff that lets an indexer outside this repository discover **all** RepID facts on Chipnet. — *60 min*

  > Written (English, Art. 5). Fourteen sections: the protocol in four lines; Chipnet access (`chipnet.imaginary.cash`, WSS, default port, hostname **without** `host:port`, plus the verified Electrum methods and the C1 event-loop-freeze hazard); **the completeness requirement** (§3 — why `listunspent` can never see a rating); the seven facts split by whether they need memory; the three state maps and their removals; the exact `OP_RETURN` container and per-tag payload rules; the structural rules for the identity/receipt genesis; the five traps; first-match-wins precedence; malformed-vs-invalid; the prohibitions; a self-verification checklist; and an acceptance dataset.
  >
  > **§3 is the core of the document**: four of the seven facts are recorded by *spending* something that then ceases to exist, so a UTXO-walking indexer **cannot** find them by construction. `RATING_ISSUED` burns the Rating Right; `IDENTITY_BURNED` leaves no marker; a top-up has the same shape as a genesis. Completeness therefore requires walking blocks from the first RepID transaction, in order, with no gaps, persisting the raw hex to make the walk resumable.
  >
  > **Empirically verified against real data (Art. 4)** — the rules were checked by decoding the five stored Chipnet transactions with libauth and asserting each rule: **25/25 PASS**. Confirmed: `REPID_RATING1` tag with exactly 2 chunks and a 1-byte payload equal to the recorded score (2 and 3), both in range and `valid: true`; identity vault form with 2 outputs, `commitment == ownerPkh` and a tokenless change; receipt genesis with 4 outputs, a tokenless 4th output, one shared category, an **empty** commitment on output 0, and the **cross** commitment pair (`rr :1` → `partyB`, `rr :2` → `partyA`, each rating a *different* party); and the negative control — all 3 funding transfers have neither an `OP_RETURN` nor an NFT, so they correctly yield no fact.
  >
  > One assertion initially failed (`RECEIPT cross commitments`); investigation showed the **test** indexed the rating rights wrongly, not the guide. Re-verified correctly: 4/4 PASS.
  >
  > **Honest scope**: §2.2 lists `blockchain.block.header` and `blockchain.transaction.id_from_pos` as *standard Electrum but not exercised in this repository* — they are needed for the §3 block walk and were not validated here. The host, the port rule, the four verified methods and the C1 hazard **were** verified against `context/network-processor.mjs`. The document states that `SPEC-008`/`SPEC-009` prevail over the guide in case of discrepancy. No code was modified in this task.




## Section D — Closing Testing and QA

- [x] **TASK-013** Run the complete Final Quality Verification Checklist (see next section) before considering any Section B cycle closed. — *20 min*

> Checklist executed: Constitution ✅ (no unapproved covenant changes; Arts. 2, 9 respected), RF Coverage ✅ (6+9+8+9 = 32 tests), Audit ✅ by TASK-014, Traceability ✅ (each task points to its RF), Intent Closure ✅ (results = Section A decisions).

- [x] **TASK-014** Manual "no-hallucination" audit: verify by hand, running the real commands, that no test result reported as passing was actually invented. — *20 min*

> Double verification executed in this session: (1) real `npx vitest run` → 4 files, 32 tests passing, 0 failures; (2) static count of `it(` blocks per file: identity 6 + interaction 9 + issued_rating_and_indexer 9 + receipt 8 = 32. Both sources match without discrepancy. The new tests (roles, metadata, range 1–5, persistence) appear by name in the output — they were not invented.

---

## Final Quality Verification Checklist (per cycle)

- [x] **Constitution Validation:** does the code respect the Supreme Law (`constitution.md`)? — ✅ Verified: no unapproved covenant modifications (Art. 9 respected: TASK-009 approved in Plan before implementing); simple solutions (Art. 2); off-chain interpretation without on-chain logic (Art. 1); radical honesty about TASK-012b and tooling limitations (Art. 4).
- [x] **RF Coverage:** are all the EARS Functional Requirements of the touched spec(s) covered by code and test? — ✅ 32 real tests cover SPEC-001 (6), SPEC-002 (9), SPEC-003 (8), SPEC-004 + RFC-006 (9). Each RF of the specs touched in this cycle has a test: roles (RF-04 SPEC-002), metadata (RF-03 SPEC-002), range 1–5 (RF-04 SPEC-004), persistence (plan §5).
- [x] **Hallucination Audit:** was it manually verified that the AI did not "invent" the completion of a task? — ✅ Real `npx vitest run` executed (4 files, 32 tests, 0 failures); the new tests appear by name in the output.
- [x] **Traceability:** does each task marked as done in `tasks.md` point to its corresponding RF? — ✅ The 14 `[x]` tasks reference their RF/spec (SPEC-002/003/004, plan §5); the documentation/QA ones (011–014) are self-referential by nature; TASK-012b remains blocked, unmarked.
- [x] **Intent Closure:** does the result reflect the original intent documented in the `spec.md`? — ✅ Results = confirmed Section A decisions (2 parties, covenant rule, pkh commitment, JSON persistence) applied and reflected in specs (TASK-010), diagram (011) and agents.md (012).

**Final responsibility:** the AI provides speed; the project architect provides the judgment and is ultimately responsible for the quality and success of the system.

---

## Section E — Post-close Integrations (after the first cycle)

- [x] **TASK-015** [RFC-005 / SPEC-002] Integrate the Interaction layer (explicit roles) into the demo server and connect the JSON persistence. — *30 min*

> Implemented and verified with a real run:
> - `server/index.js`: `/api/interactions` now validates with `validateInteraction` and derives `partyAPkh`/`partyBPkh` with `buildInteraction` + `toReceiptParts` (roles required). The Indexer store moves from `createMemoryStore` to `createJsonFileStore` (`data/indexer-store.json`).
> - `server/public/`: "Role of A" and "Role of B" fields added (index.html) and sending of `{ partyA: {pkh, role}, partyB: {pkh, role} }` (app.js).
> - Real HTTP smoke test on port 3901: wallet → identity → interaction with roles (`passenger`+`driver`) → rating score=5 → 3 indexed facts; empty role in A and in B → 400. Persistence verified on disk. `npx vitest run` → 32 tests passing.

- [x] **TASK-016** [SPEC-003 RF-06] Implement `PLATFORM_CONFIRMATION` (pattern C): interaction confirmation by a validator (platform) as an independent on-chain fact. — *45 min*

> Implemented and verified:
> - **Spec**: SPEC-003 incorporates RF-06 and REMOVES the platform attestation from "out of scope" (Art. 6: spec goes first).
> - **Indexer**: new tag `REPID_PLATFORM1`; recognizer `tryDecodePlatformConfirmation` (P2PKH spend + `OP_RETURN` with the Receipt's txid; the platform's pkh is recovered from the input's scriptSig, the platform does NOT mint an Identity). Validation against the Receipts index: reference to an unknown Receipt → `valid: false` (not silently ignored). The store (`memory` and `jsonFileStore`) now tracks and persists Receipt txids.
> - **Tests**: +4 in `test/platform_confirmation.test.js` (valid confirmation, unknown receipt → invalid, foreign tag → null, Receipts index persistence). Suite 32 → **36 tests passing** (`npx vitest run`).
> - **Demo server**: `POST /api/platform-confirmations` + "Confirm interaction" panel in the UI (RFC-005). Real HTTP verification: platform wallet confirms the Receipt → `PLATFORM_CONFIRMATION` fact `valid:true` → ledger `IDENTITY_GENESIS → RECEIPT_GENESIS → PLATFORM_CONFIRMATION`; 404 for a non-existent Receipt; `receipts` persistence in `data/indexer-store.json`.

- [x] **TASK-017** [RFC-006] Formalize the Indexer protocol as a spec (SPEC-005, SDD/EARS format). — *30 min*

> `specs/SPEC-005-indexer-protocol.md` written: 9 EARS RFs (recognition of the 4 facts `IDENTITY_GENESIS`, `RECEIPT_GENESIS`, `RATING_ISSUED`, `PLATFORM_CONFIRMATION`; `valid:false` marking; persistence; `null` for foreign transactions), user stories, non-functional requirements, edge cases (confirmed decisions + agents.md §7 tooling findings, to avoid rediscovering them) and acceptance criteria with the current suite (36 tests). Cross-references updated: `plan.md` (covers SPEC-001 to SPEC-005) and `agents.md` (RFC-006 → SPEC-005). Pending the project architect's review of the text.

- [x] **TASK-018** [SPEC-006] Implement the **Trust Link** (person→person trust link): unilateral A→B declaration, on-chain. — *50 min*

> Strategy approved by the project architect in section E: unilateral declaration (A spends its own UTXO with `OP_RETURN`; B neither signs nor consents).
> - **Spec**: `specs/SPEC-006-trust-protocol.md` (SDD/EARS format) + RF-10 in SPEC-005.
> - **Indexer**: tag `REPID_TRUST1` + recognizer `tryDecodeTrustLink` (20-byte chunk = B's pkh; A's pkh from the scriptSig). Fact `{ type, txid, trusterPkh, trustedPkh, valid }`. Self-trust (A==B) → `valid:false` (RF-03). Does not mint Rating Rights (RF-04).
> - **Tests**: +3 in `test/trust_link.test.js` (unilateral A→B, invalid self-trust, foreign tag/payload → null). Suite 36 → **39 tests passing** (`npx vitest run`, 6 files).
> - **Demo server**: `POST /api/trust-links` + "Declare trust" panel in the UI. Real HTTP verification: valid `TRUST_LINK` (A→B), self-trust → `valid:false`, malformed pkh → 400; 2 facts in the ledger. Suite + smoke without leaving hanging processes.

- [x] **TASK-019** [RFC-005] Make the prototype **formally and manually testable**: server covered by E2E tests + testing guide for non-programmers. — *60 min*

> Strategy (approved by the project architect in section E): option A — shape the prototype so that (1) it is automatically testable end-to-end and (2) it can be tested by hand, step by step, without programming knowledge.
> - **Server**: `server/index.js` — clear startup message ("RepID — prototype ready. Open the UI in your browser: http://localhost:PORT") + `REPID_DATA_DIR` env to isolate persistence (used by the E2E suite) + `POST /api/reset` (demo-only: resets wallets, facts, mock chain and persistence file).
> - **Tests**: `test/e2e_server.test.js` — starts the REAL process (`spawn node server/index.js`) on an ephemeral port and temporary persistence; complete happy flow (wallets → identity → interaction with roles → rating → platform confirmation → trust link → 5 types in the ledger) + errors (duplicate identity 409, empty role 400, out-of-range score 400, already-used Rating Right 409, non-existent Receipt 404, malformed pkh 400, self-trust `valid:false`) + reset. `package.json` gains the `"test:e2e"` script.
> - **UI**: green success toasts on each action + "Reset demo" panel (they coexist with the red error toast).
> - **Guide**: new `docs/TESTING.md` — 3-step startup, screen at a glance, 11 step-by-step tests in "What you do → Expected result" tables (including deliberate errors), Ledger glossary and honest limitations.
> - **Verification**: full suite `npx vitest run` → **52 tests / 7 files passing** (39 previous + 13 E2E); real guided run over the server (`node scripts/guide_smoke.mjs`) → 13/13 PASS including reset; no hanging processes on test ports.

- [x] **TASK-020** [RFC-006 / RFC-005] **Indexer view** in the prototype: sub-interface showing the technical side hidden today (how the node "hears" and processes each transaction). — *50 min*

> Strategy approved by the project architect in section E (Art. 9): add `snapshot()` to the Indexer store and two demo-only endpoints. Questions resolved: show feed + internal state (not just one), and include simulation of a foreign transaction that is discarded.
> - **Indexer** (`repid-indexer.mjs`): new `snapshot()` method in `createMemoryStore` and `createJsonFileStore` → `{ ratingRights, receipts }` (additive, does not touch recognition).
> - **Server** (`server/index.js`): `rawTransactions` node feed + `recordFromChain(hex, txid)` helper (the 5 actions now record the raw hex along with the fact); `GET /api/indexer-view` (feed + stores + persistence file) and `POST /api/foreign-tx` (demo: spends a P2PKH UTXO with a foreign-tag `OP_RETURN` `HELLO1` → the indexer marks it `factType: null`, the Ledger does not change). Reset also clears the feed.
> - **UI**: the right column becomes tabbed **[Ledger] | [Indexer view]** (clickable toggle); the indexer view shows the node feed (Recognized/Discarded badge, txid, bytes and **collapsible hex**), Rating Rights under tracking, indexed Receipts and persistence file; "Send unknown transaction" button with green toast.
> - **Tests**: `test/e2e_server.test.js` 13 → **15** (indexer view exposes feed + state; unknown transaction discarded without touching the ledger; reset empties feed and stores). Suite 52 → **54 tests / 7 files passing** (`npx vitest run`).
> - **Guide**: `docs/TESTING.md` adds Tests 12–14 (see hex, discarded unknown transaction, full restart).
> - **Verification**: guide_smoke extended to **19/19 PASS** over the real server (includes indexer-view, foreign-tx and reset); no hanging node processes (the `npm start` on 3787 was started by the user).

- [x] **TASK-021** [RFC-005 / RFC-006] **Visible reputation + Auto demo**: the off-chain interpretation that crowns the protocol (auditable fact by fact) and the live system in 1 click. — *60 min*

> Strategy approved by the project architect in section E (audience: technicians/collaborators): the profile must be auditable, not only show numbers.
> - **Server**: refactor of the 5 API handlers into reusable helpers (`mintIdentity`, `createInteraction`, `platformConfirm`, `issueRating`, `createTrustLink`) that execute blockchain + indexing; the handlers keep input validation and delegate (the 18 previous E2E tests + new ones verify there was no regression).
>   - `GET /api/reputation/:pkh` (400 if pkh malformed): derived from the indexed `facts` — `hasIdentity` + txid, `ratingsReceived[{score, raterPkh, txid}]`, `avg` (1 decimal, null without data), `distribution {1..5}`, `ratingsIssued`, `trustReceived` (only valid), `confirmedReceipts`. No weighting or judgment (reputation layer out of scope, SPEC-006).
>   - `POST /api/demo/run` (demo-only): reuses the helpers to populate 3 wallets + 1 identity + **2 interactions** (A↔B and B→A, so both profiles have data) + **2 ratings** (A→B=5, B→A=4) + 1 confirmation + 1 trust. Returns a summary; does not reset (coexists with previous data).
> - **UI**: third tab **[Reputation]** (select wallet + "View profile" → average, distribution with bars, identity, and auditable listings with txids + "unweighted" note); **"Play demo"** button in the toolbar with a summary toast.
> - **Tests**: `test/e2e_server.test.js` 15 → **18** (auditable profile with known flow data: B avg 5.0 / A identity + confirmedReceipts; demo/run after reset with exact counts 1/2/2/1/1; demo coexists with previous data; malformed pkh → 400). Total suite → **57 tests / 7 files** (`npx vitest run`).
> - **Guide**: `docs/TESTING.md` adds Tests 15–16 (auto demo; audit each average down to its transaction) + updates "screen at a glance".
> - **Verification**: full suite 57 tests green; guide smoke extended to real endpoints (demo/run + reputation over the real server); `node --check` OK; no hanging processes (the `npm start` on 3787 still belongs to the user).

- [x] **TASK-022** [RFC-005] **Chipnet connectivity spike**: verify the network is reachable and evaluable from this environment before touching covenants. — *40 min*

> **Objective met**: Chipnet is **alive and synced** (height ~322,878 on 2026-09-09; **May 2026 / CashVM upgrade already active** since block 279,792 — same semantics as mainnet). `chipnet.imaginary.cash` (WSS, default port 50004) responds: `getBlockHeight`, `getUtxos`, `estimatefee` (~1 sat/byte: `0.00001` BCH/kB). The `bchtest:` addresses the server already generates are valid on Chipnet.
>
> **⚠️ Finding C1 (blocks architecture):** the `@electrum-cash/network` stack (both CashScript's `ElectrumNetworkProvider` and the direct `ElectrumClient`) **freezes the event loop of the whole process, intermittently, on the second request over a persistent connection** — the process does not respond even to timers/`Promise.race`; you have to kill it. Reproduced in 6+ isolated runs; a probe with a single operation per process always works.
>
> **⚠️ Finding C2:** CashScript's default for Chipnet (`chipnet.bch.ninja`) **does not respond from this environment** (clean timeout). Effective host: `chipnet.imaginary.cash` (simple hostname, without port — this lib builds `wss://host:50004` and breaks the URL if `host:port` is passed).
>
> **Design consequence**: Chipnet mode **cannot** run network requests inside the Express process. TASK-023 implemented the **`context/network-processor`** layer that executes each network operation in an isolated *child process*. The 57 Mock tests remain intact.

- [x] **TASK-023** [RFC-005] **Dual mode `REPID_NETWORK=mock|chipnet` + network layer in child process**: the server chooses the network by env (mock by default); Chipnet virtualizes each op (`height`, `fee`, `utxos`, `broadcast`, `rawtx`) toward an isolated worker **with kill + retry (2)** on intermittent hang (C1).

> **Implemented with real verification:**
> - **`context/network-processor.mjs`**: single-operation child process; JSON stdio contract `{"ok":true,"result":...}|{"ok":false,"error":...}` (satoshis/amount travel as string). API gotcha: in the installed version of `@bitauth/libauth`, `cashAddressToLockingBytecode(addr, true)` returns **`{ bytecode, prefix, tokenSupport }`** (not the direct bytes) — discovered while isolating the bug.
> - **`server/chipnet-provider.mjs`**: CashScript provider delegating to the worker (`Network.CHIPNET` interface, `getUtxos` normalizes `token.amount` to BigInt); timeout 25s + SIGKILL; real fee (~1 sat/byte) cached for 60s.
> - **`server/index.js`**: `REPID_NETWORK` factory; P2PKH spends (rating, platform, trust, foreign) refactored into a `spendP2pkh` helper with `addBchChangeOutputIfNeeded({to: wallet.address, feeRate})` (real fee with change to the wallet). In Mock the original E2Es did not change behavior (57 green tests intact).
> - **Honest gates**: Identity and Receipt genesis on Chipnet → **501 "TASK-024"** (the current covenant requires 1/3 outputs; sending 2/4 would be rejected by the real VM); `demo/run` on Chipnet → **501 "TASK-025"**. `reset` does not call `provider.reset()` on Chipnet (it does not exist).
> - **Chipnet**: `createWallet()` no longer injects a synthetic UTXO; 409 errors without funds cite the `tbch.googol.cash` faucet and the address to fund.
> - **Verification**: real smoke `scripts/chipnet-mode-smoke.mjs` (server in chipnet mode against the live network): wallets OK, `foreign-tx` without funds → 409 with faucet hint, genesis and demo → correct 501s. Full suite 57/57 green (mock immutable). `node --check` OK in the 3 files.
>
> **Remaining for TASK-024** (approved): covenants with change output (identity 1→2, receipt 3→4) + real funding (vout 0) to enable the genesis on Chipnet; **TASK-025**: funding UX, key persistence, mempool/confirmed badge; **TASK-026**: Chipnet E2E with real tBCH + guide.

- [x] **TASK-024** [RFC-001/003/004] **Covenants with change output + real genesis**: enables the genesis on the real network (Chipnet) without giving away the funding in fees, and lets the real VM accept it. *(Strategy approved by the project architect in Plan mode: modify covenants.)*

> **Implemented with real verification:**
> - **`contracts/identity_genesis.cash`**: 1 → **2 outputs** (NFT + change P2PKH to the owner). The change cannot carry tokens **minted in the same transaction** (`tokenCategory != newCategory`) — the chosen semantics after verifying that `tokenCategory == bytes32(0)` is not satisfied in the VM with tokenless outputs (CashScript does not expose "no token" as comparable zeros).
> - **`contracts/receipt_genesis.cash`**: 3 → **4 outputs** (Receipt + 2 Rating Rights + change P2PKH to `partyA`, who funds). Same anti-hidden-minting rule on the change.
> - **`server/index.js`** (helper `createGenesisFunding`): on Chipnet it builds a **real 1-input/1-output funding transaction** that leaves the whole balance in the contract (resulting outpoint `vout 0`, the covenant condition); in Mock the UTXO is injected directly as before. The genesis adds the change with `addBchChangeOutputIfNeeded` (real fee ~1 sat/byte, cached 60s). 501 gates removed: on Chipnet without tBCH they respond **409** with faucet hint + address.
> - **`indexer/repid-indexer.mjs`**: `outputs.length` 1/2 (identity) and 3/4 (receipt); an extra output with a token is NOT the expected change → do not recognize. Backward compatible: recognizes the genesis both with and without change.
> - **Specs**: SPEC-001 +RF-06 (owner change), SPEC-003 +RF-07 (partyA change) + DoD.
> - **Tests**: 57 → **63** (8+2 covenant tests with change in identity/receipt: value leak, change with token, 3–4 outputs; 2 indexer tests with genesis and change). `npx vitest run`: **63/63 green** / 7 files.
> - **Real verification**: smoke `scripts/chipnet-mode-smoke.mjs` — on Chipnet, identity genesis without tBCH → 409 faucet (not 501). Bug found and fixed: `createGenesisFunding` received `pkh` as bytes (not `pkhHex`) → localStorage/requireWallet failed; fixed by passing `pkhHex`.
>
> **Remaining for TASK-025**: funding UX (address to fund + verify funds), key persistence, mempool/confirmed badge; **TASK-026**: Chipnet E2E (real tBCH, validates the real VM accepts the genesis) + guide.

- [x] **TASK-025** [RFC-005] **Funding UX + key persistence + mempool/confirmed badge**: closes the "fund and continue" cycle on Chipnet.

> **Implemented with real verification:**
> - **Persistence (Chipnet, isolated by `REPID_DATA_DIR`)**: test wallets are stored in `data/wallet.json` (`binToHex` of keys → reloaded at startup with `loadWalletsFromDisk`); the prototype's local state (facts, feed, identities, interactions, available Rating Rights) in `data/repid-state.json` (`persistState`/`loadStateFromDisk`) so as not to re-mint something already on-chain. In Mock nothing changes (all in memory). `reset` on Chipnet deletes both files. *Documented caveat: these are test tBCH keys, not production.*
> - **Worker**: new op `status {txid}` → `blockchain.transaction.get_status` → `{ confirmed, blockHeight }` (mempool vs confirmed).
> - **API**: `GET /api/status` (current network); `GET /api/wallets/:pkh` (on-chain balance in sats, address, `hasIdentity`); `GET /api/tx/:txid/status` (mock: confirmed instantly; chipnet: worker).
> - **demo/run on Chipnet**: 501 gate removed → runs like in mock, with a prior check: if no wallet has funds, **409** with a faucet hint.
> - **UI** (`server/public/`): network badge in the masthead, «Saldo» button per wallet (shows sats + full address to fund on Chipnet), and per-transaction status badge in the Indexer view (confirmed/block or in mempool).
> - **Real verification**: suite **63/63** + E2E **18/18** + smoke `scripts/chipnet-mode-smoke.mjs` **9/9 PASS** — includes a Chipnet process restart with persisted wallets reloaded and the `status` op responding from the worker.
>
> **Remaining for TASK-026**: Chipnet E2E with real tBCH (validates the real VM accepts the genesis) + guide.

- [x] **TASK-026** [RFC-005] **Chipnet E2E with real tBCH + guide**: validate against the real Bitcoin VM (Chipnet) that the genesis and the full flow are accepted on-chain. *(Real run executed: 2026-09-10.)*

> **Advanced and verified without funds:**
> - **`scripts/chipnet-e2e.mjs`**: isolated server in chipnet mode (`REPID_DATA_DIR=data_chipnet_e2e`, port 3789) that creates a wallet, queries its on-chain balance and runs `demo/run` (identity + 2 interactions + 2 ratings + confirmation + trust). Verifies that **each tx that produced a fact exists on the network** (rawtx downloaded from the worker: `GET /api/tx/:txid/raw`, a new endpoint) and shows the mempool/confirmed status of each, plus the reputation built from the facts. Without funds it ends **cleanly with code 2**, showing the exact address to fund and **preserving the persisted wallet** for retry.
> - **`docs/TESTING.md` §7**: human-language guide of the real mode: automatic way (command + manual faucet `tbch.googol.cash`) and manual way through the interface («Red real Chipnet» badge, Balance button, mempool/confirmed badge, block explorer).
> - **Endpoint** `GET /api/tx/:txid/raw` (Chipnet: raw hex from the worker; Mock: null).
>
> **Real run executed and recorded (2026-09-10, Chipnet · tBCH):**
> - Wallet funded by the project architect: `bchtest:zqw3mjll4fe0py3c905hye2rv52wn5k6vcpt8ppdc7` — balance queried on-chain: **1,015,000 sats**.
> - New base for `demo/run` on Chipnet: the funded wallet **funds the demo** via P2PKH→P2PKH transfers (`POST /api/transfer` + helper `transferSats`, 20k sats to each of the 3 wallets the demo creates; no OP_RETURN → the indexer ignores them, they are not facts).
> - **Result: 11/11 PASS** — 7 real broadcast facts verifiable on-chain:
>   - `ac8027090206…` · IDENTITY_GENESIS
>   - `c5d7a5cc872e…` · RECEIPT_GENESIS
>   - `ff93deae71ff…` · RECEIPT_GENESIS
>   - `7a91a0bb42a3…` · RATING_ISSUED
>   - `cb9810086869…` · RATING_ISSUED
>   - `d632d9abae70…` · PLATFORM_CONFIRMATION
>   - `782783ee7feb…` · TRUST_LINK
>   - All downloaded (worker rawtx) from the network; in mempool at the time of the run; reputation built from real facts: **avg=5.0 (1 rating)**.
>
> **Archival run with FULL txids (2026-09-10, Chipnet · tBCH):**
> > The E2E was repeated with a second faucet drop (new persisted wallet `bchtest:zpf4zlclrvwglwtygjr6qzy02skuj079eygsvsajnx`, on-chain balance 1,015,000 sats) once the persistence-retention fix was applied. **Result: 11/11 PASS**, all full txids recorded (7 facts, in mempool at run close):
> > - `b3465406476c6bbb31f04a160093ac025d401f795ee3f5d838c600bbab004fd7` · IDENTITY_GENESIS
> > - `038b1c64e25bec342bd8677b7739135f1db389a208e3e1d5e17481727257726e` · RECEIPT_GENESIS
> > - `6728f5f6d51923abf468fa12ef8e84089531d6f522d36b47ec86f0ef9ba34cb0` · RECEIPT_GENESIS
> > - `4ab26ebf1c4d4ffb4d1a4cbacc7bd702c4ef15fe3e62816df8da0146f77acd87` · RATING_ISSUED
> > - `35dcd6c666ea1ef43205790a90fb1b8d87dd467dbd7ebb5af0a2cffd110d05b9` · RATING_ISSUED
> > - `50c65e71641350059c5905eff975e2220bc37fbafe1f7dfc77cb1b38d4152d97` · PLATFORM_CONFIRMATION
> > - `5170e3a9cdcde7dda83dd9b2161dcd75c083c4597877177c314125fc158fb22a` · TRUST_LINK
> > - Reputation rebuilt from real facts: **avg=5.0**. The run's persistence kept in `data_chipnet_e2e/`.
>
> **Cycle finding (fix applied)**: the first version of the E2E **deleted its `data_chipnet_e2e` on successful completion** — that lost the wallets' keys of the run (the facts stay on-chain, but without the keys they cannot be spent again). The script now **keeps the persistence** for re-verification (manual cleanup is the operator's responsibility). The clean-start behavior was also fixed: if there are no persisted wallets, the E2E creates one and shows the address to fund (exit 2), instead of failing.
>
> **Status**: protocol validation against the real VM **closed and doubly recorded** (runs of 2026-09-10: the initial one with prefixes and the archival one with full txids). To cross-check on-chain: `https://chipnet.imaginary.cash/explorer`.

- [x] **TASK-027** [RFC-005] **Presentation package for collaborators/funding**: makes the already-validated prototype "presentable".

> **Implemented with real verification:**
> - New **`README.md`** (root): public presentation of the project (English tagline + Spanish body) — what it is, the 6 specs, status (63 tests, Mock + Chipnet), one-page architecture, how to start in both modes, tests, repo structure and honest notes. The previous SDD package README was preserved in `docs/PACKAGE-SDD.md`.
> - **`docs/PITCH.md`**: one-page pitch (problem → idea → why BCH/CashTokens → status → what is sought) for funding.
> - **`diagram/repid-architecture.svg`**: updated to the current protocol — Receipt Genesis with **4 outputs** (includes the change to A for fees), and two new on-chain facts: **Platform Confirmation** (SPEC-003/RF-06, arrow from the Receipt) and **Trust Link** (SPEC-006). Legend and footer adjusted. XML validated.
> - **`AGENTS.md`**: note of the definitive count (63) next to the RFC status.
> - **Verification**: full suite **63/63** intact (no protocol code touched; only documentation and diagram, validated as well-formed XML).

- [x] **TASK-028** [all] **Closure of the specs' open assumptions (MVP vs post-MVP framework)**: inventory and decision of the remaining assumptions, recorded in each `SPEC-00X`. *(Decided with the project architect on 2026-09-10.)*

> **Result — 5 decisions (all with the recommendations; functional language):**
> 1. **Identity key loss** (SPEC-001): **risk accepted in the MVP**. The NFT is immutable and there is no on-chain recovery; a lost key = a lost identity. It is documented and off-chain backup (key custody) is recommended. Revocation/re-issuance remains a future improvement, not scheduled.
> 2. **Rating Right spend without OP_RETURN** (SPEC-005): **MVP limit confirmed as an explicit decision**. That spend leaves the utxo "alive" in the index and emits no fact; tracking payload-less spends stays out of scope.
> 3. **Indexer persistence in production** (SPEC-005): **confirmed direction = real DB (SQLite/Postgres) in a future cycle**; JSON remains the prototype persistence.
> 4. **Cancellation/dispute of an interaction before the Receipt** (SPEC-002): **consciously deferred to post-MVP**. It does not block the MVP: without agreement, the application simply does not emit the Receipt.
> 5. **Trust Links without truster Identity** (SPEC-006): **the current MVP is kept** — any pkh can declare trust; anti-sybil and weighting stay in the reputation layer (post-MVP).
>
> **Notes:**
> - Only one *unscheduled* improvement remained open (identity revocation), noted in SPEC-001 §6.
> - **Verification**: full suite **63/63** (documentation-only changes; code policies untouched). With this, **no open assumptions remain without a framework** in the specs.

- [x] **TASK-029** [RFC-005] **Server robustness**: direct E2E tests for the endpoints added in TASK-025/026 and hardening of the `POST /api/transfer` contract. *(Executed 2026-09-10.)*

> **Implemented:**
> - **`POST /api/transfer` — strict amount validation** in `server/index.js`: now requires an integer ≥ 1 that also respects the network dust minimum (**546 sats**, previously a lower amount fell into 500 due to cashscript dust); `0`, negatives, non-numeric, empty and < 546 → **400** with a clear message; non-existent wallet (from/to) → **404**.
> - **New E2E tests** in `test/e2e_server.test.js`:
>   - Happy P2PKH→P2PKH transfer: 201, 64-hex txid, amount reflected as string, and **verifies it does NOT generate a RepID fact** (the fact count does not change — reinforces the SPEC-005 edge case: OP_RETURN-less transfers are not facts).
>   - Errors: amount `0`, `-1`, `abc`, `1.5`, empty and `100` → 400; non-existent wallets → 404.
>   - TASK-025/026 endpoints per mode: `GET /api/status` → `{network:'mock'}`; `GET /api/tx/:txid/raw` → `{hex:null}`; `GET /api/tx/:txid/status` → `{confirmed:true, blockHeight:null}`; non-existent `GET /api/wallets/:pkh` → 404.
>
> **Verification**: full suite **66/66** (before 63) + chipnet smoke **9/9** PASS intact.

> **Optional (non-blocking, depends on the drop)**: extend `scripts/chipnet-mode-smoke.mjs` with a real P2PKH→P2PKH transfer (verifying on-chain that it generates no fact) when the run's wallet has tBCH.

- [x] **TASK-030** **Public repo + CI (GitHub)**: the prototype moves from a local folder to a versioned repository with continuous integration. *(Executed 2026-09-11.)*

> **Implemented:**
> - `.gitignore` at the root (excludes `node_modules/`, `data/`, `data_chipnet_e2e/` — protects test tBCH keys/wallets).
> - MIT `LICENSE` (the project architect's decision) + `CONTRIBUTING.md`.
> - `package-lock.json` versioned (reproducible `npm ci` in CI) + `.github/workflows/ci.yml` workflow (Node 22 → `npm ci` → `npm test`).
> - `git init -b main` (maintainer's git identity), initial commit and `gh repo create repid --public --source . --push`.
> - **Repo**: https://github.com/<your-user>/repid — CI badge in the README.
>
> **Verification**: first Actions run on `main` → **success** (run 34558659475 and the badge one 34558672872, both green).

- [x] **TASK-031** [RFC-005] **"Example app" tab (freelance)** in the web console: a mini freelance platform mounted on the **existing API** (no backend changes) showing RepID as a reputation layer usable from an app. *(Executed 2026-09-11.)*

> **Implemented:**
> - New **"Example app"** tab in `server/public/index.html` + `app.js` + `style.css`:
>   1. **Hire the professional** — `POST /api/interactions` with `client`/`professional` roles (on-chain Receipt); the task selector (logo design / server / translation) is interaction metadata.
>   2. **The platform confirms** — `POST /api/platform-confirmations` (`PLATFORM_CONFIRMATION` fact with a validating wallet).
>   3. **The client rates** — the client spends its Rating Right with `POST /api/ratings` (score 1–5, slider).
>   4. **Professional's reputation** — live `GET /api/reputation/:pkh` + optional trust declaration (`POST /api/trust-links`).
> - App session history (receipt, confirmed/rated) and **"Raw"** panel showing the exact API call (method, route, payload and response) per action.
> - `renderReputation` reusable with a card target (the app tab shows the professional's profile in its own card).
> - **New E2E test** `la App de ejemplo (freelance) mueve el flujo completo sobre la API` in `test/e2e_server.test.js` (fresh client/professional/platform → interaction → confirmation → rating → cross reputations of the professional and the client).
>
> **Verification**: full suite **67/67** PASS + green CI.
>
> **Note**: the reputation's `confirmedReceipts` belongs to the **client's** profile (partyA is the Receipt owner), not the professional's — the test verifies it with cross profiles.

- [x] **TASK-032** [RFC-005] **Chipnet E2E in GitHub Actions (manual workflow)**: the validation against the real Bitcoin VM is published and reproducible in the public repo. *(Executed 2026-09-11.)*

> **Implemented:**
> - New `.github/workflows/chipnet-e2e.yml` (`workflow_dispatch`, manual on purpose: the `tbch.googol.cash` faucet is a manual captcha): checkout → Node 22 + `npm ci` → retrieves the `data_chipnet_e2e` artifact from a previous run (retry without losing tBCH) → `REPID_NETWORK=chipnet REPID_DATA_DIR=... node scripts/chipnet-e2e.mjs` → uploads the artifact with the test wallets (`if: always()`).
> - Without funds, the script stops with code 2 after showing the address to fund (same as local); the artifact stays saved for the retry.
>
> **Verification**: real run (34560157789) on GitHub — wallet created on Chipnet (`bchtest:zpu3kqx9du5hnv…`), balances queried on-chain, and controlled stop with **exit code 2** and address to fund. Expected behavior: validate the full wiring (chipnet server → provider → worker → script). With tBCH in the artifact, a retry runs the full flow 11/11 PASS.

- [x] **TASK-033** [RFC-005] **Hosted demo**: the prototype can be deployed in 1 click so a visitor tries RepID without installing anything, and starts already populated with the full flow. *(Executed 2026-09-11.)*

> **Implemented:**
> - `render.yaml` (Render.com blueprint, free plan): Node web service, `REPID_NETWORK=mock`, build `npm ci`, start `node server/index.js`, health check on `/api/facts`. 1-click deploy from `dashboard.render.com/new` → Blueprint → repo `<your-user>/repid`.
> - **`REPID_AUTO_DEMO=1`** (default off, Mock mode only, never Chipnet): at startup, the server automatically executes the full demo flow (3 wallets, identity, 2 interactions, 2 ratings, 1 confirmation, 1 trust = **7 facts**) and the visitor finds the system alive on the first screen. Refactor of `POST /api/demo/run`: the handler now delegates to the reusable `runDemo()` function, which the startup also uses.
> - **New E2E test** `auto-demo al arranque (TASK-033)` in `test/e2e_server.test.js`: starts a real server with `REPID_AUTO_DEMO=1` on an ephemeral port and verifies 7 facts (1 identity, 2 receipts, 2 ratings, 1 confirmation, 1 trust) + 3 wallets without intervention.
>
> **Verification**: full suite **68/68** PASS (before 67) + local smoke of `REPID_AUTO_DEMO=1` (server started and `/api/facts` returned the 7 facts) + pending Render deploy PR for the public URL.

- [x] **TASK-036** [SPEC-001 / RFC-001] **Identity collateral with vault covenant**: the identity moves from an NFT locked to P2PKH to an NFT custodied by an `IdentityVault` covenant that locks a **collateral in BCH**. The collateral is set at mint (> 0), **never decreases on-chain** (every spend must re-lock ≥), can be increased, and the identity can be **deleted** (the NFT is burned and the collateral returns to the owner; the wallet can mint a new identity). *(Executed 2026-09-11.)*

> **Implemented:**
> - **Contract** `contracts/identity_vault.cash` (compiled to `.json`): `mint(pubkey pk, sig s, int collateral)` — requires `nftCommitment == ownerPkh`, output 0 with `value == collateral` locked to the covenant, change P2PKH to the owner; `increaseCollateral` — re-locks the same NFT with `value >= oldCollateral` (the covenant also requires it at VM level via `output[0].value >= tx.inputs[0].value`); `burn` — burns the category and returns the balance to the owner's P2PKH. `contract.tokenAddress` is used to issue the NFT to the covenant (P2SH address with token support).
> - **Indexer** (`indexer/repid-indexer.mjs`): `tryDecodeIdentityGenesis` now recognizes the **vault** form (NFT to the covenant with 20-byte `ownerPkh` commitment + collateral) in addition to the **legacy** form (P2PKH NFT); new `tryDecodeIdentitySpend` distinguishing **top-up** (`IDENTITY_COLLATERAL_TOP_UP`, valid if the NFT matches and `new >= old`; moves tracking to the new `txid:0` outpoint) from **burn** (`IDENTITY_BURNED`; untrack). `indexRawTransaction` decodes the identity spend **before** the genesis (a top-up has the same output shape as a vault genesis). Both stores (`memory` + `jsonFileStore`) gain `trackIdentity`/`getIdentity`/`untrackIdentity` and persist the identities in the JSON snapshot.
> - **Server** (`server/index.js`): `mintIdentity(ownerPkh, collateral = 1000n)` with validations (≤ 0 → 400; collateral ≥ funding → 400), `increaseCollateral` and `burnIdentity`; `POST /api/identities` accepts optional `collateral`, new routes `POST /api/identities/:pkh/collateral` and `POST /api/identities/:pkh/burn`; `GET /api/reputation/:pkh` returns `collateral`.
> - **Web console**: "Mint identity" panel with collateral input, "Increase collateral" and "Delete identity" buttons (with confirmation), collateral visible in the profile, and list of tracked identities in the Indexer view.
> - **Tests (29 new, 68 → 97)**: `test/identity_vault.test.js` (17 covenant: mint/top-up/burn, rejections for insufficient collateral, foreign signature, collateral leak, re-issuance), `test/identity_vault_indexer.test.js` (5 indexer: genesis+tracking, top-up moves tracking, burn untrack, post-burn P2PKH is not a fact, JSON persistence), `test/e2e_server.test.js` (+7 E2E: mint with collateral, rejections, top-up, burn, re-mint, ledger with the new types).
>
> **Verification**: full suite **97/97 PASS** (`npx vitest run`, 9 files) + identical E2E separately (30 tests). SPEC-001 updated (vault + RF-06/07/08/09), `plan.md`, `README.md`, `AGENTS.md` and the web console updated. Pending: adapt `scripts/chipnet-e2e.mjs` to the vault (requires real tBCH).

- [x] **TASK-037** [RFC-001 / RFC-005] **Manual collateral testing on Chipnet**: tools + guide so the identity vault is truly tested against the real network (the Bitcoin VM is the only one that can validate mint/top-up/burn). *(Executed 2026-09-11.)*

> **Implemented:**
> - **`scripts/chipnet-vault-e2e.mjs`** (new): isolated server (`REPID_DATA_DIR=data_chipnet_vault_e2e`, port 3790), on-chain vault flow → mints with **explicit collateral** (40% of the balance, leaves change for fees), **increases** the collateral (verifies `previous + amount == new`, `valid:true` and intact category), **deletes** the identity (burn + `hasIdentity:false`), **re-mints** (new category). Without funds → shows the address to fund and **exit 2** (retry); preserves the data dir. Each tx is verified with the worker's `rawtx`/`status`; confirmation wait (~90 s). Does not touch `data_chipnet_e2e` (TASK-026).
> - **"Transfer Sats" button** in the web console (`index.html` + `app.js`): distribute tBCH among prototype wallets from one funded with the faucet. Uses the existing `POST /api/transfer` (`{ fromPkh, toPkh, amount }`, minimum 546 sats); backend unchanged.
> - **`docs/TESTING.md`** updated: Test 2 with collateral + new **2b** (increase) and **2c** (delete and re-mint), Test 10 now 7 types, Test 12 with "Identities under tracking", Test 16 with collateral in the profile, §7.1b with the `chipnet-vault-e2e.mjs` command, §7.2 with covenant verification in the explorer and the Transfer button, quick reference with both scripts.
>
> **Verification**: `node --check` on the new script and `app.js`; suite 97/97 intact (frontend/guide/script changes, no protocol touched). The real Chipnet run is the project architect's responsibility after a faucet drop.

- [x] **TASK-038** [RFC-005 / Usability] **«Mis wallets»: base wallet + sat sweep-back**: import your own wallet (always the same one) and repatriate the test wallets' sats to the primary one when done. *(Executed 2026-09-11.)*

> **Implemented:**
> - **`POST /api/wallets/import`** (`{ privateKey }`): accepts one or more keys (newline-separated) in **64-hex** (native `wallet.json` format) or **WIF** (external standard; detected with libauth's `decodePrivateKeyWif` — the server already imported it). Derives the wallet with the same `createWallet` helper (`walletFromPrivateKey`); duplicates → reuses (no duplication); `asPrimary: true` marks it as primary. In Mock it injects the synthetic funds (test locally with the base); on Chipnet it persists in `wallet.json` and reappears on restart.
> - **Primary wallet** (`POST /api/wallets/:pkh/primary`): `primaryPkh` is persisted in `repid-state.json` (new field, survives restarts on Chipnet), exposed in `GET /api/status` and as `isPrimary` in each wallet, and cleared on `reset`. In Mock it lives in memory (nothing persists in Mock, like the rest).
> - **Sweep** (`POST /api/sweep { burnIdentities }`): `sweepWalletTo` sends ALL the non-token P2PKH UTXOs of a wallet to the primary in a single **multi-input** transaction (real Chipnet fee, conservative estimate; the < 546 leftover stays as miner fee, leaving no trash UTXOs). With `burnIdentities: true`, it first burns each secondary wallet's identity (collateral → owner's wallet → falls in the same pass). Unspent Rating Rights and the collateral of non-burned identities are NOT swept. Per-wallet report `{ pkh, burned, sweptSats, error? }` (a fee error does not abort the rest).
> - **Web console**: **"Manage Wallets"** panel (textarea to paste keys + "Import", selector + "Mark as primary", **"Sweep all to primary"** button with confirmation and "Burn identities…" checkbox on by default) and **PRIMARY** badge in the wallet list.
> - **E2E tests (+6, 97 → 103)**: import by hex and WIF (with dedup and 400), synthetic funds to the imported one, sweep without primary → 409, primary mark, sweep with burn (identity deleted + collateral repatriated + secondary without balance) and without burn (identity and collateral intact). Also adjusted the `/api/status` expect and reset verifies it clears the mark.
>
> **Verification**: full suite **103/103 PASS** (`npx vitest run`, 9 files; E2E 36/36) + `node --check` for `server/index.js` and `server/public/app.js`. `docs/TESTING.md`, `AGENTS.md` and `README.md` updated.

- [x] **TASK-039** [SPEC-008] **Formal protocol specification (normative core + conformance)**: formalize RepID at protocol level, implementation-agnostic, as the normative authority above SPEC-001..007. *(Executed 2026-09-17.)*

> **Implemented:**
> - **`specs/SPEC-008-repid-protocol.md`** (new): 9 sections — (1) principles and scope, (2) protocol model (entities + cardinalities), (3) the **seven** protocol events with their field schema, (4) on-chain rules (tokens, identity/collateral, receipt, rating, validation/trust, mutability, byte notes), (5) verification and indexing (recognized/valid/invalid/not-a-fact semantics), (6) reputation interpretation (non-normative; SPEC-007's CI stays out of the core), (7) security and abuse resistance (guarantee / delegation / limitation matrix), (8) interoperability and extensibility (core vs extensions), (9) conformance. Annex A (reference implementation, non-normative) and Annex B (glossary + RF → code → test matrix).
> - **Declared precedence**: SPEC-008 prevails over SPEC-001..007 in case of conflict; those specs remain as per-feature *rationale*. `constitution.md` remains above every spec.
> - **Honest coverage**: each core RF maps to real tests; the boundary/negative RFs and §7 limitations are declared as verified by inspection/absence, not by automated test (Constitution, Art. 4); the UI is manual verification (`docs/TESTING.md`).
>
> **Verification**: `npx vitest run` → **128/128 PASS** (10 files, no protocol code changes); §3 event schemas surveyed against `indexer/repid-indexer.mjs` (7 types) and §4 invariants against `contracts/identity_vault.cash` and `contracts/receipt_genesis.cash`. `README.md`, `AGENTS.md` and `plan.md` synchronized.

- [x] **TASK-041** [RFC-005/RFC-006] **Monorepo npm workspace — protocol and indexer as separable packages**: refactor the repository into a monorepo so that the protocol and the indexer can be exported as independent repositories in the future. *(Executed 2026-09-23.)*

> **Implemented:**
> - **`packages/protocol`** (`@repid/protocol`, zero runtime deps): `index.mjs` = single source of truth for the protocol constants (tags `REPID_RATING1`/`REPID_PLATFORM1`/`REPID_TRUST1`, score range 1–5, `FACT_TYPES`) and package README; the normative specs **SPEC-005, SPEC-007 and SPEC-008 moved** to `packages/protocol/spec/` via `git mv` (SPEC-001..004 and SPEC-006 stay in `specs/`).
> - **`packages/indexer`** (`@repid/indexer`): `src/repid-indexer.mjs` (moved) now imports tags/score/fact types from `@repid/protocol` (local copies removed); its **4 tests moved** to `packages/indexer/test/` (self-contained per the project architect's decision — no root cross-imports), consuming the covenant artifacts copied to `packages/indexer/test/fixtures/`; package README documents the API + the fixture-relocation note.
> - **Root `package.json`**: `"workspaces": ["packages/protocol", "packages/indexer"]` and the previously-transitive deps declared explicitly (`@bitauth/libauth` 3.1.0-next.8, `@electrum-cash/network` 4.2.2 — latent bug fixed).
> - `server/index.js` and the 4 moved tests import the packages **by name** (`@repid/indexer`, `@repid/protocol`).
> - Docs updated: `AGENTS.md` (monorepo + package paths), `README.md` (structure tree + docs list), `CONTRIBUTING.md` (new §8, English-everywhere policy conformed to AGENTS.md §5), stale references to the deleted `docs/PACKAGE-SDD.md` removed.
>
> **Verification**: `npm install` (2 packages linked, 0 vulnerabilities); `node --check` ALL PASS (indexer src, protocol index, 4 tests, server); **`npx vitest run` → 128/128 PASS** (10 files — 6 root + 4 in `packages/indexer/test/`), which also validates the workspace resolution (`@repid/indexer`/`@repid/protocol` resolved by name from the server E2E booting the real server).

- [x] **TASK-047** [SPEC-008/009/010] **Protocol `0.4.0` executed + demo aligned (audit lote 2, Tarea E/F)**: the conformance task E that the lote-2 audit declared pending is executed, and this repository (the demo) is aligned with the new protocol version without needing a code migration. *(Executed 2026-10-07.)*

> **Implemented — protocol side (`repid-protocol`, `repid-sdk`):**
> - **Vectores B.3 de `SPEC-009` ejecutados**: `test/b3_0_4_0_vectors.test.ts` (SDK, 18 tests) con cada fila del annex enlazada a su `RF-W64`–`RF-W76` en el manifest de trazabilidad; las dos formas de `REPID_RATING2` (score + `commentHash`), `REPID_RETRACT1` (referencia 32 B, `valid` por memoria, primer sólo-una-vez), la auto-corroboración de una parte del Receipt (`valid:false`, RF-W71), el contexto de interacción (`0x10`/`0x11`, lo demás → no fact) y el binding versionado del vault (la versión se registra en la génesis, RF-W76).
> - **Burn delay `RF-O831` en VM**: `conformance/identity-vault-burn-delay.test.mjs` (6 tests) ejecuta el gate `age >= 144`.
> - **Bump**: `protocol/protocol-version.json` → `0.4.0`; `conformance/schema.test.mjs` lo comprueba; `SPEC-010` y `SPEC-009` §12.3/Annex B.3 y `SPEC-008` actualizados (ya no "0.3.0 only", vectores ya no "pending"); `protocol/requirements.json` regenerado (216 declaraciones).
> - **Resultado**: SDK **15 files, 150 tests, 0 failures** (`npm run typecheck` + `npm run check:drift` + `npm test`); protocolo **52 tests, 0 failures** (`npm test`, incluye `--check` de specs, requirements y bytecode).
>
> **Implemented — this repository (demo):**
> - The demo consumes the same `@repid/sdk` 0.4.0 (recognizer output now includes the 8th fact type `RATING_RETRACTION`). The Ledger labels and renders it (`FACT_LABELS` + `renderFact` in `server/public/app.js`); no backend change was needed — the recognizer API is backward-compatible.
> - `docs/EXTERNAL-INDEXER-GUIDE.md` updated to **eight facts / five tags**: `RATING_RETRACTION` row in §3 and §4, the Retracted-ratings map and expanded Receipts record in §5, payload table with `REPID_RATING2`/`REPID_RETRACT1` in §6.2, new §6.6 (retraction semantics), the interaction context in §7.4, trap §8.6 (version recorded at genesis, never trial-matched), precedence table (7 recognizers) in §9.1, malformed/invalid §10, and the references §13.
> - Removed 4 empty orphan `.ts` test stubs (`test/covenant_binding.test.ts` etc., untracked) that made vitest report "No test suite found"; the canonical suites live in `repid-sdk`.
> - `AGENTS.md` counts synchronized (150 SDK tests / 15 files, 52 protocol tests).
>
> **Verification**: `node --test` protocolo 52/52; SDK `npm test` 150/150 (15 files) tras re-sync (`npm run sync:protocol` + `npm run check:drift`); demo `npm test` → **73 tests, 0 failures** (35 executed + 38 tBCH-gated, 4 files) with the 0.4.0 SDK installed.