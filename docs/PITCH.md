# RepID — One-page pitch

## The problem

Reputation today lives in the hands of centralized platforms: an app decides your score, can delete it, and you can't take your history anywhere. Existing decentralized alternatives suffer two classic flaws: **fake identities** (anyone can spawn infinite accounts to inflate their score) and **cold start** (nobody has history when they start).

## The idea

RepID is a **reputation protocol on Bitcoin Cash** that uses *CashTokens* (native NFTs) to anchor **immutable facts** on-chain, and leaves **all interpretation off-chain**:

- **Identity** — a single-use NFT per person. Faking it requires burning your own account.
- **Interaction + receipt** — two people jointly record an interaction (both signatures): a *receipt* and two *Rating Rights* are born.
- **Rating 1–5** — each party rates the other *once per interaction*; the right burns when used. Guaranteed by the protocol, no intermediaries.
- **Platform confirmation** — an app can corroborate on-chain that an interaction happened, without needing an identity of its own.
- **Trust Link** — unilateral person → person trust declaration, to attack cold start.

The result: a **portable reputation, auditable down to the transaction that produced it, and sybil-resistant** — because the identity and single-vote proofs are on-chain and can't be invented.

## Why Bitcoin Cash

- **CashTokens**: NFTs with script-verifiable restrictions (the *covenant*), bidirectionally compatible with the existing BCH, no second-layer smart contracts.
- **Penny fees**: suitable for every rating to be a transaction without prohibitive costs.
- "**Layers**" philosophy: the chain as the facts layer; each app builds its own interpretation layer. RepID doesn't dictate to anyone how to weight.

## Current status

- Protocol formalized in **6 specs** (RFC-001 to RFC-006) and **93 tests, 0 failures** (7 files; 55 run unconditionally, 38 tBCH-gated).
- **Complete functional prototype**: CashScript covenants + indexer + live web console (one-click demo).
- **Runs on the real Chipnet test network** (tBCH), with every network operation isolated in a child process for safety.
- Validated against the **real Bitcoin VM**: E2E run on Chipnet (2026-09-10, 11/11 PASS) plus a second E2E for the identity collateral vault (TASK-037) — the 7 facts of the full flow were broadcast and verified on-chain.

## What we're looking for

1. **Technical collaborators** — to harden the prototype, write the example app on top of the protocol and get the production implementation ready.
2. **Early funding** — to continue development with a weeks-long horizon (individual development today).

## How to see it

```bash
npm install && npm start    # opens http://localhost:3787
```

One click on **"Play demo"** generates the whole flow: 3 people, identity, interactions, ratings, confirmation and trust. Full guide in `docs/TESTING.md`.

---

*Project details and specs: `README.md`, `specs/`, `AGENTS.md`.*