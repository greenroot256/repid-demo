# plan.md — RepID
## Technical Design (covers RFC-005: BCH Reference Implementation, and RFC-006: Indexer Specification)

This document translates the functional specs (SPEC-001 through SPEC-008) into concrete technical decisions. It describes the **how**, unlike the `spec.md` files that describe the **what** and the **why**. SPEC-008 is the **normative core of the protocol** (implementation-agnostic, with conformance) and prevails over the other specs in case of conflict.

---

## 1. Modules

| Module | Responsibility | Status |
|---|---|---|
| `contracts/IdentityVault.cash` (`IdentityVault`) | Single-use covenant that mints the identity NFT and locks a **collateral in BCH** (SPEC-001). Functions `mint` (genesis), `increaseCollateral` (top-up, the collateral never decreases on-chain) and `burn` (returns the collateral and burns the NFT). `IdentityGenesisValidator.cash` remains as the legacy format the indexer still reads | ✅ |
| `contracts/ReceiptGenesisValidator.cash` | Jointly-signed covenant that mints the Receipt + 2 Rating Rights (SPEC-003) | ✅ |
| Spend `ISSUED_RATING` | P2PKH script with `OP_RETURN` that spends a Rating Right (SPEC-004) | ✅ |
| `indexer/` (`decodeTransactionBCH`) | Reconstructs structured facts from raw transaction hex (RFC-006) | ✅ |
| `indexer/memoryStore` | Tracks live Rating Rights outpoints and Receipt txids (necessary because the NFT is burned when spent) | ✅ |
| `indexer/jsonFileStore` | Persistent variant of the store in a local JSON file (rating rights + receipts index, restarts) | ✅ |
| `server/` (Express) | Two-column web console prototype for an end-to-end demo; validates roles (SPEC-002), uses the persistent store, allows platform confirmation (SPEC-003 RF-06) and trust declarations (SPEC-006) | ✅ |
| `interaction/repid-interaction.mjs` (SPEC-002) | Pre-Receipt metadata model (explicit roles, covenant-input derivation) | ✅ |

## 2. Data Model

**Interaction (off-chain, SPEC-002)** — application-level metadata that defines an interaction between two parties before it is recorded as a Receipt (RFC-003). It is the input that feeds the Receipt genesis. It operates off the chain (Constitution, Article 1); only the resulting Receipt is anchored on-chain.

```js
// DefineInteractionInput — provided by the external application
{
  protocolRef: string,       // id/ref of the interaction in the app (optional, not interpreted on-chain)
  partyA: { pkh: bytes20, role: string },   // first participant (Receipt owner, see RFC-003 RF-04)
  partyB: { pkh: bytes20, role: string },   // second participant
}

// Interaction — formalized result (here the covenant inputs are derived)
{
  protocolRef: string,
  partyA: { pkh, role },
  partyB: { pkh, role },
  createdAt: string,   // ISO timestamp off-chain (not anchored)
}

// Derivation toward ReceiptGenesisValidator (RFC-003):
//   partyA_pkh = partyA.pkh, partyB_pkh = partyB.pkh
```

Rules:
- `role` is a free string, domain-agnostic ("passenger", "driver", "buyer"…) — RepID transports it but does not interpret it.
- `partyA.pkh` and `partyB.pkh` must exist (non-empty) and differ from each other.
- If `pkh` or `role` is missing in either party → rejection (RFC-002 RF-04).

**Identity NFT (vault)**
- Immutable NFT; `nftCommitment` = `owner_pkh` (20 bytes).
- Token category = the identity's unique identifier.
- **Collateral**: BCH locked in the `IdentityVault` covenant at mint time (amount > 0 chosen by the owner). On-chain rule: any spend must re-lock `value >= oldCollateral` (it never decreases) and only the owner can sign.
- `burn`: burns the NFT, returns the collateral to the owner's P2PKH and the identity loses validity; the wallet can mint a new identity.
- **Reader compatibility**: the indexer recognizes both the vault form (NFT to the covenant with commitment = ownerPkh and collateral) and the legacy form (NFT directly to P2PKH, without collateral).

**Interaction Receipt NFT**
- `partyA_pkh`, `partyB_pkh`
- `roles`: declared role of each party (pending formalization in SPEC-002).
- Implicit reference to the two Rating Rights minted in the same transaction.

**Rating Right (UTXO)**
- Commitment: `owner_pkh` (current decision — see open assumption in SPEC-004 §5).
- When spent: `OP_RETURN` with the score (integer 1–5).

