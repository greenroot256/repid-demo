// RepID — prototype server
//
// Exposes a REST API that runs the full protocol cycle on the Chipnet test
// network (real CashTokens, real Bitcoin VM) via an isolated worker
// (context/network-processor.mjs) — see TASK-022/023/042. There is no
// simulated network mode: wallets are born empty and must be funded with tBCH
// (manual faucet tbch.googol.cash).
//
// DESIGN WARNING — DEMO ONLY: this server stores the private keys of the
// wallets it creates, in memory, in order to sign on the user's behalf
// without asking them to handle keys in the browser. This is acceptable only
// because the wallets are test wallets (Chipnet, worthless tBCH) and live
// only while the process is running (keys are persisted on disk to survive
// restarts, see below). A real RepID always signs client-side; the server
// must never custody keys.
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  Contract, TransactionBuilder, SignatureTemplate,
} from 'cashscript';
import { calculateDust, getOutputSize } from 'cashscript/dist/utils.js';
import { ChipnetNetworkProvider, chipnetFeeRate } from './chipnet-provider.mjs';
import {
  generatePrivateKey, secp256k1, hash160, lockingBytecodeToCashAddress, binToHex, utf8ToBin,
  decodePrivateKeyWif,
} from '@bitauth/libauth';
import vaultArtifact from '../contracts/identity_vault.json' with { type: 'json' };
import receiptArtifact from '../contracts/receipt_genesis.json' with { type: 'json' };
import {
  indexRawTransaction, OP_RETURN_TAGS, PROTOCOL_VERSION, PROTOCOL_STATUS, PROTOCOL_SPECIFICATION,
} from '@repid/sdk';
import { createJsonFileStore } from '@repid/sdk/node';
import {
  validateInteraction, buildInteraction, toReceiptParts,
} from '../interaction/repid-interaction.mjs';
import { interpretReputation, normalizeParams, DEFAULT_PARAMS } from './reputation.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3787;

// The prototype runs exclusively on Chipnet (real test network — tBCH + real
// CashTokens). The mock mode is gone (TASK-042); never reintroduce it.

// Indexer persistence (TASK-004, Option A): the Rating Rights state survives
// process restarts.
// REPID_DATA_DIR lets you isolate the persistence (used by the E2E tests).
const DATA_DIR = process.env.REPID_DATA_DIR || path.join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });
const INDEXER_STORE_PATH = path.join(DATA_DIR, 'indexer-store.json');

// Wallet persistence and local prototype state (TASK-025): the test wallet
// keys survive process restarts (needed to keep the tBCH you may have funded
// the demo with, and to avoid re-minting an identity that already exists
// on-chain). WARNING: these are not production wallets — the server stores
// test keys (tBCH, worthless).
const WALLET_STORE_PATH = path.join(DATA_DIR, 'wallet.json');
const STATE_STORE_PATH = path.join(DATA_DIR, 'repid-state.json');

// --- In-memory process state (lives while the server runs) -----------------

const provider = new ChipnetNetworkProvider();
let indexerStore = createJsonFileStore(INDEXER_STORE_PATH);
const wallets = new Map(); // pkhHex -> { privateKey, publicKey, pkh, pkhHex, address }
const identitiesByPkh = new Map(); // pkhHex -> IDENTITY_GENESIS fact
const interactionsByTxid = new Map(); // txid -> RECEIPT_GENESIS fact
const availableRatingRights = new Map(); // outpoint -> { ownerPkh, ratesPkh }
const facts = []; // full chronological log, for the activity feed
// Node-local observation, OFF-CHAIN and not part of a fact: txid -> { at, roles }.
// The RepID fact schema is closed (every event sets additionalProperties: false),
// so a fact cannot carry the time this node saw it or the off-chain interaction
// roles without becoming an invalid fact. They live here instead, keyed by txid,
// and are re-attached only when a response is rendered for the UI.
const factAnnotations = new Map();
const rawTransactions = []; // "node" feed: raw hex of each incoming tx (demo)
// Prototype owner's primary wallet (TASK-038): where the secondary wallets
// send their sats back after testing. Persisted with the state on disk
// (repid-state.json).
let primaryPkh = null;
// Wallet reference names (demo tooling, OFF-CHAIN): they only ease prototype
// testing, they are not facts and never touch the chain. They are persisted
// with the state on disk, like primaryPkh.
const walletNames = new Map(); // pkhHex -> name (string)
// Named reputation criteria configurations saved from the Indexer page (demo
// tooling, OFF-CHAIN): name -> interpretation params pairs. They are not
// persisted alongside the facts (the interpretation criteria is not a fact)
// but as local demo state, like walletNames/primaryPkh. The built-in "Sample"
// preset does not live here.
const interpretConfigs = new Map(); // name -> { params }

// Startup preset for the reputation criteria: always available as "Sample"
// (built-in, read-only) so a visitor understands the tool.
const SAMPLE_NAME = 'Sample';
const SAMPLE_PARAMS = Object.freeze({ ...DEFAULT_PARAMS });

function randomBytes32() {
  return new Uint8Array(crypto.randomBytes(32));
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

// Derives the wallet object (compressed public key + pkh + token-aware
// bchtest address) from a 32-byte private key.
function walletFromPrivateKey(privateKey) {
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  const pkh = hash160(publicKey);
  const pkhHex = binToHex(pkh);
  const p2pkhBytecode = new Uint8Array([0x76, 0xa9, 0x14, ...pkh, 0x88, 0xac]);
  const addressResult = lockingBytecodeToCashAddress({
    bytecode: p2pkhBytecode, prefix: 'bchtest', tokenSupport: true,
  });
  if (typeof addressResult === 'string') throw new Error(addressResult);
  return { privateKey, publicKey, pkh, pkhHex, address: addressResult.address };
}

function addWalletToStore(wallet) {
  const existing = wallets.get(wallet.pkhHex);
  if (existing) return existing;
  wallets.set(wallet.pkhHex, wallet);
  saveWalletsToDisk();
  return wallet;
}

// Wallets are created empty: the funds are real (tBCH) and come from the
// faucet (or from the funding help from TASK-025 / the Transfer Sats panel
// with a previously funded wallet).
function createWallet() {
  const wallet = walletFromPrivateKey(generatePrivateKey(randomBytes32));
  return addWalletToStore(wallet);
}

// TASK-038 — import your own wallet (the owner's "base wallet") from a
// private key in hex (64 chars, native wallet.json format) or WIF (standard
// external format; the server detects it on its own). It joins the Map like
// any wallet: signs transactions, receives faucet funds and, with asPrimary,
// gets marked as the prototype's primary wallet.
function importWalletFromPrivate(rawInput, { asPrimary = false } = {}) {
  const raw = String(rawInput ?? '').trim();
  if (!raw) {
    const err = new Error('Provide a private key (64-character hex or WIF)');
    err.status = 400;
    throw err;
  }
  let privateKey;
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    privateKey = hexToBytes(raw);
  } else {
    const decoded = decodePrivateKeyWif(raw);
    if (typeof decoded === 'string') {
      const err = new Error('Unrecognized key: expected a private key in hex (64 characters) or WIF');
      err.status = 400;
      throw err;
    }
    privateKey = decoded.privateKey;
  }
  const wallet = addWalletToStore(walletFromPrivateKey(privateKey));
  if (asPrimary) setPrimaryPkh(wallet.pkhHex);
  return wallet;
}

