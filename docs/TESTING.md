# TESTING GUIDE — RepID Prototype (for people without programming knowledge)

This guide lets you test **every feature of the prototype by hand**, step by step, and know whether each one worked or not. You don't need to read code or type commands beyond the ones shown here.

> What is RepID? An experiment in decentralized reputation on Bitcoin Cash. Each person has a digital **identity**, records **interactions** with others, **rates** them from 1 to 5, **platforms** can confirm those interactions happened, and people can **declare trust** in each other. Everything is recorded as immutable *facts* on a chain (in this prototype, the chain is simulated).

---

## 1) What you need

- **Node.js already installed** on your computer (you should have it; otherwise download it from `nodejs.org`).
- The RepID project already downloaded in this folder.

## 2) How to start the prototype

1. Open a **terminal** (PowerShell on Windows).
2. Enter the project folder:
   ```
   cd "RepID 1.2"
   ```
3. Start the server:
   ```
   npm start
   ```
4. Wait until you see this message:
   ```
   Open the interface in your browser:
     http://localhost:3787
   ```
5. Open that address in your browser (Chrome, Edge, etc.). That's your test screen!

To **close** the prototype: go back to the terminal and press `Ctrl + C`.

---

## 3) The screen, at a glance

- **Wallets** (first view) in **3 columns**: on the first, **Create Wallet** and below it **Import Wallet**; **Transfer sats** between wallets; and **Manage Wallets** double-width (aligned Wallet / Alias / Balance table, a **star ★** marks the primary, **Sweep all to primary**) plus setting an **alias** on each wallet (Tests 1, 18, 18b and 19).
- **Console**: the whole protocol in a single guided column. At the top, a bar with **"Play demo"** (the living system in 1 click) and **"Reset demo"**. Then, the step-by-step flow 01–05: Mint identity, Record interaction, Issue rating, Confirm interaction and Declare trust (each step with its buttons and forms).
- **Console right column**: three tabs. **"Ledger"** shows the list of recorded *facts* (newest to oldest — every successful action adds a line here). **"Indexer view"** shows the technical side (raw transactions with hex and internal state, Tests 12 to 14). **"Reputation"** shows a person's aggregated history (averages and audits, Test 16).
- **Top navigation**: five switchable views: **Wallets**, **Console**, **Example app** (mini delivery platform on top of the raw API, Test 17), **Indexer** (interpretation layer lab: build your criterion, save it with a name and query each identity's profile, Test 16b) and **Identities** (the covenant "account": mint with collateral, active, burned, top-up and burn, "Validated by:" note with its endorsers and filter by validator, Tests 2–2d).
- **Green/red notice** (bottom center): confirms whether the action worked (green) or what went wrong (red).

Handy tip: every time you do an action, check that the corresponding line appears in the Ledger **and** a green notice appears.

---

## 4) Step-by-step tests

Recommended order: do them in sequence. You choose the wallets with the dropdown menus.

### Test 1 — Create wallets
| Step | What you do | Expected result |
|---|---|---|
| 1 | In the **Wallets** view, click **"Create wallet"** (3 times) | Green notice *"Wallet created."* and 3 new addresses in the **Manage Wallets** table |

> A *wallet* is a person's digital "pocket". Every time you create one, a long address appears (its technical ID). That's not real money.

### Test 2 — Mint identity (with collateral)
| Step | What you do | Expected result |
|---|---|---|
| 1 | Pick the first wallet in *Mint identity* → **Wallet** | — |
| 2 | In *Collateral (sats)* keep the suggested value (1000) | — |
| 3 | Click **"Mint identity"** | Green notice *"Identity minted with locked collateral."* and in the Ledger a **Identity minted** line showing the collateral |

> *Minting an identity* = creating your immutable digital identity. It can only be done **once per wallet**. The **collateral** sats remain **locked** with the identity: while the identity exists, that BCH cannot be spent (and the covenant **never allows lowering it** on-chain — only increasing it, see Test 2b).

### Test 2b — Increase the collateral
| Step | What you do | Expected result |
|---|---|---|
| 1 | In *Increase collateral (sats)* enter a value (e.g. 500) | — |
| 2 | Click **"Increase collateral"** | Green notice *"Collateral increased…"* and in the Ledger a **Collateral increased** line like `collateral 1000 → 1500 sats` |

> The covenant re-locks **more** BCH with the same identity. Trying to lower it is impossible by design (the network rejects it), not by a UI rule.

### Test 2c — Delete the identity
| Step | What you do | Expected result |
|---|---|---|
| 1 | Click **"Delete identity"** and accept the confirmation prompt | Green notice *"Identity deleted: NFT burned and collateral returned."* and in the Ledger a **Identity deleted** line |
| 2 | Repeat Test 2 with the same wallet | The wallet can mint a **new identity** (the previous collateral returned to its balance) |

> Deleting the identity = the NFT is **burned** (it disappears from the chain) and the collateral **returns to the wallet**. It's the only way to "exit" the protocol with your BCH intact.

### Test 2d — The "Identities" tab (IdentityVault interpretation layer)
| Step | What you do | Expected result |
|---|---|---|
| 1 | In the top navigation go to **"Identities"** | Page with three panels: *Mint identity*, *Active identities* and *Burned identities* |
| 2 | In *Mint identity* pick a wallet without identity, set a collateral (e.g. 1500) and click **"Mint identity"** | Green notice and the wallet appears in **Active identities** with **ACTIVE** badge, its category, the collateral and the genesis tx |
| 3 | In the **Console** → *Declare trust*: *Who trusts* = a wallet **without identity**, *In whom* = the wallet **with identity**, and click **"Declare trust"** | Green notice. Back in **Identities**: the active card shows **"Validated by:"** with the label of whoever declared trust |
| 4 | Above *Active identities*, in **"Filter by validator"** paste the pkh (or the address) of the one who trusted | The list is trimmed to that identity and the counter "Showing 1 of N…" appears; with another address the list stays empty with its message |
| 5 | Clear the filter text | All active identities return |
| 6 | In the active card type an increase (e.g. 500) and click **"Increase"** | Green notice; the card's collateral rises (1500 → 2000) without changing the NFT |
| 7 | Click **"Burn"** and accept the confirmation | Green notice; the wallet leaves **active** and appears in **Burned identities** with **BURNED** badge and the **returned collateral** |
| 8 | Repeat from an already-used wallet | The wallet can mint a new identity again (same as Test 2) |

> This page is the covenant's **interpretation layer**: everything is rebuilt from the Ledger (genesis, top-ups and burn). The returned collateral of a burned identity is derived from the last fact of that category, because the `IDENTITY_BURNED` fact doesn't store the amount. It doesn't show reputation or CI. The **"Validated by:"** note is local interpretation (the endorsers: valid `TRUST_LINK`s the identity received) and the validator filter trims only the active ones, without touching the facts.
>
> ⚠️ In the **simulated network (mock)** this history only lives in the current session: when you close/restart the server or use **"Reset demo"**, burns from previous sessions disappear from the list (in Chipnet mode they are kept in `data/repid-state.json`). To see the burned case, better complete Test 2c and check the page in the same session.

### Test 3 — Record an interaction (the heart of the protocol)
| Step | What you do | Expected result |
|---|---|---|
| 1 | In *Record interaction*: Party A = wallet 1, Role of A = `passenger` | — |
| 2 | Party B = wallet 2, Role of B = `driver` | — |
| 3 | Click **"Record interaction"** | Green notice *"Interaction recorded."* and **Interaction recorded** line in the Ledger |

> This records that the two parties carried out an interaction together (e.g. a ride). It's the basis for rating.

### Test 4 — Controlled error: empty role
| Step | What you do | Expected result |
|---|---|---|
| 1 | Party A = wallet 1, **leave Role of A empty** | — |
| 2 | Party B = wallet 2, Role of B = `driver` | — |
| 3 | Click **"Record interaction"** | **Red** notice explaining that each party must have a role. Nothing is added to the Ledger |

> This error is **deliberate**: the protocol requires each party to explicitly declare which role it played.

### Test 5 — Issue a rating
| Step | What you do | Expected result |
|---|---|---|
| 1 | In *Issue rating*: pick wallet 1's Rating Right (it appears as `w1 → w2`) | — |
| 2 | Move the score slider to the value you want (e.g. 5) | — |
| 3 | Click **"Issue rating"** | Green notice *"Rating issued."* and **Rating issued** line with your score |

> Each person can only rate the other **once** per interaction (the protocol guarantees it by design).

### Test 6 — The same Rating Right no longer exists
| Step | What you do | Expected result |
|---|---|---|
| 1 | Look again at *Issue rating* → *Rating Right* | The one you used no longer appears. Only the unspent ones remain |

### Test 7 — The platform confirms the interaction
| Step | What you do | Expected result |
|---|---|---|
| 1 | In *Confirm interaction*: Platform = **wallet 3** (even though it has no identity) | — |
| 2 | Interaction to confirm = the one you recorded earlier | — |
| 3 | Click **"Confirm interaction"** | Green notice *"Interaction confirmed by the platform."* and **Interaction confirmed** line |

> Any entity (a ride app, for example) can corroborate that the interaction happened, **without needing its own identity**.

### Test 8 — Declare trust (person → person)
| Step | What you do | Expected result |
|---|---|---|
| 1 | In *Declare trust*: Who trusts = wallet 1 | — |
| 2 | In whom = wallet 2 | — |
| 3 | Click **"Declare trust"** | Green notice *"Trust declared."* and **Trust declared** line |

> It's a **unilateral** declaration: wallet 1 says "I trust 2", and 2 doesn't have to sign anything.

### Test 9 — Self-trust → INVALID (deliberate error)
| Step | What you do | Expected result |
|---|---|---|
| 1 | Who trusts = wallet 1, **In whom = the same wallet 1** | Red notice *"Pick different wallets…"* (the UI doesn't allow it) |

> And if you tried it against the protocol directly, the Ledger would mark it **INVALID**: nobody can declare trust in themselves.

### Test 10 — See the full Ledger
| Step | What you do | Expected result |
|---|---|---|
| 1 | Look at the right column | The 7 fact types should be visible: **Identity minted → Collateral increased → Identity deleted → Interaction recorded → Rating issued → Interaction confirmed → Trust declared** |

### Test 11 — Start over
| Step | What you do | Expected result |
|---|---|---|
| 1 | Click **"Reset demo"** | Green notice *"Demo reset…"*, empty wallet list and empty Ledger. You can repeat all the tests |

> Now we show you what is **not seen** from the normal view: the indexer side (the node that reads the chain).

### Test 12 — The indexer view: see the raw transactions (hex)
| Step | What you do | Expected result |
|---|---|---|
| 1 | Do some actions if the Ledger is empty (wallets, identity, interaction…) | — |
| 2 | At the top of the right panel, click the **"Indexer view"** tab | In *Node feed* the transactions appear, each with a green **"Recognized"** label, the fact name, its identifier (txid) and its size in bytes |
| 3 | Click any feed row | The **raw hex** of the transaction unfolds — exactly what travels through the Bitcoin network |
| 4 | Scroll to *Indexer internal state* | You see the **Rating Rights under tracking**, the **Receipts in the index** and the **Identities under tracking (IdentityVault covenant)** with their collateral: the internal trace the indexer uses (RFC-006) to re-identify spends, validate confirmations and tell a collateral top-up from a new identity |

> In the normal view you see the *interpretation* (the fact). In this view you see the *data* the indexer processed to reach that interpretation.

### Test 13 — An unknown transaction → the indexer discards it
| Step | What you do | Expected result |
|---|---|---|
| 1 | While in the **"Indexer view"** tab, click **"Send unknown transaction"** | Green notice *"Unknown transaction sent and discarded…"* |
| 2 | Look at the *Node feed* (top) | The most recent transaction carries a red **"Discarded"** label and says "not RepID" |
| 3 | Switch to the **"Ledger"** tab | The Ledger **didn't** change: that transaction produced no facts |

> This is the most important principle of the protocol: **the chain keeps everything, but the indexer only interprets the RepID shapes**. Everything else passes through the network and is ignored.

### Test 14 — Full restart (now with the indexer view)
| Step | What you do | Expected result |
|---|---|---|
| 1 | Click **"Reset demo"** | Green notice |
| 2 | "Indexer view" tab | *Node feed* says "No transaction has arrived yet"; Rating Rights: None; Receipts: None. All interpretation trace is clean too |

### Test 15 — Play the automatic demo (the system lives on its own)
| Step | What you do | Expected result |
|---|---|---|
| 1 | Click **"Play demo"** (Console top bar) | Green notice with the summary (e.g. *"Demo ready: 7 facts (3 wallets, 2 ratings)"*) |
| 2 | Look at the Ledger | Appeared: 1 identity, **2** interactions, **2** ratings, 1 confirmation and 1 trust — all in 1 click |
| 3 | "Indexer view" tab | The node feed filled up with the hex of all those transactions |
| 4 | "Reputation" tab, pick a wallet and "View profile" | The chosen wallet shows its history (average, who rated it, who trusts it) |

> It's the same operation you'd do by hand, executed on its own by the server. It introduces no new protocol shape: it reuses exactly the same transactions.

### Test 16 — Read the reputation profile and audit each number
| Step | What you do | Expected result |
|---|---|---|
| 1 | **"Reputation"** tab → pick a wallet → **"View profile"** | You see: received average, 1–5 score distribution with bars, received trust and confirmed receipts |
| 2 | Look at "Identity" | "yes" with its txid and the **collateral in sats** if the wallet minted an identity, or "no" if it's just a wallet |
| 3 | Scroll to *Ratings received (auditable)* | Each score lists **who** it comes from and the **txid** of the transaction that produced it |
| 4 | Note a txid and look for it in the "Ledger" or "Indexer view" tab | You find exactly the transaction that backs that number |

> This is the heart of RepID: reputation is **interpretation on the chain, never inside the chain**. Every average can be broken down to the transaction that generated it. The system doesn't weight or judge: it only sums verifiable facts.

### Test 16b — "Indexer" page: reputation (invariant) and your own Confidence Index
| Step | What you do | Expected result |
|---|---|---|
| 1 | Top navigation → **"Indexer"** | Three columns: **CRITERIA** (CI signals), **CONFIGURATION** (weights + saving) and **PROFILE** (query). There are no predefined formulas: you choose which on-chain signals weight the CI |
| 2 | In CRITERIA there are 5 signals with their checkbox: **Collateral**, **Tenure**, **Validated interactions**, **Endorsements** and **Ratings** | Each one describes the on-chain data it uses and the threshold that gives signal 1.0 (1000 sats, 90 days, 3 confirmed, 2 endorsements, 5 ratings) |
| 3 | Uncheck/enable a signal in CRITERIA | In CONFIGURATION the **weight** slider (0–1) builds only for the enabled signals; with none enabled, the CI stays undefined |
| 4 | Enable **"Anti-sybil"** | Discards from the CI the ratings of wallets without Identity (the stars don't change) |
| 5 | In CONFIGURATION move the weights and write a name (e.g. `safe delivery`), click **"Save configuration"** | Green notice; the configuration appears in the list with its name |
| 6 | In PROFILE pick an identity and your saved configuration, click **"View reputation and CI"** | Two separate numbers: **Reputation** (star average, up to its `reputationCount`) and **Confidence Index** (0–1) with a bar. Below: each signal with its raw data, value and contribution; and auditable **evidence** with the **txid** of every fact that feeds the number |
| 7 | Change weights/signals in CRITERIA or try another configuration and reinterpret | The CI changes with the criterion; the **reputation (stars) and the on-chain facts are always the same** |
| 8 | In the configurations list, **"Load"** on the one you saved | Loads your signals/weights into CRITERIA/CONFIGURATION to reinterpret |
| 9 | In the list, **delete** the saved one | It disappears from the list; the **"Sample"** preset (read-only, included by default) can't be deleted or overwritten |

> The indexer is the one that *judges*: you choose its criterion. That's why "Sample" is just a read-only starting point and the **raw reputation (stars) doesn't depend on the criterion** — it's always the simple average, and the CI is a separate datum.

### Test 17 — The example app (delivery) = RepID as a layer for a real app

This tab shows an imaginary delivery app (client ⇄ rider) **using the raw RepID API**: every button triggers the same protocol flow, but presented the way an app would experience it, with the signing ceremony of a real service: the client **requests** (their signature is captured), the rider receives a **ride-available notification** and only upon **accepting** it is the Receipt anchored on-chain.

| Step | What you do | Expected result |
|---|---|---|
| 1 | **"Example app"** tab → pick **client** and **rider** (different wallets) and a **route** → **"Request service (client signature)"** | Green notice *"Request for “…” sent to the rider"*. NOTHING is anchored on-chain yet: the history shows `client signature ✓ · waiting for the rider` and in the rider column the **"New ride available"** notification appears with a "client signature ✓" badge, alert pulse (push-like) and **Accept ride / Ignore** buttons |
| 2 | In the rider column → **"Accept ride"** | The notification disappears and only now does the on-chain anchor happen: the **Ledger** adds `Interaction recorded`, the history shows the receipt with `client signature ✓ · rider signature ✓` and the **Raw** panel recorded the `POST /api/interactions`. The client's signature was the one captured when requesting; the rider's, the one that activated the Receipt |
| 3 | Pick a **platform** wallet (can be the same as the client) → **"Confirm the last ride"** | The ride goes to `confirmed ✓`, the Ledger adds `Interaction confirmed` and the **Raw** panel showed the `POST /api/platform-confirmations` with the receipt txid |
| 4 | Move the **score** slider and click **"Rate the rider"** | The ride goes to `rated (5) ✓`, the Ledger adds `Rating issued` and in the "Indexer view" the client's Rating Right disappeared from tracking (it was spent) |
| 5 | **"View my reputation"** (rider column) | In its reputation card: 5.0 average and the audited rating (client txid) |
| 6 | Client → request again, rider → **"Ignore"** | The history shows the request as `rejected by the rider` and NO fact is created (no interaction without both parties' consent) |
| 7 | Repeat steps 1–4 with another route and rate with 2 | The rider's average drops to **3.5** (5+2 / 2) — reputation lives and changes with each real fact |

> Each acceptance is a different on-chain fact, auditable one by one in the Ledger and in the "Raw" panel; an unaccepted request leaves no facts (the chain only keeps interactions signed by both parties). Today these facts live in the simulated chain; in Chipnet mode (section 7) they're really broadcast.

### Test 18 — Import your base wallet (Wallets page)

Useful to **always test with the same wallet**: you paste your wallet's key and it reappears every time (in Chipnet it survives restarts).

| Step | What you do | Expected result |
|---|---|---|
| 1 | On the **Wallets** page → **"Import Wallet"** panel, paste a private key (one per line) and click **"Import"** | Green notice *"N wallet(s) imported"* and the wallet appears in the **Manage Wallets** table |
| 2 | In *Primary wallet* pick that wallet → **"Mark as primary"** | The wallet is marked with a **star ★ to the left of its pkh** in the table (sweep destination) |
| 3 | (optional) **WIF** keys from external wallets are also accepted; the prototype recognizes them on its own | — |

> *Private key*: the easiest to get is the one the prototype already saved in `data/wallet.json` (**64-character hex**, field `privateKeyHex`). In the simulated network the imported wallet is born with toy funds; in Chipnet you have to fund it with the faucet like any other.

### Test 18b — Name your wallets (local reference)

With several wallets it's easy to get lost among pkhs. On the **Wallets** page, the **Manage Wallets** panel lets you give each wallet an **alias**; that alias shows everywhere you used to see the shortened pkh: the selectors, the **Ledger**, the reputation listings and the example app.

| Step | What you do | Expected result |
|---|---|---|
| 1 | **Wallets** page → **Manage Wallets** panel → in a wallet's "alias…" field type `Demo client` → **"Save"** | The alias appears in emerald next to the pkh in the table, and every selector of the past panel shows `Demo client` instead of the cut pkh |
| 2 | Record an interaction between `Demo client` and another unnamed wallet | The **Ledger** writes `Demo client ⇄ d8b2…a1` (the named party with its alias, the other with its shortened pkh) |
| 3 | Close the field and use **"Balance"** on a wallet with alias | The notice says `Wallet Demo client: … sat` and the row keeps its alias |
| 4 | Leave the field empty and **"Save"** on a wallet with alias | The alias disappears; everything goes back to showing the shortened pkh |

> The alias is a **local demo reference, off-chain**: it's not a fact, never reaches the chain and doesn't affect any protocol validation. In Chipnet it's persisted with `repid-state.json` and reappears on restart; in the simulated network it lives in memory.

### Test 19 — Sweep the sats to the primary wallet

When you finish testing, you recover all the loose balance of the secondary wallets (and their collateral, if you ask for it).

| Step | What you do | Expected result |
|---|---|---|
| 1 | Make sure you have a **PRIMARY** wallet marked (Test 18, step 2) | — |
| 2 | On the **Wallets** page → "Manage Wallets", keep the **"Burn identities to release collateral"** checkbox marked (it's marked by default) | — |
| 3 | Click **"Sweep all to primary"** and accept the two confirmation prompts | Green notice *"Sweep ready: N wallet(s) · X sats repatriated"* |
| 4 | Click **"Balance"** on the primary | Its balance grew: it received the loose funds of all secondary wallets |
| 5 | Click **"Balance"** on a secondary | It has no useful balance left (< 1000 sats) and, if it had an identity, that identity was **deleted** (the Ledger adds `Identity deleted`) |

> The sweep uses **one transaction per wallet** (multi-input): it collects all your non-token UTXOs. With the checkbox enabled, it first burns each identity (the collateral returns to its wallet and falls in the same sweep). **Unspent Rating Rights** are not touched — if you also want to recover that dust, rate them first (Test 8) or spend them declaring trust/platform.

---

## 5) What do the Ledger entries mean?

- **Identity minted**: a digital identity was born (its collateral sats got locked in its covenant).
- **Collateral increased**: its owner locked more BCH with the same identity (lowering it is impossible by design).
- **Identity deleted**: the NFT was burned and the collateral returned to its wallet (the person can mint a new identity).
- **Interaction recorded**: two people did something together (with roles).
- **Rating issued**: a person scored the other (1 to 5).
- **Interaction confirmed**: a platform corroborated the interaction.
- **Trust declared**: a person declared they trust another.
- **Recognized / Discarded** (in the Indexer view): the indexer detected a RepID shape in the transaction (and interprets it) or decided it isn't (and ignores it).

If a line says **INVALID**, the transaction doesn't comply with the rules (e.g. self-trust); the system still shows it so as not to hide activity, but marks it invalid.

---

## 6) Important — honest prototype limitations

- The default chain is **simulated** (not real Bitcoin Cash): no real funds or effects on a public network. (In **section 7** there's the optional mode that does use the real Bitcoin Cash testnet.)
- The *facts* are kept in a local file; if you delete that folder, the history is lost.
- **Deleted identity = irreversible**: the identity is minted once and locked to its key. It can be **deleted** (the NFT is burned and the collateral returns to the wallet), but never transferred or edited. If you lose a wallet's key, that identity **can't be recovered** (protocol decision: immutability). In testing, it's a good idea to save/custody the keys that matter to you.
- The deepest security tests (400/404/409 errors, out-of-range score, etc.) are covered by the **automatic test**, which runs on its own with the command:
  ```
  npm run test:e2e
  ```
  (this one is technical; you don't need to run it to test the prototype by hand).

---

## 7) Test on the real network (Chipnet, valueless tBCH) — optional but spectacular

Up to here everything ran on a **simulated chain**. There's also a mode that uses the **real Bitcoin Cash testnet (Chipnet)**: the transactions the prototype makes travel through a public network, can be seen in a block explorer, and the real Bitcoin virtual machine validates the contracts. Since they're test tokens (tBCH), they have no value: it's a public "playground".

> **What you'll verify here is the key thing**: that the RepID contracts are accepted by **real Bitcoin** (not only by the simulator). If the simulator obeys but the real network doesn't, the prototype is useless.

### 7.1) The automatic way (recommended)

1. In the terminal:
   ```
   $env:REPID_NETWORK="chipnet"
   node scripts/chipnet-e2e.mjs
   ```
2. The first time it will say something like *"Chipnet E2E waiting for real tBCH"* and show you an **address** to fund.
3. Go to `https://tbch.googol.cash`, paste that address and complete the captcha (manual on purpose).
4. When the faucet confirms the tBCH drop, **run the same command again**.
5. It should run, on its own, the whole flow: create 3 people, mint identity, record 2 interactions, issue 2 ratings, confirm 1 interaction and declare 1 trust — counting each one as **PASS**.
6. At the end you look at the txids on screen. You can search any of them in a Chipnet block explorer (e.g. `https://chipnet.imaginary.cash/explorer`) to see the real transaction, with its hex and its tokens.

> Steps 1 and 2 stay "waiting" if there are no funds: it's not an error, the faucet drop is missing. When you receive it, the same address already has balance and the command yields.

> **There's also a repo option** (TASK-032): the manual **"chipnet-e2e"** workflow in GitHub Actions (`Actions → chipnet-e2e → Run workflow`) runs exactly this script in the cloud, leaves the address to fund in the logs and saves the wallets as an artifact to retry. It also serves as public, reproducible evidence that the contracts run on the real network.

#### 7.1b) Validate the identity collateral (the IdentityVault) against the real VM

With the same tBCH drop you can run the specific validation of the **IdentityVault covenant** with a single command:

```
$env:REPID_NETWORK="chipnet"
node scripts/chipnet-vault-e2e.mjs
```

It verifies on the real network (counting each one as **PASS**):
1. **Mints** an identity with **explicit collateral** (the sats get locked in the covenant).
2. **Increases the collateral** — this is what's most worth seeing: the real Bitcoin VM requires the new lock to be `>=` the previous one (on-chain tamper-proofness guaranteed by the contract, not by the UI).
3. **Deletes the identity** (burn): the NFT is burned and the collateral returns to the wallet.
4. **Mints again** with the same wallet (a burned identity can create a new one).

Like the previous script: without funds it shows the address to fund and stops with a clear message (exit code 2) — it's not an error, the drop is missing. Each tx is verified against the network (`rawtx`) and shows its mempool/confirmed status.

### 7.2) The manual way (through the UI, like section 4)

1. In the terminal:
   ```
   $env:REPID_NETWORK="chipnet"
   npm start
   ```
2. When you see the startup message, open `http://localhost:3787`. At the top the **"Real Chipnet network"** notice should appear.
3. Create a wallet **or import yours** (**Wallets** page → **"Import Wallet"** panel → paste your hex or WIF key → "Import"): that way you always test against the **same base wallet**, which also reappears on every restart. Mark it as **PRIMARY** (**"Manage Wallets"** panel). In your base wallet, click **"Balance"**: it shows the full address with 0 tBCH balance.
4. Fund it at the faucet above (same address) and click **"Balance"** again: now the balance is real, in sats. *(To test with more wallets, use the **"Transfer sats"** panel on the Wallets page: split tBCH from this funded wallet to the others — one drop is enough.)*
5. Repeat **Tests 2 to 10** of this document (including the new collateral ones 2b and 2c): now every Ledger *fact* was **broadcast to the real testnet**, and the covenant with its collateral is sealed on-chain.
6. In the "Indexer view" tab, each transaction shows a **status badge**: *in mempool* (just sent, waiting for a block) or *confirmed · block N* (already sealed on the chain). Reload the page from time to time to see how it goes from mempool to confirmed.
7. Take a Ledger txid and look for it in the Chipnet block explorer to see the real transaction.
8. **Verify the covenant in the explorer**: the *Identity minted* transaction shows an output directed to a `bchtest:z…` address (the covenant) carrying the NFT and the collateral value; the *Collateral increased* one re-locks it to that **same** address with **more** sats; the *Identity deleted* one returns the sats to your wallet and the category disappears.
9. **When you finish testing**, repatriate everything with the **"Sweep all to primary"** button in the **"Manage Wallets"** panel (**Wallets** page; with the "Burn identities…" checkbox enabled): your base wallet ends up with the tBCH back and the secondaries, without balance. Check it in the explorer: each secondary wallet did one or two final transactions (burn + sweep) and your sats travel to the same address as always.

> Brief technical note: the test wallets of this mode are kept in the `data/` folder (valueless tBCH keys). If you restart the server, they reappear with their balance — a prototype detail, not production.

### 7.3) About the faucet

- The `tbch.googol.cash` faucet delivers **tBCH** (toy, valueless), one drop at a time and with captcha.
- The address on the map is the one you see in **"Balance"** (it starts with `bchtest:`). Don't use a real Bitcoin Cash address (it would start with `bitcoincash:`).
- If you press reload too often, the faucet may complain; wait a few seconds.

---

## 8) Quick command reference

Recommended path to **test it in seconds**: click "Play demo" and then the "Reputation" tab -> a wallet -> "View profile".

> **The hosted demo is gone.** Earlier versions of this guide pointed at a
> Render deployment that started already populated (`REPID_AUTO_DEMO=1`). The
> blueprint was deleted in TASK-044 and the variable is not implemented - the
> server reads only `PORT` and `REPID_DATA_DIR`. "Play demo" (`POST
> /api/demo/run`) is the only auto-population path, and it needs funded tBCH
> wallets, so it answers `409` with a faucet hint until you have them.

| What you want to do | Command |
| Start the prototype | `npm start` |
| Run the protocol's automatic tests | `npm test` |
| Run the automatic test of the whole flow (needs tBCH, see §7) | `$env:REPID_E2E_FUNDS="1"; npm run test:e2e` |
| Validate the complete flow on Chipnet (real tBCH) | `$env:REPID_NETWORK="chipnet"; node scripts/chipnet-e2e.mjs` |
| Validate the identity collateral (IdentityVault) on Chipnet | `$env:REPID_NETWORK="chipnet"; node scripts/chipnet-vault-e2e.mjs` |

## 9) The automatic tests and the tBCH gate (read this before trusting a green run)

Since TASK-042 the prototype talks **only to Chipnet**, so every wallet is born empty and anything that mints an identity, a Receipt or a rating needs real tBCH. The automatic tests boot the server on a *temporary, empty* folder, so by construction they have no coins.

That is why `npm test` reports **93 tests, 0 failures**, of which:

- **55 run every time**, on any machine, with no coins and no network.
- **38 are "gated"** (they are listed as *skipped*): they need funded wallets, so they only run when you ask for them.

You will see this notice when the gate is closed:

```
[e2e] tBCH-gated blocks SKIPPED. The prototype is Chipnet-only, so these
      blocks need funded wallets. Run with REPID_E2E_FUNDS=1 once a funded
      wallet is reachable. See docs/TESTING.md §7.
```

**This is deliberate and it is not a pass being hidden.** No simulated network was put back to make them pass: that would be testing a fiction. The honest way to exercise those 38 blocks is against the real network, either with `REPID_E2E_FUNDS=1` (once a funded wallet is reachable) or with the two E2E scripts of §7, which are the ones that actually broadcast to Chipnet and check the answers with the real Bitcoin VM (`11/11 PASS` and the vault flow).

⚠️ **Known limitation, stated plainly**: the 38 gated blocks have **not** been executed since the gate was added, because doing so needs a funded tBCH wallet. They were failing with 409 ("Insufficient tBCH funds") before the gate, and at least one of them still carries a leftover expectation from the removed mock mode. Treat them as *unverified* until someone runs them with funds — and note the same applies to the three covenant test files that were removed (`identity_genesis`, `identity_vault`, `receipt_genesis`): the covenant rules are covered by the real-VM E2E scripts and by reading the contract, not by an automated regression test. `packages/protocol/spec/SPEC-008-repid-protocol.md` §B.2 says so in the same words.