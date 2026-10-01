// RepID — network-processor (real Chipnet, TASK-023)
//
// For each network operation this script is run as an isolated CHILD
// PROCESS: one operation per process. The reason is finding C1 of the
// spike (TASK-022): @electrum-cash/network can freeze the event loop of
// the whole process when more than one request is queued over a persistent
// connection. Wrapped in a child process, a hang is only charged to the
// child: the server kills it and retries, and the Express process never
// blocks.
//
// Usage (invoked by the server):
//   node context/network-processor.mjs <op> <jsonArgs>
//
// Ops:
//   height             → current height
//   fee                → fee rate in sat/byte (estimatefee 1 block)
//   utxos {address}    → UTXOs (includes tokens, cashscript format)
//   broadcast {hex}    → txid (or the real node error)
//   rawtx {txid}       → raw hex of a transaction
//   status {txid}      → { confirmed, blockHeight } (mempool vs confirmed)
//
// Output contract: a single JSON line:
//   {"ok":true,"result":...} | {"ok":false,"error":"..."}
import { ElectrumClient } from '@electrum-cash/network';
import { cashAddressToLockingBytecode } from '@bitauth/libauth';
import { createHash } from 'node:crypto';

const HOST = process.env.REPID_CHIPNET_HOST || 'chipnet.imaginary.cash';
const [op, argsJson] = process.argv.slice(2);
const args = (() => {
  try { return JSON.parse(argsJson ?? '{}'); } catch { return {}; }
})();

const respond = (payload) => {
  console.log(JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  process.exit(0);
};
const fail = (error) => respond({ ok: false, error: String(error?.message ?? error).split('\n')[0] });

// Transforms electrum token_data into the shape cashscript uses in
// Utxo.token (amount as bigint; here it travels as a JSON string).
function parseToken(tokenData) {
  if (!tokenData) return undefined;
  const token = {
    category: tokenData.category,
    amount: tokenData.amount ?? '0',
  };
  if (tokenData.nft) {
    token.nft = {
      capability: tokenData.nft.capability,
      commitment: tokenData.nft.commitment ?? '',
    };
  }
  return token;
}

async function main() {
  const client = new ElectrumClient(`RepID-${process.pid}`, '1.4.1', HOST);
  let result = null;

  try {
    await client.connect();

    if (op === 'height') {
      const r = await client.request('blockchain.headers.subscribe');
      result = r?.height ?? null;
    } else if (op === 'fee') {
      const feeBchPerKb = await client.request('blockchain.estimatefee', args.blocks ?? 1);
      result = feeBchPerKb > 0
        ? Math.max(1, Math.round((Number(feeBchPerKb) * 100_000_000) / 1000))
        : 1;
    } else if (op === 'utxos') {
      // The server addresses are token-aware (cashaddr prefix 'z'):
      // we require tokenSupport: true so that decoding does not fail.
      // In this libauth version, cashAddressToLockingBytecode returns
      // { bytecode, prefix, tokenSupport } — not the raw bytes.
      const decoded = cashAddressToLockingBytecode(args.address, true);
      const lockResult = decoded && typeof decoded === 'object' && decoded.bytecode instanceof Uint8Array
        ? decoded.bytecode
        : decoded;
      if (typeof lockResult === 'string') fail(`invalid address: ${lockResult}`);
      if (!(lockResult instanceof Uint8Array)) fail('invalid address');
      const digest = createHash('sha256').update(Buffer.from(lockResult)).digest();
      digest.reverse();
      const scriptHash = digest.toString('hex');
      const raw = await client.request('blockchain.scripthash.listunspent', scriptHash, 'include_tokens');
      result = raw.map((u) => ({
        txid: u.tx_hash,
        vout: u.tx_pos,
        satoshis: u.value,
        token: parseToken(u.token_data),
      }));
    } else if (op === 'broadcast') {
      result = await client.request('blockchain.transaction.broadcast', args.hex);
    } else if (op === 'rawtx') {
      result = await client.request('blockchain.transaction.get', args.txid);
    } else if (op === 'status') {
      const status = await client.request('blockchain.transaction.get_status', args.txid);
      result = status
        ? { confirmed: status.confirmed === true, blockHeight: status.height ?? null }
        : { confirmed: false, blockHeight: null };
    } else {
      fail(`unknown op: ${op}`);
    }

    await client.disconnect().catch(() => {});
    respond({ ok: true, result });
  } catch (e) {
    fail(`[${op}] ${String(e?.message ?? e).slice(0, 200)}`);
  }
}

main();