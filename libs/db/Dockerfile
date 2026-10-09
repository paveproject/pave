# Build context is the repo root (npm workspace + Cargo workspace), e.g.:
#   docker build -f libs/db/Dockerfile --tag db:latest .
#
# One-off migration job run on deploy: Drizzle migrate + seed, then the
# better-auth-rs schema setup in the `auth` Postgres schema (libs/auth).

FROM rust:1-slim-bookworm AS auth-builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      pkg-config \
      libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY .cargo ./.cargo
COPY apps/api/Cargo.toml apps/api/Cargo.toml
COPY apps/api/src apps/api/src
COPY libs/auth/Cargo.toml libs/auth/Cargo.toml
COPY libs/auth/src libs/auth/src

RUN cargo build --release --locked --bin auth_migrate -p auth

# glibc (not -alpine/musl) base, to match the auth-builder's glibc binary.
FROM oven/bun:1.4.2 AS runtime
WORKDIR /app

# drizzle-orm and pg are bundled into run-setup.cjs (build-migrator), nothing to install
COPY dist/libs/db-migrator ./
COPY --from=auth-builder /app/dist/target/release/auth_migrate /usr/local/bin/auth_migrate
COPY libs/db/scripts/migrate-all.sh /usr/local/bin/migrate-all.sh
RUN chmod +x /usr/local/bin/migrate-all.sh

CMD ["/usr/local/bin/migrate-all.sh"]