// --- Prototype persistence (TASK-025) --------------------------------------
//
// Wallets and local state are saved to data/ so the demo survives restarts
// (a wallet's tBCH funds live on-chain, not in the process).

function saveWalletsToDisk() {
  const serialized = [...wallets.values()].map((w) => ({
    privateKeyHex: binToHex(w.privateKey),
    publicKeyHex: binToHex(w.publicKey),
    pkhHex: w.pkhHex,
    address: w.address,
  }));
  writeFileSync(WALLET_STORE_PATH, JSON.stringify(serialized, null, 2), 'utf8');
}

function loadWalletsFromDisk() {
  if (!existsSync(WALLET_STORE_PATH)) return;
  try {
    const serialized = JSON.parse(readFileSync(WALLET_STORE_PATH, 'utf8'));
    for (const s of serialized) {
      const wallet = {
        privateKey: hexToBytes(s.privateKeyHex),
        publicKey: hexToBytes(s.publicKeyHex),
        pkh: hexToBytes(s.pkhHex),
        pkhHex: s.pkhHex,
        address: s.address,
      };
      wallets.set(s.pkhHex, wallet);
    }
  } catch (err) {
    console.error(`[chipnet] could not load persisted wallets: ${err.message}`);
  }
}

function persistState() {
  writeFileSync(STATE_STORE_PATH, JSON.stringify({
    facts,
    factAnnotations: [...factAnnotations.entries()],
    rawTransactions,
    identitiesByPkh: [...identitiesByPkh.entries()],
    interactionsByTxid: [...interactionsByTxid.entries()],
    availableRatingRights: [...availableRatingRights.entries()],
    primaryPkh,
    walletNames: [...walletNames.entries()],
    interpretConfigs: [...interpretConfigs.entries()],
  }, null, 2), 'utf8');
}

function loadStateFromDisk() {
  if (!existsSync(STATE_STORE_PATH)) return;
  try {
    const saved = JSON.parse(readFileSync(STATE_STORE_PATH, 'utf8'));
    for (const stored of saved.facts ?? []) {
      // Migration from state written before the annotations were separated: the
      // fact on disk carries `at` (and `roles`, on a Receipt) and is therefore
      // not a valid fact. Split it on load so existing demo state heals instead
      // of staying permanently non-conformant, or being silently discarded.
      const { at, roles, ...fact } = stored;
      facts.push(fact);
      if (at !== undefined || roles !== undefined) {
        factAnnotations.set(fact.txid, { ...(at !== undefined ? { at } : {}), ...(roles !== undefined ? { roles } : {}) });
      }
    }
    for (const [txid, annotation] of saved.factAnnotations ?? []) {
      factAnnotations.set(txid, { ...factAnnotations.get(txid), ...annotation });
    }
    rawTransactions.push(...(saved.rawTransactions ?? []));
    for (const [k, v] of saved.identitiesByPkh ?? []) identitiesByPkh.set(k, v);
    for (const [k, v] of saved.interactionsByTxid ?? []) interactionsByTxid.set(k, v);
    for (const [k, v] of saved.availableRatingRights ?? []) availableRatingRights.set(k, v);
    if (saved.primaryPkh) primaryPkh = saved.primaryPkh;
    for (const [k, v] of saved.walletNames ?? []) walletNames.set(k, v);
    for (const [k, v] of saved.interpretConfigs ?? []) interpretConfigs.set(k, { params: normalizeParams(v?.params ?? {}) });
  } catch (err) {
    console.error(`[chipnet] could not load persisted state: ${err.message}`);
  }
}

function requireWallet(pkhHex) {
  const wallet = wallets.get(pkhHex);
  if (!wallet) {
    const err = new Error(`Unknown wallet: ${pkhHex}`);
    err.status = 404;
    throw err;
  }
  return wallet;
}

// TASK-038 — marks the prototype's primary wallet (where the secondary
// wallets send their sats back). Persisted on disk.
function setPrimaryPkh(pkhHex) {
  requireWallet(pkhHex);
  primaryPkh = pkhHex;
  persistState();
  return primaryPkh;
}

// Prototype P2PKH spends (rating, confirmation, trust and foreign txs). The
// fee is paid from a tokenless UTXO of the wallet itself and the change is
// added with addBchChangeOutputIfNeeded to the same wallet, using the real
// network fee rate.
async function spendP2pkh(wallet, opReturnBytecode, extraInputs = []) {
  const utxos = await provider.getUtxos(wallet.address);
  const feeUtxo = utxos.find((u) => !u.token);
  if (!feeUtxo) {
    const err = new Error(`Wallet ${wallet.pkhHex} has no tBCH funds to pay the fee. Request funds at tbch.googol.cash and send them to ${wallet.address}`);
    err.status = 409;
    throw err;
  }

  const feeRate = await chipnetFeeRate();
  const builder = new TransactionBuilder({ provider })
    .addInput(feeUtxo, new SignatureTemplate(wallet.privateKey).unlockP2PKH())
    .addOutput({ to: opReturnBytecode, amount: 0n });

  for (const { utxo, unlocker } of extraInputs) builder.addInput(utxo, unlocker);
  builder.addBchChangeOutputIfNeeded({ to: wallet.address, feeRate });

  return builder.send();
}

// TASK-026 — P2PKH→P2PKH transfer between prototype wallets (demo-only).
// No OP_RETURN: it is not a RepID fact, the indexer simply ignores it. It is
// used to spread tBCH from the funded wallet to the wallets the demo creates
// on the fly.
async function transferSats(fromPkhHex, toPkhHex, amount) {
  const from = requireWallet(fromPkhHex);
  const to = requireWallet(toPkhHex);
  const utxos = await provider.getUtxos(from.address);
  // Multi-input consolidation (same weakness as genesis funding): sats
  // fragmented across several small UTXOs must not block a transfer.
  const plainUtxos = utxos.filter((u) => !u.token);
  if (plainUtxos.length === 0) {
    const err = new Error(`Wallet ${from.pkhHex} has no tBCH funds to pay the fee. Request funds at tbch.googol.cash and send them to ${from.address}`);
    err.status = 409;
    throw err;
  }

  const feeRate = await chipnetFeeRate();
  const builder = new TransactionBuilder({ provider });
  for (const u of plainUtxos) {
    builder.addInput(u, new SignatureTemplate(from.privateKey).unlockP2PKH());
  }
  builder.addOutput({ to: to.address, amount });

  builder.addBchChangeOutputIfNeeded({ to: from.address, feeRate });

  return builder.send();
}

