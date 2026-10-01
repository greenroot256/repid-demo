import { describe, it, expect } from 'vitest';
import { interpretReputation, normalizeParams, DEFAULT_PARAMS, SIGNAL_KEYS } from '../server/reputation.mjs';

// Tests for the off-chain interpretation layer ("Indexer" page). Conceptual
// model (SPEC-007):
//   - Reputation: the average star rating (1–5) of the VALID received ratings.
//     It is a SINGLE, INVARIANT number: it does not change with the indexer's
//     criterion, with anti-sybil, nor with any signal. No ratings → "no stars
//     yet".
//   - Confidence Index (CI): a 0..1 number of the profile that THIS indexer
//     computes by weighting on-chain signals of its own choosing (collateral,
//     tenure, validated interactions, endorsements, ratings). It is a SEPARATE
//     number that does not modify the reputation: local indexer interpretation,
//     not protocol.

const A = 'aa'.repeat(20);
const B = 'bb'.repeat(20);
const C = 'cc'.repeat(20);
const P = '00'.repeat(20);

let counter = 0;
function newTxid() {
  counter += 1;
  return counter.toString(16).padStart(64, '0');
}

function ratingFact(rateePkh, raterPkh, score, receiptTxid, valid = true) {
  return {
    type: 'RATING_ISSUED',
    txid: newTxid(),
    spentOutpoint: `${receiptTxid}:1`,
    raterPkh, rateePkh, score, valid,
  };
}

function confirmationFact(receiptTxid, valid = true) {
  return { type: 'PLATFORM_CONFIRMATION', txid: newTxid(), platformPkh: A, receiptTxid, valid };
}

function trustFact(trusterPkh, trustedPkh, valid = true) {
  return { type: 'TRUST_LINK', txid: newTxid(), trusterPkh, trustedPkh, valid };
}

function genesisFact(txid, at) {
  return { type: 'IDENTITY_GENESIS', txid, at };
}

const append = (keys, weight = 1) => {
  const signals = {};
  for (const key of SIGNAL_KEYS) signals[key] = { enabled: keys.includes(key) ? '1' : '0', weight };
  return { signals };
};

describe('normalizeParams', () => {
  it('returns the defaults without parameters', () => {
    expect(normalizeParams({})).toEqual(DEFAULT_PARAMS);
  });

  it('requires numeric weights', () => {
    expect(() => normalizeParams({ signals: { collateral: { weight: 'abc' } } })).toThrow();
    expect(() => normalizeParams({ signals: { endorsements: { weight: '' } } })).not.toThrow();
  });

  it('clamps out-of-range weights (0–1)', () => {
    const p = normalizeParams({ signals: { collateral: { weight: '2' }, endorsements: { weight: '-3' } } });
    expect(p.signals.collateral.weight).toBe(1);
    expect(p.signals.endorsements.weight).toBe(0);
  });

  it('parses booleans and discards unknown keys', () => {
    const p = normalizeParams({ mode: 'magic', antiSybil: '1', signals: { collateral: { enabled: '0' } } });
    expect(p.antiSybil).toBe(true);
    expect(p.signals.collateral.enabled).toBe(false);
    expect('mode' in p).toBe(false);
  });

  it('legacy-schema configs are recomposed to the defaults', () => {
    const legacy = { useVerification: '0', ciUnverified: 0.5, useTrust: '1', trustBaseScore: 4, ciTrust: 0.5, minRaterIdentity: '1' };
    expect(normalizeParams(legacy)).toEqual(DEFAULT_PARAMS);
  });
});

describe('Reputation: invariant, independent of the criterion', () => {
  it('the star average does not change even though the criterion does', () => {
    const rx1 = newTxid();
    const rx2 = newTxid();
    const facts = [ratingFact(P, A, 5, rx1), ratingFact(P, B, 3, rx2)];
    const strict = interpretReputation(facts, [A, B], P, append(['collateral']));
    const flexible = interpretReputation(facts, [A, B], P, append(['ratings', 'tenure'], 0.5));
    expect(strict.reputation).toBe(4);
    expect(flexible.reputation).toBe(4);
    expect(strict.ci).not.toBe(flexible.ci);
    expect(strict.ciModel.applied).toBe(true);
  });

  it('without ratings the result is "no stars yet" (reputation null)', () => {
    const res = interpretReputation([], [], P, append([]));
    expect(res.reputation).toBeNull();
    expect(res.reputationCount).toBe(0);
  });

  it('invalid facts add no stars nor evidence', () => {
    const rx = newTxid();
    const facts = [
      ratingFact(P, A, 5, rx, false),
      trustFact(A, P, false),
      confirmationFact(rx, false),
    ];
    const res = interpretReputation(facts, [A], P, append(['ratings', 'endorsements']));
    expect(res.reputation).toBeNull();
    expect(res.signals.ratings).toBe(0);
    expect(res.signals.trustLinks).toBe(0);
    expect(res.signals.confirmedRatings).toBe(0);
  });

  it('cold start: no stars yet, the CI can come from endorsements (SPEC-006)', () => {
    const res = interpretReputation([trustFact(C, P, true)], [C], P, append(['endorsements']));
    expect(res.reputation).toBeNull();
    expect(res.signals.trustLinks).toBe(1);
    expect(res.ci).toBe(0.5); // min(1 endorsement / 2, 1)
  });
});

