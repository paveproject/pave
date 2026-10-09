ARG POSTGRES_VERSION=18

FROM postgres:${POSTGRES_VERSION}-bookworm

ARG POSTGRES_VERSION=18

# Add extensions here as the app needs them (one apt-get layer to keep the image lean).
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		postgresql-${POSTGRES_VERSION}-postgis-3 \
	&& rm -rf /var/lib/apt/lists/*
