# Docker

- [Production compose](#production-compose)
- [What runs on container start](#what-runs-on-container-start)
- [Volumes and permissions](#volumes-and-permissions)
- [Extensions in the image](#extensions-in-the-image)
- [CLI and upgrades](#cli-and-upgrades)
- [Platforms](#platforms)

## Production compose

Copyable as written. Secrets come from a `.env` file next to it (compose refuses to start if they're missing). Generate
`SECRET` once with `openssl rand -base64 32` and keep it forever.

```yaml
services:
  database:
    image: postgres:17 # postgis/postgis:17-3.5 for geometry fields (no arm64 build)
    restart: unless-stopped
    volumes:
      - db_data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: directus
      POSTGRES_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD}
      POSTGRES_DB: directus
    healthcheck:
      test: ['CMD', 'pg_isready', '--host=localhost', '--username=directus']
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  cache:
    image: redis:7
    restart: unless-stopped
    healthcheck:
      test: ['CMD-SHELL', "[ $$(redis-cli ping) = 'PONG' ]"]
      interval: 10s
      timeout: 5s
      retries: 5

  directus:
    image: directus/directus:12.5.1 # pin; never latest
    restart: unless-stopped
    ports:
      - '127.0.0.1:8055:8055' # TLS reverse proxy in front
    volumes:
      - uploads:/directus/uploads
      - ./extensions:/directus/extensions # must be writable by uid 1000
    depends_on:
      database:
        condition: service_healthy
      cache:
        condition: service_healthy
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "fetch('http://127.0.0.1:8055/server/ping').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))",
        ]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 60s
    environment:
      SECRET: ${DIRECTUS_SECRET:?set DIRECTUS_SECRET}
      PUBLIC_URL: https://cms.example.com
      DB_CLIENT: pg
      DB_HOST: database
      DB_PORT: '5432'
      DB_DATABASE: directus
      DB_USER: directus
      DB_PASSWORD: ${DB_PASSWORD}
      REDIS: redis://cache:6379
      CACHE_ENABLED: 'true'
      CACHE_STORE: redis
      CACHE_AUTO_PURGE: 'true'
      RATE_LIMITER_STORE: redis
      SYNCHRONIZATION_STORE: redis
      IP_TRUST_PROXY: '1' # one proxy hop in front; see configuration.md
      SESSION_COOKIE_SECURE: 'true' # PUBLIC_URL is HTTPS
      REFRESH_TOKEN_COOKIE_SECURE: 'true'
      ADMIN_EMAIL: ${ADMIN_EMAIL:-} # first boot only
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}

volumes:
  db_data:
  uploads:
```

- **The health check uses `node`, not the docs' `wget --spider http://localhost:8055/server/ping`.** That fails in the
  12.5.1 image: busybox `wget` resolves `localhost` to `::1` and Directus binds `0.0.0.0` (IPv4 only). The `-dhi`
  image has no shell or `wget` at all; `node` works on both.
- **`restart: unless-stopped` matters.** PM2 in the container doesn't restart a crashed process (`PM2_AUTO_RESTART`
  defaults to `false`).
- Leave `ADMIN_*` empty to create the first admin in the Studio onboarding screen instead.
- Expose 8055 only to the reverse proxy. Directus doesn't terminate TLS.

## What runs on container start

`node docker-entrypoint.cjs` runs `cli.js bootstrap`, then hands off to `pm2-runtime` (`PM2_INSTANCES` processes,
default `1`). Bootstrap retries the DB 5 times, 5 seconds apart, then exits and the container stops. On an empty
database it installs system tables, runs all migrations, and creates the admin from `ADMIN_*`. On an existing one it
logs `Database already initialized, skipping install` and runs pending migrations only.

- **No migration lock.** Every replica migrates on boot. On a fresh install or a version bump, start one replica, wait
  for healthy, then scale out.
- npm installs (not Docker) don't bootstrap on `directus start`; see `directus-upgrade`.

## Volumes and permissions

| Path in container      | Holds                                                    | Persist with                                         |
| ---------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `/directus/uploads`    | Files with the default `local` storage                   | Named volume, or use S3 and skip it                  |
| `/directus/extensions` | Your extensions and Marketplace installs (`.registry/`)  | Bind mount or volume, or `EXTENSIONS_LOCATION`       |
| `/directus/database`   | The SQLite file, if `DB_CLIENT=sqlite3`                  | Volume                                               |
| `/directus/templates`  | Custom email templates                                   | Bind mount (read-only is fine)                       |

- The image runs as `node` (uid 1000) and declares no `VOLUME`. Named volumes inherit the image's ownership; a
  bind-mounted host folder must be writable by uid 1000 (`chown -R 1000:1000 ./extensions`) or Marketplace installs
  and uploads fail.
- Several replicas on local storage need one shared volume or each sees only its own uploads. Prefer S3 once you scale.

## Extensions in the image

No `npm` or `npx` in the image, so only the Marketplace installs at runtime. For npm packages, build an image:

```dockerfile
# Match the image's Node major (26 from 12.6.0) so native modules load. node:26 images have no Corepack.
FROM node:26-alpine AS build
WORKDIR /extension-build
RUN npm init -y && npm install @directus-labs/spreadsheet-layout

FROM directus/directus:12.5.1
COPY --from=build --chown=node:node /extension-build/node_modules/@directus-labs/spreadsheet-layout /directus/extensions/spreadsheet-layout
```

Building extensions, `MARKETPLACE_TRUST`, auto reload: `directus-extensions`.

## CLI and upgrades

- CLI on every image: `docker compose exec directus node /directus/cli.js <command>` (`bootstrap`,
  `database migrate:latest`, `users passwd --email <e> --password <p>`, `cache clear`, `schema snapshot <file>`).
- Upgrade: back up ([backups-and-recovery.md](backups-and-recovery.md)), bump the pinned tag,
  `docker compose pull && docker compose up -d`. Read `directus-upgrade` for every version you cross.

## Platforms

Railway, Fly, Render, DigitalOcean, Coolify, Northflank, ECS, Kubernetes all run the same image. Every one needs:

- Container port `8055` (or `PORT` set to what the platform injects), health check path `/server/ping`.
- Managed Postgres (or MySQL) in `DB_*`, or `DB_CONNECTION_STRING` for Postgres.
- `SECRET`, `PUBLIC_URL` (the public HTTPS URL), and `IP_TRUST_PROXY` (there is always a proxy).
- Uploads on a persistent volume at `/directus/uploads` or in a bucket. Platform disks are usually ephemeral.
- Managed Redis and the Redis env vars before a second instance.

## Sources

- https://directus.com/docs/self-hosting/deploying
- https://directus.com/docs/self-hosting/including-extensions
- https://directus.com/docs/self-hosting/hardened-images
- https://directus.com/docs/self-hosting/requirements
- https://directus.com/docs/configuration/pm2
- https://github.com/directus/directus/blob/v12.6.0/Dockerfile
- https://github.com/directus/directus/blob/v12.6.0/docker-entrypoint.cjs
- https://github.com/directus/directus/blob/v12.6.0/ecosystem.config.cjs
- https://github.com/directus/directus/blob/v12.6.0/api/src/cli/commands/bootstrap/index.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/extensions/lib/installation/manager.ts
- Live `directus/directus:12.5.1` and `12.5.1-dhi` containers (user, paths, health check commands)
