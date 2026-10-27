# Query performance

What a caller controls to keep reads fast. Indexes are a schema decision: `directus-content-modeling`
(`references/indexes.md`). Server sizing, Redis, and horizontal scaling: `directus-self-hosting`.

- [How a read runs](#how-a-read-runs)
- [Query checklist](#query-checklist)
- [Counts, aggregates, search](#counts-aggregates-search)
- [Caching](#caching)

## How a read runs

- One query for the root collection, then **one more query per relation in `fields`**, batched with `WHERE key IN
(...)` over the parent keys. Many-to-any runs one query per target collection. `*.*.*` multiplies queries and payload.
- **Nested one-to-many lists default to 100 items per parent** (`QUERY_LIMIT_DEFAULT`). An author with 150 posts
  returns 100 under `fields=posts.id`; `deep[posts][_limit]=-1` returns all 150.
- **`deep[rel][_limit]` doesn't reduce database work.** Directus reads every related row for the page of parents (in
  batches of `RELATIONAL_BATCH_SIZE`, default 25000) and slices per parent in memory. For large child lists, query the
  child collection directly with a `filter` and `limit`.
- A `filter` or `sort` through a many-to-one path (`author.name`) adds a join. `_some` / `_none` on to-many fields
  add a subquery on the related table's foreign key. Both want indexes on the FK and the filtered field.
- Permission item rules are added to every query as filters. Fields used in rules (`status`, `user_created`) are
  filtered on for every non-admin read.

## Query checklist

| Do                                                                                 | Why                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Send `fields` with only what the page renders                                      | Fewer columns, fewer relation queries, smaller cached entries       |
| Name M2A collections: `blocks.item:block_hero.title`                               | `blocks.item.*` queries every allowed block collection              |
| Always send `limit`; page with `limit` + `page` and a stable `sort`                | Default is 100. `limit=-1` loads the whole collection into memory   |
| For deep paging or exports, use keyset paging: `sort=id&filter[id][_gt]=<last id>` | Large `offset` values make the database walk past every skipped row |
| Filter and sort on indexed fields                                                  | Everything else is a table scan on large collections                |
| Ask for `meta` only when the UI shows a total                                      | Each `meta` value is an extra query (below)                         |

**Limits.** `QUERY_LIMIT_DEFAULT` (100) applies when `limit` is omitted. `QUERY_LIMIT_MAX` is unset by default, which means no cap (`/server/info` reports `-1`).
When it's set, `limit=-1` becomes the max and a larger `limit` fails with `INVALID_QUERY`. `GET /server/info` shows
the instance's values. `MAX_RELATIONAL_DEPTH` (10) caps nesting.

## Counts, aggregates, search

- `meta=filter_count` and `meta=total_count` each run a separate `COUNT(*)` with your filter, search, and permission
  rules (`COUNT(DISTINCT pk)` when the filter joins). Request them on the first page, not every page.
- To count or sum, use `aggregate` (`aggregate[count]=*`, `aggregate[sum]=price`, `groupBy[]=status`), never fetch
  rows and count client-side. On Postgres, aggregate results come back as strings (`"count": "150"`).
- `search` runs `LOWER(column) LIKE '%term%'` OR'ed across every searchable string and text field in the collection
  (plus numeric fields when the term is a number, UUID fields when it's a UUID). No index can serve that. On large
  collections:
  - Prefer a `filter` on the one field the user means (`filter[title][_icontains]=term`).
  - Exclude long or irrelevant fields with the field setting `meta.searchable: false` (verified: excluded fields
    stop matching).
  - For real full-text search, sync to a search engine with a hook (Meilisearch, Algolia, Elasticsearch tutorials).

## Caching

Off by default. Configured with `CACHE_*` env vars.

| Behavior                | Detail                                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What's cached           | `GET` responses and GraphQL, when `CACHE_ENABLED=true`. Key: user, path, and parsed query (plus IP if an IP-restricted policy matches). Public requests share entries; each logged-in user gets their own.                                |
| Not cached              | `/auth`, `export`, responses over `CACHE_VALUE_MAX_SIZE`, and reads of a collection whose read permission uses `$NOW` (for that caller)                                                                                                   |
| **Stale reads**         | `CACHE_AUTO_PURGE` defaults to `false`. Writes don't clear the cache; reads return old data until `CACHE_TTL` (default `5m`). Verified: after a `PATCH`, the next read was a `HIT` with the old value.                                    |
| `CACHE_AUTO_PURGE=true` | Any write clears the **whole** data cache, not just that collection (except collections in `CACHE_AUTO_PURGE_IGNORE_LIST`). Write-heavy instances barely cache.                                                                           |
| Bypass one request      | Send `Cache-Control: no-store`. Works only when `CACHE_SKIP_ALLOWED=true`; otherwise the header is ignored. Studio requests skip the cache when auto purge is off.                                                                        |
| Clear manually          | `POST /utils/cache/clear` (admin). Add `?system` to also clear the system and schema cache.                                                                                                                                          |
| Response headers        | Cacheable responses get `Cache-Control: public` (no token) or `private`, `max-age=<TTL>`, plus `s-maxage` from `CACHE_CONTROL_S_MAXAGE`. With auto purge on, or for uncacheable responses, `no-cache`. A CDN can cache the `public` ones. |
| Debug                   | `CACHE_STATUS_HEADER=X-Cache` adds `HIT` / `MISS`.                                                                                                                                                                                        |

- `CACHE_STORE=memory` is per process. Several instances need `redis` or each serves its own stale copy
  (`directus-self-hosting`).
- `/assets` has its own cache headers (`ASSETS_CACHE_TTL`, default `30d`); see [files-and-assets.md](files-and-assets.md).
- The schema cache (`CACHE_SCHEMA`, on by default) is separate from the data cache and is not affected by
  `CACHE_ENABLED`.

**House rule:** for a public website, turn caching on with `CACHE_AUTO_PURGE=true` so edits show on the next request.
Only cache in a CDN or the browser with auto purge off and a `CACHE_TTL` the user accepts as staleness; with auto purge
on, responses say `no-cache`. Tell the user which setup they have, because "I saved it but the site didn't change" is
the usual symptom.

## Sources

- https://directus.com/docs/configuration/cache
- https://directus.com/docs/configuration/security-limits
- https://directus.com/docs/guides/connect/query-parameters
- https://directus.com/docs/guides/data-model/fields
- https://directus.com/docs/tutorials/extensions/integrate-meilisearch-indexing-with-custom-hooks
- https://github.com/directus/directus/blob/v12.6.0/packages/env/src/constants/defaults.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/database/run-ast/run-ast.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/database/run-ast/utils/merge-with-parent-items.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/database/run-ast/lib/apply-query/search.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/database/run-ast/lib/apply-query/filter/index.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/meta.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/sanitize-query.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/validate-query.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/middleware/cache.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/middleware/respond.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/get-cache-key.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/get-cache-headers.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/should-skip-cache.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/should-clear-cache.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/permissions-cacheable.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/utils.ts