// TASK-038 — "sweep" of one wallet into another: sends ALL of its tokenless
// P2PKH UTXOs to the destination wallet in a single multi-input transaction
// (matures all leftover test balances: genesis change, fee purchases, etc.).
// The fee estimate is conservative; if the remainder does not reach the
// network minimum dust it stays as miner fee (no unused residual change is
// created). Token UTXOs (unspent Rating Rights) are NOT swept: spending them
// is a protocol fact (a rating), not loose money.
function sweepWalletTo(fromPkhHex, toPkhHex) {
  const from = requireWallet(fromPkhHex);
  const to = requireWallet(toPkhHex);
  const result = { pkh: from.pkhHex, address: from.address, burned: false, sweptSats: '0' };
  return (async () => {
    const utxos = await provider.getUtxos(from.address);
    const plainUtxos = utxos.filter((u) => !u.token);
    const total = plainUtxos.reduce((sum, u) => sum + BigInt(u.satoshis), 0n);
    if (total <= 0n) return result;

    const builder = new TransactionBuilder({ provider });
    for (const u of plainUtxos) {
      builder.addInput(u, new SignatureTemplate(from.privateKey).unlockP2PKH());
    }

    // Same real-size fee as createGenesisFunding: the 148*N+44 heuristic
    // underestimated the destination output (34-byte P2PKH) and the remainder
    // did not reach the minimum fee cashscript requires. 5% margin; if it
    // falls below the network minimum dust it stays as miner fee (no residual
    // change is created).
    const feeRate = await chipnetFeeRate();
    const baseSize = Number(builder.getTransactionSize());
    const outputSize = Number(getOutputSize({ to: to.address, amount: 0n }));
    const fee = BigInt(Math.ceil((baseSize + outputSize) * feeRate * 1.05)) + 1n;
    const amount = total - fee;
    if (amount < 546n) return result; // below minimum dust: keep it

    builder
      .addOutput({ to: to.address, amount })
      .addBchChangeOutputIfNeeded({ to: from.address, feeRate });

    await builder.send();
    result.sweptSats = String(amount);
    return result;
  })();
}

// TASK-038 — returns the sats of ALL secondary wallets to the primary one:
// burning each wallet's identity (releasing its collateral from the covenant)
// when burnIdentities is true, then sweeping all loose P2PKH balance in a
// single pass.
async function sweepAllToPrimary({ burnIdentities = false } = {}) {
  if (!primaryPkh) {
    const err = new Error('Mark a wallet as primary first (panel "Manage Wallets")');
    err.status = 409;
    throw err;
  }
  const report = [];
  for (const w of wallets.values()) {
    if (w.pkhHex === primaryPkh) continue;
    let burned = false;
    if (burnIdentities && identitiesByPkh.has(w.pkhHex)) {
      try {
        await burnIdentity(w.pkhHex);
        burned = true;
      } catch (err) {
        report.push({ pkh: w.pkhHex, address: w.address, error: `identity not burned: ${err.message}` });
        continue;
      }
    }
    const swept = await sweepWalletTo(w.pkhHex, primaryPkh);
    report.push({ ...swept, burned });
  }
  return { primaryPkh, swept: report };
}

// Records a fact exactly as it was recognized.
//
// `fact` is stored verbatim: the closed schema in repid-protocol is the
// definition of a fact, and this prototype is a consumer of it, so the object
// that reaches disk must validate against that schema unchanged. Anything the
// demo wants to add goes in `annotation` and is kept out of the fact.
//
// `annotation.roles` carries the party roles of the off-chain interaction layer
// (RFC-002). They are off-chain metadata by construction: nobody signs them into
// a covenant, so they cannot be a protocol fact.
function recordFact(fact, annotation = {}) {
  facts.push(fact);
  factAnnotations.set(fact.txid, { at: new Date().toISOString(), ...annotation });
  return fact;
}

// Builds the object the console renders from a stored fact.
//
// The stored fact is exactly what the protocol defines (closed schema) and must
// stay that way; this view adds back the node-local observation — when this node
// saw the transaction, and the off-chain interaction roles — for display only.
// Every fact that leaves a GET endpoint for the UI goes through here, so the
// annotations are re-attached in one auditable place instead of being baked into
// the fact at recognition time.
function factView(fact) {
  return { ...fact, ...(factAnnotations.get(fact.txid) ?? {}) };
}

// Indexes the transaction AND "hears" it the way a network node would: it
// records the raw hex in the indexer feed, with the recognized fact type (or
// null if the shape matches no RepID pattern).
function recordFromChain(txHex, txid) {
  const fact = indexRawTransaction(txHex, indexerStore);
  rawTransactions.push({
    txid, hex: txHex, at: new Date().toISOString(), factType: fact ? fact.type : null,
  });
  return fact;
}

function walletSummary(w) {
  return { pkh: w.pkhHex, address: w.address, isPrimary: w.pkhHex === primaryPkh, name: walletNames.get(w.pkhHex) ?? null };
}

// --- Protocol operations (reusable helpers) --------------------------------
//
// Each helper runs the transaction on the chain, indexes it and records
// the fact + the hex in the node feed. The API handlers validate the input
// (400/403/404/409) and delegate here; /api/demo/run uses them to populate
// the demo in a single pass.

// Creates the contract genesis UTXO with the conditions required by the
// covenant and the real Bitcoin VM:
//   - vout 0 (CashTokens genesis rule: outpointIndex == 0).
//   - the whole balance in a single output directed to the contract.
// A real 1-input/N-output funding transaction is built; output 0 gets locked
// to the contract and the input surplus pays the fee.
async function createGenesisFunding(funderPkh, contract) {
  const funder = requireWallet(funderPkh);
  const leaves = await provider.getUtxos(funder.address);
  // ALL tokenless P2PKH UTXOs are consolidated: sats usually arrive
  // fragmented (600+600+5000 from a faucet) and a single small UTXO can leave
  // the covenant below the minimum dust (~546 sats). Multi-input like
  // sweepWalletTo; the dust guard is below.
  const plainUtxos = leaves.filter((u) => !u.token);
  if (plainUtxos.length === 0) {
    const err = new Error(`Wallet ${funder.pkhHex} has no tBCH funds to fund the genesis. Request funds at tbch.googol.cash and send them to ${funder.address}`);
    err.status = 409;
    throw err;
  }

  const total = plainUtxos.reduce((sum, u) => sum + BigInt(u.satoshis), 0n);

  const builder = new TransactionBuilder({ provider });
  for (const u of plainUtxos) {
    builder.addInput(u, new SignatureTemplate(funder.privateKey).unlockP2PKH());
  }

  // Fee based on the REAL SERIALIZED SIZE, not the 148*N+44 heuristic that
  // underestimated the P2SH32 output (41 bytes, not 34) and left the tx at
  // ~0.98 sat/byte, rejected by cashscript's local check
  // (TransactionFeePerByteTooLowError). getTransactionSize() already includes
  // the signatures (deterministic RFC6979), so only the funding output is
  // added; the 5% margin guarantees fee/byte >= 1.0 and the surplus (if any)
  // stays as miner fee, just like sweepWalletTo.
  const feeRate = await chipnetFeeRate();
  const baseSize = Number(builder.getTransactionSize());
  const outputSize = Number(getOutputSize({ to: contract.address, amount: 0n }));
  const fee = BigInt(Math.ceil((baseSize + outputSize) * feeRate * 1.05)) + 1n;
  const amount = total - fee;
  // Real dust of the funding output (P2SH32 without token ≈ 579 sats), not a
  // P2PKH one: cashscript rejects with 500 if the output falls below dust.
  if (amount < BigInt(calculateDust({ to: contract.address, amount }))) {
    const err = new Error(`Insufficient tBCH funds to fund the genesis (${total} total sats). Consolidate with "Return everything to the primary" or request more tBCH at tbch.googol.cash and send them to ${funder.address}`);
    err.status = 409;
    throw err;
  }

  builder.addOutput({ to: contract.address, amount });

  const funding = await builder.send();

  // recordFact() would index it as a non-RepID fact (discarded); it only
  // passes through the "node" feed so the contract genesis is traceable.
  const fact = recordFromChain(funding.hex, funding.txid);
  if (fact) recordFact(fact);
  return { txid: funding.txid, vout: 0, satoshis: amount };
}

