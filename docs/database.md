# Supabase database foundation

> Keep It Simple, But Significant

Supabase is the selected backend. Start with a shared catalog and one private collection per user. The frontend framework is independent of this decision. This change provides a database migration and tests; the current browser app still uses its bundled catalog and local IndexedDB.

## Data model

| Table | Purpose | Access |
| --- | --- | --- |
| `auth.users` | Supabase-managed identities. Referenced by UUID; passwords are never stored in application tables. | Managed by Supabase Auth. |
| `public.catalog_variants` | One row per existing tracker variant, preserving `openrift-*` IDs. Normal/foil twins share a variant. | Authenticated users read; a trusted import process writes. |
| `public.collection_items` | Normal/foil quantities and optional image override, keyed by `(user_id, variant_id)`. | Each signed-in user manages only their own rows. |

Catalog columns hold the ID, underlying card ID, name, collector number, set, available finishes, active state, and import timestamp. Additional catalog fields belong in `details` (a JSON object), including provider printing IDs, image references, domains, rules, and other game metadata. This is not a direct copy of the browser `CatalogEntry` shape: the future adapter must map the database columns and details explicitly.

Owned quantities remain separate from the shared catalog. Missing catalog variants should be archived with `active = false`, not deleted; the foreign key blocks deletion of an owned variant. Existing quantities can still be reduced on archived variants.

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

These tests do not exercise real login tokens, the Supabase API gateway, email delivery, or simultaneous requests from two devices. Verify those against a local full Supabase stack or a staging project before connecting real collection data.

## Apply to Supabase

Use a fresh development project for the first application of this initial migration. No cloud project is created by this repository.

1. Create or select a Supabase development project and choose its region.
2. Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and authenticate it through `supabase login`.
3. Link the project and review the migration plan:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push --dry-run
   ```

4. Apply the reviewed migration:

   ```bash
   supabase db push
   ```

5. Generate database types once the schema is applied:

   ```bash
   supabase gen types typescript --linked > types/database.generated.ts
   ```

The repository's minimal `supabase/config.toml` targets PostgreSQL 17 for local development. Confirm the hosted project's version when linking. Its signup setting and localhost URL configure the local stack; a database push does not configure hosted Auth. Set hosted signup, callback URLs, login method, and email delivery separately when the login flow is implemented.

For local full-stack development, `supabase start` requires a supported container runtime. `supabase db reset --local` rebuilds that disposable local database from migrations; do not use reset commands on a database containing collection data you need to retain.

## Connect the application in the next phase

1. Build a trusted catalog import that upserts the existing variants, preserves provider printing IDs, and archives missing rows without deleting quantities. Keep full upstream data in the importer cache rather than duplicating raw printings in every client response.
2. Add login and a typed Supabase data adapter. The configured API response limit is 1,000 rows, below the current 1,894 variants: paginate catalog reads rather than assuming one request returns everything.
3. Show save success or failure explicitly. Use quantity deltas for counter buttons and revision-checked writes for direct edits.
4. Import existing backups through the current matching/review logic. Make cloud imports transactional and idempotent and compare totals. If a backup contains custom or unresolved entries, the future importer must stop before writing, report those entries for review, and keep the original backup and local collection intact. Never silently skip their quantities. This migration does not import any collection automatically.
5. Verify two real accounts cannot access each other's rows through the Data API, test a save/reload across two devices, and establish database backup/restore procedures.

Browser configuration may contain the Supabase project URL and publishable key. Trusted import credentials and service-role/secret keys belong only in server or CI secrets, never in browser code or commits.

## References

- [Supabase database migrations](https://supabase.com/docs/guides/local-development/database-migrations)
- [Row Level Security and grants](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database functions and permissions](https://supabase.com/docs/guides/database/functions)
- [PGlite API](https://pglite.dev/docs/api)
