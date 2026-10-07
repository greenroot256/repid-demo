# External Indexer Guide — finding all RepID facts on Bitcoin Cash

> **Audience**: an indexer developer outside this repository.
> **Network**: **Chipnet** (BCH testnet, tBCH). The token category is different
> on every network, so nothing in this document transfers to mainnet unchanged.
> **Self-contained**: everything needed is here. No access to the RepID codebase
> is required, though §13 points to the normative sources if you want to
> cross-check.
>
> This document is a **specification of what to look for**, not a description of
> an implementation. Where the reference implementation has a limitation, it is
> declared as such rather than smoothed over.

---

## 1. What RepID is, in four lines

RepID anchors **immutable facts** on Bitcoin Cash using CashTokens (native
NFTs) and leaves all **interpretation off-chain**. A fact says *"this person
received a rating of 3 from that person for an interaction both of them
signed"* — it does **not** say whether that is good, and no score ever
computes on-chain.

There are **eight** fact types. That is the whole protocol surface.

The consequence that matters most for your indexer:

> **The chain does not remember.** Five of the eight facts are about *spending*
> something that afterwards no longer exists. A fact is often only provable from
> what you saw *earlier*. So an indexer is not a search engine — it is a
> notebook with rules.

---

## 2. Network access

### 2.1 Server

Connect to a Chipnet Electrum server over **WSS**:

| Parameter | Value |
|---|---|
| host | `chipnet.imaginary.cash` |
| port | *default* (50004 for WSS) |
| transport | WSS |

**Do not pass `host:port` combined** — that form builds a malformed URL. Pass
the hostname alone and let the client use the default WSS port. CashScript's
bundled default (`chipnet.bch.ninja`) does not respond; use the host above.

### 2.2 Methods

Verified working against this network:

| Method | Use |
|---|---|
| `blockchain.headers.subscribe` | current tip height |
| `blockchain.transaction.get` | raw transaction hex by txid |
| `blockchain.transaction.get_status` | confirmations / mempool status |
| `blockchain.scripthash.listunspent` (arg: `include_tokens`) | live UTXOs of a script, **with token fields** |

Standard Electrum, **not exercised in the reference implementation** (use them
for the historical walk in §3, but validate them before relying on them):

| Method | Use |
|---|---|
| `blockchain.block.header` | block hash by height |
| `blockchain.transaction.id_from_pos` | txids of a block, by position |

### 2.3 ⚠️ Operational hazard: the event loop can freeze

`@electrum-cash/network` has been observed to **freeze the event loop of the
entire process** on requests over a persistent connection — the process stops
responding to timers and must be killed.

**Run every real-network operation in an isolated child process**, one operation
per process, exchanging JSON over stdio (`{"ok":true,"result":…}` or
`{"ok":false,"error":…}`). If your indexer runs inside a web server, this is not
optional.

---

## 3. The requirement almost everyone misses: scan the whole history

**A complete RepID index cannot be built from UTXO queries.**

`listunspent` tells you what is *alive right now*. Five of the eight facts are
recorded by *spending* something, and the spend destroys the evidence:

| Fact | Why a UTXO walk misses it |
|---|---|
| `RATING_ISSUED` | Spending the Rating Right **burns the NFT**. No UTXO remains. A spent Rating Right is indistinguishable from nothing at all. |
| `RATING_RETRACTION` | It spends an ordinary P2PKH coin of the rater. Nothing at all marks that spend as a retraction — only state from a rating seen earlier can name it. |
| `IDENTITY_BURNED` | The identity category simply disappears from every output. Nothing marks the spot. |
| `IDENTITY_COLLATERAL_TOP_UP` | It **re-locks the same NFT with the same shape as a fresh mint**. Indistinguishable from a genesis by shape alone. |
| `PLATFORM_CONFIRMATION` | Recognizable on its own, but its `valid` verdict depends on a Receipt you must have indexed already. |

**Therefore:**

1. Determine a **start height**: the block of the first RepID transaction, or a
   checkpoint you have independently verified. An indexer that starts from
   "now" can never recover ratings, top-ups or burns — they are gone.
