const state = {
  wallets: [],
  ratingRights: [],
  interactions: [],
  network: 'chipnet',
  primaryPkh: null,
  interpretConfigs: [],
};

const toastEl = document.getElementById('toast');
function showToast(message, kind) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', kind === 'error');
  toastEl.classList.toggle('success', kind === 'success');
  toastEl.classList.add('visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('visible'), 4000);
}
function showError(message) { showToast(message, 'error'); }
function showSuccess(message) { showToast(message, 'success'); }

const themeToggle = document.querySelector('.theme-toggle');
const themeLabel = document.getElementById('theme-label');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeLabel.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  try { localStorage.setItem('repid-theme', theme); } catch (e) {}
}
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});
applyTheme(document.documentElement.dataset.theme || 'dark');

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

function short(hex) {
  if (!hex) return '';
  return hex.length > 16 ? `${hex.slice(0, 8)}…${hex.slice(-6)}` : hex;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function walletListItem(w, extra = '') {
  return `<li>
    <span class="wallet-item">
      ${w.isPrimary ? '<span class="primary-star" title="Primary wallet">★</span>' : ''}
      <code class="wallet-key">${short(w.pkh)}</code>
      ${w.name ? `<span class="wallet-alias">${escapeHtml(w.name)}</span>` : ''}
    </span>
    ${extra}
    <label class="wallet-rename">
      <input class="wallet-name-input" data-name-input="${w.pkh}" value="${escapeHtml(w.name ?? '')}" placeholder="alias…" maxlength="24" />
      <button class="mini accent" data-action="set-wallet-name" data-pkh="${w.pkh}">Save</button>
    </label>
    <button class="mini" data-action="check-balance" data-pkh="${w.pkh}">Balance</button>
  </li>`;
}

function walletLabel(pkh) {
  const match = state.wallets.find((w) => w.pkh === pkh);
  return match?.name || short(pkh);
}

// --- Data loading and render --------------------------------------------

function formatSats(n) {
  return `${Number(n).toLocaleString('es-AR')} sat`;
}

async function loadWallets() {
  state.wallets = await api('/api/wallets');
  state.primaryPkh = state.wallets.find((w) => w.isPrimary)?.pkh ?? null;

  const list = document.getElementById('wallet-list');
  list.innerHTML = state.wallets.length
    ? state.wallets.map((w) => walletListItem(w)).join('')
    : '<li>No wallets yet.</li>';

  const options = state.wallets
    .map((w) => `<option value="${w.pkh}">${walletLabel(w.pkh)}${w.isPrimary ? ' ★' : ''}</option>`)
    .join('');
  for (const id of ['identity-owner', 'interaction-party-a', 'interaction-party-b', 'platform-pkh', 'trust-trust', 'trust-trusted', 'reputation-pkh', 'app-client', 'app-rider', 'app-platform', 'app-trust-voter', 'transfer-from', 'transfer-to', 'primary-select', 'interpret-pkh', 'ident-mint-wallet']) {
    const select = document.getElementById(id);
    const previous = select.value;
    select.innerHTML = options || '<option value="">— create a wallet first —</option>';
    if ([...select.options].some((o) => o.value === previous)) select.value = previous;
  }
  syncTrustTarget();
}

async function loadRatingRights() {
  state.ratingRights = await api('/api/rating-rights');
  const select = document.getElementById('rating-right');
  select.innerHTML = state.ratingRights.length
    ? state.ratingRights
      .map((rr) => `<option value="${rr.outpoint}">${walletLabel(rr.ownerPkh)} → ${walletLabel(rr.ratesPkh)}</option>`)
      .join('')
    : '<option value="">— no Rating Rights available —</option>';
}

const FACT_LABELS = {
  IDENTITY_GENESIS: 'Identity minted',
  IDENTITY_COLLATERAL_TOP_UP: 'Collateral increased',
  IDENTITY_BURNED: 'Identity burned',
  RECEIPT_GENESIS: 'Interaction recorded',
  RATING_ISSUED: 'Rating issued',
  PLATFORM_CONFIRMATION: 'Interaction confirmed',
  TRUST_LINK: 'Trust declared',
};

function renderFact(fact) {
  const time = new Date(fact.at).toLocaleTimeString();
  let detail = '';
  if (fact.type === 'IDENTITY_GENESIS') {
    detail = `owner=${walletLabel(fact.ownerPkh)} category=${short(fact.identityCategory)}${fact.collateral ? ` · collateral=${fact.collateral} sats` : ''}`;
  } else if (fact.type === 'IDENTITY_COLLATERAL_TOP_UP') {
    detail = `owner=${walletLabel(fact.ownerPkh)} · collateral ${fact.previousCollateral} → ${fact.collateral} sats${fact.valid ? '' : ' · INVALID'}`;
  } else if (fact.type === 'IDENTITY_BURNED') {
    detail = `owner=${walletLabel(fact.ownerPkh)} · collateral returned`;
  } else if (fact.type === 'RECEIPT_GENESIS') {
    const [a, b] = fact.ratingRights;
    detail = `${walletLabel(a.ownerPkh)} ⇄ ${walletLabel(b.ownerPkh)} · category=${short(fact.receiptCategory)}`;
  } else if (fact.type === 'RATING_ISSUED') {
    detail = `${walletLabel(fact.raterPkh)} → ${walletLabel(fact.rateePkh)} · score=${fact.score}`;
  } else if (fact.type === 'PLATFORM_CONFIRMATION') {
    detail = `${walletLabel(fact.platformPkh)} corroborated ${short(fact.receiptTxid)}${fact.valid ? '' : ' · INVALID'}`;
  } else if (fact.type === 'TRUST_LINK') {
    detail = `${walletLabel(fact.trusterPkh)} trusts ${walletLabel(fact.trustedPkh)}${fact.valid ? '' : ' · INVALID (self-trust)'}`;
  }
  return `<li>
    <span class="fact-dot ${fact.type}"></span>
    <span class="fact-time">${time}</span>
    <span class="fact-body">
      <strong>${FACT_LABELS[fact.type] || fact.type}</strong>
      <span class="fact-data">${detail}</span>
      <span class="fact-data">tx=${short(fact.txid)}</span>
    </span>
  </li>`;
}

async function loadFacts() {
  const facts = await api('/api/facts');
  const log = document.getElementById('fact-log');
  log.innerHTML = facts.length
    ? facts.slice().reverse().map(renderFact).join('')
    : '<li class="fact-empty">No facts yet. Create a wallet to start.</li>';
}

async function loadInteractions() {
  state.interactions = await api('/api/interactions');
  const select = document.getElementById('platform-receipt');
  select.innerHTML = state.interactions.length
    ? state.interactions
      .map((fact) => {
        const [a, b] = fact.ratingRights ?? [];
        return `<option value="${fact.txid}">${walletLabel(a?.ownerPkh)} ⇄ ${walletLabel(b?.ownerPkh)} · ${short(fact.txid)}</option>`;
      })
      .join('')
    : '<option value="">— no interactions recorded —</option>';
}

async function refreshAll() {
  await loadWallets();
  await loadRatingRights();
  await loadInteractions();
  await loadFacts();
  await loadIndexerView();
  await loadInterpretConfigs();
}

// --- Indexer view --------------------------------------------------------

const RAW_LABELS = { ...FACT_LABELS };

function renderRawTx(tx) {
  const recognized = tx.factType !== null;
  const size = Math.floor(tx.hex.length / 2);
  const label = recognized ? (RAW_LABELS[tx.factType] || tx.factType) : 'Discarded (not RepID)';
  const time = new Date(tx.at).toLocaleTimeString();
  return `<li>
    <details class="raw-tx">
      <summary>
        <span class="raw-badge ${recognized ? 'ok' : 'no'}">${recognized ? 'Recognized' : 'Discarded'}</span>
        <span class="raw-status pending" data-txid="${tx.txid}" data-status="unknown">…</span>
        <span class="fact-time">${time}</span>
        <strong>${label}${recognized ? '' : ''}</strong>
        <span class="fact-data">tx=${short(tx.txid)} · ${size} bytes</span>
      </summary>
      <pre class="raw-hex">${tx.hex}</pre>
    </details>
  </li>`;
}

async function checkTxStatuses(transactions) {
  for (const tx of transactions) {
    const el = document.querySelector(`[data-txid="${tx.txid}"]`);
    if (!el) continue;
    try {
      const status = await api(`/api/tx/${tx.txid}/status`);
      const label = status.confirmed
        ? `confirmed${status.blockHeight ? ` · block ${status.blockHeight}` : ''}`
        : 'in mempool';
      el.textContent = label;
      el.dataset.status = status.confirmed ? 'confirmed' : 'pending';
    } catch {
      el.textContent = 'status unavailable';
    }
  }
}

async function loadIndexerView() {
  const view = await api('/api/indexer-view');
  const feed = document.getElementById('raw-feed');
  feed.innerHTML = view.transactions.length
    ? view.transactions.map(renderRawTx).join('')
    : '<li class="fact-empty">No transaction has arrived yet.</li>';
  await checkTxStatuses(view.transactions);

  const rrList = document.getElementById('indexer-rating-rights');
  rrList.innerHTML = view.stores.ratingRights.length
    ? view.stores.ratingRights.map(([outpoint, info]) => `<li><code>${outpoint}</code> → owner=${walletLabel(info.ownerPkh)} rates=${walletLabel(info.ratesPkh)}</li>`).join('')
    : '<li>None.</li>';

  const receiptsList = document.getElementById('indexer-receipts');
  receiptsList.innerHTML = view.stores.receipts.length
    ? view.stores.receipts.map(([txid, info]) => `<li><code>${short(txid)}</code> → owner=${walletLabel(info.receiptOwnerPkh)}</li>`).join('')
    : '<li>None.</li>';

  const identitiesList = document.getElementById('indexer-identities');
  identitiesList.innerHTML = view.stores.identities.length
    ? view.stores.identities.map(([outpoint, info]) => `<li><code>${short(outpoint)}</code> → owner=${walletLabel(info.ownerPkh)} · collateral=${info.collateral ?? '—'} sats</li>`).join('')
    : '<li>None.</li>';

  document.getElementById('indexer-store-file').textContent = `Persisted in: ${view.storeFile} (data/ folder).`;
}

// --- Identities view (RFC-001, the covenant vault "bank account") --------
//
// The "Identities" tab is the identity interpretation layer: it shows the
// active identity NFTs (their owners, category, current collateral, genesis
// tx and age) and the burned identities (burned NFT, returned collateral and
// burn tx). It does NOT show reputation nor CI: that lives in the Reputation
// / Interpretation tab.

const identValidatorsByOwner = new Map();
const identFilterState = { value: '' };
let lastActiveIdentities = [];

// An identity is "validated" by those who issued it a trust declaration
// (endorsement): valid TRUST_LINK (self-trust is marked invalid).
function buildIdentityValidators(facts) {
  const map = new Map();
  for (const f of facts || []) {
    if (f.type !== 'TRUST_LINK' || !f.valid) continue;
    const list = map.get(f.trustedPkh);
    if (list) {
      if (!list.some((v) => v.pkh === f.trusterPkh)) list.push({ pkh: f.trusterPkh, txid: f.txid });
    } else {
      map.set(f.trustedPkh, [{ pkh: f.trusterPkh, txid: f.txid }]);
    }
  }
  return map;
}

// Normalizes the filter tokens: 40-hex → pkh; otherwise tie-breaks against the
// full address of a known wallet. Returns a Set of pkhs.
function normalizeFilterAddresses(raw) {
  const set = new Set();
  for (const token of String(raw || '').split(/[\s,;\n]+/)) {
    const t = token.trim();
    if (!t) continue;
    if (/^[0-9a-fA-F]{40}$/.test(t)) {
      set.add(t.toLowerCase());
      continue;
    }
    const wallet = state.wallets.find((w) => w.address === t);
    if (wallet) set.add(wallet.pkh);
  }
  return set;
}

function renderActiveIdentities(identities) {
  lastActiveIdentities = identities;
  const filterSet = normalizeFilterAddresses(identFilterState.value);
  const list = document.getElementById('ident-active-list');
  const countEl = document.getElementById('ident-filter-count');
  const shown = filterSet.size
    ? identities.filter((id) => (identValidatorsByOwner.get(id.ownerPkh) || [])
        .some((v) => filterSet.has(v.pkh)))
    : identities;
  list.innerHTML = shown.length
    ? shown.map((id) => activeIdentityCard(id, identValidatorsByOwner.get(id.ownerPkh) || [])).join('')
    : identities.length
      ? '<li class="identity-empty">No active identity was validated by the given addresses.</li>'
      : '<li class="identity-empty">No active identities. Mint one with a wallet and collateral.</li>';
  countEl.textContent = filterSet.size
    ? `Showing ${shown.length} of ${identities.length} identities validated by the given addresses.`
    : '';
}

async function loadIdentitiesView() {
  identFilterState.value = document.getElementById('ident-filter-validator')?.value ?? '';
  const [identities, facts] = await Promise.all([
    api('/api/identities'),
    api('/api/facts'),
  ]);

  const walletSelect = document.getElementById('ident-mint-wallet');
  if (walletSelect) {
    walletSelect.innerHTML = state.wallets.length
      ? state.wallets
        .map((w) => `<option value="${w.pkh}">${walletLabel(w.pkh)}${walletLabel(w.pkh) ? '' : ''}</option>`)
        .join('')
      : '<option value="">— create a wallet first —</option>';
  }

  identValidatorsByOwner.clear();
  for (const [pkh, validators] of buildIdentityValidators(facts)) {
    identValidatorsByOwner.set(pkh, validators);
  }

  renderActiveIdentities(identities && identities.length ? identities : []);

  // The burn fact doesn't carry the returned collateral amount: it is rebuilt
  // from the last fact of that category (genesis or top-up). Facts come in
  // order, so the last write wins.
  const collateralByCategory = new Map();
  for (const f of facts || []) {
    const isIdentityCollateral = f.type === 'IDENTITY_GENESIS'
      || f.type === 'IDENTITY_COLLATERAL_TOP_UP';
    if (isIdentityCollateral && f.identityCategory && f.collateral != null) {
      collateralByCategory.set(f.identityCategory, f.collateral);
    }
  }

  const burned = (facts || []).filter((f) => f.type === 'IDENTITY_BURNED');
  const burnedList = document.getElementById('ident-burned-list');
  burnedList.innerHTML = burned.length
    ? burned.map((b) => burnedIdentityCard(b, collateralByCategory.get(b.identityCategory))).join('')
    : '<li class="identity-empty">No identity has been burned yet.</li>';
}

function activeIdentityCard(identity, validators = []) {
  const pkh = identity.ownerPkh;
  const age = identity.at ? ageLabel(new Date(identity.at)) : '';
  const validatorsText = validators.length
    ? `Validated by: ${validators.map((v) => `<strong>${escapeHtml(walletLabel(v.pkh))}</strong> <code>${short(v.pkh)}</code>`).join(' · ')}`
    : 'Not validated yet';
  return `<li class="identity-card active" data-pkh="${pkh}">
    <div class="identity-card-head">
      <span class="identity-badge active">ACTIVE</span>
      <strong>${walletLabel(pkh)}</strong>
      <code>${short(pkh)}</code>
    </div>
    <div class="identity-card-meta">
      <span>category <code>${short(identity.identityCategory)}</code></span>
      <span>collateral <strong>${Number(identity.collateral).toLocaleString('es-AR')}</strong> sats</span>
      <span>genesis <code>${short(identity.txid)}</code> · ${age}</span>
    </div>
    <div class="identity-card-validators">${validatorsText}</div>
    <div class="identity-card-actions">
      <label>Increase collateral
        <input type="number" class="identity-topup" min="1" value="1000" />
      </label>
      <button data-action="identities-increase-collateral" data-pkh="${pkh}">Increase</button>
      <button data-action="identities-burn" data-pkh="${pkh}" class="danger">Burn</button>
    </div>
  </li>`;
}

function burnedIdentityCard(identity, returnedCollateral) {
  const collateralText = returnedCollateral != null
    ? `<span>collateral returned <strong>${Number(returnedCollateral).toLocaleString('es-AR')}</strong> sats</span>`
    : '<span>collateral returned to wallet</span>';
  return `<li class="identity-card burned" data-pkh="${identity.ownerPkh}">
    <div class="identity-card-head">
      <span class="identity-badge burned">BURNED</span>
      <strong>${walletLabel(identity.ownerPkh)}</strong>
      <code>${short(identity.ownerPkh)}</code>
    </div>
    <div class="identity-card-meta">
      <span>category <code>${short(identity.identityCategory)}</code></span>
      ${collateralText}
      <span>burned <code>${short(identity.txid)}</code> · ${identity.at ? ageLabel(new Date(identity.at)) : ''}</span>
    </div>
  </li>`;
}

function ageLabel(date) {
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  return days <= 0 ? 'today' : `${days}d ago`;
}

// --- Reputation profile (off-chain interpretation) -----------------------

function distributionBars(distribution) {
  const max = Math.max(...Object.values(distribution), 1);
  return Object.entries(distribution).map(([score, count]) => {
    const pct = Math.round((count / max) * 100);
    return `<div class="dist-row">
      <span class="dist-score">${score}</span>
      <div class="dist-track"><div class="dist-fill" style="width:${pct}%"></div></div>
      <span class="dist-count">${count}</span>
    </div>`;
  }).join('');
}

function listItems(items, labelOf) {
  return items.map((it) => `<li>${labelOf(it)} · tx=${short(it.txid)}</li>`).join('');
}

function renderReputation(profile, cardId = 'reputation-card') {
  const card = document.getElementById(cardId);
  const n = profile.ratingsReceived.length;
  const identity = profile.hasIdentity
    ? `<li>Identity <strong>yes</strong> (tx=${short(profile.identityTxid)})${profile.collateral ? ` · collateral ${profile.collateral} sats` : ''}</li>`
    : '<li>Identity: <strong>no</strong> (wallet only)</li>';

  card.innerHTML = `
    <div class="rep-summary">
      <div>
        <span class="rep-label">average received</span>
        <span class="rep-avg">${profile.avg ?? '—'}</span>
        <span class="rep-label">from ${n} rating${n === 1 ? '' : 's'}</span>
      </div>
      <div>
        <span class="rep-label">trust received</span>
        <span class="rep-avg small">${profile.trustReceived.length}</span>
        <span class="rep-label">confirmed receipts</span>
        <span class="rep-avg small">${profile.confirmedReceipts.length}</span>
      </div>
    </div>
    <ul class="store-list">${identity}</ul>
    <h4>Distribution of received scores (1–5)</h4>
    <div class="dist">${distributionBars(profile.distribution)}</div>
    ${n ? `<h4>Received ratings (auditable)</h4><ul class="store-list">${listItems(profile.ratingsReceived, (r) => `score ${r.score} · from ${walletLabel(r.raterPkh)}`)}</ul>` : ''}
    ${profile.ratingsIssued.length ? `<h4>Issued ratings</h4><ul class="store-list">${listItems(profile.ratingsIssued, (r) => `score ${r.score} · to ${walletLabel(r.rateePkh)}`)}</ul>` : ''}
    ${profile.trustReceived.length ? `<h4>Who trusts this person</h4><ul class="store-list">${listItems(profile.trustReceived, (t) => `trusts them: ${walletLabel(t.trusterPkh)}`)}</ul>` : ''}
    ${profile.confirmedReceipts.length ? `<h4>Interactions confirmed by platform</h4><ul class="store-list">${listItems(profile.confirmedReceipts, (c) => `receipt ${short(c.receiptTxid)}`)}</ul>` : ''}
  `;
}

// --- Reputation criteria (Indexer page) ----------------------------------

const INTERPRET_SIGNALS = [
  { key: 'collateral', label: 'Identity collateral', desc: 'vault sats + collateral', unit: 'sats', threshold: 1000 },
  { key: 'tenure', label: 'Identity age', desc: 'days since genesis', unit: 'days', threshold: 90 },
  { key: 'confirmed', label: 'Validated interactions', desc: 'ratings over platform-confirmed Receipts', unit: 'conf.', threshold: 3 },
  { key: 'endorsements', label: 'Trust endorsements', desc: 'received TRUST_LINKs', unit: 'endorsements', threshold: 2 },
  { key: 'ratings', label: 'Ratings received', desc: 'total valid ratings received', unit: 'ratings', threshold: 5 },
];

const INTERPRET_DEFAULTS = {
  signals: Object.fromEntries(INTERPRET_SIGNALS.map(({ key }) => [key, { enabled: true, weight: 1 }])),
  antiSybil: false,
};

let interpretState = JSON.parse(JSON.stringify(INTERPRET_DEFAULTS));

function normalizeInterpret(params = INTERPRET_DEFAULTS) {
  const signals = {};
  for (const { key } of INTERPRET_SIGNALS) {
    const s = (params.signals && params.signals[key]) || {};
    signals[key] = {
      enabled: s.enabled === undefined ? INTERPRET_DEFAULTS.signals[key].enabled : Boolean(s.enabled),
      weight: Number(s.weight ?? INTERPRET_DEFAULTS.signals[key].weight),
    };
  }
  return { signals, antiSybil: params.antiSybil === undefined ? INTERPRET_DEFAULTS.antiSybil : Boolean(params.antiSybil) };
}

function interpretParams() {
  const signals = {};
  for (const { key } of INTERPRET_SIGNALS) {
    signals[key] = {
      enabled: interpretState.signals[key].enabled ? '1' : '0',
      weight: interpretState.signals[key].weight,
    };
  }
  return { signals, antiSybil: interpretState.antiSybil ? '1' : '0' };
}

function interpretQuery() {
  const p = interpretParams();
  const parts = [];
  for (const { key } of INTERPRET_SIGNALS) {
    parts.push(`signals[${key}][enabled]=${p.signals[key].enabled}`);
    parts.push(`signals[${key}][weight]=${p.signals[key].weight}`);
  }
  parts.push(`antiSybil=${p.antiSybil}`);
  return parts.join('&');
}

function renderSignalControls() {
  document.getElementById('interpret-criteria').innerHTML = INTERPRET_SIGNALS.map(({ key, label, desc, unit, threshold }) => `
    <label class="check param-row"><input type="checkbox" class="interpret-signal-toggle" data-signal="${key}" ${interpretState.signals[key].enabled ? 'checked' : ''} /> <strong>${label}</strong></label>
    <p class="hint indent">${desc} — signal 1.0 when it reaches ${threshold} ${unit}.</p>
  `).join('');
  renderWeights();
}

function renderWeights() {
  const el = document.getElementById('interpret-weights');
  const active = INTERPRET_SIGNALS.filter(({ key }) => interpretState.signals[key].enabled);
  if (!active.length) {
    el.innerHTML = '<p class="hint">Enable at least one signal in CRITERIA to fine-tune its weight.</p>';
    return;
  }
  el.innerHTML = active.map(({ key, label, unit, threshold }) => `
    <label class="param-row">Weight of "${label}"
      <input type="range" class="interpret-weight" data-signal="${key}" min="0" max="1" step="0.05" value="${interpretState.signals[key].weight}" />
      <output id="interpret-weight-output-${key}">${interpretState.signals[key].weight}</output>
    </label>
    <p class="hint indent">${threshold} ${unit} alone already give signal 1.0 on this metric.</p>
  `).join('');
}

function applyConfig(params = INTERPRET_DEFAULTS) {
  interpretState = normalizeInterpret(params);
  document.getElementById('interpret-anti-sybil').checked = interpretState.antiSybil;
  renderSignalControls();
}

function renderConfigList(configs) {
  const list = document.getElementById('interpret-config-list');
  list.innerHTML = configs.length
    ? configs.map((c) => `<li class="config-item ${c.builtin ? 'builtin' : ''}">
        <span class="config-name">${escapeHtml(c.name)}${c.builtin ? ' <span class="notif-badge ok">SAMPLE</span>' : ''}</span>
        <span class="config-actions">
          <button class="mini" data-action="load-config" data-name="${escapeHtml(c.name)}">Load</button>
          ${c.builtin ? '' : `<button class="mini danger" data-action="delete-config" data-name="${escapeHtml(c.name)}">Delete</button>`}
        </span>
      </li>`).join('')
    : '<li>No saved configurations. Adjust the parameters and save one.</li>';
}

async function loadInterpretConfigs() {
  const { configs } = await api('/api/interpret-configs');
  state.interpretConfigs = configs;
  const sel = document.getElementById('interpret-config');
  const previous = sel.value;
  sel.innerHTML = configs.length
    ? configs.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}${c.builtin ? ' (Sample)' : ''}</option>`).join('')
    : '<option value="">— no configurations —</option>';
  if ([...sel.options].some((o) => o.value === previous)) sel.value = previous;
  renderConfigList(configs);
}

function renderInterpreted(result) {
  const card = document.getElementById('interpret-card');
  const { reputation, reputationCount, ci, ciModel, signals, evidence, hasIdentity } = result;

  const signalRows = (ciModel.signals || [])
    .filter((s) => s.enabled && s.weight > 0)
    .map((s) => `
      <li>
        <span class="ci-signal-head"><strong>${s.label}</strong>
          <span class="contrib-note">value ${s.value} · weight ${s.weight}</span></span>
        <span class="ci-bar"><span class="ci-bar-fill" style="width:${Math.max(0, Math.min(100, s.value)) * 100}%"></span></span>
        <span class="contrib-note">data: ${s.count} ${s.unit} · contributes ${s.contribution} to CI</span>
      </li>`).join('');

  const evidenceList = evidence.length
    ? evidence.map((e) => {
        if (e.kind === 'trust') {
          return `<li><span class="contrib-badge trust">VOTE</span> ${walletLabel(e.counterpartyPkh)} gave a trust vote <span class="contrib-note">tx=${short(e.txid)}</span></li>`;
        }
        if (e.kind === 'identity') {
          return `<li><span class="contrib-badge confirmed">IDENTITY</span> vault genesis <span class="contrib-note">collateral ${e.collateral ?? '—'} sats · ${e.ageDays} days · tx=${short(e.txid)}</span></li>`;
        }
        const badges = e.confirmed
          ? '<span class="contrib-badge confirmed">RATING</span>'
          : (e.asEvidence ? '<span class="contrib-badge pending">RATING</span>' : '<span class="contrib-badge sybil">EXCLUDED</span>');
        return `<li>${badges} ${walletLabel(e.counterpartyPkh)} rated ${e.score}/5 ${e.confirmed ? '<span class="contrib-note">(confirmed receipt)</span>' : '<span class="contrib-note">(unconfirmed)</span>'} <span class="contrib-note">tx=${short(e.txid)}${e.asEvidence ? '' : ' · doesn\'t count as CI evidence (anti-sybil)'}</span></li>`;
      }).join('')
    : '<li>No evidence yet.</li>';

  card.innerHTML = `
    <div class="interpret-head">
      <div>
        <span class="rep-label">Reputation (star average)</span>
        <span class="rep-avg">${reputation ?? '—'}</span>
        <span class="rep-label">${reputationCount} valid rating(s) received</span>
      </div>
      <div>
        <span class="rep-label">Confidence Index (this criterion)</span>
        <span class="ci-value">${ci ?? '—'}</span>
        ${ciModel.applied ? '<span class="ci-bar"><span class="ci-bar-fill" style="width:' + Math.round((ci ?? 0) * 100) + '%"></span></span>' : ''}
      </div>
    </div>
    <ul class="store-list">
      <li>Own identity: <strong>${hasIdentity ? 'yes' : 'no (wallet only)'}</strong></li>
      <li>Confirmed by platform: <strong>${signals.confirmedRatings}</strong> · Endorsements: <strong>${signals.trustLinks}</strong>${signals.excludedFromCi ? ` · <span class="ci-note-warn">${signals.excludedFromCi} rating(s) excluded from CI by anti-sybil (the stars don't change)</span>` : ''}</li>
      <li>Vault collateral: <strong>${signals.collateralSats ?? '—'}</strong> sats${hasIdentity ? ` · age: <strong>${signals.ageDays}</strong> days` : ''}</li>
      <li>CI of the votes (SPEC-006): <strong>${ciModel.trustCi}</strong></li>
    </ul>
    ${ciModel.applied
      ? `<h4>Confidence Index signals (Σ signal × weight / Σ weight)</h4>
         <ul class="contrib-list">${signalRows}</ul>`
      : '<p class="hint">No weighted signals: CI stays undefined (reputation doesn\'t depend on the criterion).</p>'}
    <h4>Evidence (auditable down to the txid)</h4>
    <ul class="contrib-list">${evidenceList}</ul>
  `;
}

// --- Actions -------------------------------------------------------------

async function withDisabled(button, fn) {
  button.disabled = true;
  try {
    await fn();
  } catch (err) {
    showError(err.message);
  } finally {
    button.disabled = false;
  }
}

// --- Example app (delivery, two simultaneous users) ----------------------

const appState = { tasks: [], offers: [], confirmations: [], trustVotes: [] };
let appOfferId = 0;

function appAppendRaw(text) {
  const el = document.getElementById('app-raw');
  el.appendChild(document.createElement('div'));
  el.lastChild.textContent = text.trimEnd();
  while (el.childElementCount >= 40) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}

async function appCall(method, path, body) {
  appAppendRaw(`▶ ${method} ${path}\n${body ? JSON.stringify(body, null, 1) : ''}`);
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  appAppendRaw(`→ ${res.status} ${JSON.stringify(json)}`);
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

function appPicked() {
  const clientPkh = document.getElementById('app-client').value;
  const riderPkh = document.getElementById('app-rider').value;
  const platformPkh = document.getElementById('app-platform').value;
  if (!clientPkh || !riderPkh) throw new Error('Pick a client and a rider.');
  if (clientPkh === riderPkh) throw new Error('Client and rider must be different wallets.');
  if (!platformPkh) throw new Error('Pick a wallet for the platform.');
  return { clientPkh, riderPkh, platformPkh };
}

function appPickedPair() {
  const clientPkh = document.getElementById('app-client').value;
  const riderPkh = document.getElementById('app-rider').value;
  if (!clientPkh || !riderPkh) throw new Error('Pick a client and a rider.');
  if (clientPkh === riderPkh) throw new Error('Client and rider must be different wallets.');
  return { clientPkh, riderPkh };
}

function renderAppHistory() {
  const el = document.getElementById('app-history');
  const lines = [];
  for (const o of appState.offers) {
    lines.push(o.status === 'pending'
      ? `${o.taskType} · requested by ${walletLabel(o.clientPkh)} · client signature ✓ · <strong>waiting for the rider</strong>`
      : `<em>${o.taskType} · requested by ${walletLabel(o.clientPkh)} · rejected by the rider</em>`);
  }
  appState.tasks.forEach((t, i) => {
    lines.push(`${t.taskType} (#${i + 1}) · receipt <code>${short(t.txid)}</code> · client signature ✓ · rider signature ✓ · ${t.confirmed ? 'confirmed ✓' : 'unconfirmed'} · ${t.rated ? `rated by the client (${t.score}) ✓` : 'not rated by the client'} · ${t.ratedByRider ? `rated by the rider (${t.riderScore}) ✓` : 'not rated by the rider'}`);
  });
  const html = lines.map((l, i) => `<li><strong>#${i + 1}</strong> · ${l}</li>`).join('');
  el.innerHTML = html || '<li>No rides yet.</li>';
}

