# pave

Nx monorepo. Rust backend (Axum), Expo/React Native mobile app, Postgres
via Drizzle. Read a package's own `AGENTS.md` (e.g. `libs/db/AGENTS.md`)
when working inside it - this file only covers what spans packages.

## Map

| Path                    | What it is                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`              | Rust/Axum HTTP API. Auth via `better-auth-rs` (SeaORM entities, see `libs/auth`). Emits its own OpenAPI spec (`--emit-openapi <path>`).                                                                                |
| `apps/notify`           | Rust worker, BullMQ-style jobs over Redis. Shares `libs/notify-contracts` with `apps/api`.                                                                                                                             |
| `apps/mobile`           | Expo/React Native. Consumes `libs/query-client`, not `libs/api-js` directly.                                                                                                                                           |
| `apps/postgres`         | Just the Dockerfile for the Postgres image deployed in `infra` - no app code.                                                                                                                                          |
| `libs/db`               | Drizzle schema + migrations. Sole owner of every Postgres schema, `auth` included - see its own `AGENTS.md`.                                                                                                           |
| `libs/auth`             | SeaORM entities `better-auth-rs` reads/writes at runtime. Issues no DDL itself (`libs/db` does) - don't add a `create_*_tables` function back here.                                                                    |
| `libs/notify-contracts` | Shared job payload types between `apps/api` and `apps/notify`.                                                                                                                                                         |
| `libs/api-js`           | **Generated.** `nx codegen api-js` (`npx openapi-ts`) regenerates `src/__generated__/*` from `apps/api/.openapi/openapi.json`. Never hand-edit anything under `__generated__`; it's overwritten wholesale on next run. |
| `libs/query-client`     | Hand-written `@tanstack/react-query` wrapper around `libs/api-js`'s generated client/types. This is what `apps/mobile` actually imports.                                                                               |

## Two gotchas that will bite again

**API client goes stale silently.** Changing a route/DTO in `apps/api`
does not auto-regenerate `libs/api-js` - no CI step does this today.
After changing API routes: run `apps/api`'s binary with
`--emit-openapi <path>` to refresh `apps/api/.openapi/openapi.json`,
then `nx codegen api-js`. `libs/query-client` only needs touching if
the shape of what you wrap changed, not just the generated types.

**`nx affected` doesn't see Dockerfile `COPY`s.** `apps/api/Dockerfile`
and `libs/db/Dockerfile` both `COPY` source from `libs/auth`/
`libs/notify-contracts`/`apps/notify` - Nx has no way to know this (it
infers deps from declared project relationships, not Dockerfile
content). A change to a shared lib alone can under-scope `nx affected
-t docker-build`, silently skipping an image that actually needed a
rebuild. `.github/workflows/cd.yml`'s `workflow_dispatch -f all=true`
forces `nx run-many -t docker-build --all` as the escape hatch - use
it whenever only a shared lib changed and you're not sure every
dependent image got rebuilt.

## Route conventions (`apps/api`)

- **Singular segment for one resource, plural for a collection.**
  `GET /user/{user_id}/protest-sessions` lists; `PUT
/protest-session/{protest_session_id}` addresses one. A sub-resource nests
  under the singular namespace: `/user/{user_id}/trusted-contact/invite`,
  `/trusted-contact/invite/redeem`.
- **Path params are snake_case and named after the resource** - `{user_id}`,
  `{protest_session_id}`, `{blob_id}`, never a bare `{id}`, which goes
  ambiguous as soon as a path carries two.
- **`/me` is only for what has no sense addressed by an id**: the profile,
  avatar, push token, recovery-phrase blob, DEK generation counter, the
  aggregate pending-actions feed, the per-user websocket. Anything owned by an
  account that a trusted contact could one day read goes under
  `/user/{user_id}/...`, so the path can express that access even while the
  guard still refuses it.
- **404, never 403, for a resource or a `user_id` belonging to someone else** -
  a 403 confirms it exists. 403 is reserved for capability and state (the
  caller's own device isn't `active`, "already active"). The single
  user-scope check is `app::access::authorize_user_scope`; item routes push
  ownership into the `WHERE` clause (`find_owned_*`).
- **Routers declare absolute paths and are merged, not nested** (except `/me`).
  `#[utoipa::path]` already spells the absolute path by hand, so keeping both
  absolute means a grep finds the route and its doc, and they must match.
- The folder tree mirrors the URL tree: `app/users/trusted_contact/invite/`
  serves `/user/{user_id}/trusted-contact/invite`. Folders are snake_case
  because a Rust module name cannot contain a hyphen. DTOs and query helpers
  live in the domain module that also serves the item routes
  (`app::trusted_contacts`), imported from `app::users::*`.
- `libs/query-client` mirrors this: a `/user/{user_id}/...` resource gets a
  `userKeys`/`user*Options` entry, an item route its own domain folder. Every
  user-scoped factory takes an optional `userId` with `enabled: !!userId`,
  because several screens mount before `/me` has answered.

## Conventions

- Never add an AI co-author trailer to commits.
- Never `git push` without explicit confirmation first - committing locally is fine.
