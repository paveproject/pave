# RustFS's own S3 CLI (rc): MinIO no longer distributes mc images. Pinned by digest.
FROM rustfs/rc@sha256:ab024bfebee49a750ce886b4c70963ccd9ddaa03f491704a90710641d7a26699

COPY libs/assets/static/ /static/
COPY libs/assets/entrypoint.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