**Indexed fact (Indexer output)**
- Fact type (Identity genesis / Identity collateral top-up / Identity burned / Receipt genesis / Rating issued / Platform confirmation / Trust link).
- Source and destination outpoint.
- Decoded payload (score, pkh, category, referenced Receipt txid, collateral).
- State: alive / spent (relevant for Rating Rights, which are burned). For platform confirmations: `valid` depending on whether the referenced Receipt is indexed.

## 3. Algorithms

- **Genesis validation (Identity / Receipt):** the covenant verifies that the spent outpoint has `vout == 0` (CashTokens constraint) and that the resulting token category is consistent, comparing bytes in the inverted order returned by `tokenCategory`.
- **Indexer reconstruction:** `decodeTransactionBCH` parses the raw hex → inputs/outputs with tokens are extracted → the fact is classified according to the output pattern (identity genesis, identity top-up or burn, receipt genesis + 2 rating rights, rating right spend with `OP_RETURN`, platform attestation or trust declaration). `outpointTransactionHash` already comes in display order from libauth and is not inverted (careful: it is the opposite case of `tokenCategory`). A spend of an identity vault is decoded **before** the genesis (a top-up has the same output shape as a vault genesis; only the trace of outpoints under tracking distinguishes them).
- **PLATFORM_CONFIRMATION (SPEC-003 RF-06, pattern C):** the platform spends its own P2PKH UTXO (without Identity) with `OP_RETURN: <tag REPID_PLATFORM1> <Receipt txid, 32 bytes>`. The indexer recovers the signer's pkh from the first input's scriptSig and validates the reference against the Receipts index; if the Receipt is not indexed, the fact is recognized but marked `valid: false`.
- **TRUST_LINK (SPEC-006):** unilateral declaration — A spends a P2PKH UTXO with `OP_RETURN: <tag REPID_TRUST1> <B's pkh, 20 bytes>`. Without B's consent and without Rating Rights. If A == B, it is marked `valid: false`.
- **MemoryStore / JsonFileStore:** they maintain a map of live Rating Rights outpoints and an index of Receipt txids; upon detecting a valid spend, they mark the outpoint as consumed and record the decoded score.

## 4. Testing Strategy

- **Test runner:** vitest.
- **Simulation:** `MockNetworkProvider`. Known and accepted limitation: it does not execute the Bitcoin VM nor validate signatures or scripts — a successful submission is not evidence by itself that the script is correct; it is complemented with explicit assertions about the resulting transaction structure.
- **Cases not verifiable with the current tooling:** "impostor" tests (an unauthorized signer trying to spend) using a custom Unlocker with P2PKH are inconclusive because `debug()` rejects those transactions before evaluating them. This is documented explicitly instead of being claimed as coverage (Constitution, Article 4).
- **Coverage rule (Constitution, Articles 3 and 7):** each RF of each spec.md must have at least one test that explicitly verifies it, not just a generic contract test.

## 5. Persistence

The Indexer requires persistent state because the Rating Right NFT is burned when spent — without an external record, the traceability of "who already rated" is lost. For the MVP, `createMemoryStore` is used (in-memory, not persistent between restarts).

**Prototype persistence (TASK-004, Option A — confirmed):** `createJsonFileStore(filePath)` persists the Rating Rights state and the Receipts index in a local JSON file:
- Loads the state at startup from the file (clean startup if it does not exist — ignoring `ENOENT`).
- Re-writes the file after each registered Rating Right and after each indexed Receipt.
- Survives process restarts; shares the same interface as `createMemoryStore`, so `indexRawTransaction` does not change.

**Production (out of the MVP scope):** a real DB (SQLite or other) will replace the JSON file when the project scales — decision deferred to a future iteration.

## 6. Network Dependencies

- The BCH network upgrade **"Layla" (May 2026)** enables loops inside CashScript covenants. No current RepID contract depends on this capability; it is registered here to evaluate in future versions whether it simplifies any covenant (e.g., validation of N parties in the Receipt, if that direction is confirmed).
- ⚠️ The **"Layla upgrade loop"** pattern mentioned in previous sessions was lost in an environment reset and **was not reconstructed** (TASK-012b): without an original source, reconstructing it blindly would violate Radical Honesty (Constitution, Art. 4). If a reference appears in the future (session note, chat, email), this section is the anchor to document it again.

## 7. Binding Technical Conventions (repeated from agents.md for visibility in the design flow)

- CashTokens genesis requires `vout == 0` on the spent outpoint.
- `tokenCategory` in covenants → bytes in inverted order.
- `outpointTransactionHash` (libauth) → already in display order.
- `addOpReturnOutput` → UTF-8 by default, use the `"0x"` prefix for raw bytes.