#!/bin/sh
set -eu

: "${S3_ENDPOINT:=http://rustfs:9000}"
: "${S3_BUCKET:?S3_BUCKET is required}"
: "${S3_ASSETS_PREFIX:=static}"
: "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID is required}"
: "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY is required}"

echo "Waiting for S3 endpoint at ${S3_ENDPOINT}..."
until rc alias set s3 "${S3_ENDPOINT}" "${S3_ACCESS_KEY_ID}" "${S3_SECRET_ACCESS_KEY}" >/dev/null 2>&1; do
  echo "S3 endpoint not reachable yet, retrying in 2s..."
  sleep 2
done

echo "Ensuring bucket ${S3_BUCKET} exists and is public..."
rc bucket create --ignore-existing "s3/${S3_BUCKET}"
rc bucket anonymous set download "s3/${S3_BUCKET}"

echo "Syncing /static -> s3/${S3_BUCKET}/${S3_ASSETS_PREFIX} (uploads changes, removes deleted files)..."
rc mirror --remove --overwrite /static/ "s3/${S3_BUCKET}/${S3_ASSETS_PREFIX}/"

echo "Done. Current contents:"
rc object list --recursive "s3/${S3_BUCKET}/${S3_ASSETS_PREFIX}/"