2. Walk blocks from that height to the tip, **in order, with no gaps**.
3. For each txid, fetch the raw hex with `blockchain.transaction.get`.
4. Run the recognition algorithm of §9 on each transaction, **in that order**.
5. **Persist the raw hex** as you go, so an interrupted scan resumes instead of
   restarting, and so every fact stays re-verifiable against the chain later.

If the start height is unknown, walk from genesis. It is slower and correct;
skipping is faster and permanently wrong.

---

## 4. The eight facts, and which ones need memory

| Fact | Recognizable from its own bytes? | Needs prior state |
|---|---|---|
| `IDENTITY_GENESIS` | **Yes** | no |
| `RECEIPT_GENESIS` | **Yes** | no |
| `TRUST_LINK` | **Yes** | no |
| `PLATFORM_CONFIRMATION` | Yes — but its **validity** needs state | partially |
| `IDENTITY_COLLATERAL_TOP_UP` | **No** | yes |
| `IDENTITY_BURNED` | **No** | yes |
| `RATING_ISSUED` | **No** | yes |
| `RATING_RETRACTION` | **No** | yes |

Three facts are self-contained. One is recognized standalone and validated
against memory. Four are **only** recognizable if your indexer remembers the
artifact they consume.

---

## 5. The state you must maintain

The chain keeps none of this. Your index must.

| Map | Key | Value | Written when | Read when |
|---|---|---|---|---|
| Rating Rights | `outpoint` = `txid:vout` | `{ownerPkh, ratesPkh}` | a `RECEIPT_GENESIS` is recognized | a `RATING_ISSUED` is recognized |
| Identities (vaults) | `outpoint` = `txid:0` | `{ownerPkh, identityCategory, collateral}` | a vault `IDENTITY_GENESIS` or a valid top-up | that vault's outpoint is spent |
| Receipts | `txid` | `{receiptOwnerPkh, partyBPkh, receiptContext?}` | a `RECEIPT_GENESIS` is recognized | a `PLATFORM_CONFIRMATION` or a `RATING_RETRACTION` is recognized |
| Retracted ratings | `(raterPkh, receiptTxid)` | marker | the **first valid** `RATING_RETRACTION` | a `RATING_RETRACTION` is recognized (`valid =` reference known && not already here) |

**Removals are as important as writes:**

- `RATING_ISSUED` → **remove** the consumed Rating Right outpoint.
- `IDENTITY_BURNED` → **remove** the vault outpoint.
- `IDENTITY_COLLATERAL_TOP_UP` (valid) → **move** the tracking from the spent
  outpoint to `<new txid>:0`, updating the collateral.

`outpoint` strings are **lowercase hex txid, display order**, then `:`, then the
output index — e.g. `6bb06faf…b11c:1`.

Persist this state. It must survive a restart, or a resumed scan will produce
different results than a single continuous run — which breaks the determinism
requirement in §9.4.

---

## 6. Recognition rules, family A: the `OP_RETURN` facts

Four facts are declared by spending the declarer's own P2PKH and adding one
`OP_RETURN`: `RATING_ISSUED`, `RATING_RETRACTION`, `PLATFORM_CONFIRMATION`,
`TRUST_LINK`.

### 6.1 The container

```
OP_RETURN  <push tag>  <push payload>
  0x6a     len data    len data
```

Parse it as:

1. Skip the leading `0x6a`.
2. Repeatedly read a **one-byte length opcode**, then that many bytes, until the
   script is exhausted.
3. Require **at least two** pushes: the tag and a payload.
4. Decode the first push as **UTF-8** and compare it to the tag with **exact
   byte equality** — not prefix, not case-insensitive.

**Reject the whole `OP_RETURN`** (produce no fact) if:

- any push uses `OP_0` (`0x00`);
- any push uses a multi-byte form: `PUSHDATA1` (`0x4c`), `PUSHDATA2` (`0x4d`),
  `PUSHDATA4` (`0x4e`);
- any push declares a length of `0` or greater than `75`.

Chunk boundaries are significant. Validate the **count** and the **length** of
each chunk before concatenating anything.

### 6.2 The payloads

