import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import schema from '@repid/sdk/protocol/schemas/repid-fact.schema.json' with { type: 'json' };

// A fact is defined by the closed schema of repid-protocol: every shape in it
// sets additionalProperties: false. This prototype is a consumer of that
// definition, so anything it stores as a fact must not carry an extra key — not
// even a helpful one such as the time the node saw the transaction (`at`) or the
// off-chain interaction roles (`roles`), which used to be stamped onto the fact
// and silently made every persisted fact invalid.
//
// This suite is not tBCH-gated: it seeds a legacy annotated state file, boots
// the real server, and checks that the annotations are split out of the fact on
// load and moved to their own state key, while the API still hands them back to
// the console as a view.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4100 + Math.floor(Math.random() * 900);
const BASE = `http://localhost:${PORT}`;
const DIR = mkdtempSync(join(tmpdir(), 'repid-persist-'));

// The union of the top-level properties across the seven shapes is the complete
// set of keys a fact may carry (each shape forbids anything else).
const ALLOWED_FACT_KEYS = new Set(schema.oneOf.flatMap((shape) => Object.keys(shape.properties)));

const HEX64 = 'a'.repeat(64);
const HEX64_RECEIPT = 'd'.repeat(64);
const HEX40 = 'b'.repeat(40);
const HEX40_OTHER = 'f'.repeat(40);

// State as this prototype used to write it: the fact carried the node-local
// annotations and was therefore not a valid fact. The `at` is real (taken from
// the persisted file the annotation work started from).
const LEGACY_STATE = {
  facts: [
    {
      type: 'IDENTITY_GENESIS',
      txid: HEX64,
      identityCategory: 'c'.repeat(64),
      ownerPkh: HEX40,
      collateral: '1000',
      identityOutpoint: `${HEX64}:0`,
      at: '2026-09-27T15:57:20.736Z',
    },
    {
      type: 'RECEIPT_GENESIS',
      txid: HEX64_RECEIPT,
      receiptCategory: 'e'.repeat(64),
      receiptOwnerPkh: HEX40,
      ratingRights: [
        { outpoint: `${HEX64_RECEIPT}:1`, ownerPkh: HEX40, ratesPkh: HEX40_OTHER },
        { outpoint: `${HEX64_RECEIPT}:2`, ownerPkh: HEX40_OTHER, ratesPkh: HEX40 },
      ],
      at: '2026-09-27T15:58:00.000Z',
      roles: ['client', 'rider'],
    },
  ],
};

writeFileSync(join(DIR, 'repid-state.json'), JSON.stringify(LEGACY_STATE), 'utf8');

let server;

async function waitUp(attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/wallets`);
      if (res.ok) return;
    } catch { /* server is not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('The persistence conformance server did not respond');
}

async function api(method, p, body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

function persistedFacts() {
  return JSON.parse(readFileSync(join(DIR, 'repid-state.json'), 'utf8')).facts ?? [];
}

beforeAll(async () => {
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), REPID_DATA_DIR: DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitUp();
}, 30_000);

afterAll(() => {
  if (server) server.kill();
  rmSync(DIR, { recursive: true, force: true });
});

describe('persisted facts are schema-conformant (annotations are not facts)', () => {
  it('migrates the legacy annotations out of the fact on load', async () => {
    // Reading and re-writing the state is what proves the migration persists:
    // saving a criterion calls persistState() without touching the network.
    const saved = await api('PUT', '/api/interpret-configs/e2e-persist', {
      params: { signals: { ratings: { enabled: true, weight: 1 } }, antiSybil: false },
    });
    expect(saved.status).toBe(200);

    const facts = persistedFacts();
    expect(facts).toHaveLength(2);

    for (const fact of facts) {
      for (const key of Object.keys(fact)) {
        expect(
          ALLOWED_FACT_KEYS.has(key),
          `"${key}" is not a property of any fact shape in the protocol schema`,
        ).toBe(true);
      }
      expect(fact).not.toHaveProperty('at');
      expect(fact).not.toHaveProperty('roles');
    }
  });

  it('keeps the annotations in their own state key, keyed by txid', async () => {
    const state = JSON.parse(readFileSync(join(DIR, 'repid-state.json'), 'utf8'));
    const annotations = new Map(state.factAnnotations ?? []);

    expect(annotations.get(HEX64)?.at).toBe('2026-09-27T15:57:20.736Z');
    expect(annotations.get(HEX64_RECEIPT)?.roles).toEqual(['client', 'rider']);
    expect(annotations.get(HEX64_RECEIPT)?.at).toBe('2026-09-27T15:58:00.000Z');
  });

  it('still hands the annotations to the console as a view', async () => {
    const res = await api('GET', '/api/facts');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const [identity, receipt] = res.body;
    expect(identity.at).toBe('2026-09-27T15:57:20.736Z');
    expect(receipt.at).toBe('2026-09-27T15:58:00.000Z');
    expect(receipt.roles).toEqual(['client', 'rider']);
  });
});
