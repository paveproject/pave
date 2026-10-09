#!/bin/sh
set -eu

: "${S3_ENDPOINT:=http://minio:9000}"
: "${S3_BUCKET:?S3_BUCKET is required}"
: "${S3_ASSETS_PREFIX:=static}"
: "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"

echo "Waiting for MinIO at ${S3_ENDPOINT}..."
until mc alias set myminio "${S3_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null 2>&1; do
  echo "MinIO not reachable yet, retrying in 2s..."
  sleep 2
done

echo "Ensuring bucket ${S3_BUCKET} exists and is public..."
mc mb --ignore-existing "myminio/${S3_BUCKET}"
mc anonymous set download "myminio/${S3_BUCKET}"

echo "Syncing /static -> myminio/${S3_BUCKET}/${S3_ASSETS_PREFIX} (uploads changes, removes deleted files)..."
mc mirror --remove --overwrite /static "myminio/${S3_BUCKET}/${S3_ASSETS_PREFIX}"

echo "Done. Current contents:"
mc ls "myminio/${S3_BUCKET}/${S3_ASSETS_PREFIX}"