| Tag | Pushes | Payload | Meaning |
|---|---|---|---|
| `REPID_RATING1` | exactly 2 | exactly **1 byte** | the score |
| `REPID_RATING2` | exactly 3 | exactly **1 byte**, then exactly **32 bytes** | the score, then the `commentHash` (hash of the app-side comment; kept raw here) |
| `REPID_PLATFORM1` | exactly 2 | exactly **32 bytes** | txid of the validated Receipt |
| `REPID_TRUST1` | exactly 2 | exactly **20 bytes** | pkh of the trusted party |
| `REPID_RETRACT1` | exactly 2 | exactly **32 bytes** | txid of the Receipt whose rating is retracted |

A payload of the wrong length, or the wrong chunk count under that tag, produces
**no fact at all** — it is a malformed container, not an invalid fact (§10).
`REPID_RATING2` with two chunks is *not* silently read as `REPID_RATING1`: the
tag names the schema, and a wrong shape is rejected, never guessed at.

### 6.3 `RATING_ISSUED` — where the participants come from

**The payload does not contain the addresses.** `REPID_RATING1` is one byte (the
score); `REPID_RATING2` is that byte plus a 32-byte `commentHash`.

Resolve the parties from your Rating Rights map:

1. For each **input** of the transaction, form its outpoint `txid:vout`.
2. If that outpoint is a tracked Rating Right, then
   `raterPkh = ownerPkh` and `rateePkh = ratesPkh`.
3. Remove that outpoint from the map — the spend burned the right, and it can
   never produce a second rating.
4. If **no** input matches a tracked right, produce **no fact**. A rating
   `OP_RETURN` with no matching right is not a fact.

The minted Rating Right's outpoint txid is the Receipt's txid, so
`receiptTxid = <spent outpoint txid>` rides along with the fact — that is what a
later `REPID_RETRACT1` is corroborated against.

Validity: `valid = (1 ≤ score ≤ 5)`. A score outside the range is **still a
fact**, reported with `valid: false`. Never drop it, never clamp it.

### 6.4 `PLATFORM_CONFIRMATION`

`valid = true` only if the 32-byte `receiptTxid` is already in your Receipts
map; otherwise `valid: false`. The declarant is the platform (§7).

### 6.5 `TRUST_LINK`

`valid = (trustedPkh ≠ trusterPkh)`. **Self-trust is a fact, not an error**:
report it with `valid: false`.

### 6.6 `RATING_RETRACTION` — the rater takes a rating back

A rater retracts a rating by spending one of their own P2PKH coins with a
`REPID_RETRACT1` `OP_RETURN` naming the Receipt whose rating is taken back. It
does **not** spend a Rating Right — the one that issued the rating was destroyed
when the rating was made.

The declarer `raterPkh` comes from the first input's unlocking bytecode (§7.1).
The reference is the 32-byte `receiptTxid`.

```
valid = hasRating(raterPkh, receiptTxid) && !isAlreadyRetracted(raterPkh, receiptTxid)
```

- An **unknown** reference is reported with `valid: false` — a claim, not
  evidence of an earlier fact.
- A spender who never signed that rating is `valid: false`.
- **Only the first valid retraction** is recorded in your Retracted ratings map;
  every later `REPID_RETRACT1` for the same rating is `valid: false`. The
  original `RATING_ISSUED` stays in the ratings index, untouched — retraction
  is a new fact, not a mutation of history.

Never drop a retraction: reporting `valid: false` preserves the record of an
attempt (§10).

---

## 7. Recognition rules, family B: the structural facts

These carry no `OP_RETURN`. They are recognized from the **output structure**.

### 7.1 Who is the declarant? (for family A)

For `PLATFORM_CONFIRMATION`, `TRUST_LINK` and `RATING_RETRACTION` the declarant's
`pkh` is **not** in the payload. Derive it from the **first input's unlocking
bytecode**:

1. Require the script to be at least 35 bytes long.
2. Require the byte `0x21` at position *length − 34* (the compressed-public-key
   push marker).
3. Take the last 33 bytes as the compressed public key.
4. `pkh = hash160(publicKey)`.

Read the key **from the tail**, so a signature push before it is tolerated. If
the shape does not match, produce **no fact** — the declarer cannot be
attributed.