function genesisFeeRate() {
  return chipnetFeeRate();
}

// Identity collateral (TASK-036): the vault covenant custodies the BCH that
// backs the identity. The initial collateral must fit inside the funding (the
// mint covenant requires exactly 2 outputs: covenant + change).
const DEFAULT_IDENTITY_COLLATERAL = 1000n;

async function mintIdentity(ownerPkh, collateral = DEFAULT_IDENTITY_COLLATERAL) {
  const owner = requireWallet(ownerPkh);
  if (identitiesByPkh.has(ownerPkh)) {
    const err = new Error('This wallet already has an identity');
    err.status = 409;
    throw err;
  }
  if (collateral <= 0n) {
    const err = new Error('Collateral must be a positive integer amount of sats');
    err.status = 400;
    throw err;
  }

  const contract = new Contract(vaultArtifact, [owner.pkh], { provider });
  // If a previous genesis attempt broadcast the funding but the mint failed
  // afterwards (e.g. collateral below dust), the covenant already has a
  // funded NFT-less UTXO: reusing it avoids leaving those sats orphaned in the
  // P2SH (the mint would spend the original vout-0 outpoint, fulfilling the
  // CashTokens genesis rule).
  const covenantUtxos = await provider.getUtxos(contract.address);
  const pendingFunding = covenantUtxos.find((u) => !u.token && u.vout === 0);
  const genesisUtxo = pendingFunding?.satoshis > 0n
    ? pendingFunding
    : await createGenesisFunding(owner.pkhHex, contract);
  if (collateral >= genesisUtxo.satoshis) {
    const err = new Error(`Collateral (${collateral} sats) leaves no change on the covenant funding (${genesisUtxo.satoshis} sats)`);
    err.status = 400;
    throw err;
  }
  const category = genesisUtxo.txid;

  // The mint covenant requires exactly 2 outputs (vault + change), both must
  // exceed the network dust (~741 for the P2SH32 vault with NFT, ~546 for the
  // P2PKH change). Validated BEFORE building to give clear errors instead of
  // cashscript's cryptic OutputSatoshisTooSmallError / a VM failure due to a
  // missing change output.
  const vaultOutput = {
    to: contract.tokenAddress,
    amount: collateral,
    token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(owner.pkh) } },
  };
  const vaultDust = BigInt(calculateDust(vaultOutput));
  if (collateral < vaultDust) {
    const err = new Error(`Collateral (${collateral} sats) does not reach the network minimum for the vault output (${vaultDust} sats): add more sats to the wallet and retry`);
    err.status = 409;
    throw err;
  }

  const feeRate = await genesisFeeRate();
  const builder = new TransactionBuilder({ provider })
    .addInput(genesisUtxo, contract.unlock.mint(owner.publicKey, new SignatureTemplate(owner.privateKey), collateral))
    .addOutput(vaultOutput);

  // Mirror of addBchChangeOutputIfNeeded's internal math: it would change the
  // final fee and we need to know whether the resulting change still exceeds
  // its dust before letting the builder silently drop the change (that would
  // leave a single output and the covenant would reject it).
  await assertChargeChangeAboveDust(builder, owner.address, feeRate, 'Identity genesis');

  const tx = await builder
    .addBchChangeOutputIfNeeded({ to: owner.address, feeRate })
    .send();

  const fact = recordFact(recordFromChain(tx.hex, tx.txid));
  identitiesByPkh.set(owner.pkhHex, fact);
  persistState();
  return fact;
}

// Finds the live covenant vault UTXO that custodies this wallet's identity
// (the one holding the NFT + its collateral). Electrum reports it.
async function findIdentityVaultUtxo(ownerPkh) {
  const owner = requireWallet(ownerPkh);
  const entry = identitiesByPkh.get(ownerPkh);
  if (!entry) {
    const err = new Error('This wallet has no identity to manage');
    err.status = 409;
    throw err;
  }
  const contract = new Contract(vaultArtifact, [owner.pkh], { provider });
  const utxos = await provider.getUtxos(contract.address);
  const covenant = utxos.find((u) => {
    if (!u.token) return false;
    const cat = typeof u.token.category === 'string' ? u.token.category : binToHex(u.token.category);
    return cat === entry.identityCategory;
  });
  if (!covenant) {
    const err = new Error(`The covenant of ${ownerPkh} was not found on Chipnet (was it spent another way?).`);
    err.status = 409;
    throw err;
  }
  return { contract, covenant };
}

// Fee source for covenant spends (grows the owner wallet's P2PKH UTXO; never
// touches the locked collateral).
async function ownerFeeUtxo(owner) {
  const utxos = await provider.getUtxos(owner.address);
  const feeUtxo = utxos.find((u) => !u.token);
  if (!feeUtxo) {
    const err = new Error(`Wallet ${owner.pkhHex} has no tBCH funds to pay the fee. Request funds at tbch.googol.cash and send them to ${owner.address}`);
    err.status = 409;
    throw err;
  }
  return feeUtxo;
}

// Mirror of addBchChangeOutputIfNeeded's internal math to know, BEFORE
// building, whether the resulting change still exceeds its minimum dust. All
// vault spends require exactly 2 outputs; if the change fell below dust, the
// builder would silently absorb it into the fee and the tx would end with 1
// output, which the covenant rejects with an opaque VM error.
async function assertChargeChangeAboveDust(builder, changeTo, feeRate, what) {
  const surplus = builder.inputs.reduce((t, i) => t + BigInt(i.satoshis), 0n)
    - builder.outputs.reduce((t, o) => t + BigInt(o.amount), 0n);
  if (surplus <= 0n) {
    const err = new Error(`${what}: nothing is left above the covenant to pay the fee`);
    err.status = 409;
    throw err;
  }
  const tentativeSize = builder.getTransactionSize();
  const tentativeFee = BigInt(Math.ceil(feeRate * Number(tentativeSize)));
  if (surplus <= tentativeFee) {
    const err = new Error(`${what}: the change cannot pay the fee (~${tentativeFee} sats). Add more sats to the wallet and retry`);
    err.status = 409;
    throw err;
  }
  const changeDust = BigInt(calculateDust({ to: changeTo, amount: 0n }));
  const changeSize = BigInt(getOutputSize({ to: changeTo, amount: 0n }));
  const txSizeWithChange = tentativeSize + changeSize;
  const calcFee = BigInt(Math.ceil(feeRate * Number(txSizeWithChange)));
  const changeAmount = surplus - calcFee;
  if (changeAmount < changeDust) {
    const err = new Error(`${what}: the change returned to the wallet (${changeAmount} sats) does not reach the network minimum (${changeDust} sats). Add more sats to the wallet`);
    err.status = 409;
    throw err;
  }
}

