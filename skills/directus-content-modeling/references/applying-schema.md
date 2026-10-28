# Applying schema

## Pick the tool

| Situation | Use |
| --- | --- |
| An agent building or changing a schema interactively on a dev instance | Directus MCP tools |
| A script or app creating schema in code | REST: `/collections`, `/fields`, `/relations` |
| Promoting schema + config (roles, policies, flows, settings) from dev to staging to prod, reviewed in git | Environment Sync: `d6s` (`@directus/cli@12`), Directus 12.2+ |
| Schema-only promotion, or CI on older versions | `directus schema snapshot` / `apply`, or `/schema/snapshot` → `/schema/diff` → `/schema/apply` |
| Seeding content (demo data, fixtures, initial pages) | A seed script (see [Seeding content](#seeding-content)) |
| Starting a new project from a Directus starter (schema + content + frontend) | `directus-template-cli` (`init` / `apply`) |

**Recommended:** model on a dev instance, promote with Environment Sync. Never hand-build schema on production.

## MCP

Order: `schema` (discover) → `collections` (create with initial fields) → `fields` (add the rest) → `relations` (wire
them) → `schema({ keys: [...] })` (verify).

- `collections` create accepts `fields` inline. Send the PK, system fields, and scalar fields in one call.
- `fields` create `data` is always an array, even for one field.
- Relational fields first, then `relations`. Junction collections before M2M/M2A relations.
- Confirm the plan with the user before the first write. Show the collection URL from the result after creating.
- Registry mode (`/mcp?tool_mode=registry`) exposes `search`, `execute`, and `schema`. Search for `collections`,
  `fields`, `relations` and run them with `execute`.

## REST

```
POST /collections            { collection, meta, schema: {}, fields: [...] }   # folders: schema: null
POST /fields/:collection     { field, type, meta, schema }
POST /relations              { collection, field, related_collection, meta, schema }
PATCH /fields/:collection/:field
PATCH /relations/:collection/:field                                              # only schema.on_delete / on_update and meta
```

Admin token required. Read back with `GET /fields/:collection` and `GET /relations/:collection`.

## Snapshot and Environment Sync

Both are owned by the **`directus-environment-sync`** skill (setup, push modes, CI, rollback; the snapshot comparison,
`force`, and version checks are in its how-it-works.md). Load it before applying a snapshot or running any `d6s`
command against a shared instance. The traps that delete data:

- `POST /schema/diff` defaults to `mode=mirror`; applying that diff drops everything on the target that isn't in the
  snapshot. Pass `mode=merge` unless the user wants an exact match.
- CLI `schema apply` also makes the database match the snapshot. Always `--dry-run` first.
- `directus schema snapshot` / `apply` and `/schema/*` move collections, fields, and relations only.
- `d6s` flow: `d6s sync pull --from dev`, commit the sync files, `d6s sync diff --to prod` (applies nothing),
  `d6s sync push --to prod` (merge mode by default, never deletes).

## Seeding content

**Recommended:** seed content with scripts, not templates. A script runs anywhere (local, CI, against Cloud), is
reviewable, and gives the same result every time. Environment Sync moves schema and config, not content.

- One script per dataset, committed next to the sync files. Read `DIRECTUS_URL` and a token from env. Use
  `@directus/sdk` or plain `fetch`.
- **Idempotent.** Use fixed UUIDs in the seed data, then read by key and `update` if it exists, `create` if it
  doesn't. Running it twice must not duplicate anything.
- **Order:** files first (`POST /files/import` from a URL, or upload), then lookup and config collections, then
  parents. Nested relational writes in one payload are fine for owned children (blocks, menu items).
- Run it after schema and config are in place (`d6s sync push`), never before.

**Templates (`directus-template-cli`).** `init` scaffolds a Directus project plus a frontend from a starter. `apply`
loads a template's schema, permissions, and content into a new or reset instance. The starters still ship this way,
so use it to start from a starter. Don't build new deployment or promotion workflows on it: Environment Sync is the
intended replacement. It overwrites user-collection items with matching primary keys, skips existing system records,
and wants PostgreSQL (don't extract from SQLite and apply to Postgres). v0.5.0+ is for Directus 11 and up.

## Don't

- **Don't create tables directly in the database** and expect them to behave. Directus sees unregistered tables but
  they have no metadata (interfaces, relations, permissions). If you must, register them afterwards
  (`POST /collections` with the existing name) and create relations through Directus.
- **Don't change a field's `type` on a column with data** without a backup. `type` without a `schema` object is
  silently ignored, Postgres fails or truncates, and SQLite keeps mixed data. Safe paths: [schema-changes.md](schema-changes.md).
- **Don't delete and recreate a field to "fix" it.** That drops the column's data. `PATCH` the `meta` instead.

## Sources

- https://directus.com/docs/guides/environment-sync
- https://directus.com/docs/guides/ai/mcp/tools
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/schema.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/collections/prompt.md
- https://github.com/directus-labs/directus-template-cli/blob/main/README.md
