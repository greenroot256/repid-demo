// RepID — TASK-026: E2E Chipnet with real tBCH.
//
// Starts an isolated server in chipnet mode (REPID_DATA_DIR = data_chipnet_e2e)
// and runs the full (demo) flow against the real test network. Verifies:
//   1. a wallet is created and its on-chain balance (if it is 0 → funding
//      instructions and exit 2: the test is "pending for tBCH", not failed).
//   2. demo/run: 3 wallets, 1 identity, 2 interactions, 2 ratings,
//      1 platform confirmation and 1 trust link — everything really broadcast.
//   3. each tx that produced a fact exists on the network (rawtx from the
//      worker) and shows a visible confirmation status (mempool or confirmed
//      + height).
//   4. a reputation profile is built from the on-chain facts.
//
// Requires tBCH: the faucet tbch.googol.cash is manual (captcha). The address
// to fund is shown when running without funds. Run:
//   node scripts/chipnet-e2e.mjs

import { spawn } from 'node:child_process';

const PORT = 3789;
const DATA = 'data_chipnet_e2e';

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
    console.log('E2E Chipnet waiting for real tBCH.');
    console.log('Fund this address at the faucet (manual, captcha):');
    console.log(`  ${w.address}`);
    console.log('  https://tbch.googol.cash');
    console.log('Then re-run:  node scripts/chipnet-e2e.mjs');
    console.log('(The server and its persistence stay intact for a retry.)');
    console.log('────────────────────────────────────────────────────────────────');
    server.kill();
    process.exit(2);
  }
  const funder = balances.find((b) => b.body.balanceSats !== '0');
  console.log(`  wallet with tBCH: ${funder.body.address.slice(0, 24)}… (${funder.body.balanceSats} sats)`);

  const summary = await api('POST', '/api/demo/run');
  check('full demo broadcast on Chipnet', summary.status === 201,
    `${summary.body.facts} facts (${summary.body.wallets} wallets, ${summary.body.ratings} ratings)`);

  const facts = await api('GET', '/api/facts');
  const byType = (t) => facts.body.filter((f) => f.type === t).length;
  check('identity genesis on-chain', byType('IDENTITY_GENESIS') === 1);
  check('interactions on-chain', byType('RECEIPT_GENESIS') === 2);
  check('ratings on-chain', byType('RATING_ISSUED') === 2);
  check('platform confirmation on-chain', byType('PLATFORM_CONFIRMATION') === 1);
  check('trust link on-chain', byType('TRUST_LINK') === 1);

  const anyMempool = [];
  for (const fact of facts.body) {
    const status = await api('GET', `/api/tx/${fact.txid}/status`);
    const raw = await api('GET', `/api/tx/${fact.txid}/raw`);
    if (raw.status !== 200 || !raw.body.hex) throw new Error(`tx ${fact.txid} does not exist on the network`);
    if (!status.body.confirmed) anyMempool.push(fact.txid);
    console.log(`  tx ${fact.txid} ${status.body.confirmed
      ? `confirmed (block ${status.body.blockHeight})`
      : 'in mempool'}  [${fact.type.slice(0, 22)}]`);
  }
  check(`all txs exist on Chipnet (rawtx fetched from worker)`, true, `${facts.body.length} txs`);
  console.log(anyMempool.length ? `  (${anyMempool.length} still in mempool: ${anyMempool.join(', ')}…)` : '  all confirmed.');

  const ratedPkh = facts.body.find((f) => f.type === 'RATING_ISSUED')?.raterPkh;
  const rated = facts.body.find((f) => f.type === 'RATING_ISSUED');
  const profile = await api('GET', `/api/reputation/${rated ? rated.rateePkh : ratedPkh}`);
  check('reputation built from real facts', profile.status === 200 && profile.body.avg !== null, `avg=${profile.body.avg} (${profile.body.ratingsReceived?.length ?? 0} ratings)`);

  // TASK-026 — confirmation wait: on Chipnet a block usually arrives in
  // seconds. We wait up to ~90 s to see at least one confirmed tx and
  // record the real height (if it stays in mempool it is not a failure:
  // it is already on the network).
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

server.kill();
// Design note: REPID_DATA_DIR is NOT deleted on purpose — the test wallets
// (tBCH) and the facts stay accessible to re-verify txids or retry. To clean
// up: delete the data_chipnet_e2e folder manually.
console.log('\nE2E Chipnet completed: real flow validated against the test network.');
console.log(`(Persistence kept in ${DATA}/ for re-verification — delete it manually whenever you want.)`);
process.exit(0);