# Riftbound Tracker

> Keep It Simple, But Significant

A browser-based collection tracker for Riftbound TCG. Track normal and foil copies, browse a card binder or table, check collection progress, and export your collection.

Repository documentation and development communication use English. See [AGENTS.md](AGENTS.md) for the repository conventions. The existing user interface uses German labels; card data is imported in English.

## Run the app

Clone the repository and open `index.html` in a browser. The generated `riftbound_tracker.html` offers the same app in one HTML file.

For a consistent local web address, serve the repository directory with Python 3:

```bash
git clone https://github.com/SpoogyOh/riftbound-tracker.git
cd riftbound-tracker
python3 -m http.server 8765 --bind 127.0.0.1
```

Open <http://127.0.0.1:8765>. Node.js and npm are needed for development commands and catalog updates, not to run the bundled app. Styling uses Tailwind's CDN script; card images load on demand. A generated SVG placeholder is used when a card image fails to load.

Browser storage belongs to the browser profile and origin. Export a JSON backup before moving between a local file, a local server, or another domain. The app does not synchronize collections between devices.

## Features

- Separate normal and foil quantities, with buttons and direct number entry.
- Table and binder views, card-image lightbox, foil effects, and collection statistics.
- Quick entry by card name or collector number. Ambiguous matches require an explicit variant selection.
- Filters for ownership, domains, set, card type, and rarity, plus several sorting options.
- English card catalog imported from [OpenRift](https://openrift.app/developers).
- IndexedDB persistence, a labeled localStorage fallback, JSON backup/restore, and CSV export.
- Custom cards and custom image URLs or uploaded images.

Normal/foil twins share one catalog row with two counters. Alternate art, signatures, promo markers, different sizes, and special metal finishes remain separate variants. The normal/special-finish counter stores metal copies; unavailable finishes are disabled. Catalog progress counts variants rather than only distinct game cards.

## Repository map

| File or directory | Responsibility | When to change it |
| --- | --- | --- |
| `README.md` | Project overview, setup instructions, repository map, and data-flow guide. | Explain how to use or develop the project. |
| `index.html` | Main page structure: buttons, forms, table, grid, dialogs, and custom CSS. Loads the shared JavaScript files. | Change the interface layout or add a control. |
| `app.js` | Connects the interface to the data. Handles clicks, counters, filtering, rendering, statistics, images, and export/import actions. | Change how the app behaves. |
| `collection.js` | Validates backup records, matches saved quantities to catalog entries, preserves uncertain legacy entries, and creates compact collection snapshots. | Change collection rules, migration, or the backup format. |
| `storage.js` | Reads and writes collection snapshots in IndexedDB. Serializes writes and handles the localStorage fallback and legacy storage keys. | Change how personal collection data is persisted. |
| `cards.js` | Generated card catalog, variant IDs, metadata, rules text, values, keywords, tags, image references, and underlying printing details. | Regenerate it with the importer. |
| `types/models.ts` | Shared TypeScript models for catalog rows, physical printings, metadata, quantities, and collection backups. | Change the data contracts as features evolve. |
| `types/openrift.ts` | Expected upstream fields consumed by the importer. | Update the OpenRift input contract. |
| `types/browser.d.ts` | Declares the two generated catalog globals on `window`. | Change how browser scripts access the catalog. |
| `tsconfig.json` | Strict type-checking scope for the first migration phase. | Add a source file as it is migrated. |
| `supabase/` | Versioned PostgreSQL schema, access policies, quantity adjustment function, and local Supabase configuration. | Evolve the central database through new migrations. |
| `docs/database.md` | Data model, setup steps, access rules, and boundaries of the database foundation. | Change the online-storage design or setup instructions. |
| `scripts/import-openrift.mjs` | Downloads or reads OpenRift data, validates and normalizes it, groups normal/foil twins, and generates `cards.js`. | Change the data source or catalog mapping. |
| `scripts/build-standalone.mjs` | Embeds the shared scripts into `index.html` to generate the single-file app. | Change how the standalone file is built. |
| `riftbound_tracker.html` | Generated single-file version of the app. | Regenerate after shared source changes. |
| `package.json` | Lists development commands, the supported Node.js version, and development dependencies. | Add a command or dependency. |
| `package-lock.json` | Records exact dependency versions and integrity hashes for reproducible installs. | Let npm update it when dependencies change. |
| `playwright.config.cjs` | Configures real-browser tests, Chrome, viewports, the local test server, and reports. | Change browser-test setup. |
| `tests/catalog.test.mjs` | Tests catalog normalization, IDs, migration, quantities, and backup validation. | Verify data and migration changes. |
| `tests/app.test.mjs` | Tests app initialization, controls, persistence, and fallbacks in jsdom with fake-indexeddb. | Verify app logic without launching a browser. |
| `tests/database.test.mjs` | Applies the SQL migration to PGlite and verifies grants, user isolation, quantities, and data preservation. | Verify database changes. |
| `tests/browser/tracker.spec.cjs` | End-to-end tests in real Chrome: migration, native IndexedDB, reload, backups, CSV, filters, variants, desktop/mobile-width views, and an actual image request. | Verify complete user flows. |
| `.github/workflows/browser-test.yml` | GitHub Actions workflow that installs dependencies, runs the tests, and uploads browser reports/screenshots. | Change automated checks. |
| `.gitignore` | Lists local caches, dependencies, temporary files, and reports that Git should not track. | Exclude another generated local artifact. |
| `AGENTS.md` | Repository language and development conventions for coding assistants. | Update project-wide working conventions. |
| `chat-verlauf.md` | Historical German conversation notes from the initial project creation. | Consult for background; it is not current technical documentation. |

The `.html` files describe web pages. The `.js` files contain browser-side JavaScript. The `.mjs` scripts run with Node.js, outside the browser. The `.cjs` files use the CommonJS module format for test configuration/code. Markdown (`.md`) files are documentation; JSON files hold structured configuration/data; YAML (`.yml`) defines the GitHub workflow.

## How the pieces work together

### Catalog updates

1. The developer runs `npm run catalog:update`.
2. `scripts/import-openrift.mjs` reads the English OpenRift catalog and generates `cards.js`.
3. `npm run standalone:build` regenerates `riftbound_tracker.html` from the shared files.
4. The generated catalog is committed with the application source.

The app uses this bundled catalog. It does not query the OpenRift catalog API on every page load. Card images are fetched separately when needed.

### Opening the app

1. `index.html` loads `cards.js`, `collection.js`, `storage.js`, and `app.js` in that order.
2. `app.js` asks `storage.js` for the saved collection.
3. `collection.js` combines the current catalog with saved quantities and custom entries.
4. `app.js` renders the table/grid and updates the statistics.

### Example: adding one normal copy

1. You click `+` on a card.
2. The click handler in `app.js` increases that card's quantity in the current page state.
3. `collection.js` creates a snapshot of personal quantities, custom cards, and image overrides.
4. `storage.js` saves the snapshot in IndexedDB, or uses the labeled fallback.
5. `app.js` refreshes the displayed quantities and statistics.

The shared card catalog answers **which cards exist**. Your browser collection answers **which copies you own**. Personal collection quantities are not uploaded to GitHub or written back to OpenRift.

## Developer commands

Use Node.js 22 or newer. Install the development dependencies with:

```bash
npm ci
```

| Command | What it does |
| --- | --- |
| `npm run catalog:update` | Refreshes the English OpenRift catalog and generates `cards.js`. |
| `npm run standalone:build` | Generates `riftbound_tracker.html` from the current shared source. |
| `npm run typecheck` | Checks the shared TypeScript models and catalog importer. |
| `npm test` | Runs catalog, jsdom/storage, and PostgreSQL database tests without launching a browser. |
| `npm run test:database` | Runs only the database migration and access-control tests. |
| `npm run test:browser` | Runs the Chrome end-to-end tests. |

The browser-test configuration expects an installed Google Chrome and a `python3` executable. It starts a local server automatically, or reuses an existing server locally. The GitHub workflow runs on Ubuntu 24.04 with Chrome already installed.

After changing the shared interface or JavaScript, regenerate the standalone file and run the relevant tests. After changing only documentation, check the text, commands, and file links; rebuilding the catalog is unnecessary.

### Gradual TypeScript migration

The first phase defines shared models in `types/` and checks the existing importer through JSDoc type references, including the catalog entries it constructs. Run `npm run typecheck`; the same check runs in CI. TypeScript is pinned to the JavaScript-based 6.0.3 compiler for compatibility with restricted development environments.

`allowJs` and `checkJs` let checked JavaScript coexist with TypeScript. `noEmit` means this phase does not add a browser build step or generate replacement runtime scripts. The large generated `cards.js` payload is outside the type-checking scope; its transformation is checked at the importer boundary. `collection.js`, `storage.js`, `app.js`, and the tests are outside the type-checking scope until their migration phases; the collection-backup types describe their current format but do not yet check their implementations.

Next, migrate the importer implementation to TypeScript, followed by collection/storage logic and finally the interface code. Keep the generated JavaScript and standalone HTML usable throughout. Type checking does not validate untrusted API responses or imported backups at runtime; the existing runtime checks and tests remain necessary.

### Import behavior

The importer requires no API key. It sends a project-identifying User-Agent, caches the raw response and ETag locally for at least one hour, and uses `If-None-Match` for later updates. HTTP errors do not replace the existing generated catalog. There are no automatic retry loops.

To normalize an existing raw response instead of making an API request:

```bash
node scripts/import-openrift.mjs --input /path/to/catalog.json
npm run standalone:build
```

The generated metadata records the import date and catalog size. A set is marked as a preview when its known English release date is in the future; a missing release date alone does not mark it as unreleased.

## Online database foundation

Supabase (PostgreSQL) is the selected backend for the future online app. The initial migration creates a shared card catalog and an owner-scoped collection table, with explicit grants, Row Level Security, and a quantity adjustment function. The first online version tracks catalog-backed cards; custom cards are deferred. See [docs/database.md](docs/database.md) for setup and the data model.

This prepares the database layer only. The browser app still uses its bundled catalog and IndexedDB; it does not connect to Supabase yet. No hosted project, user account, catalog upload, or personal collection migration is created by the test suite. The frontend framework remains undecided.

## Collection migration and backups

Download a JSON backup before switching versions. The old V1/V2 localStorage keys remain intact during migration.

Legacy entries are assigned to a standard catalog variant only when the card number and normalized name match unambiguously. Conflicting names, ambiguous variants, or removed entries remain available for review with their quantities preserved. New catalog variants appear even when a collection was saved with an older catalog.

Current JSON backups use `schemaVersion: 3`. They contain the personal collection separately from the generated catalog. Old JSON-list backups can still be imported; validation occurs before replacing the current collection. CSV exports include variant IDs, variant descriptions, and finishes.

IndexedDB and localStorage are browser storage, not a cloud account. Browser data can be cleared, so keep JSON backups for copies you want to retain independently of the browser profile.

## Source and licensing notes

Card data comes from [OpenRift](https://openrift.app/developers), a community source. Card names link to OpenRift card pages. Images are loaded on demand rather than redistributed as a bulk image archive.

Riftbound and its associated artwork belong to Riot Games. OpenRift cannot grant rights to Riot's content; see the [Riftbound developer policies](https://developer.riotgames.com/policies/riftbound).

The original project documentation describes the code as MIT-licensed. A separate `LICENSE` file has not yet been checked in. The code-license statement does not grant rights to card data or artwork.
