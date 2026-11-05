# Riftbound Tracker

> Keep It Simple, But Significant

A browser-based collection tracker for Riftbound TCG. Track normal and foil copies, browse a card binder or table, check collection progress, and export your collection.

Hosted test environment: <https://riftbound-tracker-test.opiola-daniel.chatgpt.site/>. The owner reported successful login, persisted quantities, shared counts across two browser sessions, concurrent increments, and separate collections for two accounts on 2026-11-02. See the [verification record](docs/database.md#hosted-test-verification) for scope and remaining checks.

Repository documentation and development communication use English. See [AGENTS.md](AGENTS.md) for the repository conventions. The user interface and card data are in English. CSV export column names and backup file names are still German.

## Run the app

The app is built with [Vite](https://vite.dev) and needs Node.js 22 or newer and a Supabase account. Start the development server:

```bash
git clone https://github.com/SpoogyOh/riftbound-tracker.git
cd riftbound-tracker
npm ci
npm run dev
```

Open <http://127.0.0.1:8765> and sign in. Styling is compiled by Tailwind CSS at build time, together with the self-hosted Archivo font in `fonts/`; card images load on demand. A generated SVG placeholder is used when a card image fails to load.

### Build and deploy

`npm run build` writes the static site to `dist/`, with relative asset paths, so it works at a domain root or in a subfolder. Serve `dist/` from any static host; `npm run preview` serves it locally. A host that builds from the repository needs the build command `npm run build`, the output directory `dist`, and Node.js 22. The repository files themselves are not a runnable site. When the app moves to another address, add that address to the Supabase Auth URL configuration (see [docs/database.md](docs/database.md#authentication-and-first-account-test)).

Your collection lives in your private Supabase account. Earlier versions also kept a separate local collection in the browser (IndexedDB/localStorage). This version no longer reads that data and never deletes it; download a JSON backup with an earlier version if you still need it.

## Use the online collection

1. Open the hosted test environment linked above, or serve the app over HTTP locally.
2. On the sign-in screen, use **Create account** to register, confirm your email, then sign in. An existing Supabase Auth account can sign in directly. Passwords are handled by Supabase Auth; the app does not store a separate password.
3. Signed-in mode loads the online catalog and collection. All variants are paginated, so the default 1,000-row API cap does not truncate the catalog. Owned archived variants remain available.
4. Add copies or edit counts. **Saved · Supabase** in the header confirms a server response. If a response is lost or an edit conflicts, the app reads the current server state and asks you to check it. It never repeats an uncertain increment automatically.
5. **Reload from server** in the account menu fetches changes from another device. **Sign out** returns to the sign-in screen.

The current project URL and publishable browser key are configured in `src/cloud.ts`; both are public configuration. There is no service-role/secret key in the client. RLS restricts collection rows to their owner.

Custom cards and backup restore are not available. JSON and CSV export remain. Restoring a backup into an account and transferring an old local collection are deferred until they can be atomic, reviewed and lossless.

When setting up another host, configure its app URL and email delivery in Supabase as described in [docs/database.md](docs/database.md#authentication-and-first-account-test). The repository does not change hosted Auth settings. The hosted smoke test does not establish fresh registration/email delivery or production readiness. Password recovery UI is a follow-up; it is not included in this first login flow.

## Features

- Email/password sign-in, registration with email confirmation, and a private online collection.
- Separate normal and foil quantities, with buttons and direct number entry.
- Binder and list views, a card panel that stays open beside the results (arrow keys browse, Esc closes), foil effects, and collection statistics.
- Capture mode for a pile of cards: type a collector number or name and press Enter to add one copy in the chosen finish. Ambiguous matches require an explicit variant selection, unknown input changes nothing, and each addition can be undone.
- Filters for ownership, domains (select multiple; cards match any selected domain), set, card type, and rarity, plus several sorting options. Click a selected domain to deselect it; All or an empty selection includes every domain.
- English card catalog imported from [OpenRift](https://openrift.app/developers).
- JSON backup and CSV export.
- Custom image URLs or uploaded images per card.
- Online changes confirmed by the server, atomic counter increments, conflict detection for absolute edits, and an explicit reload button.

Normal/foil twins share one catalog row with two counters. Alternate art, signatures, promo markers, different sizes, and special metal finishes remain separate variants. The normal/special-finish counter stores metal copies; unavailable finishes are disabled. Catalog progress counts variants rather than only distinct game cards. Playsets require 10 copies per Rune variant, 1 for Legends and Battlefields, and 3 for other cards. Normal and foil copies count together. Rune variants have independent playsets; all other cards combine variants with the same `cardId`, including variants outside the current search or filters. The playset statistic counts each completed Rune variant or other game card once. Quantity controls, ownership filters, exports and catalog progress remain per variant.

## Repository map

| File or directory | Responsibility | When to change it |
| --- | --- | --- |
| `README.md` | Project overview, setup instructions, repository map, and data-flow guide. | Explain how to use or develop the project. |
| `index.html` | Main page structure: header, sign-in screen, filters, binder and list, panels and dialogs. Loads the `src/main.ts` entry. | Change the interface layout or add a control. |
| `src/main.ts` | Vite entry: imports the styles, the session controller and the interface code. | Add a new top-level module. |
| `src/styles.css` | Tailwind setup, design tokens (`@theme`), and the component classes (`@layer components`). | Change the look. |
| `src/app.js` | Connects the interface to the data. Handles clicks, counters, filtering, rendering, statistics, images, capture, and exports. Not yet type-checked. | Change how the app behaves. |
| `vite.config.mjs` | Vite and Tailwind build settings, development and preview server. | Change the build. |
| `fonts/` | Self-hosted Archivo variable font (SIL Open Font License, see `OFL.txt`). | Replace or update the interface font. |
| `assets/riftbound/` / `src/icons.ts` | Original Riftbound icons from the League of Legends Wiki, with source URLs, checksums and UI mappings. | Update game symbols; see the asset directory's attribution notes. |
| `src/cloud.ts` | TypeScript login/session controller and account-bound Supabase clients. | Change authentication and online state transitions. |
| `src/cloud-repository.ts` | Typed paginated catalog reads, private collection reads, atomic adjustments, and revision-checked edits. | Change online data access. |
| `tests/cloud-repository.test.mjs` / `tests/cloud-app.test.mjs` | Exercise the real SDK against deterministic Auth/PostgREST responses: pagination, accounts, conflicts, failed writes, capture, and that old local data stays untouched. | Verify online behavior without sending email or writing real collections. |
| `tests/browser/cloud.spec.cjs` | Two isolated Chrome sessions using a shared API fixture. | Verify online controls, reload, conflicts, and logout. |
| `tests/browser/online.cjs` | Serves the API fixture to a browser page and signs in through the sign-in screen. | Change how browser tests reach the fixture account. |
| `cards.js` | Generated card catalog, variant IDs, metadata, rules text, values, keywords, tags, image references, and underlying printing details. The source of the Supabase catalog import; the app loads the catalog from Supabase. | Regenerate it with the importer. |
| `types/models.ts` | Shared TypeScript models for catalog rows, physical printings, metadata, quantities, and collection backups. | Change the data contracts as features evolve. |
| `types/database.generated.ts` | TypeScript types generated from the deployed Supabase database. | Regenerate after applying schema migrations. |
| `types/openrift.ts` | Expected upstream fields consumed by the importer. | Update the OpenRift input contract. |
| `tsconfig.json` | Strict type-checking scope for the gradual migration. | Add a source file as it is migrated. |
| `tsconfig.tools.json` | Compiles the TypeScript catalog export tool into the ignored `.cache/tools/` directory. | Change the Node.js tool build. |
| `supabase/` | Versioned PostgreSQL schema, access policies, quantity adjustment function, and local Supabase configuration. | Evolve the central database through new migrations. |
| `docs/database.md` | Data model, setup steps, access rules, and boundaries of the database foundation. | Change the online-storage design or setup instructions. |
| `scripts/import-openrift.mjs` | Downloads or reads OpenRift data, validates and normalizes it, groups normal/foil twins, and generates `cards.js`. | Change the data source or catalog mapping. |
| `scripts/export-supabase-catalog.mts` | Validates the bundled catalog and generates an atomic PostgreSQL refresh, preserving IDs and quantities. | Change the database catalog mapping or refresh rules. |
| `package.json` | Lists development commands, the supported Node.js version, and development dependencies. | Add a command or dependency. |
| `package-lock.json` | Records exact dependency versions and integrity hashes for reproducible installs. | Let npm update it when dependencies change. |
| `playwright.config.cjs` | Configures real-browser tests, Chrome, viewports, the local test server, and reports. | Change browser-test setup. |
| `tests/catalog.test.mjs` | Tests catalog normalization and IDs. | Verify importer changes. |
| `tests/database.test.mjs` | Applies the SQL migration to PGlite and verifies grants, user isolation, quantities, and data preservation. | Verify database changes. |
| `tests/catalog-import.test.mjs` | Tests the complete catalog import, repeatability, archiving, quoting, and owned-card conflicts in PostgreSQL. | Verify catalog refresh changes. |
| `tests/browser/tracker.spec.cjs` | End-to-end tests in real Chrome, signed in to a fixture account: the sign-in screen, reload, JSON/CSV export, capture, filters, variants, the card panel, desktop/mobile-width views, and an actual image request. | Verify complete user flows. |
| `.github/workflows/browser-test.yml` | GitHub Actions workflow that installs dependencies, runs the tests, and uploads browser reports/screenshots. | Change automated checks. |
| `.gitignore` | Lists local caches, dependencies, temporary files, and reports that Git should not track. | Exclude another generated local artifact. |
| `AGENTS.md` | Repository language and development conventions for coding assistants. | Update project-wide working conventions. |
| `chat-verlauf.md` | Historical German conversation notes from the initial project creation. | Consult for background; it is not current technical documentation. |

The `.html` files describe web pages. The `.js` files contain browser-side JavaScript. The `.mjs` scripts run with Node.js, outside the browser. The `.cjs` files use the CommonJS module format for test configuration/code. Markdown (`.md`) files are documentation; JSON files hold structured configuration/data; YAML (`.yml`) defines the GitHub workflow.

## How the pieces work together

### Catalog updates

1. The developer runs `npm run catalog:update`.
2. `scripts/import-openrift.mjs` reads the English OpenRift catalog and generates `cards.js`.
3. The generated catalog is committed with the application source.

The app loads the catalog from Supabase, which is refreshed from `cards.js` with `npm run catalog:sql`. It does not query the OpenRift catalog API on every page load. Card images are fetched separately when needed.

### Opening the app

1. `index.html` loads `src/main.ts`, which Vite bundles with the session controller (`src/cloud.ts`), the interface code (`src/app.js`) and the styles.
2. The session controller shows the sign-in screen, or loads the signed-in account's catalog and owned quantities through the typed repository.
3. `src/app.js` renders the binder or list and updates the statistics.

### Example: adding one normal copy

1. You click `+` on a card.
2. `src/app.js` asks the session controller to adjust that card's quantity.
3. The controller calls the atomic database adjustment function and waits for the server's response.
4. `src/app.js` shows the confirmed quantities and statistics, and **Saved · Supabase** appears in the header.

`+`/`−` and capture call the atomic database adjustment function. Direct quantity edits and image edits check the saved revision so another device's changes cannot be silently overwritten. Reload or return to the tab to fetch newer server data; there is no live subscription or offline write queue.

The shared card catalog answers **which cards exist**. Your account's collection answers **which copies you own**. Personal collection quantities are never uploaded to GitHub or OpenRift; they are stored in the user's private Supabase collection.

## Developer commands

Use Node.js 22 or newer. Install the development dependencies with:

```bash
npm ci
```

| Command | What it does |
| --- | --- |
| `npm run catalog:update` | Refreshes the English OpenRift catalog and generates `cards.js`. |
| `npm run build:tools` | Compiles the TypeScript Node.js export tool. |
| `npm run catalog:sql` | Validates `cards.js` and generates `.cache/catalog-import.sql` for a trusted Supabase import. |
| `npm run dev` | Starts the Vite development server at <http://127.0.0.1:8765>. |
| `npm run build` | Builds the static site into `dist/`. |
| `npm run preview` | Serves the built `dist/` at <http://127.0.0.1:8765>. |
| `npm run typecheck` | Checks the shared TypeScript models, catalog normalizer, database export tool, and online client. |
| `npm test` | Runs catalog, jsdom online-app, and PostgreSQL database tests without launching a browser. |
| `npm run test:database` | Builds the tool and runs the database migration, access-control, and catalog import tests. |
| `npm run test:browser` | Runs the Chrome end-to-end tests. |

The browser-test configuration expects an installed Google Chrome. It builds the site and serves it with `vite preview`, or reuses an existing server locally. The GitHub workflow runs on Ubuntu 24.04 with Chrome already installed.

After interface changes, run the relevant tests; `dist/` is build output and is not committed. After changing only documentation, check the text, commands, and file links; rebuilding the catalog is unnecessary.

### Gradual TypeScript migration

The first phase defines shared models in `types/` and checks the existing importer through JSDoc type references, including the catalog entries it constructs. Run `npm run typecheck`; the same check runs in CI. TypeScript is pinned to the JavaScript-based 6.0.3 compiler for compatibility with restricted development environments.

`allowJs` and `checkJs` let checked JavaScript coexist with TypeScript. `noEmit` keeps type checking separate from compilation. New code in `src/` is TypeScript; Vite bundles it at build time. No frontend framework is required for this step. `skipLibCheck` skips a known mismatch between the SDK's bundled WebAuthn declarations and TypeScript 6 DOM declarations; project source remains strictly checked. The large generated `cards.js` payload is outside the type-checking scope; its transformation is checked at the importer boundary. `src/app.js` (marked `@ts-nocheck`) and the tests are outside the type-checking scope until their migration phases; the collection-backup types describe the JSON backup format but do not yet check its implementation.

Next, migrate the importer implementation to TypeScript and then the interface code. Keep the app working after every step. Type checking does not validate untrusted API responses or imported backups at runtime; the existing runtime checks and tests remain necessary.

The Supabase export tool is implemented in TypeScript (`.mts`) and compiled for Node.js by `tsconfig.tools.json`. Test commands build it automatically. The UI still uses shared JavaScript; the online controller and repository are TypeScript.

### Import behavior

The importer requires no API key. It sends a project-identifying User-Agent, caches the raw response and ETag locally for at least one hour, and uses `If-None-Match` for later updates. HTTP errors do not replace the existing generated catalog. There are no automatic retry loops.

To normalize an existing raw response instead of making an API request:

```bash
node scripts/import-openrift.mjs --input /path/to/catalog.json
```

The generated metadata records the import date and catalog size. A set is marked as a preview when its known English release date is in the future; a missing release date alone does not mark it as unreleased.

## Online database foundation

Supabase (PostgreSQL) stores the shared catalog and private online collections. The initial migration creates a shared card catalog and an owner-scoped collection table, with explicit grants, Row Level Security, and a quantity adjustment function. The first online version tracks catalog-backed cards; custom cards are deferred. See [docs/database.md](docs/database.md) for setup and the data model.

The migration is deployed to the Frankfurt development project [riftbound-tracker](https://supabase.com/dashboard/project/jhleumwhywdurherakml). The imported English snapshot contains 1,894 variants representing 1,100 game cards and 2,491 printings. Every imported data field was compared with the source, with zero mismatches. The empty collection/Auth state recorded at catalog import was historical; real accounts have since been used for the hosted smoke test. The app connects through the typed Supabase adapter; signed out, it shows only the sign-in screen. The hosted verification record distinguishes the confirmed basic flows from outstanding deployment checks. This integration keeps the existing interface and does not select a new frontend framework.

## Backups

**Download backup (JSON)** in the account menu saves the account's owned counts and image overrides as `schemaVersion: 3`, separately from the generated catalog. This is the same format earlier local versions used. Restoring a backup into an account is a follow-up; see [docs/database.md](docs/database.md#next-integration-steps). CSV exports include variant IDs, variant descriptions, and finishes.

Earlier versions stored a local collection under the `riftbound_card_tracker_v1`/`v2`/`v3` localStorage keys and in IndexedDB. This version neither reads nor deletes them.

## Source and licensing notes

Card data comes from [OpenRift](https://openrift.app/developers), a community source. Card names link to OpenRift card pages. Images are loaded on demand rather than redistributed as a bulk image archive.

Riftbound and its associated artwork belong to Riot Games. OpenRift cannot grant rights to Riot's content; see the [Riftbound developer policies](https://developer.riotgames.com/policies/riftbound).

The original project documentation describes the code as MIT-licensed. A separate `LICENSE` file has not yet been checked in. The code-license statement does not grant rights to card data or artwork.