function pendingOffersForRider(riderPkh) {
  return appState.offers.filter((o) => o.riderPkh === riderPkh && o.status === 'pending');
}

function renderAppNotifications() {
  const el = document.getElementById('app-notifications');
  const riderPkh = document.getElementById('app-rider').value;
  const mine = pendingOffersForRider(riderPkh);
  const others = appState.offers.filter((o) => o.riderPkh !== riderPkh && o.status === 'pending').length;
  if (!mine.length) {
    el.innerHTML = `<p class="hint">No requests for this wallet. Request a ride from the client column to see the notification here.</p>
      ${others ? `<p class="hint">There ${others === 1 ? 'is' : 'are'} ${others} pending request${others === 1 ? '' : 's'} for ${others === 1 ? 'another rider wallet' : 'other rider wallets'} (switch the rider wallet to see them).</p>` : ''}`;
    return;
  }
  el.innerHTML = mine.map((o) => `
    <div class="app-notification pulse-in" data-offer="${o.id}">
      <div class="notif-main">
        <strong>New ride available</strong>
        <span class="notif-detail">${o.taskType} · requested by ${walletLabel(o.clientPkh)}</span>
        <span class="notif-detail">Client signature <span class="notif-badge ok">✓ granted</span></span>
      </div>
      <div class="notif-actions">
        <button class="mini accent" data-action="app-accept" data-id="${o.id}">Accept ride</button>
        <button class="mini" data-action="app-reject" data-id="${o.id}">Ignore</button>
      </div>
    </div>`).join('');
}

