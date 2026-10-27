# Reading and writing data with `rest()`

Filter operators, `deep`, relational write payloads, and other query syntax belong to the `directus` skill (`references/filters.md`, `references/rest-api.md`). This file covers how the SDK sends them and what comes back. Docs: https://directus.com/docs/guides/connect/sdk

## Contents

- [Item commands](#item-commands)
- [The query object](#the-query-object)
- [What comes back](#what-comes-back)
- [Counting and pagination](#counting-and-pagination)
- [Helpers: withToken, withOptions, withSearch, customEndpoint](#helpers)
- [Errors](#errors)
- [GraphQL](#graphql)

## Item commands

Commands are standalone, tree-shakeable exports from `@directus/sdk` that build a request; nothing is sent until you pass one to `client.request()`. Arguments are **positional**. The last `query` argument on writes controls which fields the response returns.

| Command | Signature | Notes |
| --- | --- | --- |
| `readItems` / `readItem` | `(collection, query?)` / `(collection, key, query?)` | |
| `readSingleton` / `updateSingleton` | `(collection, query?)` / `(collection, item, query?)` | |
| `createItem` / `createItems` | `(collection, item, query?)` / `(collection, items[], query?)` | |
| `updateItem` | `(collection, key, item, query?)` | |
| `updateItems` | `(collection, keys[] \| query, item, query?)` | Sends `{ keys \| query, data }` |
| `updateItemsBatch` | `(collection, items[], query?)` | Each item carries its primary key |
| `deleteItem` / `deleteItems` | `(collection, key)` / `(collection, keys[] \| query)` | `deleteItem` resolves `null` |
| `aggregate` | `(collection, { aggregate, groupBy?, query? })` | See [counting](#counting-and-pagination) |

- Item commands throw for `directus_*` names. Core collections have their own commands (`readUsers`, `readMe`, `updateMe`, `readFiles`, `uploadFiles`, `readRoles`, `serverInfo`, ...). Content versions: `readContentVersions`, `saveToContentVersion`, `compareContentVersion`, `promoteContentVersion`.
- The SDK throws before sending when the collection, key, or keys array is empty.

```ts
const created = await directus.request(createItem('posts', { title: 'Hello', status: 'draft' }, { fields: ['id'] }));
await directus.request(updateItems('posts', { filter: { status: { _eq: 'draft' } } }, { status: 'archived' }));
```

## The query object

| Key | SDK behavior |
| --- | --- |
| `fields` | Array; nested objects become dot paths. Omit and the API returns `*` with relations as bare keys. |
| `filter` | Sent as JSON. Ignored if `{}`. |
| `sort`, `search`, `offset`, `page` | Sent as-is (`sort` array or string, `-` for descending; `page` starts at 1 and uses `limit`). |
| `limit` | API default is 100 (`QUERY_LIMIT_DEFAULT`). `-1` for all, if `QUERY_LIMIT_MAX` allows. |
| `deep` | Sent as JSON; keys prefixed with `_` (`{ blocks: { _sort: ['sort'], _filter: {...} } }`). |
| `alias` | Sent as JSON. Not reflected in output types. |
| `version` / `versionRaw` | Content version key. `versionRaw` is `readItem`/`readSingleton` only. Drafts in a frontend: `directus-visual-editing`. |
| `backlink` | **Not sent.** Typed on `Query` but `queryToParams` never serializes it in v27.0.0. Use `withOptions` or a custom param. |
| any other key | Passed through as a query parameter (string or JSON string), for example `meta`, `export`. |

## What comes back

The SDK unwraps the JSON response and returns **only `data`**. `meta` is dropped, so `readItems('posts', { meta: 'total_count' } as any)` still returns `Post[]`.

`onResponse` hooks also receive the unwrapped value. Non-JSON responses: `text/html` and `text/plain` come back as a string (other `text/*` types, such as CSV exports, do not), `204` as `null`, anything else as the raw `Response`.

## Counting and pagination

Put `filter`/`search` **inside `query`**. A top-level `filter` compiles without error and is silently dropped, so the count covers the whole collection.

```ts
const [{ count }] = await directus.request(
	aggregate('posts', { aggregate: { count: '*' }, query: { filter: { status: { _eq: 'published' } } } }),
);
const total = Number(count); // typed as strings; strings at runtime on Postgres
```

`groupBy` returns one row per group: `aggregate('posts', { aggregate: { count: '*' }, groupBy: ['status'] })`.

Paginate with `limit` + `page` (or `offset`), a stable `sort` (`['-published_at', 'id']`), and the count above run in parallel: `pages = Math.ceil(Number(count) / limit)`.

## Helpers

```ts
import { withToken, withOptions, withSearch, customEndpoint } from '@directus/sdk';

await directus.request(withToken(token, readItems('posts'))); // per-request bearer token
await directus.request(withOptions(readItems('posts'), { cache: 'no-store' })); // shallow-merged into RequestInit

// extra headers: use the function form and spread init.headers
await directus.request(
	withOptions(readItems('posts'), (init) => ({ ...init, headers: { ...init.headers, 'X-Request-Id': id } })),
);

// query as a SEARCH request body instead of the URL (long filters)
await directus.request(withSearch(readItems('posts', { filter: bigFilter })));

// endpoint extension or any route without a command
const stats = await directus.request(customEndpoint<{ total: number }>({ path: '/my-endpoint/stats', method: 'GET' }));
```

- Helpers compose: `withToken(token, withOptions(readItems('posts'), { cache: 'no-store' }))`.
- **Trap:** `withOptions(cmd, { headers: {...} })` replaces the whole `headers` object, which holds `Authorization` (from `withToken` or the client token) and `Content-Type`. The request goes out as Public and writes lose their JSON content type. Always use the function form.
- `withSearch` uses the HTTP `SEARCH` method, which is not in the default `CORS_METHODS`.
- `customEndpoint` responses are unwrapped the same way (a top-level `data` key is returned alone). For a JSON body pass `body: JSON.stringify(...)`; `Content-Type: application/json` is added for you.

## Errors

```ts
import { isDirectusError } from '@directus/sdk';

try {
	await directus.request(createItem('posts', payload));
} catch (error) {
	if (!isDirectusError(error)) throw error; // network failure, SDK argument check, non-JSON error body
	const code = error.errors[0]?.extensions.code; // 'FORBIDDEN', 'INVALID_PAYLOAD', 'RECORD_NOT_UNIQUE', ...
	const status = error.response.status;
}
```

- Thrown API errors carry `message` (first error's message), `errors` (array), and `response` (the fetch `Response`).
- `readItem` on a missing key returns **403 `FORBIDDEN`**, not 404. Directus does not reveal whether an item exists to callers who cannot read it.
- `401 INVALID_CREDENTIALS` on a static token usually means the token was regenerated or the database was reset. `401 TOKEN_EXPIRED` means a login access token expired and was not refreshed.
- GraphQL errors (HTTP 200 with `errors`) are thrown the same way. Codes: https://directus.com/docs/guides/connect/errors

## GraphQL

```ts
const client = createDirectus<Schema>(url).with(staticToken(token)).with(graphql());
const data = await client.query<{ posts: Post[] }>(`query ($limit: Int) { posts(limit: $limit) { id title } }`, {
	limit: 5,
});
// system collections: client.query(query, variables, 'system')
```

Output is whatever generic you pass; the Schema does not type GraphQL results.

## Sources

- https://directus.com/docs/guides/connect/sdk
- https://directus.com/docs/guides/connect/query-parameters
- https://directus.com/docs/guides/connect/errors
- https://directus.com/docs/configuration/security-limits
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/utils/query-to-params.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/utils/extract-data.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/utils/request.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/utils/is-directus-error.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/rest/commands/read/items.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/rest/commands/read/aggregate.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/types/aggregate.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/rest/commands/update/items.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/rest/commands/delete/items.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/rest/helpers/with-options.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/rest/composable.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/rest/helpers/with-search.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/rest/helpers/custom-endpoint.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/graphql/composable.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/items.ts
- https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/lib/directus/fetchers.ts
