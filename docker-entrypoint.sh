#!/bin/sh
set -e
cd /data
echo "HR SAO website version ${APP_VERSION:-dev}"
if [ -n "$EMDASH_SITE_URL" ]; then echo "Site URL: $EMDASH_SITE_URL (fixed by EMDASH_SITE_URL)"
else echo "Site URL: taken from each request (fallback ${FALLBACK_SITE_URL:-none})"; fi
# first start: put the handover content into the volume (later starts keep the live data)
if [ ! -f data.db ]; then
	echo "First start: copying initial content into /data"
	cp /app/initial-data/data.db data.db
	mkdir -p uploads && cp -R /app/initial-data/uploads/. uploads/
fi
mkdir -p uploads data sessions
# database patches that come with this version (each runs once; see patches/README.md)
node --no-warnings /app/scripts/apply-patches.mjs /app/patches
if [ -z "$EMDASH_ENCRYPTION_KEY" ]; then
	echo "WARNING: EMDASH_ENCRYPTION_KEY is not set — stored settings cannot be read" >&2
fi
exec "$@"
