# Build context is the repo root (npm workspace), e.g.:
#   docker build -f libs/db/Dockerfile --tag db:latest .
#
# One-off migration job run on deploy: Drizzle migrate + seed, auth schema
# included (see libs/db/src/lib/schemas/auth.ts).

FROM oven/bun:1.4.2 AS runtime
WORKDIR /app

# drizzle-orm and pg are bundled into run-setup.cjs (build-migrator), nothing to install
COPY dist/libs/db-migrator ./
COPY libs/db/scripts/migrate-all.sh /usr/local/bin/migrate-all.sh
RUN chmod +x /usr/local/bin/migrate-all.sh

CMD ["/usr/local/bin/migrate-all.sh"]
