FROM postgres:18-alpine

RUN apk add --no-cache curl jq openssl

COPY deploy/backup.sh /usr/local/bin/taste-backup
RUN chmod 0755 /usr/local/bin/taste-backup

ENTRYPOINT ["/usr/local/bin/taste-backup"]
