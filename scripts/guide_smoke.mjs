// Guide smoke: starts the REAL server with temporary persistence and runs
// the docs/TESTING.md flow the same way the UI would.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const PORT = 3911;
const BASE = `http://localhost:${PORT}`;
const DIR = `${process.env.TEMP || process.env.TMP}\\repid-guide-smoke`;
mkdirSync(DIR, { recursive: true });

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT, REPID_DATA_DIR: DIR },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let bootLog = '';
server.stdout.on('data', (d) => { bootLog += d; });
server.stderr.on('data', (d) => { bootLog += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp() {
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(`${BASE}/api/wallets`); if (r.ok) return; } catch {}
    await sleep(250);
  }
  throw new Error('server did not come up');
}
const api = async (path, method = 'GET', body) => {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return r;
};

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  [${extra}]` : ''}`);
  if (!ok) failures += 1;
};

try {
  await waitUp();
  check('clear boot message in the log', bootLog.includes('RepID — prototype ready') && bootLog.includes(`http://localhost:${PORT}`));

  // Test 1 — create 3 wallets
  const w = [];
  for (let i = 0; i < 3; i += 1) w.push((await api('/api/wallets', 'POST')).ok ? (await fetch(`${BASE}/api/wallets`).then((r) => r.json()))[i] : null);
  check('3 wallets created', w.length === 3 && w.every((x) => x?.pkh));
  const r = await fetch(`${BASE}/api/wallets`).then((r) => r.json());
  check('3 addresses in the Wallets list', r.length === 3 && r.every((x) => x && x.pkh));

  // Test 2 — mint identity (wallet 1)
  const id1 = await api('/api/identities', 'POST', { ownerPkh: r[0].pkh });
  check('identity minted (201)', id1.status === 201);
  const id2 = await api('/api/identities', 'POST', { ownerPkh: r[0].pkh });
  check('duplicate identity rejected (409)', id2.status === 409);

  // Test 3 — passenger/driver interaction
  const itx = await api('/api/interactions', 'POST', {
    partyA: { pkh: r[0].pkh, role: 'passenger' },
    partyB: { pkh: r[1].pkh, role: 'driver' },
  });
  check('interaction registered (201)', itx.status === 201);

  // Test 4 — empty role → 400
  const bad = await api('/api/interactions', 'POST', {
    partyA: { pkh: r[0].pkh, role: '' },
    partyB: { pkh: r[1].pkh, role: 'driver' },
  });
  check('empty role rejected (400)', bad.status === 400);

  // Test 5 — rating 5 (wallet 1 with its Rating Right)
  const rights = await fetch(`${BASE}/api/rating-rights`).then((x) => x.json());
  const mine = rights.find((rr) => rr.ownerPkh === r[0].pkh);
  const rating = await api('/api/ratings', 'POST', { outpoint: mine.outpoint, raterPkh: r[0].pkh, score: 5 });
  check('rating 5 issued (201)', rating.status === 201 && rating.ok);

  // Test 6 — spent right is no longer available
  const rightsAfter = await fetch(`${BASE}/api/rating-rights`).then((x) => x.json());
  check('w1 Rating Right no longer listed', !rightsAfter.some((rr) => rr.ownerPkh === r[0].pkh));

  // Test 7 — platform confirms (wallet 3, no identity)
  const interactions = await fetch(`${BASE}/api/interactions`).then((x) => x.json());
  const conf = await api('/api/platform-confirmations', 'POST', { platformPkh: r[2].pkh, receiptTxid: interactions[0].txid });
  check('platform confirms without identity (201)', conf.status === 201 && conf.ok);

  // Test 8 — trust link A→B
  const trust = await api('/api/trust-links', 'POST', { trusterPkh: r[0].pkh, trustedPkh: r[1].pkh });
  check('A→B trust declared (201)', trust.status === 201 && trust.ok);

  // Test 10 — the 5 fact types in the ledger
  const facts = await fetch(`${BASE}/api/facts`).then((x) => x.json());
  const types = new Set(facts.map((f) => f.type));
  const haveAll = ['IDENTITY_GENESIS', 'RECEIPT_GENESIS', 'RATING_ISSUED', 'PLATFORM_CONFIRMATION', 'TRUST_LINK'].every((t) => types.has(t));
  check('5 fact types in the Ledger', haveAll, facts.map((f) => f.type).join(', '));

  // Test 12 — indexer view: raw feed + internal state
  const view = await fetch(`${BASE}/api/indexer-view`).then((x) => x.json());
  check('node feed with hex + txids', view.transactions.length >= 5 && view.transactions.every((t) => t.hex && /^[0-9a-f]{64}$/.test(t.txid)));
  check('internal state: indexed receipts', view.stores.receipts.length >= 1);
  check('persistence file reported', /indexer-store\.json$/.test(view.storeFile));

  // Test 13 — unknown transaction: discarded without touching the ledger
  const factsBeforeForeign = (await fetch(`${BASE}/api/facts`).then((x) => x.json())).length;
  const foreign = await api('/api/foreign-tx', 'POST');
  check('unknown transaction sent (201)', foreign.status === 201);
  const view2 = await fetch(`${BASE}/api/indexer-view`).then((x) => x.json());
  check('discarded in the feed (factType null)', view2.transactions[0].factType === null && view2.transactions[0].txid === (await foreign.json()).txid);
  const factsAfterForeign = (await fetch(`${BASE}/api/facts`).then((x) => x.json())).length;
  check('ledger intact after foreign transaction', factsAfterForeign === factsBeforeForeign);

  // Test 11/14 — reset clears everything (includes indexer view)
  const reset = await api('/api/reset', 'POST');
  const walletsAfter = await fetch(`${BASE}/api/wallets`).then((x) => x.json());
  const factsAfter = await fetch(`${BASE}/api/facts`).then((x) => x.json());
  const viewAfter = await fetch(`${BASE}/api/indexer-view`).then((x) => x.json());
  check('reset clears wallets, Ledger and indexer view', reset.ok && walletsAfter.length === 0 && factsAfter.length === 0 && viewAfter.transactions.length === 0 && viewAfter.stores.receipts.length === 0);

  // Test 15 — auto demo
  const demo = await api('/api/demo/run', 'POST');
  const demoBody = demo.ok ? await demo.json() : null;
  check('auto demo: full summary (201)', demo.status === 201 && demoBody.wallets === 3 && demoBody.identities === 1 && demoBody.interactions === 2 && demoBody.ratings === 2 && demoBody.confirmations === 1 && demoBody.trustLinks === 1);

  // Test 16 — auditable reputation profile
  const demoWallets = await fetch(`${BASE}/api/wallets`).then((x) => x.json());
  const prof = await fetch(`${BASE}/api/reputation/${demoWallets[0].pkh}`).then((x) => x.json());
  check('wallet 1 profile: 1 rating, avg 4.0, has identity', prof.ratingsReceived.length === 1 && prof.ratingsReceived[0].score === 4 && prof.avg === '4.0' && prof.hasIdentity === true && prof.distribution[4] === 1);
  const profB = await fetch(`${BASE}/api/reputation/${demoWallets[1].pkh}`).then((x) => x.json());
  check('wallet 2 profile: 1 rating 5 and 1 trust received', profB.ratingsReceived.length === 1 && profB.ratingsReceived[0].score === 5 && profB.avg === '5.0' && profB.trustReceived.length === 1);
  const badProf = await api('/api/reputation/xyz');
  check('malformed pkh rejected (400)', badProf.status === 400);

  console.log(failures === 0 ? '\nALL OK — manual guide verified against the real server.' : `\n${failures} failures.`);
} catch (e) {
  console.error('FLOW ERROR:', e.message);
  console.error('Server log:', bootLog.slice(0, 800));
  failures += 1;
} finally {
  server.kill();
  setTimeout(() => rmSync(DIR, { recursive: true, force: true }), 300);
  process.exitCode = failures === 0 ? 0 : 1;
}