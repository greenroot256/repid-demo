// RepID — prototype server
//
// Indexer interpretation layer for reputation (constitution.md, Article 1):
// the blockchain stores immutable facts and this module is the off-chain
// criterion that aggregates them. It is not protocol code: it is the
// *interpretation* that an indexer makes of the facts.
//
// Conceptual model (SPEC-007):
//   - Reputation: the average star rating (1–5) of the VALID received
//     ratings. It is a SINGLE, INVARIANT number: it does not change with the
//     indexer's criterion, with anti-sybil, or with any signal. No ratings →
//     "no stars yet" (null). Trust votes do not add stars.
//   - Confidence Index (CI): a 0..1 number for the profile that THIS indexer
//     computes by weighting on-chain signals of its own choosing. It is a
//     SEPARATE figure: it does not modify the reputation. A low CI does not
//     invalidate stars or facts: it is the indexer's local interpretation.
//
// Signals available today (data the indexer already reads from the chain):
//   collateral      identity vault sats                      → min(sats/1000, 1)
//   tenure          days since genesis (`at` of the fact)   → min(days/90, 1)
//   confirmed       ratings on confirmed Receipts            → min(n/3, 1)
//   endorsements    valid TRUST_LINKs received              → min(n/2, 1)
//   ratings         valid ratings received                  → min(n/5, 1)
//
// Each signal is toggled (enabled) and weighted (weight 0–1). The indexer's
// criterion = the set of signals with their weights + the antiSybil toggle.
// CI = round2( Σ(signal·weight) / Σ(weight) ). No weighted signals → null.
// The thresholds (1000 sats, 90 days, 3, 2, 5) are the demo indexer's choice
// (SPEC-007 §5), not protocol values.
//
// Anti-sybil: when active, ratings from wallets WITHOUT an Identity are
// excluded from the CI calculation (they contribute no evidence to the
// `confirmed`/`ratings` signals), but THEIR STARS DO remain in the
// reputation (the average does not change).
//
// Every fact with `valid: false` (self-trust, confirmations of unknown
// Receipts, out-of-range scores) is left out of the calculation and
// contributes no stars or evidence.

export const SIGNAL_KEYS = Object.freeze(['collateral', 'tenure', 'confirmed', 'endorsements', 'ratings']);

export const SIGNAL_SCHEMA = Object.freeze({
  collateral: { label: 'Identity collateral', threshold: 1000, unit: 'sats' },
  tenure: { label: 'Identity age', threshold: 90, unit: 'days' },
  confirmed: { label: 'Validated interactions', threshold: 3, unit: 'confirmed' },
  endorsements: { label: 'Trust endorsements', threshold: 2, unit: 'endorsements' },
  ratings: { label: 'Ratings received', threshold: 5, unit: 'ratings' },
});

export const DEFAULT_PARAMS = Object.freeze({
  signals: Object.freeze(Object.fromEntries(
    SIGNAL_KEYS.map((key) => [key, Object.freeze({ enabled: true, weight: 1 })]),
  )),
  antiSybil: false,
});

