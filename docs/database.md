# Supabase database foundation

> Keep It Simple, But Significant

Supabase is the selected backend. Start with a shared catalog and one private collection per user. The frontend framework is independent of this decision. The browser now includes a TypeScript Supabase adapter and email/password login. Local mode uses the bundled catalog and IndexedDB; signed-in mode reads the shared catalog and the private collection from Supabase.

## Development deployment

- Project: [riftbound-tracker](https://supabase.com/dashboard/project/jhleumwhywdurherakml), reference `jhleumwhywdurherakml`.
- Region: Frankfurt (`eu-central-1`), PostgreSQL 17.
- API URL: `https://jhleumwhywdurherakml.supabase.co`.
- Applied migration: `20261029164445_initial_catalog_and_collection.sql`. The filename matches the version recorded by Supabase; its SQL is unchanged from the reviewed initial migration.
- Database types: `types/database.generated.ts`, generated from the deployed schema.

The catalog contains 1,894 active variants from the bundled OpenRift snapshot dated `2026-10-28T11:08:40.770Z`: 1,100 distinct game cards and 2,491 distinct English printing IDs. All imported fields were compared to the expected rows using PostgreSQL JSONB equality, with zero mismatches. Collection items and Auth users remain empty; RLS is enabled, anonymous catalog reads are denied, and authenticated catalog writes are denied.

A hosted SQL smoke check previously created temporary user/variant fixtures in a transaction, exercised actual `auth.uid()`, roles, RLS and quantity constraints, then rolled everything back. Owner updates succeeded; cross-user reads/updates/inserts, anonymous access, client catalog writes, and negative quantities were rejected. The browser publishable key was also tested against the hosted Auth settings endpoint (HTTP 200) and Data API: anonymous reads of both tables return HTTP 401 / PostgreSQL 42501, as intended. Hosted email sign-in and a two-device authenticated test with real accounts remain outstanding.

The security advisor reported no findings after schema deployment. The performance advisor reported only an [unused index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) on `collection_items_variant_id_idx`, expected while the collection table is empty. Keep this foreign-key index for catalog reference checks.

The initial migration has now been deployed. Add a new migration for subsequent schema changes; do not edit the deployed SQL.

## Data model

| Table | Purpose | Access |
| --- | --- | --- |
| `auth.users` | Supabase-managed identities. Referenced by UUID; passwords are never stored in application tables. | Managed by Supabase Auth. |
| `public.catalog_variants` | One row per existing tracker variant, preserving `openrift-*` IDs. Normal/foil twins share a variant. | Authenticated users read; a trusted import process writes. |
| `public.collection_items` | Normal/foil quantities and optional image override, keyed by `(user_id, variant_id)`. | Each signed-in user manages only their own rows. |

Catalog columns hold the ID, underlying card ID, name, collector number, set, available finishes, active state, and import timestamp. Additional catalog fields belong in `details` (a JSON object), including provider printing IDs, image references, domains, rules, and other game metadata. This is not a direct copy of the browser `CatalogEntry` shape: the typed adapter maps the database columns and details explicitly.

Owned quantities remain separate from the shared catalog. Missing catalog variants should be archived with `active = false`, not deleted; the foreign key blocks deletion of an owned variant. Existing quantities can still be reduced on archived variants.

## Catalog import and refresh

Generate the SQL from the reviewed browser snapshot:

```bash
npm run catalog:sql
```

This compiles `scripts/export-supabase-catalog.mts`, parses the two generated JSON assignments in `cards.js` without evaluating JavaScript, validates variant/printing identities and completeness, and writes `.cache/catalog-import.sql`. Apply that SQL through the Supabase SQL Editor, the Supabase connector, or a trusted database connection. Generating the file does not itself contact the database or require credentials.

To refresh from OpenRift first, use the existing cached importer and rebuild the standalone app before generating the database import:

```bash
npm run catalog:update
npm run standalone:build
npm run catalog:sql
```

Optional input/output paths are supported:

```bash
npm run catalog:sql -- --input cards.js --output .cache/catalog-import.sql
```

The generated SQL runs as one atomic `DO` statement. It serializes refreshes with an advisory lock and briefly blocks collection writes while checking compatibility. It upserts by the existing variant IDs, reactivates returning variants, and archives missing OpenRift variants. It never deletes variants or updates owned quantities. Changes to the identity or available finishes of an owned variant abort the import for review. Repeat imports preserve the same identities, data and quantities; `imported_at` records the latest refresh.

The database rows retain the application fields, rules, images, provider printing IDs, `printingSizes`, and the source timestamp (`details.catalogImportedAt`). Personal counts and the duplicated raw `printings` objects are excluded. Full printing details remain in the bundled source and importer cache. The online adapter loads size summaries and includes archived variants referenced by collection rows. A future local-backup importer must use `printingSizes` where legacy matching previously inspected raw printing objects.

The exporter prints counts and a SHA-256 of the normalized row payload. The first imported payload hash is `693d4688d6940bd53ecb6f641007fc594982185f8f2179e04f0535ee9056d702`. Generated SQL and compiled tools are ignored by Git. Data refreshes do not modify schema migrations.

## Integrity and write behavior

- Counts are integers between 0 and 999, matching the existing backup validator.
- Normal and foil quantities must match the variant's available finishes. Metal variants continue using the current normal/special-finish counter.
- A trigger sets `updated_at` and increments `revision` on collection updates. A future absolute-value editor should use `revision` as an optimistic concurrency condition and detect zero updated rows.
- `adjust_collection_quantity(p_variant_id, p_finish, p_delta)` changes one catalog-backed quantity using an atomic SQL update. It derives the owner from `auth.uid()`, runs with caller permissions, and remains subject to RLS. Negative or overflowing results fail and roll back.
- A delta is not idempotent: after a timeout, read the stored result before deciding whether to repeat it. Do not automatically retry an uncertain increment.
- Direct catalog writes are reserved for the trusted importer. Before changing a variant's identity or finish availability, check affected quantities; a catalog metadata update does not automatically revalidate existing rows or remap them.

The first online version tracks catalog-backed cards only. Custom cards, shared collections, public profiles, transaction history, and an offline write queue are deferred until their user flow is defined. The existing browser app still supports custom and unresolved entries locally; its storage and backup format are unchanged.

## Local verification

```bash
npm ci
npm run typecheck
npm run test:database
```

Tests use PGlite, an embedded PostgreSQL engine, without a Docker dependency. They create minimal `auth.users`, `auth.uid()`, and role fixtures, then execute the actual migration. They verify anonymous denial, read-only catalog access, isolation between two user identities, valid owner CRUD, owner reassignment denial, quantity/finish constraints, rollback, catalog edits, and deletion behavior. The complete `npm test` command includes these tests, so CI runs them too.

Additional SDK/jsdom tests and the Chrome flow use deterministic Auth/PostgREST responses. They verify pagination below the requested page size, isolated accounts, competing edits/inserts, lost responses without retries, session transitions, and preserved local records. They do not establish hosted email delivery or real authenticated two-device behavior. Complete the account test below before relying on online collection data.

## Apply to Supabase

The development project above is already provisioned and migrated. The following commands describe how to link a local checkout or deploy the versioned schema to another fresh development project.

1. Create or select a Supabase development project and choose its region.
2. Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and authenticate it through `supabase login`.
3. Link the project and review the migration plan:

   ```bash
   supabase link --project-ref jhleumwhywdurherakml
   supabase db push --dry-run
   ```

4. Apply pending reviewed migrations (the existing initial migration is already recorded in the linked development project):

   ```bash
   supabase db push
   ```

5. Generate database types once the schema is applied:

   ```bash
   supabase gen types typescript --linked > types/database.generated.ts
   ```

The repository's minimal `supabase/config.toml` targets PostgreSQL 17 for local development. Confirm the hosted project's version when linking. Its signup setting and localhost URL configure the local stack; a database push does not configure hosted Auth. Configure the hosted email/password flow, callback URLs and email delivery separately as described below.

For local full-stack development, `supabase start` requires a supported container runtime. `supabase db reset --local` rebuilds that disposable local database from migrations; do not use reset commands on a database containing collection data you need to retain.

## Authentication and first account test

The browser uses the pinned `@supabase/supabase-js` package, a publishable key, persisted Auth sessions, and the existing owner-scoped policies. Each data client checks that the active session still belongs to its repository owner before supplying a request token. A session switch immediately clears the previous view and invalidates pending UI responses. Supabase remains responsible for authentication and authorization.

Hosted settings checked on 2026-10-29: email authentication enabled, signup enabled, email confirmation required, anonymous sign-in disabled. No hosted settings or real accounts were changed by the integration.

Before registering:

1. In [Auth URL Configuration](https://supabase.com/dashboard/project/jhleumwhywdurherakml/auth/url-configuration), set the deployed HTTPS Site URL and allow the actual confirmation redirect URL. For the local server shown in the README, add `http://127.0.0.1:8765/`. Avoid broad production wildcards.
2. In Auth email settings, configure your SMTP sender for real users. The [default sender](https://supabase.com/docs/guides/auth/auth-smtp) is restricted to organization team addresses and intended for initial testing. Keep email confirmation enabled.
3. Open the app, create your own account, confirm the email, and sign in. No credentials should be posted to issues or chat. The confirmation link should return to the configured app URL.
4. Sign in on a second device. Increment the same variant on both; reload and verify both changes remain. Test a stale absolute edit: the app should report a conflict and reload, rather than overwrite.
5. Use a second real account to verify it starts with its own collection and cannot read or modify the first account's rows through the Data API. Export a backup, reload, sign out and confirm the local browser collection is still intact.

The connector does not expose hosted Auth configuration updates, so these dashboard settings are documented. Password recovery UI, cloud backup restore and local-to-cloud transfer are follow-ups. Existing backups/custom or unresolved cards must remain intact until a transactional importer can report unsupported entries before writing.

The online UI waits for write confirmation. Button adjustments use the existing atomic RPC with SDK retries explicitly disabled. Absolute edits, paired quick entry and image changes use revision-conditional updates or conflict-detecting first inserts. Old edit dialogs are invalidated after a refresh. After a failed/uncertain write, the controller reads the server state; if that read also fails, editing stays locked. Refresh on tab return or use the reload button; there is no live subscription or offline write queue.

## Next integration steps

1. Complete the hosted account and email test above, then choose a static host and configure its HTTPS URL.
2. Add lossless local/backup transfer: validate all entries, stop on custom or unresolved cards, commit all supported changes transactionally and idempotently, then compare totals. Never silently skip quantities or replace a live collection with an old browser snapshot.
3. Add password recovery and establish database backup/restore procedures before inviting other users.

Browser configuration may contain the Supabase project URL and publishable key. Trusted import credentials and service-role/secret keys belong only in server or CI secrets, never in browser code or commits.

## References

- [Supabase database migrations](https://supabase.com/docs/guides/local-development/database-migrations)
- [Row Level Security and grants](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database functions and permissions](https://supabase.com/docs/guides/database/functions)
- [PGlite API](https://pglite.dev/docs/api)