> This is a **shape match, not a signature check**. It reads a public key out of
> the scriptSig and hashes it; it does not verify the signature is valid for that
> key. That is correct for an indexer (the network already enforced the
> spend), but it means this derivation must never be reused as an
> authentication primitive.

### 7.2 `IDENTITY_GENESIS`

Output 0 must carry an NFT with `capability = none` and `token.amount = 0`.

**Legacy form — 1 output:** the NFT is locked to a plain P2PKH. That
locking script **is** the `ownerPkh`.

**Vault form — 2 outputs:**
- output 0: the NFT under a covenant, with a `commitment` of exactly 20 bytes;
  that commitment **is** the `ownerPkh`.
- output 1: a **tokenless** P2PKH change, and it must return to **the same
  `ownerPkh`**. A change output carrying a token is not a change.
- `collateral` = the satoshi value of output 0. `identityOutpoint` = `<txid>:0`.

Any other output count → no fact.

> Note on the reference implementation: all identities share **one** covenant
> script, so a `listunspent` against that single script hash does reveal *live*
> identity vaults. Treat this as a bootstrap optimization only — it is an
> implementation detail, it cannot see burns or top-ups, and the protocol does
> not require it. The reliable method remains §3.

### 7.3 `IDENTITY_COLLATERAL_TOP_UP` and `IDENTITY_BURNED`

Both begin the same way: **one of this transaction's inputs is a tracked vault
outpoint**. If no input matches, this transaction is not an identity spend.

Then look at whether the tracked **category reappears in any output**:

- **It does not reappear** → the identity was burned.
  `IDENTITY_BURNED`. Remove the outpoint from your map. `valid: true`.
- **It does reappear** → a top-up. Require output 0 to carry the **same**
  category, `token.amount = 0`, and a `commitment` equal to the tracked
  `ownerPkh`. `collateral` = output 0's satoshi value.
  `valid = (same NFT) && (collateral ≥ previousCollateral)` — collateral may
  never decrease.
  If valid, move the tracking to `<new txid>:0` with the new collateral.
  If **not** valid, report the fact with `valid: false` and **do not** advance
  the tracking to the invalid state.

### 7.4 `RECEIPT_GENESIS`

**Three or four** outputs. If four, output 3 must be a **tokenless** P2PKH
change; a fourth output *carrying a token* is not a change → no fact.

Outputs 0, 1 and 2 must each carry an NFT with `capability = none` and
`token.amount = 0`, all three sharing **one identical category**.

The commitments form the load-bearing structure:

| Output | Role | Commitment | Locked to |
|---|---|---|---|
| 0 | Receipt | **empty**, or an interaction context (see below) | `partyA`'s P2PKH |
| 1 | Rating Right | `partyB`'s pkh | `partyA`'s P2PKH |
| 2 | Rating Right | `partyA`'s pkh | `partyB`'s P2PKH |

This **cross** pairing is what makes the ratings honest: neither party can mint a
right that lets them rate themselves. If the commitments are not the cross pair,
produce no fact.

The Receipt's commitment is what carries the **interaction context** (a
machine-readable hint an app put on-chain; the bytes are the app's, the indexer
keeps them raw). Decode it from output 0's NFT commitment:

| Commitment | Decoded as `receiptContext` |
|---|---|
| empty | no context field |
| `0x10` + 1 category byte + 1 `roleA` byte + 1 `roleB` byte (4 bytes) | `{interactionCategory, roleA, roleB}`, bytes kept raw |
| `0x11` + 1 category byte + 1 `roleA` byte + 1 `roleB` byte + 32 `contextHash` bytes (36 bytes) | the above plus `contextHash` |
| any other length, or another first byte | **no fact** — a foreign payload is not a variant |

Then write to your maps: Rating Rights `<txid>:1` and `<txid>:2`, and the
Receipt `<txid>` with `{receiptOwnerPkh, partyBPkh, receiptContext?}`.

---

## 8. The five traps

These are the reasons a correct-looking implementation finds nothing.

**1. Byte order is not uniform.**
Inside a CashScript covenant, `tokenCategory` is exposed in **internal
(inverted display) order**. A transaction decoder that returns
`outpointTransactionHash` and `token.category` gives them in **display order
already** — do **not** invert them. This is the single most common cause of
"nothing matches": every category comparison fails and every fact looks unknown.
State, for each comparison, which order you are in.