function numParam(raw, fallback, min, max) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid parameter: ${String(raw)}`);
  return Math.min(max, Math.max(min, n));
}

function boolParam(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  return raw === true || String(raw) === '1' || String(raw) === 'true';
}

// Validates and completes the received parameters (from query/body) against
// the defaults. Throws Error if any value is not numeric. Configs saved with
// the previous schema (useVerification/ciUnverified/…) are recomposed to the
// defaults: unknown keys are discarded.
export function normalizeParams(raw = {}) {
  const src = raw ?? {};
  const rawSignals = src.signals ?? {};
  const signals = {};
  for (const key of SIGNAL_KEYS) {
    const s = rawSignals[key] ?? {};
    signals[key] = {
      enabled: boolParam(s.enabled, DEFAULT_PARAMS.signals[key].enabled),
      weight: numParam(s.weight, DEFAULT_PARAMS.signals[key].weight, 0, 1),
    };
  }
  return {
    signals,
    antiSybil: boolParam(src.antiSybil, DEFAULT_PARAMS.antiSybil),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function dateToDaysAgo(value) {
  const t = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

// `identitySource`: iterable of pkhs with an active Identity, or Map pkh →
// identity fact (with `collateral` and `at`) — the server passes
// `identitiesByPkh`.
function identityFacts(identitySource, pkh) {
  if (!identitySource) return null;
  if (identitySource instanceof Map) return identitySource.get(pkh) ?? null;
  return [...identitySource].includes(pkh) ? {} : null;
}

// Interprets the reputation and Confidence Index of `pkh` over the indexer's
// fact list (SPEC-007). `rawParams` defines the signal criterion.
export function interpretReputation(facts, identitySource, pkh, rawParams = {}) {
  const params = normalizeParams(rawParams);
  const self = identityFacts(identitySource, pkh);
  const identities = new Set(
    identitySource
      ? identitySource instanceof Map
        ? identitySource.keys()
        : identitySource
      : [],
  );

  // Receipts confirmed by a platform (valid and known fact).
  const confirmedReceipts = new Set();
  for (const f of facts) {
    if (f.type === 'PLATFORM_CONFIRMATION' && f.valid) confirmedReceipts.add(f.receiptTxid);
  }

  // Valid ratings received by `pkh`. A rating's `spentOutpoint` is
  // `<receiptTxid>:<vout>`: the originating Receipt is derived from it.
  const ratings = [];
  for (const f of facts) {
    if (f.type !== 'RATING_ISSUED' || f.rateePkh !== pkh || !f.valid) continue;
    const receiptTxid = (f.spentOutpoint || '').split(':')[0] || null;
    ratings.push({ f, receiptTxid, confirmed: confirmedReceipts.has(receiptTxid) });
  }

  const trustLinks = facts.filter(
    (f) => f.type === 'TRUST_LINK' && f.trustedPkh === pkh && f.valid,
  );

  // Reputation: star average, ALWAYS the same (all valid ratings).
  const reputation = ratings.length
    ? round2(ratings.reduce((s, r) => s + r.f.score, 0) / ratings.length)
    : null;

  // Raw counts (without anti-sybil filter) for the data panel.
  const confirmedRatings = ratings.filter((r) => r.confirmed).length;
  const excludedFromCi = params.antiSybil
    ? ratings.filter((r) => !identities.has(r.f.raterPkh)).length
    : 0;

  // The identity fact in the `identitiesByPkh` Map has no `at` (the server
  // only adds it to the copy in `facts`): we look it up here for the age
  // signal.
  const identityAt = (() => {
    if (!self) return null;
    if (self.at) return self.at;
    const fact = facts.find((f) => f.type === 'IDENTITY_GENESIS' && f.txid === self.txid);
    return fact ? fact.at : null;
  })();
  const collateralSats = (() => {
    const raw = self?.collateral;
    if (raw === undefined || raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  const ageDays = self ? dateToDaysAgo(identityAt) : 0;
  const hasIdentity = identities.has(pkh);

  // Signals → [0,1]. Anti-sybil filters the ratings of wallets without an
  // Identity ONLY from the evidence contributed to the CI (stars do not change).
  const signalCounts = {
    collateral: collateralSats ?? 0,
    tenure: ageDays,
    confirmed: params.antiSybil
      ? ratings.filter((r) => r.confirmed && identities.has(r.f.raterPkh)).length
      : confirmedRatings,
    endorsements: trustLinks.length,
    ratings: params.antiSybil
      ? ratings.filter((r) => identities.has(r.f.raterPkh)).length
      : ratings.length,
  };

  const signalValues = {};
  for (const key of SIGNAL_KEYS) {
    const { threshold } = SIGNAL_SCHEMA[key];
    signalValues[key] = Math.min(signalCounts[key] / threshold, 1);
  }

  let weightedSum = 0;
  let weightSum = 0;
  const ciSignals = SIGNAL_KEYS.map((key) => {
    const { enabled, weight } = params.signals[key];
    const { label, unit, threshold } = SIGNAL_SCHEMA[key];
    const value = round2(enabled && weight > 0 ? signalValues[key] : 0);
    const contribution = weight > 0 ? round2(value * weight) : 0;
    if (enabled && weight > 0) {
      weightedSum += contribution;
      weightSum += weight;
    }
    return {
      key, label,
      enabled,
      weight,
      threshold,
      unit,
      count: signalCounts[key],
      value,
      contribution,
    };
  });

  const ci = weightSum > 0 ? round2(weightedSum / weightSum) : null;

  const evidence = [];
  for (const { f, receiptTxid, confirmed } of ratings) {
    evidence.push({
      kind: 'rating',
      score: f.score,
      counterpartyPkh: f.raterPkh,
      txid: f.txid,
      receiptTxid,
      confirmed,
      feedsSignals: ['confirmed', 'ratings'],
      asEvidence: !(params.antiSybil && !identities.has(f.raterPkh)),
    });
  }
  for (const t of trustLinks) {
    evidence.push({
      kind: 'trust',
      counterpartyPkh: t.trusterPkh,
      txid: t.txid,
      feedsSignals: ['endorsements'],
      asEvidence: true,
    });
  }
  if (self) {
    evidence.push({
      kind: 'identity',
      txid: self.txid ?? null,
      collateral: collateralSats,
      ageDays,
      feedsSignals: ['collateral', 'tenure'],
      asEvidence: true,
    });
  }

  return {
    pkh,
    params,
    hasIdentity,
    reputation,
    reputationCount: ratings.length,
    ci,
    ciModel: {
      applied: weightSum > 0,
      antiSybil: params.antiSybil,
      signals: ciSignals,
    },
    signals: {
      ratings: ratings.length,
      confirmedRatings,
      trustLinks: trustLinks.length,
      collateralSats,
      ageDays,
      excludedFromCi,
    },
    evidence,
  };
}