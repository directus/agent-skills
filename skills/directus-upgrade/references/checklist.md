# Upgrade checklist

Copy into the upgrade ticket or PR and tick off per stop (for example 10.13.4 → 11.17.4, then → 12.5.1).

## Contents

- [The checklist](#the-checklist)
- [Commands](#commands)
- [Env grep](#env-grep)
- [Runtime notes](#runtime-notes)
- [Rollback](#rollback)

## The checklist

```markdown
## Directus upgrade: <from> → <to>

### Before

- [ ] Current version confirmed (`GET /server/info` with a token → `data.version` on 10.8.3+; 10.2.0 to 10.8.2 return
      none, use `npx directus --version` or the image tag)
- [ ] Final target confirmed with the requester; this stop is the last release of the next major or the target
      itself (never 12.4.0)
- [ ] Read breaking changes for every release crossed (docs page + GitHub release notes)
- [ ] Grep sweep run on: frontend(s), SDK clients, extensions, infra repo, flows export
- [ ] Node version meets target (22 for 11.4+), Docker base image updated
- [ ] Database version supported (MySQL 5.7 dropped in 11.7)
- [ ] 12.x only: license plan decided, `LICENSE_KEY` ready, `PUBLIC_URL` absolute, outbound HTTPS to licensing.directus.com allowed
- [ ] 12.5 only: `directus_policies.ip_access` and `IMPORT_IP_DENY_LIST` entries valid
- [ ] Staging copy of prod DB + uploads available to rehearse

### Backup

- [ ] Database dump taken and restore tested
- [ ] Uploads storage backed up (volume snapshot or bucket copy/versioning)
- [ ] Schema snapshot saved (`schema snapshot`)
- [ ] `.env` / compose / k8s manifests saved
- [ ] Current image tag or package version recorded for rollback

### Upgrade

- [ ] Scale to one replica (House rule: one process runs the migrations)
- [ ] Bump Docker tag / `directus` package to the target (pinned, not `latest`)
- [ ] Env changes from each hop file applied
- [ ] Health checks point at `/server/ping` (12.x)
- [ ] Start; migrations ran (Docker: bootstrap on start; npm: `database migrate:latest`)
- [ ] No "Database migrations have not all been run" warning in logs
- [ ] Extensions loaded (no load errors in logs)

### After

- [ ] Admin login works; non-admin login works; SSO login works (licensed on 12.x)
- [ ] Spot-check reads as each important role (permissions, M2A fields, versioned items)
- [ ] One flow run end to end; webhooks-turned-flows still fire
- [ ] File upload + asset transform work
- [ ] 12.x: `GET /license` status `active` (or grace understood)
- [ ] SDK / extensions-sdk bumped in every caller, type check passes
- [ ] New schema snapshot taken and committed (REST diff refuses snapshots from another version)
- [ ] Scale replicas back up
```

## Commands

```bash
# Version (data.version is absent on 10.2.0 to 10.8.2)
curl -s -H "Authorization: Bearer $TOKEN" "$URL/server/info" | jq -r '.data.version // .data.directus.version // "none"'
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$URL/server/health" | jq -r '.releaseId'   # admin only; covers 10.2 to 10.8.2
docker compose exec directus node /directus/cli.js --version   # any 10.x to 12.x image
SELECT version FROM directus_migrations ORDER BY version DESC LIMIT 1;   -- last applied migration: earliest matching release, not the exact patch

# Schema snapshot (default format yaml; --format json for JSON)
npx directus schema snapshot ./snapshots/pre-upgrade.yaml
# Docker 12.1+ images have no npx; the file is written inside the container, so target a mounted path
docker compose exec directus node /directus/cli.js schema snapshot --yes /directus/snapshots/pre-upgrade.yaml

# Migrations
npx directus database migrate:latest
docker compose exec directus node /directus/cli.js database migrate:latest
npx directus bootstrap            # install or migrate, then ensure an admin exists

# Which migrations ran
SELECT version, name, timestamp FROM directus_migrations ORDER BY version DESC LIMIT 10;
```

## Env grep

Each hop file lists its env changes. Combined sweep:
`rg -n "_REDIS_|memcache|SENDGRID|IP_TRUST_PROXY|CACHE_SCHEMA_MAX_ITERATIONS|LICENSE_(KEY|TOKEN)" .env* docker-compose* k8s/ helm/`.

## Runtime notes

- Database versions: https://directus.com/docs/self-hosting/requirements. MySQL/MariaDB use `mysql2` from 11.0.0
  (decimals as strings, strict charset comparison; match `DB_CHARSET`).
- Docker: pin a version tag. Images run `bootstrap` (migrations) on every start.
- Redis: required for multiple replicas.
- **House rule:** clear caches after each upgrade stop: `npx directus cache clear` (exists in 11.17.4 and 12.x, not in
  10.13.4; there, flush the Redis cache or restart, which resets a memory cache).

## Rollback

- **House rule:** treat database restore as the rollback path. `database migrate:down` reverts one migration at a time
  and some migrations transform data (roles to policies in 11.0, webhooks table dropped in 11.14.1, comments moved in
  11.1.2), so stepping down a major is not reliable.
- Steps: stop Directus, restore the DB dump and uploads backup taken before this stop, redeploy the previous image tag
  or package version and env, start, confirm `data.version`.
- 12.x: deactivate a license activated on a throwaway rehearsal instance (**Settings > License**) before destroying it.
- Keep the pre-upgrade snapshot with the pre-upgrade backup; apply it only to an instance restored to that same version.
  `POST /schema/diff` refuses a mismatch, but CLI `directus schema apply` checks neither version nor vendor. Details:
  `directus-environment-sync` (how-it-works.md).

## Sources

- https://directus.com/docs/self-hosting/upgrading
- https://directus.com/docs/self-hosting/requirements
- https://directus.com/docs/self-hosting/hardened-images
- https://directus.com/docs/licensing/overview
- https://directus.com/docs/releases/breaking-changes
- https://github.com/directus/directus/blob/v12.5.1/api/src/cli/index.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/cli/commands/bootstrap/index.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/app.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/utils/schema/validate-snapshot.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/cli/commands/schema/apply.ts
- https://github.com/directus/directus/blob/v10.8.3/api/src/services/server.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/database/seeds/15-migrations.yaml
- https://github.com/directus/directus/blob/v12.5.1/packages/env/src/constants/defaults.ts
- https://github.com/directus/directus/blob/v12.5.1/Dockerfile
- https://github.com/directus/directus/blob/v12.5.1/docker-entrypoint.cjs
