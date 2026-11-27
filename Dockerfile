# HR SAO website (Astro + EmDash, Node.js, SQLite) — one container, data kept in the /data volume.
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
LABEL org.opencontainers.image.version=$APP_VERSION
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
# the site uses the domain each request was opened with (scripts/public-origin.mjs + astro.config.mjs
# security.allowedDomains); FALLBACK_SITE_URL is used only when the proxy does not pass the domain on.
# EMDASH_SITE_URL in .env, when set, overrides both.
ARG DEFAULT_SITE_URL=
ENV FALLBACK_SITE_URL=$DEFAULT_SITE_URL
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/patches ./patches
COPY --from=build /app/scripts ./scripts
# content at handover time; copied into /data on the first start only
COPY --from=build /app/data.db ./initial-data/data.db
COPY --from=build /app/uploads ./initial-data/uploads
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data && chown node:node /data \
	# admin sign-in sessions: Astro writes them to node_modules/.astro/sessions (read-only for the node
	# user), so point that at the volume; sessions also survive updating to a new image
	&& mkdir -p /app/node_modules/.astro && rm -rf /app/node_modules/.astro/sessions \
	&& ln -s /data/sessions /app/node_modules/.astro/sessions
USER node
# the app reads ./data.db, ./uploads and ./data relative to the working directory
WORKDIR /data
VOLUME /data
EXPOSE 4321
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--import", "/app/scripts/public-origin.mjs", "/app/dist/server/entry.mjs"]
