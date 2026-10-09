#!/bin/sh
# Runs both migration steps in order, as one-off job (see libs/db/Dockerfile):
#   1. Drizzle migrate + reference data seed, for everything but auth.
#   2. better-auth-rs schema setup, for the `auth` Postgres schema.
set -e

echo "==> Drizzle migrate + seed"
bun /app/run-setup.cjs

echo "==> better-auth schema setup"
auth_migrate