async function increaseCollateral(ownerPkh, amount) {
  const owner = requireWallet(ownerPkh);
  const { contract, covenant } = await findIdentityVaultUtxo(ownerPkh);
  if (amount <= 0n) {
    const err = new Error('The increase must be a positive integer amount of sats');
    err.status = 400;
    throw err;
  }

  const category = identitiesByPkh.get(ownerPkh).identityCategory;
  const previousCollateral = BigInt(covenant.satoshis);
  const newCollateral = previousCollateral + amount;

  const feeRate = await genesisFeeRate();
  const builder = new TransactionBuilder({ provider })
    .addInput(covenant, contract.unlock.increaseCollateral(owner.publicKey, new SignatureTemplate(owner.privateKey)))
    .addInput(await ownerFeeUtxo(owner), new SignatureTemplate(owner.privateKey).unlockP2PKH())
    .addOutput({
      to: contract.tokenAddress,
      amount: newCollateral,
      token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(owner.pkh) } },
    });

  await assertChargeChangeAboveDust(builder, owner.address, feeRate, 'Collateral top-up');

  const tx = await builder
    .addBchChangeOutputIfNeeded({ to: owner.address, feeRate })
    .send();

  const fact = recordFact(recordFromChain(tx.hex, tx.txid));
  // The genesis fact does NOT change (it is the anchor); only the current
  // collateral of the identity is updated for the view.
  identitiesByPkh.get(ownerPkh).collateral = fact.collateral;
  persistState();
  return fact;
}

async function burnIdentity(ownerPkh) {
  const owner = requireWallet(ownerPkh);
  const { contract, covenant } = await findIdentityVaultUtxo(ownerPkh);
  const collateral = BigInt(covenant.satoshis);

  const feeRate = await genesisFeeRate();
  const builder = new TransactionBuilder({ provider })
    .addInput(covenant, contract.unlock.burn(owner.publicKey, new SignatureTemplate(owner.privateKey)))
    .addInput(await ownerFeeUtxo(owner), new SignatureTemplate(owner.privateKey).unlockP2PKH())
    .addOutput({ to: owner.address, amount: collateral });

  await assertChargeChangeAboveDust(builder, owner.address, feeRate, 'Identity burn');

  const tx = await builder
    .addBchChangeOutputIfNeeded({ to: owner.address, feeRate })
    .send();

  const fact = recordFact(recordFromChain(tx.hex, tx.txid));
  identitiesByPkh.delete(ownerPkh);
  persistState();
  return fact;
}

async function createInteraction(partyAInput, partyBInput) {
  const interaction = buildInteraction({ partyA: partyAInput, partyB: partyBInput });
  const { partyAPkh, partyBPkh } = toReceiptParts(interaction);
  const partyA = requireWallet(partyAPkh);
  const partyB = requireWallet(partyBPkh);

  const contract = new Contract(receiptArtifact, [partyA.pkh, partyB.pkh], { provider });
  // partyA funds the genesis: hence the covenant change returns to partyA
  // (output 3).
  const genesisUtxo = await createGenesisFunding(partyA.pkhHex, contract);
  const category = genesisUtxo.txid;

  const builder = new TransactionBuilder({ provider })
    .addInput(
      genesisUtxo,
      contract.unlock.mint(
        partyA.publicKey,
        new SignatureTemplate(partyA.privateKey),
        partyB.publicKey,
        new SignatureTemplate(partyB.privateKey),
      ),
    )
    .addOutput({ to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: '' } } })
    .addOutput({ to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyB.pkh) } } })
    .addOutput({ to: partyB.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyA.pkh) } } });

  await assertChargeChangeAboveDust(builder, partyA.address, await genesisFeeRate(), 'Receipt genesis');

  const tx = await builder
    .addBchChangeOutputIfNeeded({ to: partyA.address, feeRate: await genesisFeeRate() })
    .send();

  const fact = recordFact(recordFromChain(tx.hex, tx.txid), {
    roles: [interaction.partyA.role, interaction.partyB.role],
  });
  interactionsByTxid.set(tx.txid, fact);
  for (const rr of fact.ratingRights) availableRatingRights.set(rr.outpoint, rr);
  persistState();
  return fact;
}

async function platformConfirm(platformPkh, receiptTxid) {
  const platform = requireWallet(platformPkh);

  const tagBytes = utf8ToBin(OP_RETURN_TAGS.PLATFORM);
  const txidBytes = hexToBytes(receiptTxid);
  const opReturnBytecode = new Uint8Array([
    0x6a, tagBytes.length, ...tagBytes, txidBytes.length, ...txidBytes,
  ]);

  const tx = await spendP2pkh(platform, opReturnBytecode);
  const fact = recordFact(recordFromChain(tx.hex, tx.txid));
  persistState();
  return fact;
}

async function issueRating(outpoint, raterPkh, score) {
  const rater = requireWallet(raterPkh);
  const ratingRight = indexerStore.getRatingRight(outpoint);
  if (!ratingRight) {
    const err = new Error('Rating Right not found');
    err.status = 404;
    throw err;
  }
  if (ratingRight.ownerPkh !== raterPkh) {
    const err = new Error('This Rating Right does not belong to this wallet');
    err.status = 403;
    throw err;
  }

  const [txid, voutStr] = outpoint.split(':');
  const vout = Number(voutStr);
  const utxos = await provider.getUtxos(rater.address);
  const ratingRightUtxo = utxos.find((u) => u.txid === txid && u.vout === vout);
  if (!ratingRightUtxo) {
    const err = new Error('This Rating Right has already been used');
    err.status = 409;
    throw err;
  }

  const tagBytes = utf8ToBin(OP_RETURN_TAGS.RATING);
  const opReturnBytecode = new Uint8Array([0x6a, tagBytes.length, ...tagBytes, 1, score]);

  const tx = await spendP2pkh(rater, opReturnBytecode, [{
    utxo: ratingRightUtxo,
    unlocker: new SignatureTemplate(rater.privateKey).unlockP2PKH(),
  }]);

  const fact = recordFact(recordFromChain(tx.hex, tx.txid));
  availableRatingRights.delete(outpoint);
  persistState();
  return fact;
}

