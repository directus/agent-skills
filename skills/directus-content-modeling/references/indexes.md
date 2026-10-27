# Indexes

- [What Directus creates](#what-directus-creates)
- [Set it](#set-it)
- [When to index](#when-to-index)
- [Composite and other custom indexes](#composite-and-other-custom-indexes)
- [Check what exists](#check-what-exists)

Indexes make filters, sorts, and lookups fast on large collections and make every write a little slower. Directus
creates a few on its own and exposes two flags for the rest. Anything else needs a database migration.

## What Directus creates

| Field setting                    | Database result                                                          |
| -------------------------------- | ------------------------------------------------------------------------ |
| Primary key                      | Primary key constraint (indexed by every vendor)                         |
| `schema.is_unique: true`         | Unique index `<collection>_<field>_unique`                               |
| `schema.is_indexed: true`        | Index `<collection>_<field>_index`                                       |
| M2O relation (`POST /relations`) | Foreign key constraint `<collection>_<field>_foreign`, **no index**      |
| Two or more columns in one index | Not possible through the API, the Studio, or snapshots. Use a migration. |

Names longer than 60 characters are shortened with a hash. Setting the flag back to `false` drops the index.

**Foreign keys are not indexed for you.** Directus never adds an index to an FK column. On Postgres the M2O column
`articles.author` had only the FK constraint until `is_indexed: true` was set. SQLite, SQL Server, and Oracle don't
index FK columns either. MySQL and MariaDB (InnoDB) create one automatically when the constraint is added.

## Set it

```
POST  /fields/posts                 { "field": "category", "type": "uuid", "schema": { "is_indexed": true } }
PATCH /fields/posts/status          { "schema": { "is_indexed": true } }
PATCH /fields/posts/slug            { "schema": { "is_unique": true } }
```

- Works on create and on existing fields, through REST, the MCP `fields` tool, and the Studio field settings.
- `is_unique` on a column that already holds duplicates fails with `RECORD_NOT_UNIQUE` and changes nothing. Find
  them first: `GET /items/posts?groupBy[]=slug&aggregate[count]=*` and look for counts over 1.
- System collections: `schema.is_indexed` is the one setting you may change on `directus_*` fields.
- Single-column flags travel in schema snapshots and Environment Sync. Composite indexes don't.

**Large tables.** A plain `CREATE INDEX` blocks writes to the table while it builds. Add `?concurrentIndexCreation` to
`POST /fields/:collection`, `PATCH /fields/:collection[/:field]`, or `POST /collections`:

| Vendor     | With `?concurrentIndexCreation`                                          |
| ---------- | ------------------------------------------------------------------------ |
| Postgres   | `CREATE INDEX CONCURRENTLY` (runs outside the transaction)               |
| MySQL      | `ALGORITHM=INPLACE LOCK=NONE`, falls back to a blocking build if refused |
| SQL Server | `WITH (ONLINE = ON)` on Enterprise edition only, blocking otherwise      |
| Others     | Ignored, blocking build                                                  |

## When to index

**House rule:**

- Index every field the frontend or a permission rule filters or sorts on in a collection that grows: `status`,
  `published_at`, category and author FKs, `user_created` when permissions filter on `$CURRENT_USER`.
- `slug` and `permalink` are already covered: they get `is_unique: true` (see [routing-and-seo.md](routing-and-seo.md)).
- On Postgres, SQLite, and SQL Server, set `is_indexed: true` on every M2O column and on both FK columns of every
  junction (`post_tags.post`, `post_tags.tag`). Nested reads of to-many relations look rows up by those columns.
- Large routed collections (posts, products, events) that list "published, newest first": add a composite index on
  `(status, published_at)` with a migration. Two separate single-column indexes help less.
- Don't index small lookup and config collections (`globals`, `navigation`, `languages`), booleans on their own, or
  fields that are only displayed.

Every index costs disk and slows inserts and updates on that table, and Directus keeps no record of why it exists.
Add indexes for queries you actually run, not for every field.

`search` can't use these indexes: it runs `LOWER(column) LIKE '%term%'` across every searchable field. See
`directus` (`references/performance.md`).

## Composite and other custom indexes

Self-hosted: put a migration in `MIGRATIONS_PATH` (default `./migrations`). File names need a `-` and must not start
with a `YYYYMMDD[A-Z]` date (that format is reserved for Directus's own migrations). They run with
`directus database migrate:latest` and on `directus bootstrap` (what the Docker image runs at start).

```js
// migrations/001-posts-status-published-index.js
const name = 'posts_status_published_at_index';

export async function up(knex) {
	await knex.schema.alterTable('posts', (table) => table.index(['status', 'published_at'], name));
}

export async function down(knex) {
	await knex.schema.alterTable('posts', (table) => table.dropIndex(['status', 'published_at'], name));
}
```

- **A fresh environment won't boot with it.** Custom migrations run at `bootstrap`, before `d6s push` has created
  `posts`, so the container exits with `no such table` on every start (12.5.1). Don't guard with
  `hasTable` and return: the migration is then recorded as done and the index never appears. For a new environment,
  start without the migration, push the schema, then add the migration and restart.
- Directus can't see it. `GET /fields` reports `is_indexed: false` for columns covered only by a composite index (on
  Postgres the flag reflects single-column, non-unique indexes only), and snapshots and `d6s` don't carry it. Commit
  the migration and run it in every environment.
- Composite unique indexes (one translation per item and language) use `table.unique([...], { indexName })` the same
  way. See [relationships.md](relationships.md).
- On Directus Cloud, raw database access is Direct Database Access (Enterprise); without it, composite indexes aren't
  something you can add yourself.

## Check what exists

`GET /fields/:collection` shows `schema.is_indexed`, `is_unique`, and `foreign_key_table` per field. For the full
picture (composite, partial, and hand-made indexes) ask the database:

| Vendor     | Query                                                                   |
| ---------- | ----------------------------------------------------------------------- |
| Postgres   | `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'posts';` |
| MySQL      | `SHOW INDEX FROM posts;`                                                |
| SQLite     | `PRAGMA index_list('posts');`                                           |
| SQL Server | `EXEC sp_helpindex 'posts';`                                            |

## Sources

- https://directus.com/docs/guides/data-model/fields
- https://directus.com/docs/configuration/migrations
- https://directus.com/docs/cloud/configuration/direct-database-access
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/fields.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/fields.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/relations.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/get-default-index-name.ts
- https://github.com/directus/directus/tree/v12.6.0/api/src/database/helpers/schema/dialects
- https://github.com/directus/directus/blob/v12.6.0/packages/schema/src/dialects/postgres.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/database/migrations/run.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/database/run-ast/lib/apply-query/search.ts
- https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html
- https://www.sqlite.org/foreignkeys.html
