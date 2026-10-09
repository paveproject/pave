FROM minio/mc:latest

COPY libs/assets/static/ /static/
COPY libs/assets/entrypoint.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
