---
name: directus-upgrade
description: "Use when upgrading Directus (v9, v10, v11, or 12.x) or the code that calls it: picking the path, backups, bumping the Docker tag or package, migrations, and fixing what breaks in frontends, SDK clients, extensions, and flows. Also errors and licensing lockdown after an upgrade, and matching @directus/sdk or extensions-sdk versions. Not for moving schema between instances (directus-environment-sync)."
metadata:
  author: directus
  directus-version: '12.6.0'
---

# Directus upgrade

Move a Directus instance and its callers (frontends, SDK clients, extensions, flows, infra) to the version the user
asked for. Pin both ends, back up, read every breaking change you cross, upgrade the server, then fix the callers.

_Verified against Directus v12.6.0 source, release notes, and breaking-changes docs. If the instance disagrees, trust
the instance._

## Procedure

0. **Pin the target.** Use what the user asked for. For "latest", resolve with `gh release list -R directus/directus`
   and say which version you chose. Verified up to 12.6.0; past that, read the newer release notes. Don't cross a major
   nobody asked for: 12 brings license enforcement.
1. **Find the current version.**
   - `GET /server/info` with a token: `data.version` on 10.8.3+. On v9 and 10.0 to 10.1, `data.directus.version` (admin
     only). **10.2.0 to 10.8.2 omit it;** `GET /server/health` with an admin token returns it as `releaseId`.
   - `npx directus --version` (npm installs), or `directus` in `package.json`.
   - Docker tag. If `latest`, ask the container: `docker compose exec directus node /directus/cli.js --version` (every
     10.x to 12.x image).
   - Last resort: `SELECT version FROM directus_migrations ORDER BY version DESC LIMIT 1;`, then find the release that
     shipped it (`api/src/database/migrations/` per tag). Earliest matching release, not the exact patch.
   - Also note DB vendor and version, Node version, `@directus/sdk` and `@directus/extensions-sdk` in every caller.
2. **Back up:** the database (`pg_dump`, `mysqldump`, copy the SQLite file), uploads storage, a schema snapshot
   (`npx directus schema snapshot ./snapshot.yaml`, or `node /directus/cli.js` in Docker), and the env file.
3. **Load the hop files** from the routing table and read each release you cross. Patches break too (10.6.3, 10.13.2,
   11.1.2, 11.14.1).
4. **Grep the callers** with each file's patterns. Fix code before or alongside the server bump.
5. **Upgrade the server.** **House rule:** one major at a time, stopping on the last release of each (9.26.0 → 10.13.4 →
   11.17.4 → 12.x target), booting each stop once so its migrations run. Skip 12.4.0 (use 12.4.1).
6. **Run migrations.** Docker runs `directus bootstrap` on start. npm installs don't (`directus start` only logs
   `Database migrations have not all been run`): run `npx directus database migrate:latest` or `npx directus bootstrap`.
7. **Update callers:** SDK, extensions-sdk, extension `host` ranges, frontends, flows, health checks, monitoring.
8. **Verify:** admin and non-admin login, `/server/ping`, a versioned item read, one flow run, each custom extension
   loads, `GET /license` (12.x, admin).

## Critical traps

- **Directus 12 enforces a license.** Core tier without one: SSO, custom permission rules (item filters, field lists
  other than `*`, validation, presets), custom OpenAI-compatible LLMs, AI translations need a license. Over-limit
  upgraded instances get 30 days, then lock down (`403 RESOURCE_RESTRICTED` on `/items`, `/files`, `/assets`,
  `/graphql`, `/mcp`, `/flows/trigger/:id`; WebSockets refused; non-admin login fails). Check before upgrading.
- **v11 moved permissions from roles to policies.** `admin_access`, `app_access`, `enforce_tfa`, `ip_access` left
  `directus_roles`; `directus_permissions.role` became `policy`.
- **`/server/health` needs a token on 12.x** (403). Point probes at `/server/ping` before deploying, or an orchestrator
  may roll you back.
- **`IP_TRUST_PROXY` defaults to `false` on 12.x.** Behind a proxy, rate limits, IP access, and logs see the proxy IP.
- **Only REST checks snapshot versions.** `POST /schema/diff` refuses another version or vendor unless `force`; CLI
  `directus schema apply` applies silently. Fresh snapshot after each stop. Details: `directus-environment-sync`
  (how-it-works.md, "Schema snapshot and apply").
- **Docker 12.1+ images have no `npm` or `npx`.** Use `docker compose exec directus node /directus/cli.js <command>`
  (every image) and install extensions at build time.
- **Node 26 from 12.6.0** (Node 22 from 11.4.0). `node:26` build stages have no Corepack. `@directus/sdk` 27.1 still
  accepts `node >=22`.
- **12.5.0 rejects malformed policy `ip_access` at request time** (requests from that user fail; release notes give no status code). Clean
  `directus_policies.ip_access` first.

## Routing

Load only the hop files you cross, in order, stopping at the target. In a minors file, read only the sections after your
current version.

| Current version              | Load, in order                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| 9.x                          | [v9-to-10.0](references/v9-to-10.0.md), [10.x-minors](references/10.x-minors.md), then the 10.13 row |
| 10.0 to 10.12                | [10.x-minors](references/10.x-minors.md), then the 10.13 row                                         |
| 10.13                        | [11.0](references/11.0.md), [11.x-minors](references/11.x-minors.md), then the 11.17 row             |
| 11.0 to 11.16                | [11.x-minors](references/11.x-minors.md), then the 11.17 row                                         |
| 11.17                        | [12.0](references/12.0.md), [12.x-minors](references/12.x-minors.md)                                 |
| 12.0 to 12.6                 | [12.x-minors](references/12.x-minors.md)                                                             |
| Patch bump within a minor    | That major's minors file; search it for the target patch (10.6.3, 10.13.2, 11.1.2, 11.14.1 break)    |
| Any, plus SDK/extension work | [sdk-and-extensions](references/sdk-and-extensions.md) (version map, `host`, extension API changes)  |
| Running the upgrade          | [checklist](references/checklist.md) (copyable checklist, commands, env grep, rollback)              |

## Go deeper

1. Directus docs MCP server: `https://directus.com/docs/mcp` (no auth; tools `search-docs`, `get-doc`, `list-docs`,
   `search-directus-code`, `get-directus-file`). Useful for `get-directus-file` on a pinned migration.
2. Raw markdown for any docs page: `https://directus.com/docs/raw/<path>.md`, for example
   `https://directus.com/docs/raw/releases/breaking-changes/version-12.md`. Index: `https://directus.com/docs/llms.txt`.
3. The instance itself: its error messages, `GET /server/info`, `GET /server/specs/oas`, the schema, and the
   `directus_migrations` table. Release notes per tag: `gh release view v12.6.0 -R directus/directus`.
