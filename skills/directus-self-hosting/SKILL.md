---
name: directus-self-hosting
description: "Load first, before exploring code, when deploying or running a Directus server: Docker Compose, Postgres and Redis, hosting platforms, env vars, email, file storage, proxies, health checks, several instances, caching and stale data, rate limits, backups, and Directus Cloud. Not for version upgrades (directus-upgrade), moving config between instances (directus-environment-sync), or licensing (directus-access-control)."
metadata:
  author: directus
  directus-version: '12.6.0'
---

# Directus self-hosting

Run Directus in production: the container, its env, the database, file storage, Redis, scaling, and backups. Directus
ships as the `directus/directus` Docker image; everything is configured through environment variables.

_Verified against Directus v12.6.0 source (`Dockerfile`, `docker-entrypoint.cjs`, `packages/env`, `api/src`), live
12.5.1 and 12.6.0 containers, and the self-hosting docs._

## First checks

1. **Check the version before anything else.** `GET /server/info` with a token returns `data.version`. Older than
   12.6: read the version notes for its major in the `directus` skill (`references/versions-v<major>.md`), or without
   that skill `https://directus.com/docs/raw/releases/breaking-changes/version-<major>.md`. Newer: read the release
   notes since 12.6.0 first.
2. **Where does it run?** Self-hosted Docker (or a platform running the image) vs Directus Cloud. On Cloud there is no
   shell or raw env access: load [directus-cloud.md](references/directus-cloud.md) and stop there.
3. **One instance or several?** Several containers, or `PM2_INSTANCES` > 1 in one container, means Redis is required.
4. **Which database and version?** `DB_CLIENT`, and whether it's managed. SQLite is a file in one container's volume:
   one instance only.
5. **Where do files live?** Local volume (`/directus/uploads`) or a storage driver (`STORAGE_LOCATIONS`). Check
   `directus_files.storage` before changing anything.
6. **Pin the image tag,** never `latest`.

## Critical traps

- **The image defaults to SQLite.** It ships `DB_CLIENT=sqlite3` and `DB_FILENAME=/directus/database/database.sqlite`,
  with no volume. A missing or misspelled `DB_*` var boots a working, empty instance whose data is gone on the next
  redeploy. After first boot, check the logs or the database for the tables before adding content.
- **`SECRET` is permanent.** It signs tokens and encrypts stored secrets (AI provider keys, `license_key`,
  `license_token`, deployment credentials). Change it and every session ends and those values decrypt to `null`. Unset,
  each process picks a random one: logins break across restarts and replicas.
- **`ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_TOKEN` only apply on first boot** (empty database). Changing them later
  does nothing. Reset with `node /directus/cli.js users passwd --email <email> --password <new>`.
- **Several instances without Redis break quietly.** Caches, rate limits, WebSocket events, flow and extension reloads
  stay per process. `SYNCHRONIZATION_STORE` stays `memory` even with `REDIS` set, so scheduled flows run once per
  instance until you set it to `redis`. See [scaling.md](references/scaling.md).
- **`CACHE_ENABLED=true` alone serves stale data.** `CACHE_AUTO_PURGE` defaults to `false`: API callers get old
  responses for `CACHE_TTL` while the Studio skips the cache, so editors see their change and the site doesn't. Cache
  semantics: `directus` (`references/performance.md`).
- **Behind a proxy, set `IP_TRUST_PROXY`** (default `false`). Otherwise every user shares the proxy's IP: one client
  trips the rate limit for everyone, and policy IP allowlists and logs see the proxy.
- **Uploads and Marketplace extensions are files in the container** (`/directus/uploads`,
  `/directus/extensions/.registry`). Without a volume or a storage driver they vanish on redeploy.
- **The docs' `wget http://localhost:8055/server/ping` health check can fail.** Busybox `wget` tries `::1` first and
  Directus listens on `0.0.0.0` (IPv4). Use `127.0.0.1`, or `node` (the only option on `-dhi` images, which have no
  shell). `/server/health` returns 403 without a token; probe `/server/ping`.
- **No migration lock.** Every container runs `bootstrap` (install or migrate) on start. Boot one replica first for a
  fresh install or an upgrade, then scale out.

## Routing

- Writing docker-compose, what happens on container start, volumes, permissions, extensions, platform deploys → [docker.md](references/docker.md)
- Env vars: SECRET, PUBLIC_URL, DB, admin bootstrap, CORS, proxies, rate limits, email, storage, logs → [configuration.md](references/configuration.md)
- Several instances, load balancers, Redis, cache and stale data, query limits, DB pool, slow or 503s → [scaling.md](references/scaling.md)
- What to back up, Postgres/MySQL/SQLite dumps, restoring, disaster recovery → [backups-and-recovery.md](references/backups-and-recovery.md)
- The project is on Directus Cloud → [directus-cloud.md](references/directus-cloud.md)

## Related skills

`directus-upgrade` (bumping the image, migrations across versions, `/server/health` and `IP_TRUST_PROXY` changes) ·
`directus-environment-sync` (promote schema and config between instances) · `directus-access-control` (licensing,
core-tier limits, lockdown) · `directus-extensions` (building and loading extensions) · `directus-content-modeling`
(indexes) · `directus` (query performance, REST)

## Go deeper

1. Directus docs MCP server: `https://directus.com/docs/mcp` (no auth; tools `search-docs`, `get-doc`, `list-docs`,
   `search-directus-code`, `get-directus-file`). Env defaults live in `packages/env/src/constants/defaults.ts`.
2. Raw markdown for any docs page: `https://directus.com/docs/raw/<path>.md`, for example
   `https://directus.com/docs/raw/self-hosting/deploying.md` and `configuration/*.md`. Index:
   `https://directus.com/docs/llms.txt`.
3. The instance itself: container logs (startup warnings name missing `SECRET`, relative `PUBLIC_URL`, pending
   migrations), `GET /server/ping`, `GET /server/health` with an admin token, `GET /server/info`.