describe('Confidence Index signals', () => {
  it('collateral: vault sats → min(sats/1000, 1)', () => {
    const base = { txid: newTxid(), collateral: '2000' };
    expect(interpretReputation([], new Map([[P, base]]), P, append(['collateral'])).ci).toBe(1);
    const half = { txid: newTxid(), collateral: '500' };
    expect(interpretReputation([], new Map([[P, half]]), P, append(['collateral'])).ci).toBe(0.5);
    const noVault = interpretReputation([], [P], P, append(['collateral'])); // iterable ≠ Map: no fact
    expect(noVault.ci).toBe(0);
  });

  it('tenure: days since genesis → min(days/90, 1), with fallback to the fact', () => {
    const gen = genesisFact(newTxid(), new Date(Date.now() - 45 * 86_400_000).toISOString());
    const map = new Map([[P, { txid: gen.txid, collateral: '1000' }]]); // no `at`: looked up in facts
    const res = interpretReputation([gen], map, P, append(['tenure']));
    expect(res.ci).toBe(0.5);
    expect(res.signals.ageDays).toBe(45);
  });

  it('confirmed: ratings on confirmed Receipts → min(n/3, 1)', () => {
    const rx = newTxid();
    const rx2 = newTxid();
    const rx3 = newTxid();
    const rx4 = newTxid();
    const facts = [
      ratingFact(P, A, 5, rx), ratingFact(P, A, 5, rx2), ratingFact(P, A, 5, rx3),
      confirmationFact(rx), confirmationFact(rx2), confirmationFact(rx3),
      ratingFact(P, B, 1, rx4),
    ];
    const res = interpretReputation(facts, [A, B], P, append(['confirmed']));
    expect(res.signals.confirmedRatings).toBe(3);
    expect(res.ci).toBe(1);
    const onlyOpen = interpretReputation([ratingFact(P, B, 1, rx4)], [B], P, append(['confirmed']));
    expect(onlyOpen.ci).toBe(0);
    expect(onlyOpen.reputation).toBe(1); // the star stays
  });

  it('endorsements: received TRUST_LINKs → min(n/2, 1)', () => {
    const two = interpretReputation([trustFact(A, P), trustFact(B, P)], [A, B], P, append(['endorsements']));
    expect(two.ci).toBe(1);
    const one = interpretReputation([trustFact(A, P)], [A], P, append(['endorsements']));
    expect(one.ci).toBe(0.5);
  });

  it('ratings: total valid ratings received → min(n/5, 1)', () => {
    const facts = [1, 2, 3, 4, 5].map((s) => ratingFact(P, A, s < 3 ? 5 : 3, newTxid()));
    const res = interpretReputation(facts, [A], P, append(['ratings']));
    expect(res.signals.ratings).toBe(5);
    expect(res.ci).toBe(1);
    expect(interpretReputation(facts.slice(0, 2), [A], P, append(['ratings'])).ci).toBe(0.4);
  });
});