function syncTrustTarget() {
  const select = document.getElementById('app-trust-target');
  const clientPkh = document.getElementById('app-client').value;
  const riderPkh = document.getElementById('app-rider').value;
  const options = [];
  if (clientPkh) options.push(`<option value="${clientPkh}">Client (${short(clientPkh)})</option>`);
  if (riderPkh) options.push(`<option value="${riderPkh}">Rider (${short(riderPkh)})</option>`);
  const previous = select.value;
  select.innerHTML = options.length
    ? options.join('')
    : '<option value="">— pick client and rider first —</option>';
  if ([...select.options].some((o) => o.value === previous)) select.value = previous;
}

function renderConfirmHistory() {
  const el = document.getElementById('app-confirm-history');
  el.innerHTML = appState.confirmations.length
    ? appState.confirmations.map((c) => `<li>${walletLabel(c.platformPkh)} corroborated receipt <code>${short(c.receiptTxid)}</code> · tx=${short(c.txid)}</li>`).join('')
    : '<li>None yet.</li>';
}

function renderTrustHistory() {
  const el = document.getElementById('app-trust-history');
  el.innerHTML = appState.trustVotes.length
    ? appState.trustVotes.map((v) => `<li>${walletLabel(v.trusterPkh)} trusts ${walletLabel(v.trustedPkh)}${v.valid ? '' : ' (invalid)'} · tx=${short(v.txid)}</li>`).join('')
    : '<li>None yet.</li>';
}

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('button.view');
  if (viewButton) {
    const view = viewButton.dataset.view;
    for (const btn of document.querySelectorAll('.view')) {
      const active = btn.dataset.view === view;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
      btn.tabIndex = active ? 0 : -1;
    }
    for (const wrap of document.querySelectorAll('.view-wrap')) {
      wrap.classList.toggle('active', wrap.id === `view-${view}`);
    }
    if (view === 'app') {
      renderAppHistory();
      renderConfirmHistory();
      renderTrustHistory();
      renderAppNotifications();
    }
    if (view === 'identities') {
      loadIdentitiesView();
    }
    event.preventDefault();
    return;
  }

  const tabButton = event.target.closest('button.tab');
  if (tabButton) {
    const tab = tabButton.dataset.tab;
    for (const btn of document.querySelectorAll('.tab')) {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    }
    for (const panel of document.querySelectorAll('.tab-panel')) {
      panel.classList.toggle('active', panel.id === `tab-${tab}`);
    }
  }

  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;

  if (action === 'create-wallet') {
    withDisabled(button, async () => {
      await api('/api/wallets', { method: 'POST' });
      await refreshAll();
      showSuccess('Wallet created.');
    });
  }

  if (action === 'transfer-sats') {
    withDisabled(button, async () => {
      const fromPkh = document.getElementById('transfer-from').value;
      const toPkh = document.getElementById('transfer-to').value;
      const amount = document.getElementById('transfer-amount').value;
      if (!fromPkh || !toPkh) throw new Error('Pick both wallets first.');
      if (fromPkh === toPkh) throw new Error('Pick different wallets to transfer.');
      if (!amount || Number(amount) < 546) throw new Error('Minimum amount: 546 sats.');
      const res = await api('/api/transfer', {
        method: 'POST',
        body: JSON.stringify({ fromPkh, toPkh, amount }),
      });
      await refreshAll();
      showSuccess(`Transferred ${formatSats(res.amount)} (without creating a RepID fact).`);
    });
  }

  if (action === 'import-wallets') {
    withDisabled(button, async () => {
      const privateKey = document.getElementById('import-keys').value;
      if (!privateKey.trim()) throw new Error('Paste at least one private key (64-hex or WIF).');
      const res = await api('/api/wallets/import', {
        method: 'POST',
        body: JSON.stringify({ privateKey }),
      });
      document.getElementById('import-keys').value = '';
      await refreshAll();
      showSuccess(`${res.count} wallet(s) imported: ${res.wallets.map((w) => short(w.pkh)).join(', ')}.`);
    });
  }

  if (action === 'set-primary') {
    withDisabled(button, async () => {
      const pkh = document.getElementById('primary-select').value;
      if (!pkh) throw new Error('Pick a wallet to mark as primary.');
      await api(`/api/wallets/${pkh}/primary`, { method: 'POST' });
      await refreshAll();
      showSuccess('Primary wallet marked. It is the sweep destination for the sats.');
    });
  }

  if (action === 'sweep-to-primary') {
    withDisabled(button, async () => {
      if (!state.primaryPkh) throw new Error('Mark a primary wallet first.');
      const burnIdentities = document.getElementById('burn-on-sweep').checked;
      const confirmText = burnIdentities
        ? 'The identities of the secondary wallets will be BURNED to release their collateral and sweep EVERYTHING to the primary. Continue?'
        : 'The loose sats of the secondary wallets will be swept to the primary. Identities (and their collaterals) are kept. Continue?';
      if (!window.confirm(confirmText)) return;
      if (burnIdentities && !window.confirm('Confirm: in Chipnet this is on-chain (test tBCH, no value). Proceed?')) return;
      const res = await api('/api/sweep', {
        method: 'POST',
        body: JSON.stringify({ burnIdentities }),
      });
      await refreshAll();
      const done = res.swept.filter((s) => !s.error);
      const total = done.reduce((acc, s) => acc + Number(s.sweptSats || 0), 0);
      const failed = res.swept.filter((s) => s.error);
      const detail = failed.length ? ` · ${failed.length} with an issue (${failed.map((s) => s.error).join('; ')})` : '';
      showSuccess(`Sweep done: ${done.length} wallet(s) · ${formatSats(total)} repatriated${detail}`);
    });
  }

  if (action === 'check-balance') {
    withDisabled(button, async () => {
      const pkh = button.dataset.pkh;
      const info = await api(`/api/wallets/${pkh}`);
      const badge = 'tBCH';
      const w = state.wallets.find((x) => x.pkh === pkh) ?? { pkh };
      const extra = `<span class="wallet-balance">${formatSats(info.balanceSats)} ${badge}${info.hasIdentity ? ' · has identity' : ''}</span><div class="wallet-address">${info.address}</div>`;
      button.closest('li').outerHTML = walletListItem(w, extra);
      showSuccess(`Wallet ${walletLabel(pkh)}: ${formatSats(info.balanceSats)} ${badge}.`);
    });
  }

  if (action === 'set-wallet-name') {
    withDisabled(button, async () => {
      const pkh = button.dataset.pkh;
      const input = button.closest('li').querySelector('[data-name-input]');
      const name = (input?.value ?? '').trim().slice(0, 24);
      await api(`/api/wallets/${pkh}/name`, { method: 'PUT', body: JSON.stringify({ name }) });
      await loadWallets();
      showSuccess(name ? `Name saved: "${name}"` : 'Name cleared.');
    });
  }

  if (action === 'show-reputation') {
    withDisabled(button, async () => {
      const pkh = document.getElementById('reputation-pkh').value;
      if (!pkh) throw new Error('Pick a wallet first.');
      const profile = await api(`/api/reputation/${pkh}`);
      renderReputation(profile);
      showSuccess(`Profile of ${short(pkh)} loaded.`);
    });
  }

  if (action === 'interpret') {
    withDisabled(button, async () => {
      const pkh = document.getElementById('interpret-pkh').value;
      if (!pkh) throw new Error('Pick a wallet first.');
      const qs = interpretQuery();
      const result = await api(`/api/reputation/${pkh}/interpret?${qs}`);
      renderInterpreted(result);
      showSuccess(`Profile of ${walletLabel(pkh)}: reputation ${result.reputation ?? 'no stars'} · CI ${result.ci ?? '—'}. The stars don't depend on the criterion.`);
    });
  }

  if (action === 'save-config') {
    withDisabled(button, async () => {
      const name = document.getElementById('interpret-config-name').value.trim().slice(0, 24);
      if (!name) throw new Error('Write a name for the configuration.');
      const params = interpretParams();
      await api(`/api/interpret-configs/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify({ params }),
      });
      await loadInterpretConfigs();
      showSuccess(`Configuration "${name}" saved.`);
    });
  }

  if (action === 'load-config') {
    withDisabled(button, async () => {
      const name = button.dataset.name;
      const config = state.interpretConfigs.find((c) => c.name === name);
      if (!config) throw new Error('Unknown configuration.');
      applyConfig(config.params);
      const sel = document.getElementById('interpret-config');
      if ([...sel.options].some((o) => o.value === name)) sel.value = name;
      showSuccess(`Criterion "${name}" loaded in the editor.`);
    });
  }

  if (action === 'delete-config') {
    withDisabled(button, async () => {
      const name = button.dataset.name;
      if (!window.confirm(`Delete the configuration "${name}"?`)) return;
      await api(`/api/interpret-configs/${encodeURIComponent(name)}`, { method: 'DELETE' });
      await loadInterpretConfigs();
      showSuccess(`Configuration "${name}" deleted.`);
    });
  }

  if (action === 'interpret-reset') {
    applyConfig(INTERPRET_DEFAULTS);
    document.getElementById('interpret-card').textContent = 'Criterion restored to the defaults (the "Sample" preset). Adjust and save, or query the Profile.';
    showSuccess('Criterion restored.');
  }

  if (action === 'run-demo') {
    withDisabled(button, async () => {
      const summary = await api('/api/demo/run', { method: 'POST' });
      await refreshAll();
      showSuccess(`Demo done: ${summary.facts} facts (${summary.wallets} wallets, ${summary.ratings} ratings).`);
    });
  }

  if (action === 'send-foreign') {
    withDisabled(button, async () => {
      await api('/api/foreign-tx', { method: 'POST' });
      await loadIndexerView();
      showSuccess('Unknown transaction sent and discarded by the indexer.');
    });
  }

  if (action === 'mint-identity') {
    withDisabled(button, async () => {
      const ownerPkh = document.getElementById('identity-owner').value;
      if (!ownerPkh) throw new Error('Pick a wallet first.');
      const collateral = document.getElementById('identity-collateral').value;
      await api('/api/identities', {
        method: 'POST',
        body: JSON.stringify({ ownerPkh, collateral }),
      });
      await loadFacts();
      await loadIndexerView();
      await loadIdentitiesView();
      showSuccess('Identity minted with locked collateral.');
    });
  }

  if (action === 'increase-collateral') {
    withDisabled(button, async () => {
      const ownerPkh = document.getElementById('identity-owner').value;
      if (!ownerPkh) throw new Error('Pick a wallet first.');
      const amount = document.getElementById('identity-topup-amount').value;
      if (!amount || Number(amount) <= 0) throw new Error('Enter an increase in sats.');
      await api(`/api/identities/${ownerPkh}/collateral`, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });
      await loadFacts();
      await loadIndexerView();
      await loadIdentitiesView();
      showSuccess('Collateral increased. The covenant never lets it go down on-chain.');
    });
  }

  if (action === 'burn-identity') {
    withDisabled(button, async () => {
      const ownerPkh = document.getElementById('identity-owner').value;
      if (!ownerPkh) throw new Error('Pick a wallet first.');
      if (!window.confirm('Delete this identity? The NFT is burned and the collateral returns to the wallet. The wallet will be able to mint a new identity.')) return;
      await api(`/api/identities/${ownerPkh}/burn`, { method: 'POST' });
      await loadFacts();
      await loadIndexerView();
      await loadIdentitiesView();
      showSuccess('Identity deleted: NFT burned and collateral returned.');
    });
  }

  if (action === 'mint-identity-here') {
    withDisabled(button, async () => {
      const ownerPkh = document.getElementById('ident-mint-wallet').value;
      if (!ownerPkh) throw new Error('Pick a wallet first.');
      const collateral = document.getElementById('ident-mint-collateral').value;
      if (!collateral || Number(collateral) < 1) throw new Error('Enter a collateral in sats.');
      await api('/api/identities', {
        method: 'POST',
        body: JSON.stringify({ ownerPkh, collateral }),
      });
      await loadFacts();
      await loadIndexerView();
      await loadIdentitiesView();
      showSuccess('Identity minted with locked collateral.');
    });
  }

  if (action === 'identities-increase-collateral') {
    withDisabled(button, async () => {
      const pkh = button.dataset.pkh;
      const card = button.closest('.identity-card');
      const amount = card ? card.querySelector('.identity-topup').value : '';
      if (!pkh) throw new Error('Invalid identity.');
      if (!amount || Number(amount) <= 0) throw new Error('Enter an increase in sats.');
      await api(`/api/identities/${pkh}/collateral`, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });
      await loadFacts();
      await loadIndexerView();
      await loadIdentitiesView();
      showSuccess('Collateral increased. The covenant never lets it go down on-chain.');
    });
  }

  if (action === 'identities-burn') {
    withDisabled(button, async () => {
      const pkh = button.dataset.pkh;
      if (!pkh) throw new Error('Invalid identity.');
      if (!window.confirm('Burn this identity? The NFT is burned and the collateral returns to the wallet.')) return;
      await api(`/api/identities/${pkh}/burn`, { method: 'POST' });
      await loadFacts();
      await loadIndexerView();
      await loadIdentitiesView();
      showSuccess('Identity burned: NFT burned and collateral returned.');
    });
  }

  if (action === 'create-interaction') {
    withDisabled(button, async () => {
      const partyAPkh = document.getElementById('interaction-party-a').value;
      const partyBPkh = document.getElementById('interaction-party-b').value;
      const roleA = document.getElementById('interaction-role-a').value;
      const roleB = document.getElementById('interaction-role-b').value;
      if (!partyAPkh || !partyBPkh) throw new Error('Pick both parties.');
      await api('/api/interactions', {
        method: 'POST',
        body: JSON.stringify({
          partyA: { pkh: partyAPkh, role: roleA },
          partyB: { pkh: partyBPkh, role: roleB },
        }),
      });
      await loadRatingRights();
      await loadInteractions();
      await loadFacts();
      showSuccess('Interaction recorded.');
    });
  }

  if (action === 'create-platform-confirmation') {
    withDisabled(button, async () => {
      const platformPkh = document.getElementById('platform-pkh').value;
      const receiptTxid = document.getElementById('platform-receipt').value;
      if (!platformPkh || !receiptTxid) throw new Error('Pick a platform and an interaction.');
      await api('/api/platform-confirmations', {
        method: 'POST',
        body: JSON.stringify({ platformPkh, receiptTxid }),
      });
      await loadFacts();
      showSuccess('Interaction confirmed by the platform.');
    });
  }

  if (action === 'create-trust-link') {
    withDisabled(button, async () => {
      const trusterPkh = document.getElementById('trust-trust').value;
      const trustedPkh = document.getElementById('trust-trusted').value;
      if (!trusterPkh || !trustedPkh) throw new Error('Pick both wallets.');
      if (trusterPkh === trustedPkh) throw new Error('Pick different wallets to avoid self-trust.');
      await api('/api/trust-links', {
        method: 'POST',
        body: JSON.stringify({ trusterPkh, trustedPkh }),
      });
      await loadFacts();
      showSuccess('Trust declared.');
    });
  }

  if (action === 'reset-demo') {
    withDisabled(button, async () => {
      await api('/api/reset', { method: 'POST' });
      await refreshAll();
      showSuccess('Demo reset. You can start over.');
    });
  }

  if (action === 'issue-rating') {
    withDisabled(button, async () => {
      const outpoint = document.getElementById('rating-right').value;
      if (!outpoint) throw new Error('No Rating Right selected.');
      const rr = state.ratingRights.find((r) => r.outpoint === outpoint);
      const score = Number(document.getElementById('rating-score').value);
      await api('/api/ratings', {
        method: 'POST',
        body: JSON.stringify({ outpoint, raterPkh: rr.ownerPkh, score }),
      });
      await loadRatingRights();
      await loadFacts();
      showSuccess('Rating issued.');
    });
  }

  if (action === 'app-request') {
    withDisabled(button, async () => {
      const { clientPkh, riderPkh } = appPickedPair();
      const taskType = document.getElementById('app-task').value;
      appOfferId += 1;
      const offer = {
        id: appOfferId,
        taskType,
        clientPkh,
        riderPkh,
        clientSigned: true,
        riderSigned: false,
        status: 'pending',
      };
      appState.offers.push(offer);
      renderAppHistory();
      renderAppNotifications();
      showSuccess(`Request for "${taskType}" sent to the rider — waiting for acceptance.`);
      setTimeout(() => {
        const node = document.querySelector(`#app-notifications [data-offer="${offer.id}"]`);
        if (node) node.classList.remove('pulse-in');
      }, 2200);
    });
  }

  if (action === 'app-accept') {
    withDisabled(button, async () => {
      const id = Number(button.dataset.id);
      const offer = appState.offers.find((o) => o.id === id && o.status === 'pending');
      if (!offer) throw new Error('The request is no longer pending.');
      const fact = await appCall('POST', '/api/interactions', {
        partyA: { pkh: offer.clientPkh, role: 'client' },
        partyB: { pkh: offer.riderPkh, role: 'rider' },
      });
      const clientRight = (fact.ratingRights ?? []).find((rr) => rr.ownerPkh === offer.clientPkh);
      const riderRight = (fact.ratingRights ?? []).find((rr) => rr.ownerPkh === offer.riderPkh);
      offer.riderSigned = true;
      offer.status = 'accepted';
      offer.txid = fact.txid;
      offer.clientRight = clientRight?.outpoint;
      offer.riderRight = riderRight?.outpoint;
      offer.confirmed = false;
      offer.rated = false;
      offer.score = null;
      offer.ratedByRider = false;
      offer.riderScore = null;
      appState.tasks.push(offer);
      appState.offers = appState.offers.filter((o) => o.id !== id);
      renderAppHistory();
      renderAppNotifications();
      await loadRatingRights();
      await loadInteractions();
      await loadFacts();
      showSuccess(`Ride "${offer.taskType}" accepted — on-chain Receipt created (client and rider signatures).`);
    });
  }

  if (action === 'app-reject') {
    const id = Number(button.dataset.id);
    const offer = appState.offers.find((o) => o.id === id && o.status === 'pending');
    if (!offer) return;
    offer.status = 'rejected';
    renderAppHistory();
    renderAppNotifications();
    showSuccess(`Ride "${offer.taskType}" dismissed.`);
  }

  if (action === 'app-confirm') {
    withDisabled(button, async () => {
      const { platformPkh } = appPicked();
      const pending = [...appState.tasks].reverse().find((t) => !t.confirmed);
      if (!pending) throw new Error('There is no unconfirmed ride.');
      const conf = await appCall('POST', '/api/platform-confirmations', {
        platformPkh, receiptTxid: pending.txid,
      });
      pending.confirmed = true;
      appState.confirmations.push({ platformPkh, receiptTxid: pending.txid, txid: conf.txid, valid: conf.valid !== false });
      renderAppHistory();
      renderConfirmHistory();
      await loadFacts();
      showSuccess(conf.valid ? 'Platform confirmed the ride on-chain.' : 'Invalid confirmation in the index.');
    });
  }

  if (action === 'app-rate') {
    withDisabled(button, async () => {
      const score = Number(document.getElementById('app-score').value);
      const pending = [...appState.tasks].reverse().find((t) => !t.rated);
      if (!pending) throw new Error('There is no unrated ride.');
      if (!pending.clientRight) throw new Error('The client\'s Rating Right was not retained.');
      const rating = await appCall('POST', '/api/ratings', {
        outpoint: pending.clientRight, raterPkh: pending.clientPkh, score,
      });
      pending.rated = true;
      pending.score = score;
      renderAppHistory();
      await loadRatingRights();
      await loadFacts();
      showSuccess(`Rating ${score}/5 anchored on-chain.`);
    });
  }

  if (action === 'app-reputation') {
    withDisabled(button, async () => {
      const { riderPkh } = appPicked();
      const profile = await appCall('GET', `/api/reputation/${riderPkh}`);
      renderReputation(profile, 'app-reputation-card');
      renderAppHistory();
      showSuccess(`Rider profile loaded (avg=${profile.avg ?? '—'}).`);
    });
  }

  if (action === 'app-rate-client') {
    withDisabled(button, async () => {
      const { riderPkh } = appPicked();
      const score = Number(document.getElementById('app-score-client').value);
      const pending = [...appState.tasks].reverse().find((t) => !t.ratedByRider);
      if (!pending) throw new Error('There is no ride unrated by the rider.');
      if (!pending.riderRight) throw new Error('The rider\'s Rating Right was not retained.');
      const rating = await appCall('POST', '/api/ratings', {
        outpoint: pending.riderRight, raterPkh: pending.riderPkh, score,
      });
      pending.ratedByRider = true;
      pending.riderScore = score;
      renderAppHistory();
      await loadRatingRights();
      await loadFacts();
      showSuccess(`Rating ${score}/5 from the rider to the client anchored on-chain.`);
    });
  }

  if (action === 'app-reputation-client') {
    withDisabled(button, async () => {
      const { clientPkh } = appPicked();
      const profile = await appCall('GET', `/api/reputation/${clientPkh}`);
      renderReputation(profile, 'app-reputation-card-client');
      showSuccess(`Client profile loaded (avg=${profile.avg ?? '—'}).`);
    });
  }

  if (action === 'app-trust') {
    withDisabled(button, async () => {
      const trusterPkh = document.getElementById('app-trust-voter').value;
      const trustedPkh = document.getElementById('app-trust-target').value;
      if (!trusterPkh || !trustedPkh) throw new Error('Pick who gives the vote and about whom.');
      if (trusterPkh === trustedPkh) throw new Error('Self-trust is invalid: pick different identities.');
      const trust = await appCall('POST', '/api/trust-links', { trusterPkh, trustedPkh });
      appState.trustVotes.push({ trusterPkh, trustedPkh, valid: trust.valid !== false, txid: trust.txid });
      renderTrustHistory();
      await loadFacts();
      showSuccess(trust.valid === false ? 'Vote recorded but marked invalid (self-trust).' : 'Trust vote anchored on-chain.');
    });
  }
});