async function createTrustLink(trusterPkh, trustedPkh) {
  const truster = requireWallet(trusterPkh);
  requireWallet(trustedPkh);

  const tagBytes = utf8ToBin(OP_RETURN_TAGS.TRUST);
  const pkhBytes = hexToBytes(trustedPkh);
  const opReturnBytecode = new Uint8Array([
    0x6a, tagBytes.length, ...tagBytes, pkhBytes.length, ...pkhBytes,
  ]);

  const tx = await spendP2pkh(truster, opReturnBytecode);
  const fact = recordFact(recordFromChain(tx.hex, tx.txid));
  persistState();
  return fact;
}

// --- App ------------------------------------------------------------------

const app = express();
app.set('query parser', 'extended'); // qs: allows nested `signals[key][...]` params (SPEC-007)
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Synthetic demo wallets

app.post('/api/wallets', (req, res) => {
  res.status(201).json(walletSummary(createWallet()));
});

app.get('/api/status', (req, res) => {
  // The protocol version and status come from the SDK, which reads them from the
  // normative repository. Surfacing them here is what makes the cutover checkable
  // at runtime: if this demo and the protocol ever disagree, the disagreement is
  // visible on the first request instead of hiding inside the recognizer.
  res.json({
    network: 'chipnet',
    primaryPkh,
    protocolVersion: PROTOCOL_VERSION,
    protocolStatus: PROTOCOL_STATUS,
    protocolSpecification: PROTOCOL_SPECIFICATION,
  });
});

app.get('/api/wallets', (req, res) => {
  res.json([...wallets.values()].map(walletSummary));
});

// TASK-038 — import one of your own wallets from its private key (hex or
// WIF), one per request. With asPrimary it is marked as the primary wallet.
// Trims spaces and accepts several separated by line breaks.
app.post('/api/wallets/import', (req, res) => {
  const { privateKey, asPrimary = false } = req.body ?? {};
  const imported = [];
  const keys = String(privateKey ?? '')
    .split(/\r?\n/)
    .map((k) => k.trim())
    .filter(Boolean);
  if (!keys.length) {
    return res.status(400).json({ error: 'Provide at least one private key (64-hex or WIF)' });
  }
  for (const key of keys) {
    const wallet = importWalletFromPrivate(key, { asPrimary });
    imported.push(walletSummary(wallet));
  }
  res.status(201).json({ count: imported.length, wallets: imported, primaryPkh });
});

// TASK-038 — mark an existing wallet as the primary one (the destination of
// the sats when test wallets are returned).
app.post('/api/wallets/:pkh/primary', (req, res, next) => {
  try {
    res.json({ primaryPkh: setPrimaryPkh(req.params.pkh) });
  } catch (err) { next(err); }
});

// Reference name of a wallet (demo tooling, OFF-CHAIN): it only eases testing
// and does not touch the chain. An empty string deletes the name.
app.put('/api/wallets/:pkh/name', (req, res, next) => {
  try {
    requireWallet(req.params.pkh);
    const rawName = req.body?.name;
    if (typeof rawName !== 'string') {
      const err = new Error('The name must be a text string (or an empty string to delete it)');
      err.status = 400;
      throw err;
    }
    const name = rawName.trim().slice(0, 24);
    if (name) walletNames.set(req.params.pkh, name);
    else walletNames.delete(req.params.pkh);
    persistState();
    res.json({ pkh: req.params.pkh, name: walletNames.get(req.params.pkh) ?? null });
  } catch (err) { next(err); }
});

// Reputation criteria configurations (Indexer page). Saved by name and
// reusable to interpret profiles; they are demo tooling, OFF-CHAIN, and are
// not written next to the index facts.
app.get('/api/interpret-configs', (req, res) => {
  const user = [...interpretConfigs.keys()]
    .sort()
    .map((name) => ({ name, params: interpretConfigs.get(name).params, builtin: false }));
  res.json({ configs: [{ name: SAMPLE_NAME, params: SAMPLE_PARAMS, builtin: true }, ...user] });
});

app.put('/api/interpret-configs/:name', (req, res, next) => {
  try {
    const name = String(req.params.name ?? '').trim().slice(0, 24);
    if (!name || name === SAMPLE_NAME) {
      const err = new Error(`The name cannot be empty nor be "${SAMPLE_NAME}" (read-only preset)`);
      err.status = 400;
      throw err;
    }
    let params;
    try {
      params = normalizeParams(req.body?.params ?? {});
    } catch (normErr) {
      const err = new Error(`Invalid parameters: ${normErr.message}`);
      err.status = 400;
      throw err;
    }
    interpretConfigs.set(name, { params });
    persistState();
    res.json({ name, params });
  } catch (err) { next(err); }
});

app.delete('/api/interpret-configs/:name', (req, res, next) => {
  try {
    if (String(req.params.name ?? '') === SAMPLE_NAME) {
      const err = new Error(`"${SAMPLE_NAME}" is the prototype's read-only preset, it cannot be deleted`);
      err.status = 400;
      throw err;
    }
    if (!interpretConfigs.delete(req.params.name)) {
      const err = new Error(`Unknown configuration: ${req.params.name}`);
      err.status = 404;
      throw err;
    }
    persistState();
    res.json({ deleted: req.params.name });
  } catch (err) { next(err); }
});

// TASK-026 — demo-only: transfer between prototype wallets (allows spreading
// tBCH from the funded wallet towards the ones the demo creates on the fly).

app.post('/api/transfer', async (req, res, next) => {
  try {
    const { fromPkh, toPkh, amount } = req.body ?? {};
    const from = requireWallet(fromPkh);
    requireWallet(toPkh);
    if (!/^\d+$/.test(String(amount))) {
      const err = new Error('amount must be a positive integer number of sats');
      err.status = 400;
      throw err;
    }
    const num = Number(BigInt(amount));
    if (!Number.isSafeInteger(num) || num <= 0) {
      const err = new Error('amount must be a positive integer number of sats');
      err.status = 400;
      throw err;
    }
    if (num < 546) {
      const err = new Error('amount must be at least 546 sats (network minimum dust)');
      err.status = 400;
      throw err;
    }
    const tx = await transferSats(fromPkh, toPkh, BigInt(num));
    res.status(201).json({ txid: tx.txid, fromPkh, toPkh, amount: String(BigInt(num)) });
  } catch (err) { next(err); }
});

// TASK-038 — returns the sats of all secondary wallets to the primary one
// (with optional identity burning to release the collaterals).

app.post('/api/sweep', async (req, res, next) => {
  try {
    const { burnIdentities = false } = req.body ?? {};
    const report = await sweepAllToPrimary({ burnIdentities });
    res.status(201).json(report);
  } catch (err) { next(err); }
});

// TASK-025 — funding UX: real balance of a wallet (on-chain) plus its
// address to fund it with the faucet.

app.get('/api/wallets/:pkh', async (req, res, next) => {
  try {
    const wallet = requireWallet(req.params.pkh);
    const utxos = await provider.getUtxos(wallet.address);
    const sats = utxos
      .filter((u) => !u.token)
      .reduce((sum, u) => sum + BigInt(u.satoshis), 0n);
    res.json({
      ...walletSummary(wallet),
      balanceSats: sats.toString(),
      hasIdentity: identitiesByPkh.has(wallet.pkhHex),
    });
  } catch (err) { next(err); }
});