**2. Multi-byte pushes.** Emitting `PUSHDATA1` for a 32-byte payload, or
relying on `OP_0` for empty data, makes the `OP_RETURN` unparseable per §6.1.

**3. The declarant is in the scriptSig, not in the payload.** §7.1.

**4. A change output must be tokenless.** In the identity vault form and the
receipt genesis, a change output carrying a token of the operation's category
invalidates the whole recognition.

**5. The cross-commitments.** A receipt whose two Rating Rights commit to
themselves, or in the same order, is **not** a valid receipt genesis.

**6. A vault's version is recorded at genesis, not guessed at spend.** A `0.4.0`
identity vault spends against the covenant body of the version recorded when the
identity was recognized — never by trying each body until one matches. An
identity recognized under its pre-`0.4.0` body, spent revealing the `0.4.0`
body, is bound to *no* declared body: report no fact (§12 binding).

---

## 9. The recognition algorithm

### 9.1 First match wins

For each transaction, run these in this **fixed order** and emit the first fact
produced. If none matches, emit **no fact** — not an error, not a partial
result.

| # | Recognizer | Emits |
|---|---|---|
| 1 | identity spend | `IDENTITY_COLLATERAL_TOP_UP` / `IDENTITY_BURNED` |
| 2 | identity genesis | `IDENTITY_GENESIS` |
| 3 | receipt genesis | `RECEIPT_GENESIS` |
| 4 | issued rating (`REPID_RATING1` and `REPID_RATING2`) | `RATING_ISSUED` |
| 5 | platform confirmation | `PLATFORM_CONFIRMATION` |
| 6 | rating retraction | `RATING_RETRACTION` |
| 7 | trust link | `TRUST_LINK` |

### 9.2 Why the spend comes first

A top-up re-emits the same NFT toward the same covenant and therefore has
**the same shape as a genesis**. The only thing that distinguishes "someone
re-funded an existing identity" from "a new identity was minted" is whether that
outpoint was already tracked. So the spend must be tested first; if you test the
genesis first, every top-up is misreported as a new identity.

### 9.3 Compute the txid yourself

Derive the txid from the raw hex you were given — do not trust a txid supplied
alongside it. Outpoints are built from that txid, and every later lookup depends
on it being right.

### 9.4 Determinism

The same raw hex, against the same index state, must always produce the same
result. Two scans of the same chain must agree exactly.

---

## 10. Malformed is not the same as invalid

This distinction is the difference between a useful index and a lying one.

| Situation | Result |
|---|---|
| No known shape matches | **no fact** (`null`) |
| Wrong chunk count, wrong payload length, unparseable push | **no fact** |
| Well-formed, but score outside 1–5 | fact with `valid: false` |
| Well-formed, but referenced Receipt unknown | fact with `valid: false` |
| Well-formed, but self-trust | fact with `valid: false` |
| Well-formed, but collateral decreased | fact with `valid: false` |
| Well-formed retraction, but unknown or repeated reference / wrong signer | fact with `valid: false` |

Never silently drop an invalid fact. Dropping it erases evidence that somebody
attempted something; reporting it with `valid: false` preserves the record while
withholding it from any interpretation.

---

## 11. What your indexer must not do

- **Do not re-verify signatures.** The network already did. Your job is reading
  shapes. (And the shape check in §7.1 is not a signature check — do not
  advertise it as one.)
- **Do not compute a score, a rank, a trust level or a reputation number.**
  That is the interpretation layer, it is somebody else's, and two indexers are
  expected to disagree. Emit facts; let others interpret.
- **Do not skip non-RepID transactions silently.** Process them, emit nothing.
  They are the control group that proves you are not inventing facts.
- **Do not leave gaps in the block walk.** A gap is permanent loss of facts that
  cannot be repaired afterwards.
- **Do not treat a fact's absence as a fact.** "No rating found" means the
  history was not fully scanned, or your state was lost.

---

## 12. Self-verification before you report done

Do not claim completeness until all of these hold.

1. **Scan continuity.** Your block walk has no gaps between the start height and
   the tip. Prove it: the number of blocks walked equals `tip − start + 1`.