document.getElementById('rating-score').addEventListener('input', (event) => {
  document.getElementById('rating-score-output').textContent = event.target.value;
});

for (const id of ['app-client', 'app-rider']) {
  document.getElementById(id).addEventListener('change', () => {
    syncTrustTarget();
    renderAppNotifications();
  });
}

document.getElementById('app-score').addEventListener('input', (event) => {
  document.getElementById('app-score-output').textContent = event.target.value;
});

document.getElementById('app-score-client').addEventListener('input', (event) => {
  document.getElementById('app-score-client-output').textContent = event.target.value;
});

document.getElementById('interpret-anti-sybil').addEventListener('change', (event) => {
  interpretState.antiSybil = event.target.checked;
});
document.getElementById('interpret-criteria').addEventListener('change', (event) => {
  if (event.target.classList.contains('interpret-signal-toggle')) {
    interpretState.signals[event.target.dataset.signal].enabled = event.target.checked;
    renderWeights();
  }
});
document.getElementById('interpret-weights').addEventListener('input', (event) => {
  if (event.target.classList.contains('interpret-weight')) {
    interpretState.signals[event.target.dataset.signal].weight = Number(event.target.value);
    const out = document.getElementById(`interpret-weight-output-${event.target.dataset.signal}`);
    if (out) out.textContent = event.target.value;
  }
});
document.getElementById('interpret-config').addEventListener('change', (event) => {
  const name = event.target.value;
  const config = state.interpretConfigs.find((c) => c.name === name);
  if (config) applyConfig(config.params);
});

const identFilterInput = document.getElementById('ident-filter-validator');
identFilterInput.addEventListener('input', () => {
  identFilterState.value = identFilterInput.value;
  renderActiveIdentities(lastActiveIdentities);
});
applyConfig(INTERPRET_DEFAULTS);

async function boot() {
  const status = await api('/api/status');
  state.network = status.network;
  const tag = document.getElementById('network-tag');
  tag.textContent = 'Real Chipnet network (tBCH) — wallets are locally persisted test keys; the indexer listens to real transactions.';
}

boot().then(refreshAll);