// TASK-025 — confirmation status of a transaction: mempool vs confirmed (and
// at what height).

app.get('/api/tx/:txid/status', async (req, res, next) => {
  try {
    const { confirmed, blockHeight } = await provider.txStatus(req.params.txid);
    res.json({ confirmed, blockHeight });
  } catch (err) { next(err); }
});

// TASK-026 — raw hex of a real transaction (Chipnet) to verify in E2E that
// the tx that produced a fact exists on-chain (the worker fetches the rawtx).

app.get('/api/tx/:txid/raw', async (req, res, next) => {
  try {
    const hex = await provider.getRawTransaction(req.params.txid);
    res.json({ hex });
  } catch (err) { next(err); }
});

// RFC-001 — Identity Protocol (collateral vault, TASK-036)

app.post('/api/identities', async (req, res, next) => {
  try {
    const { ownerPkh } = req.body;
    // Optional collateral (sats). If missing, the demo default is used.
    let collateral = DEFAULT_IDENTITY_COLLATERAL;
    const raw = req.body?.collateral;
    if (raw !== undefined && raw !== null && raw !== '') {
      if (!/^\d+$/.test(String(raw))) {
        return res.status(400).json({ error: 'collateral must be a positive integer number of sats' });
      }
      collateral = BigInt(String(raw));
    }
    const fact = await mintIdentity(ownerPkh, collateral);
    res.status(201).json(fact);
  } catch (err) { next(err); }
});

app.get('/api/identities', (req, res) => {
  res.json([...identitiesByPkh.values()].map(factView));
});

// TASK-036 — increase the identity's collateral (the covenant never lets it
// go down on-chain; here it is only added from the owner's wallet).

app.post('/api/identities/:pkh/collateral', async (req, res, next) => {
  try {
    const { amount } = req.body ?? {};
    if (!/^\d+$/.test(String(amount ?? ''))) {
      return res.status(400).json({ error: 'amount must be a positive integer number of sats' });
    }
    const fact = await increaseCollateral(req.params.pkh, BigInt(String(amount)));
    res.status(201).json(fact);
  } catch (err) { next(err); }
});

// TASK-036 — delete the identity: the NFT is burned and the collateral
// returns to the owner. The wallet is then free to mint a new identity.

app.post('/api/identities/:pkh/burn', async (req, res, next) => {
  try {
    const fact = await burnIdentity(req.params.pkh);
    res.status(201).json(fact);
  } catch (err) { next(err); }
});

// RFC-003/004 — Interaction Receipt + Rating Rights

app.post('/api/interactions', async (req, res, next) => {
  try {
    // SPEC-002: the interaction is defined at the application level with an
    // explicit role for each party; it is validated before anchoring the
    // Receipt.
    const { partyA: reqA, partyB: reqB } = req.body ?? {};
    const validated = validateInteraction({ partyA: reqA, partyB: reqB });
    if (!validated.ok) {
      return res.status(400).json({ error: validated.error });
    }

    const fact = await createInteraction(reqA, reqB);
    // The console echoes the roles of the interaction it just anchored; the
    // stored fact stays clean (see factView).
    res.status(201).json(factView(fact));
  } catch (err) { next(err); }
});

app.get('/api/interactions', (req, res) => {
  res.json([...interactionsByTxid.values()].map(factView));
});

// SPEC-003 RF-06 — PLATFORM_CONFIRMATION (pattern C): the platform
// corroborates, with its own P2PKH spend + OP_RETURN, that the referenced
// interaction happened. Independent fact; the Receipt genesis does not change.
// The validator does not need to mint an Identity.

app.post('/api/platform-confirmations', async (req, res, next) => {
  try {
    const { platformPkh, receiptTxid } = req.body ?? {};
    if (!/^[0-9a-f]{64}$/.test(receiptTxid || '')) {
      return res.status(400).json({ error: 'receiptTxid must be a valid txid (64 hex)' });
    }
    if (!indexerStore.getReceipt(receiptTxid)) {
      return res.status(404).json({ error: 'There is no Receipt indexed with that txid' });
    }

    const fact = await platformConfirm(platformPkh, receiptTxid);
    res.status(201).json(fact);
  } catch (err) { next(err); }
});

// RFC-004 — ISSUED_RATING (plain P2PKH spend of a Rating Right)

app.post('/api/ratings', async (req, res, next) => {
  try {
    const { outpoint, raterPkh, score } = req.body;
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return res.status(400).json({ error: 'score must be an integer between 1 and 5' });
    }
    const fact = await issueRating(outpoint, raterPkh, score);
    res.status(201).json(fact);
  } catch (err) { next(err); }
});

// SPEC-006 — TRUST_LINK: unilateral A→B declaration. A spends its UTXO with
// an OP_RETURN (tag + B's pkh) declaring it trusts B. No consent from B, no
// Rating Rights.

app.post('/api/trust-links', async (req, res, next) => {
  try {
    const { trusterPkh, trustedPkh } = req.body ?? {};
    if (!/^[0-9a-f]{40}$/.test(trusterPkh || '') || !/^[0-9a-f]{40}$/.test(trustedPkh || '')) {
      return res.status(400).json({ error: 'trusterPkh and trustedPkh must be valid pkhs (40 hex)' });
    }
    const fact = await createTrustLink(trusterPkh, trustedPkh);
    res.status(201).json(fact);
  } catch (err) { next(err); }
});

app.get('/api/rating-rights', (req, res) => {
  res.json([...availableRatingRights.entries()].map(([outpoint, rr]) => ({ outpoint, ...rr })));
});

// Ledger / activity feed

app.get('/api/facts', (req, res) => {
  res.json(facts.map(factView));
});

// Indexer view (RFC-006): the raw transaction feed as the network "hears" it,
// plus the internal state the indexer keeps to re-identify spends (Rating
// Rights) and validate confirmations (Receipts). Demo-only, over whatever is
// in memory.

app.get('/api/indexer-view', (req, res) => {
  res.json({
    transactions: [...rawTransactions].reverse(),
    stores: indexerStore.snapshot(),
    storeFile: path.basename(INDEXER_STORE_PATH),
  });
});

// Demo-only: sends a transaction that is NOT RepID (an OP_RETURN with a
// foreign tag). The indexer "sees" it arrive but discards it — there is no
// way it matches — and the Ledger does not change. It shows the recognition
// filter by contrast.

app.post('/api/foreign-tx', async (req, res, next) => {
  try {
    let walletWithFunds = null;
    for (const w of wallets.values()) {
      const utxos = await provider.getUtxos(w.address);
      if (utxos.some((u) => !u.token)) { walletWithFunds = w; break; }
    }
    if (!walletWithFunds) {
      const err = new Error('There is no wallet with tBCH funds to pay the fee. Request funds at tbch.googol.cash');
      err.status = 409;
      throw err;
    }

    const tagBytes = utf8ToBin('HELLO1');
    const msgBytes = utf8ToBin('not RepID');
    const opReturnBytecode = new Uint8Array([0x6a, tagBytes.length, ...tagBytes, msgBytes.length, ...msgBytes]);

    const tx = await spendP2pkh(walletWithFunds, opReturnBytecode);

    const fact = recordFromChain(tx.hex, tx.txid);
    res.status(201).json({ txid: tx.txid, hex: tx.hex, recognized: fact ? fact.type : null });
  } catch (err) { next(err); }
});