describe('Composite CI and weights', () => {
  it('CI = Σ(signal × weight) / Σ(weight)', () => {
    const gen = genesisFact(newTxid(), new Date(Date.now() - 45 * 86_400_000).toISOString());
    const rx1 = newTxid(), rx2 = newTxid(), rx3 = newTxid(), rx4 = newTxid(), rx5 = newTxid();
    const facts = [
      gen,
      ratingFact(P, A, 5, rx1), ratingFact(P, A, 5, rx2), ratingFact(P, A, 5, rx3),
      ratingFact(P, A, 4, rx4), ratingFact(P, A, 4, rx5),
      confirmationFact(rx1), confirmationFact(rx2), confirmationFact(rx3),
      trustFact(C, P),
    ];
    const map = new Map([[P, { txid: gen.txid, collateral: '2000' }]]);
    const params = {
      signals: {
        collateral: { enabled: '1', weight: 1 },     // value 1.0  (2000 collateral)
        tenure: { enabled: '1', weight: 0.5 },       // value 0.5  (45 days)
        confirmed: { enabled: '1', weight: 0.25 },   // value 1.0  (3 confirmed)
        endorsements: { enabled: '1', weight: 0.2 }, // value 0.5  (1 endorsement / 2)
        ratings: { enabled: '1', weight: 0.1 },      // value 1.0  (5 ratings)
      },
    };
    const res = interpretReputation(facts, map, P, params);
    // (1·1 + 0.5·0.5 + 1·0.25 + 0.5·0.2 + 1·0.1) / (1 + 0.5 + 0.25 + 0.2 + 0.1)
    // = 1.7 / 2.05 = 0.829... → 0.83
    expect(res.reputation).toBe(4.6); // (5+5+5+4+4)/5 — the stars are untouched
    expect(res.ci).toBe(0.83);
    const collateral = res.ciModel.signals.find((s) => s.key === 'collateral');
    expect(collateral.contribution).toBe(1);
    const tenure = res.ciModel.signals.find((s) => s.key === 'tenure');
    expect(tenure.contribution).toBe(0.25);
    expect(res.ciModel.applied).toBe(true);
  });

  it('a signal with weight 0 or disabled contributes nothing to the CI', () => {
    const rx = newTxid();
    const res = interpretReputation(
      [ratingFact(P, A, 5, rx), trustFact(C, P, true)],
      new Map([[P, { txid: newTxid(), collateral: '2000' }]]),
      P,
      {
        signals: {
          collateral: { enabled: '1', weight: 0 }, // there is collateral but weight 0
          tenure: { enabled: '1', weight: 0 },
          confirmed: { enabled: '1', weight: 0 },
          ratings: { enabled: '0', weight: 1 },    // disabled
          endorsements: { enabled: '1', weight: 1 }, // only with weight: 1 endorsement → 0.5
        },
      },
    );
    expect(res.ci).toBe(0.5);
    expect(res.reputation).toBe(5); // invariant
    const collateral = res.ciModel.signals.find((s) => s.key === 'collateral');
    expect(collateral.value).toBe(0); // weight 0 → the signal is nullified even with data
    expect(collateral.contribution).toBe(0);
    const ratings = res.ciModel.signals.find((s) => s.key === 'ratings');
    expect(ratings.enabled).toBe(false);
    expect(ratings.contribution).toBe(0);
  });

  it('with no weighted signal the CI stays undefined (applied false)', () => {
    const rx = newTxid();
    const res = interpretReputation(
      [ratingFact(P, A, 5, rx)],
      [A], P,
      {
        signals: {
          collateral: { enabled: '1', weight: 0 },
          tenure: { enabled: '1', weight: 0 },
          confirmed: { enabled: '1', weight: 0 },
          endorsements: { enabled: '1', weight: 0 },
          ratings: { enabled: '0', weight: 1 },
        },
      },
    );
    expect(res.ci).toBeNull();
    expect(res.ciModel.applied).toBe(false);
    expect(res.reputation).toBe(5);
  });
});

describe('Anti-sybil: excludes from the CI, never from the stars', () => {
  it('ratings without Identity leave the CI evidence but their stars stay', () => {
    const rx1 = newTxid();
    const rx2 = newTxid();
    const facts = [ratingFact(P, A, 5, rx1), ratingFact(P, C, 1, rx2)];
    const res = interpretReputation(facts, [A], P, { ...append(['ratings']), antiSybil: '1' });
    expect(res.reputation).toBe(3); // (5 + 1) / 2 — the average does NOT change
    expect(res.reputationCount).toBe(2);
    expect(res.signals.excludedFromCi).toBe(1);
    expect(res.ciModel.antiSybil).toBe(true);
    expect(res.ciModel.signals.find((s) => s.key === 'ratings').count).toBe(1);
    expect(res.ci).toBe(0.2); // only the rating with identity qualifies
  });

  it('marks the evidence: asEvidence false for the excluded rating', () => {
    const rx = newTxid();
    const res = interpretReputation(
      [ratingFact(P, A, 5, rx), ratingFact(P, C, 1, newTxid())],
      [A], P,
      { antiSybil: '1' },
    );
    const evidA = res.evidence.find((e) => e.kind === 'rating' && e.counterpartyPkh === A);
    const evidC = res.evidence.find((e) => e.kind === 'rating' && e.counterpartyPkh === C);
    expect(evidA.asEvidence).toBe(true);
    expect(evidC.asEvidence).toBe(false);
    expect(evidC.feedsSignals).toContain('ratings');
  });

  it('hasIdentity follows the source and does not mutate the indexed facts', () => {
    const rx = newTxid();
    const fact = ratingFact(P, A, 5, rx);
    const snapshot = JSON.parse(JSON.stringify(fact));
    const res = interpretReputation([fact], new Map([[P, { txid: newTxid(), collateral: '1000' }]]), P, append(['collateral']));
    expect(res.hasIdentity).toBe(true);
    expect(res.evidence.some((e) => e.kind === 'identity')).toBe(true);
    expect(interpretReputation([fact], [A], P, append([])).hasIdentity).toBe(false);
    expect(fact).toEqual(snapshot);
  });
});