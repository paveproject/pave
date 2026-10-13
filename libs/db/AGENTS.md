# libs/db

Drizzle owns every Postgres schema used by `pave` - `public`, `i18n`,
`system`, `extensions`, and `auth`. All of it, no exceptions.

## Why this needs saying

`auth` used to be a second, competing source of truth: `better-auth-rs`
(the Rust auth library `apps/api` uses) issued its own `CREATE SCHEMA
auth` + `CREATE TABLE` statements via a `create_auth_tables()` function
and a standalone `auth_migrate` binary, run as a separate step before
Drizzle's own migration. Two systems racing to create the same schema
broke in three different ways before it got fixed (see migration
`0013_create_auth_tables.sql` and `libs/auth/src/schema.rs`'s history
if you need the full story) - don't reintroduce a second owner.

What stands today:

- `src/lib/schemas/auth.ts` is a normal Drizzle schema file, in
  `drizzle.config.ts`'s `schema`/`schemaFilter` like every other one.
  Keep its tables/FKs/indexes in sync **by hand** with `libs/auth/src/
schema.rs`'s SeaORM entities - the two must agree, since
  `better-auth-rs` reads/writes these tables without knowing Drizzle
  created them. There is no tooling that checks this for you.
- `libs/auth/src/schema.rs` has the entity definitions `better-auth-rs`
  needs at runtime, and nothing else - no DDL, no `create_*_tables`
  function. If you're tempted to add one back, don't; add a Drizzle
  migration instead.
- `scripts/migrate-all.sh` is one step now (`bun run-setup.cjs`) - no
  `auth_migrate` binary, no ordering to get right between two systems.

## The search_path trap

Postgres silently skips a schema named in `search_path` that doesn't
exist yet and falls through to the next one - no error, no warning.
This is exactly how the old dual-ownership bug stayed hidden: tables
meant for `auth` landed in `public` with a clean exit code. If a
migration ever needs a schema to exist before some statement in it
runs, create it explicitly in that same migration (`CREATE SCHEMA IF
NOT EXISTS ...`) - never assume an earlier step already did.

## Migration history note

`0000_productive_demogoblin.sql` still contains a dead, never-applied
`auth.account`/`session`/`user`/`verification` sub-tree (singular table
names - not what's live) from an abandoned earlier design, cleaned up
by `0004_grey_dark_beast.sql`'s `DROP ... CASCADE`. It's intentionally
left as-is: editing an already-generated migration is unusual and the
one time it seemed necessary, the actual fix turned out to be an
additive migration (`0013`) instead - see `0004`'s comment before
touching `0000`.
