// RepID — TASK-037: Chipnet E2E of the identity collateral vault.
//
// Starts an isolated server in chipnet mode (REPID_DATA_DIR = data_chipnet_vault_e2e)
// and validates the IdentityVault covenant against the real Bitcoin VM:
//   1. identity minted with explicit collateral (on-chain lock).
//   2. collateral increase (the covenant requires value >= oldCollateral).
//   3. identity burn (the collateral returns; the category is not re-issued).
//   4. re-mint after the burn (a burned wallet can create a new identity).
//   5. each tx that produced a fact exists on the network (rawtx from the
//      worker) and shows its status (mempool or confirmed + height).
//
// Requires tBCH: the faucet tbch.googol.cash is manual (captcha). The address
// to fund is shown when running without funds (exit 2, persistence intact for
// a retry). Run:
//   node scripts/chipnet-vault-e2e.mjs

import { spawn } from 'node:child_process';

const PORT = 3790;
const DATA = 'data_chipnet_vault_e2e';

const withTimeout = (p, ms, label) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${label}`)), ms)),
]);

const api = async (method, path, body) => {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT), REPID_NETWORK: 'chipnet', REPID_DATA_DIR: DATA },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stderr.on('data', (d) => { serverLog += d; });
server.stdout.on('data', (d) => { serverLog += d; });

await withTimeout(new Promise((resolve) => {
  server.stdout.on('data', (d) => { if (String(d).includes('http://localhost:')) resolve(); });
}), 20000, 'server startup').catch(() => {
  console.log('ERROR: server did not start within 20s\n', serverLog.slice(0, 600));
  server.kill();
  process.exit(1);
});

const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
  if (!ok) throw new Error(`failed check: ${label}`);
};

const short = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '');

const finish = (message, code = 0) => {
  server.kill();
  console.log(message);
  // Design note: REPID_DATA_DIR is NOT deleted on purpose — the tBCH wallets
  // and the facts stay accessible to re-verify txids or retry.
  console.log(`(Persistence kept in ${DATA}/ for re-verification — delete it manually whenever you want.)`);
  process.exit(code);
};

try {
  let walletPool = [];
  {
    const res = await api('GET', '/api/wallets');
    walletPool = res.body;
  }
  if (walletPool.length === 0) {
    const created = await api('POST', '/api/wallets');
    check('wallet created on Chipnet', created.status === 201 && !!created.body.address, created.body.address?.slice(0, 22) + '…');
    walletPool = [created.body];
  }
  check('wallets available on Chipnet', walletPool.length > 0, `${walletPool.length} wallets`);

  const balances = [];
  for (const w of walletPool) {
    const bal = await api('GET', `/api/wallets/${w.pkh}`);
    balances.push(bal);
  }
  check('balances queryable on-chain', balances.every((b) => b.status === 200));

  const funded = balances.find((b) => b.body.balanceSats !== '0');
  if (!funded) {
    const w = walletPool[0];
    console.log('\n────────────────────────────────────────────────────────────────');
    console.log('Chipnet vault E2E waiting for real tBCH.');
    console.log('Fund this address at the faucet (manual, captcha):');
    console.log(`  ${w.address}`);
    console.log('  https://tbch.googol.cash');
    console.log('Then re-run:  node scripts/chipnet-vault-e2e.mjs');
    console.log('(The server and its persistence stay intact for a retry.)');
    console.log('────────────────────────────────────────────────────────────────');
    finish('', 2);
  }

  const owner = funded.body;
  const balance = Number(owner.balanceSats);
  console.log(`  wallet with tBCH: ${owner.address.slice(0, 24)}… (${owner.balanceSats} sats)`);
  if (balance < 2500) {
    finish(`\nFunds too low for the vault (${balance} sats): ask for another drop from the faucet and retry.`, 2);
  }

  const factByType = async (type) => {
    const facts = await api('GET', '/api/facts');
    return facts.body.filter((f) => f.type === type);
  };

  // 1) Identity with explicit collateral (leaves change for fees in the wallet).
  let genesisTxid;
  if (owner.hasIdentity) {
    console.log('  (wallet already had a persisted identity: continuing with top-up/burn)');
  } else {
    const collateral = Math.max(1000, Math.floor(balance * 0.4));
    const minted = await api('POST', '/api/identities', { ownerPkh: owner.pkh, collateral: String(collateral) });
    check('identity minted with explicit collateral', minted.status === 201 && minted.body.type === 'IDENTITY_GENESIS',
      `collateral=${minted.body.collateral ?? '?'}`);
    const genesises = await factByType('IDENTITY_GENESIS');
    const latest = genesises[genesises.length - 1];
    check('IDENTITY_GENESIS fact with collateral', latest && Number(latest.collateral) === collateral && latest.ownerPkh === owner.pkh,
      latest ? `collateral=${latest.collateral}` : 'no fact');
    genesisTxid = latest.txid;
  }

  // Genesis reference (if it came from persistence, take the newest fact).
  if (!genesisTxid) {
    const genesises = await factByType('IDENTITY_GENESIS');
    const latest = genesises[genesises.length - 1];
    if (!latest) {
      finish('ERROR: no IDENTITY_GENESIS fact for the wallet (inconsistent state?).', 1);
    }
    genesisTxid = latest.txid;
  }
  const genesisCategory = (await factByType('IDENTITY_GENESIS')).find((f) => f.txid === genesisTxid)?.identityCategory;

  // 2) Increase collateral: the covenant requires value >= oldCollateral (real VM).
  const topUpAmount = 1000;
  const topUp = await api('POST', `/api/identities/${owner.pkh}/collateral`, { amount: String(topUpAmount) });
  check('collateral increased on-chain', topUp.status === 201 && topUp.body.type === 'IDENTITY_COLLATERAL_TOP_UP',
    `${topUp.body.previousCollateral} → ${topUp.body.collateral} sats`);
  const topUpValid = topUp.body.valid !== false;
  check('top-up marked valid by the indexer (same NFT and new >= old)', topUpValid,
    topUp.body.valid === false ? 'valid: false' : 'valid');
  const prev = Number(topUp.body.previousCollateral);
  const next = Number(topUp.body.collateral);
  check('collateral grows by exactly the requested amount', prev + topUpAmount === next, `${prev} + ${topUpAmount} = ${next}`);
  check('top-up keeps the identity category', !genesisCategory || topUp.body.identityCategory === genesisCategory,
    topUp.body.identityCategory === genesisCategory ? 'category intact' : 'different category');

  // 3) Burn: returns the collateral and burns the category.
  const burned = await api('POST', `/api/identities/${owner.pkh}/burn`);
  check('identity burned on-chain (burn)', burned.status === 201 && burned.body.type === 'IDENTITY_BURNED',
    `collateral returned=${burned.body.collateral ?? '?'}`);
  const afterBurn = await api('GET', `/api/wallets/${owner.pkh}`);
  check('wallet loses validity after the burn', afterBurn.body.hasIdentity === false, `hasIdentity=${afterBurn.body.hasIdentity}`);

  // 4) Re-mint: the burned wallet can create a new identity.
  const reminted = await api('POST', '/api/identities', { ownerPkh: owner.pkh });
  check('re-mint after burn (new identity)', reminted.status === 201 && reminted.body.type === 'IDENTITY_GENESIS',
    `collateral=${reminted.body.collateral}`);
  const gensAfter = await factByType('IDENTITY_GENESIS');
  const lastGen = gensAfter[gensAfter.length - 1];
  check('the new genesis is a different category', lastGen && lastGen.identityCategory !== genesisCategory,
    lastGen ? `${short(lastGen.identityCategory)} vs ${short(genesisCategory)}` : 'no fact');

  // 5) The vault facts exist on-chain (rawtx fetched from the worker) and
  //    show their confirmation status.
  const facts = await api('GET', '/api/facts');
  const vaultTxs = facts.body.filter((f) => ['IDENTITY_GENESIS', 'IDENTITY_COLLATERAL_TOP_UP', 'IDENTITY_BURNED'].includes(f.type));
  check('vault facts present in the ledger', facts.body.some((f) => f.type === 'IDENTITY_COLLATERAL_TOP_UP') && facts.body.some((f) => f.type === 'IDENTITY_BURNED'),
    `${vaultTxs.length} vault txs`);
  const anyMempool = [];
  for (const fact of vaultTxs) {
    const status = await api('GET', `/api/tx/${fact.txid}/status`);
    const raw = await api('GET', `/api/tx/${fact.txid}/raw`);
    if (raw.status !== 200 || !raw.body.hex) throw new Error(`tx ${fact.txid} does not exist on the network`);
    if (!status.body.confirmed) anyMempool.push(fact.txid);
    console.log(`  tx ${fact.txid} ${status.body.confirmed
      ? `confirmed (block ${status.body.blockHeight})`
      : 'in mempool'}  [${fact.type}]`);
  }
  check('all vault txs exist on Chipnet (rawtx from worker)', true, `${vaultTxs.length} txs`);
  console.log(anyMempool.length ? `  (${anyMempool.length} still in mempool: ${anyMempool.join(', ')}…)` : '  all confirmed.');

  // Confirmation wait (~90 s): on Chipnet a block usually arrives in seconds.
  const firstTxid = facts.body[0].txid;
  for (let i = 0; i < 30; i += 1) {
    const status = await api('GET', `/api/tx/${firstTxid}/status`);
    if (status.body.confirmed) {
      console.log(`  ✓ ${firstTxid} confirmed in block ${status.body.blockHeight} (chipnet)`);
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
} catch (err) {
  server.kill();
  console.log('ERROR:', err.message);
  console.log('server log:', serverLog.slice(0, 600));
  process.exit(1);
}

finish('\nChipnet vault E2E completed: mint + top-up + burn + re-mint validated against the real VM.');