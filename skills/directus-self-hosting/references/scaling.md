# Scaling and operations

- [What needs Redis](#what-needs-redis)
- [Multi-instance env](#multi-instance-env)
- [Load balancers and WebSockets](#load-balancers-and-websockets)
- [Cache in operations](#cache-in-operations)
- [Database pool](#database-pool)
- [Overload and 503s](#overload-and-503s)
- [Slow instance checklist](#slow-instance-checklist)

"Several instances" means several containers, or `PM2_INSTANCES` > 1 inside one container. Both are separate Node
processes with separate memory.

## What needs Redis

Setting any `REDIS` or `REDIS_*` variable switches some things to Redis automatically. Others have their own switch and
stay in memory until you set it.

| Feature                                                                                                                           | Switch                        | Without it, per process                                                    |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| Message bus: WebSocket subscription events, flow reloads, extension reloads, schema-change notices                                | automatic with `REDIS*`       | A change on one instance isn't seen by subscribers or caches on the others |
| Locks and shared stores: TUS uploads, extension sync, collaborative editing rooms, license state                                  | automatic with `REDIS*`       | Each instance locks alone                                                  |
| Data cache and system cache (schema, permissions)                                                                                 | `CACHE_STORE=redis`           | Each process has its own copy; a purge on one doesn't clear the rest       |
| Rate limiter                                                                                                                      | `RATE_LIMITER_STORE=redis`    | Each instance allows the full budget                                       |
| Synchronized schedules: schedule-trigger flows, `schedule()` in hook extensions, retention, TUS cleanup, telemetry, license check | `SYNCHRONIZATION_STORE=redis` | **Every instance runs every scheduled job.** A nightly flow sends N emails |

`SYNCHRONIZATION_STORE` is the one people miss: it defaults to `memory` even when `REDIS` is set.

Redis holds caches, locks, counters, and messages that Directus rebuilds. It isn't part of the backup.

## Multi-instance env

Add to every replica, on top of the [docker.md](docker.md#production-compose) env (which already has them):

```bash
REDIS=redis://cache:6379          # the compose service name; or REDIS_HOST, REDIS_PORT, REDIS_USERNAME, REDIS_PASSWORD
CACHE_STORE=redis
RATE_LIMITER_STORE=redis
SYNCHRONIZATION_STORE=redis
```

Plus: the same `SECRET` everywhere; uploads on S3 or another driver (or one shared volume); extensions baked into the
image or loaded from storage with `EXTENSIONS_LOCATION`. A Marketplace install writes files only on the replica that
handled it, unless `EXTENSIONS_LOCATION` is set.

`REDIS_ENABLED=false` turns Redis off even when `REDIS` is set (handy for one-off CLI runs). Unset, Redis is on when
`REDIS` or `REDIS_HOST` is present.

Sharing one Redis between several Directus projects: give each project its own namespaces (`CACHE_NAMESPACE`,
`SYNCHRONIZATION_NAMESPACE`, `REDIS_BUS_NAMESPACE`, `REDIS_LOCK_NAMESPACE`, and the rest listed in the synchronization
docs). **House rule:** one Redis database per project is simpler.

## Load balancers and WebSockets

- Health check: `GET /server/ping` (no auth, returns `pong`, doesn't touch the DB). `/server/health` checks DB, Redis,
  storage, and email, needs a token (403 without), returns 503 if any check fails, and caches its result for
  `HEALTHCHECK_CACHE_TTL` (default `5m`). Use it for monitoring, not for
  routing.
- WebSockets are off by default (`WEBSOCKETS_ENABLED=false`). Directus uses plain WebSockets with no polling fallback,
  so a socket stays on the instance it opened on and sticky sessions aren't needed. Events from writes on other
  instances arrive through the Redis bus.
- The proxy must pass `Upgrade` / `Connection` headers on `/websocket` and `/graphql`, and its idle timeout must be
  longer than `WEBSOCKETS_HEARTBEAT_PERIOD` (default 30 seconds), or sockets drop.
- Set `IP_TRUST_PROXY` to the hop count in front of Directus ([configuration.md](configuration.md#proxies-cors-cookies)).
- **Kubernetes:** liveness and readiness probes on `GET /server/ping` (`initialDelaySeconds` 60, since the first boot
  runs migrations). There's no migration lock, so run migrations once per release in a Job (or `initContainer` on a
  single-replica rollout) with `node /directus/cli.js bootstrap`, then roll the Deployment.

## Cache in operations

What the data cache stores, `CACHE_AUTO_PURGE`, headers, and clearing it are in `directus` (`references/performance.md`).
The ops side:

- **Several instances need `CACHE_STORE=redis`.** With `memory`, each replica keeps and serves its own stale copy.
- **Writes that bypass Directus never purge** (SQL scripts, another app writing the same tables). Clear with
  `POST /utils/cache/clear` as admin or `node /directus/cli.js cache clear` (Redis store only).
- **Schema changed directly in the database** (a migration tool, `ALTER TABLE`): Directus keeps serving the cached
  schema. `POST /utils/cache/clear?system` or restart every instance.
- **`node /directus/cli.js cache clear` with `CACHE_STORE=memory`** does nothing; memory caches live inside each
  running process.

## Database pool

Knex defaults to `min: 2, max: 10` connections per process. Override with `DB_POOL__MIN` and `DB_POOL__MAX`. Total
connections = replicas × `PM2_INSTANCES` × pool max, plus anything else using the database. Keep it under the
database's `max_connections` (managed Postgres plans are often low), or put a pooler such as PgBouncer in front.

## Overload and 503s

- `503` with `Under pressure`: the pressure limiter (`PRESSURE_LIMITER_ENABLED=true` by default) rejects requests when
  the event loop is over 99% busy or delayed more than 500 ms. It means the process is saturated: add instances or CPU,
  or find the expensive requests. Don't just disable it.
- Sizing: the docs give `1x 0.25 vCPU / 512 MB` as the minimum and `2x 1 vCPU / 2GB` as the recommended minimum. Heavy image transforms
  (`ASSETS_TRANSFORM_MAX_CONCURRENT`, default 25) and large `limit=-1` reads drive memory.
- `QUERY_LIMIT_MAX` (unset by default, so no cap) protects the instance from `limit=-1` on huge collections. Setting it
  changes API behavior for callers; see `directus` (`references/performance.md`).

## Slow instance checklist

1. `GET /server/health` with an admin token: DB response time, Redis, storage latency.
2. Query shape (fields, deep relations, `meta`, `search`, `limit=-1`): `directus` (`references/performance.md`).
3. Missing indexes on filtered, sorted, or foreign key fields: `directus-content-modeling`.
4. Cache on, Redis-backed, with a purge mode the site can live with. Pool not exhausted (database connection count).

## Sources

- https://directus.com/docs/self-hosting/requirements
- https://directus.com/docs/self-hosting/deploying
- https://directus.com/docs/configuration/synchronization
- https://directus.com/docs/configuration/cache
- https://directus.com/docs/configuration/realtime
- https://directus.com/docs/configuration/database
- https://directus.com/docs/configuration/pm2
- https://directus.com/docs/configuration/healthcheck
- https://github.com/directus/directus/blob/v12.6.0/api/src/redis/utils/redis-config-available.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/bus/lib/use-bus.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/lock/lib/use-lock.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/synchronization.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/schedule.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/cache.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/cli/commands/cache/clear.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/rate-limiter.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/websocket/handlers/subscribe.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/database/index.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/app.ts
