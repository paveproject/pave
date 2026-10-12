#!/bin/sh
# One-off migration job run on deploy (see libs/db/Dockerfile): Drizzle
# migrate + reference data seed, auth schema included (see
# libs/db/src/lib/schemas/auth.ts).
set -e

echo "==> Drizzle migrate + seed"
bun /app/run-setup.cjs
