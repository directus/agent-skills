# Indexes

- [What Directus creates](#what-directus-creates)
- [Set it](#set-it)
- [Composite and other custom indexes](#composite-and-other-custom-indexes)

## What Directus creates

| Field setting | Database result |
| --- | --- |
| Primary key | Primary key constraint |
| `schema.is_unique: true` | Unique index `<collection>_<field>_unique` |
| `schema.is_indexed: true` | Index `<collection>_<field>_index` |
| M2O relation (`POST /relations`) | Foreign key constraint, **no index** (Postgres, SQLite, SQL Server, Oracle; MySQL InnoDB adds one) |
| Two or more columns in one index | Not possible through the API, the Studio, or snapshots. Use a migration |

**Recommended:** index the M2O columns and both junction FK columns that the frontend or permission rules filter on.
Skip small lookup collections and booleans on their own. `search` can't use any of these (it runs
`LOWER(column) LIKE '%term%'`; see `directus`, `references/performance.md`).

## Set it

```
PATCH /fields/posts/status          { "schema": { "is_indexed": true } }
PATCH /fields/posts/slug            { "schema": { "is_unique": true } }
```

- Works on create and on existing fields. Setting the flag back to `false` drops the index.
- `is_unique` on a column that already holds duplicates fails with `RECORD_NOT_UNIQUE` and changes nothing.
- System collections: `schema.is_indexed` is the one setting you may change on `directus_*` fields.
- Large tables: add `?concurrentIndexCreation` to `POST /fields/:collection`, `PATCH /fields/:collection[/:field]`, or
  `POST /collections` so the build doesn't block writes (Postgres `CONCURRENTLY`, MySQL `LOCK=NONE`, SQL Server
  Enterprise `ONLINE = ON`; ignored elsewhere).

## Composite and other custom indexes

Self-hosted: put a migration in `MIGRATIONS_PATH` (default `./migrations`). File names need a `-` and must not start
with a `YYYYMMDD[A-Z]` date (reserved for Directus's own migrations). They run on `directus database migrate:latest` and
`directus bootstrap` (what the Docker image runs at start). Use knex: `table.index(['status', 'published_at'], name)` in
`up`, `table.dropIndex(...)` in `down`.

- **A fresh environment won't boot with it.** Custom migrations run at `bootstrap`, before `d6s push` has created the
  table, so the container exits with `no such table` on every start (12.5.1). Don't guard with `hasTable` and return:
  the migration is then recorded as done and the index never appears. Start without the migration, push the schema,
  then add the migration and restart.
- Directus can't see it. `GET /fields` reports `is_indexed: false` for columns covered only by a composite index, and
  snapshots and `d6s` don't carry it. Commit the migration and run it in every environment.
- Composite unique indexes (one translation per item and language) use `table.unique([...], { indexName })`. See
  [relationships.md](relationships.md).
- On Directus Cloud, raw database access is Direct Database Access (Enterprise).

## Sources

- https://directus.com/docs/guides/data-model/fields
- https://directus.com/docs/configuration/migrations
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/fields.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/relations.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/database/helpers/schema/dialects
- https://github.com/directus/directus/blob/v12.6.0/api/src/database/migrations/run.ts
