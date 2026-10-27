# REST API

Calling Directus over HTTP. Filters: [filters.md](filters.md). Login and tokens: [auth-and-access.md](auth-and-access.md).
Full reference: https://directus.com/docs/api/items and https://directus.com/docs/guides/connect/query-parameters.

## Contents

- [Item endpoints](#item-endpoints)
- [Responses](#responses)
- [Query parameters](#query-parameters)
- [Relational writes](#relational-writes)
- [Errors](#errors)
- [System endpoints](#system-endpoints)

## Item endpoints

`GET`, `POST`, `PATCH`, `DELETE` on `/items/<collection>` and `/items/<collection>/<pk>`. `POST` takes an object or an
array. The non-obvious forms:

| Purpose                     | Request                            | Body                                                        |
| --------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| List with query in body     | `SEARCH /items/<collection>`       | `{ "query": { ... } }` (overrides URL params)               |
| Update many, same data      | `PATCH /items/<collection>`        | `{ "keys": [...], "data": {...} }`                          |
| Update many by query        | `PATCH /items/<collection>`        | `{ "query": { "filter": ... }, "data": {...} }`             |
| Update many, different data | `PATCH /items/<collection>`        | array of objects, each with its primary key                 |
| Delete many                 | `DELETE /items/<collection>`       | array of keys, `{ "keys": [...] }`, or `{ "query": {...} }` |
| Singleton read / update     | `GET` / `PATCH /items/<singleton>` | no key; PATCH upserts                                       |

- `keys` and `query` are mutually exclusive on update and delete.
- Update and delete by query run as a read first: the caller needs read access to the primary key and to every field
  used in `filter` and `sort`. Items the caller can't read are skipped.
- Batch mutations are transactional: all succeed or all fail. `MAX_BATCH_MUTATION` caps the batch size (default
  unlimited); over it fails with `INVALID_PAYLOAD`.

**House rule:** delete by explicit keys. Read the matching keys first, confirm the count with the user, then delete.

## Responses

- `data` is an object for single-item reads, singletons, and single-object creates; an array for lists and array
  creates. Update-many always returns an array.
- `meta` only appears when requested: `meta=total_count` (all items), `meta=filter_count` (after filter and search), or
  `meta=*`.
- Create and update return the written items, shaped by `fields` (204 with no body if the caller can't read them).
  Delete returns 204.

## Query parameters

Pass as bracket params (`filter[status][_eq]=draft`) or JSON strings (`filter={"status":{"_eq":"draft"}}`). They work on
system endpoints too.

| Param                    | Notes                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `fields`                 | `title,author.name`, `*`, `*,images.*`. Send it every time.                                                                               |
| `search`                 | All string and text fields in the collection, not related fields. Slower than a filter.                                                   |
| `limit`                  | Default `100` (`QUERY_LIMIT_DEFAULT`). `-1` = all, capped by `QUERY_LIMIT_MAX` if set.                                                    |
| `offset` / `page`        | `page` starts at 1 and multiplies `limit`. Use a stable `sort`.                                                                           |
| `aggregate` / `groupBy`  | `aggregate[count]=*`, `groupBy[]=author&groupBy[]=year(publish_date)`                                                                     |
| `deep`                   | Query params on nested relations, prefixed with `_`: `_filter`, `_sort`, `_limit`, `_offset`, `_page`, `_search`. Not `fields` or `deep`. |
| `alias`                  | `alias[nl]=translations&deep[nl][_filter][code][_eq]=nl-NL`. No relational paths or dots in the alias.                                    |
| `version` / `versionRaw` | See [content-versioning.md](content-versioning.md).                                                                                       |
| `backlink`               | `backlink=false` drops reverse relations from `*.*` expansion only.                                                                       |

To pull a value out of a JSON field use `json(field, path)` in `fields` (not in `filter`; use the `_json` operator
there). Date and `count` functions: [filters.md](filters.md#functions).

```
# posts that have at least one approved comment (filters parents)
filter[comments][_some][status][_eq]=approved
# every post, but only its approved comments (filters nested rows)
deep[comments][_filter][status][_eq]=approved
```

Query depth through relations is capped by `MAX_RELATIONAL_DEPTH` (default 10); deeper fails with `INVALID_QUERY`.

## Relational writes

| Relation     | Link existing                                | Create nested                                                 | Update nested                                                 | Unlink                    |
| ------------ | -------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------- |
| Many-to-one  | `"author": 5`                                | `"author": { "name": "New" }`                                 | `"author": { "id": 5, "name": "Renamed" }`                    | `"author": null`          |
| One-to-many  | `"comments": [1, 5]`                         | `"comments": [{ "text": "Hi" }]`                              | `"comments": [{ "id": 5, "text": "Edited" }]`                 | leave it out of the array |
| Many-to-many | junction rows: `"tags": [{ "tags_id": 12 }]` | `"tags": [{ "tags_id": { "name": "New" } }]`                  | `"tags": [{ "id": 19, "tags_id": { "id": 7, "name": "x" } }]` | leave it out of the array |
| Many-to-any  |                                              | `"blocks": [{ "collection": "block_hero", "item": { ... } }]` |                                                               |                           |

**Arrays replace the whole set.** Anything not in the array is unlinked (and nulled or deleted depending on the
relation's `one_deselect_action`). For partial changes use the detailed form:

```json
{ "comments": { "create": [{ "text": "New" }], "update": [{ "id": 5, "text": "Edited" }], "delete": [9] } }
```

Many-to-many writes go through the junction: `id` is the junction row, `tags_id` (or your junction field name) is the
related item. Check the junction field names with the schema first.

## Errors

```json
{ "errors": [{ "message": "...", "extensions": { "code": "FORBIDDEN" } }] }
```

Branch on `extensions.code`, not the message. A response can hold several errors. Unknown codes (extensions and flows
throw their own) are generic failures. All codes: https://directus.com/docs/guides/connect/errors.

| Code                                                                                                         | Status | Usually means                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FORBIDDEN`                                                                                                  | 403    | No permission, **or** the collection, field, or item doesn't exist. The message names the field and path.                                                                                                |
| `INVALID_QUERY` / `INVALID_PAYLOAD`                                                                          | 400    | Bad query param (malformed filter JSON, unknown operator) / bad body (`extensions.reason` explains).                                                                                                     |
| `FAILED_VALIDATION`                                                                                          | 400    | Field validation failed. `extensions.field` and `type` say which.                                                                                                                                        |
| `RECORD_NOT_UNIQUE` / `NOT_NULL_VIOLATION` / `INVALID_FOREIGN_KEY` / `VALUE_TOO_LONG` / `VALUE_OUT_OF_RANGE` | 400    | Database constraint. `extensions.collection` / `field` say where.                                                                                                                                        |
| `INVALID_CREDENTIALS` / `TOKEN_EXPIRED` / `USER_SUSPENDED`                                                   | 401    | Wrong email, password, or token / refresh and retry / refresh for a suspended user, not retryable. `INVALID_TOKEN` (403) is a malformed token.                                                           |
| `COLLECTION_INACTIVE`                                                                                        | 403    | Collection deactivated (set to **Inactive**) by the license resolution flow. Reads and writes both fail.                                                                                                 |
| `RESOURCE_RESTRICTED`                                                                                        | 403    | Licensing. `extensions.category`: a feature (`custom_permission_rules_enabled`, `custom_llms_enabled`) or a locked area (`items`, `files`, `assets`, `graphql`, `mcp`, `flows`, `login`).                |
| `LIMIT_EXCEEDED`                                                                                             | 403    | A license limit (`extensions.category`: `seats`, `collections`, `flows`) or the concurrent import cap.                                                                                                   |
| `VERSION_HASH_MISMATCH`                                                                                      | 422    | Promote with a stale `mainHash`. Re-run compare, review, retry. `extensions.mainHash` has the current one.                                                                                               |
| `ROUTE_NOT_FOUND`                                                                                            | 404    | Wrong path. A missing item or collection is 403, not 404. Exception: singletons have no `POST /items/<singleton>` or `PATCH /items/<singleton>/<id>` (404); update them with `PATCH /items/<singleton>`. |

Licensing effects behind `RESOURCE_RESTRICTED` and `LIMIT_EXCEEDED`: `directus-access-control` (`references/licensing.md`).

## System endpoints

System collections have their own routes (`/users`, `/files`, `/roles`, `/policies`, `/permissions`, `/flows`,
`/versions`, `/dashboards`, `/panels`, `/settings`, ...) and take the same query params. `/server/ping` is public;
`/server/info` and `/server/health` need a token. `GET /server/specs/oas` returns an OpenAPI document built from this
instance's schema and the caller's permissions; use it for exact payload shapes.

## Sources

- https://directus.com/docs/guides/connect/query-parameters
- https://directus.com/docs/guides/connect/relations
- https://directus.com/docs/guides/connect/errors
- https://directus.com/docs/configuration/security-limits
- https://directus.com/docs/releases/breaking-changes/version-12
- https://directus.com/docs/api/items
- https://github.com/directus/directus/blob/v12.5.1/api/src/utils/sanitize-query.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/utils/validate-query.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/middleware/validate-batch.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/controllers/items.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/middleware/respond.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/modules/process-ast/utils/validate-path/create-error.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/app.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/ai/tools/items/prompt.md
- https://github.com/directus/directus/blob/v12.5.1/api/src/utils/create-mutation-tracker.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/license/entitlements/manager.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/middleware/is-locked.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/errors/src/errors
