# DESIGN-CONVENTIONS.md — Visual Conventions

Applies to the prototype server (web console), to any future UI, and to the architecture diagram.
Source of authority: **`references/repid-guia-visual.html`** (guide v0.1) and the brand stamps `references/Logo-tema-*.png`.

## Theme and palette

- **Two switchable modes**: dark (`data-theme="dark"`, default) and light (`data-theme="light"`). The toggle lives in the masthead, persists in `localStorage` (`repid-theme`) and is applied in `<head>` to avoid theme flash.
- The variables live in `:root[data-theme="…"]` (`style.css`): `--bg`, `--surface`, `--surface-2`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--accent`, `--accent-strong`, `--accent-deep`, `--on-accent`, `--accent-soft`.
- **Single accent: emerald green** — `#0AC18E` on dark ink, `#07805E` on light paper. Active elements and actions go green; nothing competes with it.
- The palette doesn't change between modes: light mode inverts the roles of ink and paper, and the green darkens/lightens depending on the background to keep contrast.
- The **functional tints** of the fact dots are kept by protocol semantics (amber top-up/pending, red danger/burn, indigo receipt, violet platform confirmation, blue trust), even though the guide is monochromatic: they are status codes, not decorative accents.

## Logo

- **One version per background** (guide, section 01): `server/public/logo-dark.png` (light stamp `#0AC18E`, only on dark background) and `server/public/logo-light.png` (deep stamp `#07805E`, only on light background). Inverted they lose legibility; they are neither recolored nor swapped.
- In the masthead they are shown with `.brand-mark.for-dark` / `.brand-mark.for-light`, one per theme; "RepID" in Fraunces 17px/600.

## Typography

- **Fraunces** — display and identity (titles, large averages).
- **IBM Plex Sans** — interface (general UI).
- **IBM Plex Mono** — reserved **strictly** for on-chain data (hashes, hex, token categories, outpoints). Do not use it for general UI text or prose.

## Surfaces

- Ledger and panels use the same **`--surface`** card (unified surface). The "light paper / dark console" contrast of the ledger became obsolete in the current aesthetic.

## Layout (web console, 2026-09 redesign)

- **Compact masthead** (`--serif`, no long intro) + **sticky** navigation bar `.view-nav` (`.view-nav-inner` centered, `max-width: 76rem`) for the five views: Wallets, Console, Example app, Indexer, Identities. All content lives in `.page` (same `max-width: 76rem`).
- **Wallets**: `.wallets-page` with `.app-header` and `.wallets-grid` (**3 columns**, `minmax(0,1fr) minmax(0,1fr) minmax(0,2fr)`, normal `.panel` cards). The first column is `.wallets-col` (two stacked panels: **Create wallet** and below it **Import Wallet**); followed by **Transfer sats** and the double-width **Manage Wallets** (`panel-wallets-manage`). The wallet table uses `.wallet-thead` and `.wallet-list li` sharing the **same grid** (`minmax(0,1fr) auto auto`, columns Wallet/Alias/Balance): the text alias is hidden (it lives in the Alias column input), the alias input narrows to `8ch` and the Balance button goes right (`justify-self:end`). The primary wallet is marked with `.primary-star` (★ amber `--warn`) to the left of the pkh, without a banner. Breakpoints: **<1200px** → 2 columns, **<680px** → 1 column (the Console media query stays at <1100px). It replaces the collapsible block that lived in the Console (`.tool-block`, removed).
- **Console**: two-column grid (`minmax(0,2fr) minmax(21rem,1fr)`, `align-items:start`). Left column = **guided flow**: toolbar `.console-toolbar` with demo/reset and five numbered `.panel.protocol-step` (`.step-head` + `.step-num` in emerald mono). Right column = sticky `.ledger` (`top: 4.25rem`, below the nav) with the three tabs. At **<1100px** the console goes to 1 column and the ledger stops being sticky.
- **Action hierarchy**: `btn-primary` (emerald background, main step action), `btn-secondary` (border, alternative action), `btn-ghost` (text, delicate action) and `danger` for destructive ones (`reset-demo`, burn). `.wide` stretches the button to the panel width.
- **Example app**: `.app-header` with header and collapsible intro `details.app-how`; steps `1–3` with `.step-num`; log `.app-crud` as `<details>` with `summary` and the Raw panel (.app-raw) inside; lower duo `.duo.bottom-duo` for history and log.
- **Indexer**: grid `.indexer-page .duo` in two columns (profile first): `slot-profile-main` occupies `grid-column:1; grid-row:1/3`; on its right `slot-criteria` (top) and `slot-config` (bottom). Below <900px everything falls to one column in document order (profile → criteria → config).
- **Identities**: `.identities-layout` in two columns: sticky `.identity-mint` (`top: 4.25rem`) on the left; on the right `.identity-lists` with the active and burned cards. Below <900px it goes to one column and the form stops being sticky. Each active card carries the `.identity-card-validators` row ("Validated by:" + endorser list, dotted `border-top` and names in `--hue-trust`); the *Active identities* panel has the `#ident-filter-validator` input (mono, full panel width) and the `#ident-filter-count` counter.
- At every breakpoint the semantic reading order is preserved and all the `id`/`data-action` (see `app.js`) are kept — the redesign is **pure HTML/CSS**, it never touches the logic.

## Architecture Diagram Conventions

- The dot colors of the diagram must match the "facts" indicators used in the console frontend — visual consistency between the conceptual diagram and the real UI.
- **Hollow circle** = unspent Rating Right (alive).
- **Filled circle** = terminal fact / already-spent UTXO.

## Sync Note

These conventions are applied in the web console (guide aesthetic), in the masthead stamps and in the architecture SVG diagram. Any new UI or diagram must respect them to maintain RepID's visual identity.