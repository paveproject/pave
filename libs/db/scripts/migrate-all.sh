#!/bin/sh
# Runs both migration steps in order, as one-off job (see libs/db/Dockerfile):
#   1. better-auth-rs schema setup, for the `auth` Postgres schema.
#   2. Drizzle migrate + reference data seed, for everything but auth.
# auth first: Drizzle's own migrations add a FOREIGN KEY from "user" to
# "auth"."users" (confirmed failing with "schema auth does not exist"
# when run the other way round) - that schema/table must exist first.
set -e

echo "==> better-auth schema setup"
auth_migrate

echo "==> Drizzle migrate + seed"
bun /app/run-setup.cjs
