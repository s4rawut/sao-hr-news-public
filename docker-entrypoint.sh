#!/bin/sh
set -e
cd /data
# first start: put the handover content into the volume (later starts keep the live data)
if [ ! -f data.db ]; then
	echo "First start: copying initial content into /data"
	cp /app/initial-data/data.db data.db
	mkdir -p uploads && cp -R /app/initial-data/uploads/. uploads/
fi
mkdir -p uploads data
if [ -z "$EMDASH_ENCRYPTION_KEY" ]; then
	echo "WARNING: EMDASH_ENCRYPTION_KEY is not set — stored settings cannot be read" >&2
fi
exec "$@"