2. **Every txid exists.** For each reported fact, confirm its txid is retrievable
   from the network. A fact you cannot locate on-chain is a bug, not a fact.
3. **State invariants hold.**
   - no Rating Right outpoint is spent twice;
   - no identity outpoint is both tracked and burned;
   - every tracked identity's collateral never decreased.
4. **Negative control.** Non-RepID transactions in the scanned range produced
   `null` — a nonzero number of them should be there. Zero `null`s over a large
   range means you are matching too loosely.
5. **Cross-check one fact by hand.** Pick one `RATING_ISSUED`, read its
   `OP_RETURN` bytes, and confirm the tag, the payload (`1` byte for a
   `REPID_RATING1`, `1 + 32` for a `REPID_RATING2`), and that the spent outpoint
   matches a Rating Right from a receipt genesis you indexed earlier.
6. **Report the gaps honestly.** If you could only start at block N, say so
   explicitly and state which fact types are therefore unreliable.

---

## 13. Normative references

| Document | Contents |
|---|---|
| `SPEC-008` (RepID Protocol) | the normative core: principles, the event schemas and their fields, on-chain invariants, validity semantics, security limits, conformance |
| `SPEC-009` (Wire Format and Recognition) | the byte-level contract this document summarizes: `OP_RETURN` encoding, per-tag payloads, declarer derivation, recognizer precedence, state transitions |
| `repid-protocol` / `protocol/` | the machine-readable constants: the five tags, the score range, the eight fact-type names, and the fact JSON Schema |
| `repid-sdk` | the reference decoder, published as `@repid/sdk` |

`SPEC-008` and `SPEC-009` are normative; this guide is a convenience summary. If
you find a discrepancy between this guide and those two, **the specs win** —
and the discrepancy is worth reporting.

---

## 14. Acceptance test — a known-good dataset

Use this to check your implementation before trusting it on anything else. These
are real Chipnet transactions, and the expected output is exact.

**Expected: 5 facts, plus 3 transactions that must yield nothing.**

| # | Fact | txid | Key values |
|---|---|---|---|
| 1 | `IDENTITY_GENESIS` | `a3887c5ea75e3a20f4487aeffd0c60d102552368a9afc3800ebf118a1b33191e` | `ownerPkh` `6234d40262ddb07271d34f99ad025c18c56b9238` |
| 2 | `IDENTITY_GENESIS` | `f07232cd4f23c72750475d598771254957354af9c522d358e64ce464903337f0` | `ownerPkh` `18fc5969f82f2429a5366656215de1aa7538af15` |
| 3 | `RECEIPT_GENESIS` | `6bb06faf9f9588913512c30c21efdcf3569e17519630b4d823890f93bb61b11c` | holder `6234d402…`; rights at `:1` and `:2`, cross-committed |
| 4 | `RATING_ISSUED` | `ef58b17b77ebbe783654d9293cadee65753603fe6685e67dd3fb06db0a63eabb` | `18fc5969…` → `6234d402…`, score **2**, `valid: true` |
| 5 | `RATING_ISSUED` | `404533cc01ffa2394d0317c1fabf1726f2e0831d1e17c61456f17f36cade014c` | `6234d402…` → `18fc5969…`, score **3**, `valid: true` |

Must produce **no fact** — these are plain funding transfers with no RepID
structure:

```
012cd29c363f2058d60a00f94ba6a0df51fda0c5f6a78b32c3cf87dcee64b07c
c339f7fedcd266df0f0094f6b3aeedd545e8f60dae58969be1816182883de854
5f4c7226b4aa9d9e9dcbf9518e9bbed00e4e44306c2052ce2bd7fa25560b36b0
```

**How to grade your run:**

- All 5 facts found with the right types, txids, participants and scores → pass.
- Fact 4 and 5 missing → your walk never covered those blocks, **or** you
  resolved Rating Rights without persisting state between restarts. This is the
  single most common failure; §3 and §5 are the fix.
- The 3 funding transactions reported as facts → your matching is too loose.
  Re-check §6.2 payload lengths and §7.4 cross-commitments.
- Facts found but with byte-reversed categories → §8, trap 1.