// Reputation profile (interpretation layers, off-chain — Constitution Art. 1).
// It does not weigh or judge: it only aggregates already-indexed facts so a
// person can see their history and audit trail. The weighing / anti-sybil
// logic stays in the reputation layer (out of scope; see SPEC-006).

app.get('/api/reputation/:pkh', (req, res) => {
  const { pkh } = req.params;
  if (!/^[0-9a-f]{40}$/.test(pkh)) {
    return res.status(400).json({ error: 'pkh must be a valid pkh (40 hex)' });
  }

  const ratingsReceived = [];
  for (const f of facts) {
    if (f.type === 'RATING_ISSUED' && f.rateePkh === pkh && f.valid) {
      ratingsReceived.push({ score: f.score, raterPkh: f.raterPkh, txid: f.txid });
    }
  }
  const total = ratingsReceived.reduce((s, r) => s + r.score, 0);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratingsReceived) distribution[r.score] += 1;

  const trustReceived = facts
    .filter((f) => f.type === 'TRUST_LINK' && f.trustedPkh === pkh && f.valid)
    .map((f) => ({ trusterPkh: f.trusterPkh, txid: f.txid }));

  const ratingsIssued = facts
    .filter((f) => f.type === 'RATING_ISSUED' && f.raterPkh === pkh)
    .map((f) => ({ score: f.score, rateePkh: f.rateePkh, txid: f.txid }));

  const confirmedReceipts = [];
  for (const f of facts) {
    if (f.type !== 'PLATFORM_CONFIRMATION' || !f.valid) continue;
    const receipt = facts.find((x) => x.type === 'RECEIPT_GENESIS' && x.txid === f.receiptTxid);
    if (receipt && receipt.receiptOwnerPkh === pkh) {
      confirmedReceipts.push({ receiptTxid: f.receiptTxid, txid: f.txid });
    }
  }

  res.json({
    pkh,
    hasIdentity: identitiesByPkh.has(pkh),
    identityTxid: identitiesByPkh.get(pkh)?.txid ?? null,
    collateral: identitiesByPkh.get(pkh)?.collateral ?? null,
    ratingsReceived,
    avg: ratingsReceived.length ? (total / ratingsReceived.length).toFixed(1) : null,
    distribution,
    ratingsIssued,
    trustReceived,
    confirmedReceipts,
  });
});

// Interpreted reputation according to a configurable criteria (Indexer page):
// the chosen reputation layer asks for an identity's reputation following the
// criteria parameters. The parameters arrive as a query string; they belong
// to the session (ephemeral, the criteria is not persisted). The indexer
// keeps recognizing facts without weighing them; this interpretation happens
// afterwards, off-chain (constitution.md, Article 1; SPEC-005 §6).

app.get('/api/reputation/:pkh/interpret', (req, res) => {
  const { pkh } = req.params;
  if (!/^[0-9a-f]{40}$/.test(pkh)) {
    return res.status(400).json({ error: 'pkh must be a valid pkh (40 hex)' });
  }
  let result;
  try {
    result = interpretReputation(facts, identitiesByPkh, pkh, req.query);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.json(result);
});

// Automatic demo (demo-only): populates the prototype with the full flow in a
// single pass, reusing exactly the same operations as the API — do not
// introduce any new shape. It lets a visitor see the live system and the
// indexer view with hex traffic at a glance.

async function runDemo() {
  // The demo runs on the real chain: the wallets it creates are born empty —
  // the wallet funded with tBCH finances them via P2PKH→P2PKH transfers (20k
  // sats each: several genesis transactions and spends with plenty of margin).
  let funderPkh = null;
  for (const w of wallets.values()) {
    const utxos = await provider.getUtxos(w.address);
    if (utxos.some((u) => !u.token)) { funderPkh = w.pkhHex; break; }
  }
  if (!funderPkh) {
    const err = new Error('Fund a wallet with tBCH first (faucet tbch.googol.cash) to be able to pay the demo fees');
    err.status = 409;
    throw err;
  }
  const a = createWallet();
  const b = createWallet();
  const platform = createWallet();
  for (const w of [a, b, platform]) {
    await transferSats(funderPkh, w.pkhHex, 20_000n);
  }

  await mintIdentity(a.pkhHex);

  const itx1 = await createInteraction(
    { pkh: a.pkhHex, role: 'passenger' },
    { pkh: b.pkhHex, role: 'driver' },
  );
  const itx2 = await createInteraction(
    { pkh: b.pkhHex, role: 'buyer' },
    { pkh: a.pkhHex, role: 'seller' },
  );

  // txs, outpoint txid:1 = partyA's Rating Right (the one that rates B).
  await issueRating(itx1.ratingRights[0].outpoint, a.pkhHex, 5);
  await issueRating(itx2.ratingRights[0].outpoint, b.pkhHex, 4);

  await platformConfirm(platform.pkhHex, itx1.txid);
  await createTrustLink(a.pkhHex, b.pkhHex);

  return {
    wallets: wallets.size,
    identities: identitiesByPkh.size,
    interactions: interactionsByTxid.size,
    ratings: facts.filter((f) => f.type === 'RATING_ISSUED').length,
    confirmations: facts.filter((f) => f.type === 'PLATFORM_CONFIRMATION').length,
    trustLinks: facts.filter((f) => f.type === 'TRUST_LINK').length,
    facts: facts.length,
  };
}

app.post('/api/demo/run', async (req, res, next) => {
  try {
    const summary = await runDemo();
    res.status(201).json(summary);
  } catch (err) { next(err); }
});

// Demo-only: resets the prototype so the tests can be repeated from zero.
// The facts are already on-chain: "resetting" clears the local point of view
// (test wallets + state) to go back to zero.

app.post('/api/reset', (req, res) => {
  wallets.clear();
  identitiesByPkh.clear();
  interactionsByTxid.clear();
  availableRatingRights.clear();
  facts.length = 0;
  factAnnotations.clear();
  rawTransactions.length = 0;
  primaryPkh = null;
  writeFileSync(INDEXER_STORE_PATH, '{}', 'utf8');
  indexerStore = createJsonFileStore(INDEXER_STORE_PATH);
  try {
    rmSync(WALLET_STORE_PATH, { force: true });
    rmSync(STATE_STORE_PATH, { force: true });
  } catch { /* files that do not exist */ }
  res.json({ ok: true });
});

// Errors

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message });
});

// Boot: restore persisted test wallets and local state (TASK-025).
loadWalletsFromDisk();
loadStateFromDisk();

app.listen(PORT, () => {
  console.log('RepID — prototype ready (real CHIPNET network via isolated worker).');
  console.log(`  http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop the server when you are done.');
});