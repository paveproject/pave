# Build context is the repo root (Cargo workspace), e.g.:
#   docker build -f apps/api/Dockerfile --tag api:latest .
#
# Default command runs the server. To run the one-off auth schema setup
# instead (creates better-auth-rs's tables in the `auth` Postgres schema),
# override the command with the same image:
#   docker run --rm --env-file .env api:latest --setup-db

FROM rust:1-slim-bookworm AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      pkg-config \
      libssl-dev \
      curl \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY .cargo ./.cargo
COPY apps/api/Cargo.toml apps/api/Cargo.toml
COPY apps/api/src apps/api/src
COPY apps/notify/Cargo.toml apps/notify/Cargo.toml
COPY apps/notify/src apps/notify/src
COPY libs/auth/Cargo.toml libs/auth/Cargo.toml
COPY libs/auth/src libs/auth/src
COPY libs/notify-contracts/Cargo.toml libs/notify-contracts/Cargo.toml
COPY libs/notify-contracts/src libs/notify-contracts/src

RUN cargo build --release --locked --bin api

FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --no-create-home api

COPY --from=builder /app/dist/target/release/api /usr/local/bin/api

USER api
EXPOSE 3002
ENTRYPOINT ["/usr/local/bin/api"]
