# GraphQL

Directus generates a GraphQL schema per caller from the data model and their permissions. Same permissions, filter
operators, and query params as REST, in GraphQL form.

**House rule:** use REST (or the SDK) by default. It covers files, assets, versions, flow triggers, utilities, and
`SEARCH`, has simpler error handling, and is what the MCP tools and most examples use. Pick GraphQL when the caller
already has a GraphQL client and wants typed, nested selections in one request.

## Endpoints and naming

- `POST /graphql`: user collections. `POST /graphql/system`: system collections (`users`, `files`, `roles`, ...; the
  `directus_` prefix is dropped) plus auth, server, and utility mutations (`auth_login`, `auth_refresh`, ...).
- `GET /server/specs/graphql/<scope>`: SDL for `items` or `system`, if `GRAPHQL_INTROSPECTION` is on.
- `ws(s)://<host>/graphql`: subscriptions (see [realtime.md](realtime.md)).
- Authenticate with `Authorization: Bearer <token>` like REST. A locked-down instance returns 403
  `RESOURCE_RESTRICTED` on `/graphql` (see `directus-access-control`).

| Operation | Field for a collection `posts`                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------- |
| List      | `posts(filter:, sort:, limit:, offset:, page:, search:)`                                              |
| One       | `posts_by_id(id: 1, version: "draft")`                                                                |
| Aggregate | `posts_aggregated(groupBy: [...]) { count { id } sum { views } countAll }`                            |
| Version   | `posts_by_version(id: 1, version: "draft")`                                                           |
| Create    | `create_posts_item(data:)`, `create_posts_items(data: [])`                                            |
| Update    | `update_posts_item(id:, data:)`, `update_posts_items(ids: [], data:)`, `update_posts_batch(data: [])` |
| Delete    | `delete_posts_item(id:)`, `delete_posts_items(ids: [])`                                               |

Singletons have no `_by_id`, `_aggregated`, create, or delete; update uses `update_<singleton>(data:)`.

```graphql
query {
	posts(filter: { status: { _eq: "published" } }, sort: ["-date_published"], limit: 10) {
		id
		title
		comments(filter: { approved: { _eq: true } }, limit: 3) {
			text
		}
		blocks {
			collection
			item {
				... on block_hero {
					headline
				}
			}
		}
	}
}
```

## Differences from REST

- Nested arguments replace `deep`: filter, sort, and limit directly on the relation field.
- Many-to-any uses union fragments (`... on block_hero`). In filters, `:` becomes `__` (`item__block_hero`).
- Functions: `date_published_func { year }` in selections, `date_published_func: { year: { _eq: 2024 } }` in filters.
- `version` only works on `_by_id`, singletons, and `_by_version`, not on lists.
- No file uploads and no `/assets` transforms. Use REST for files.
- Resolver errors can come back as HTTP 200 with an `errors` array. Check both status and `errors[].extensions.code`.
- Some sensitive system mutations are single-use per request (`GRAPHQL_SINGLE_USE_MUTATIONS`). Large queries are
  capped by `GRAPHQL_QUERY_TOKEN_LIMIT` (default 5000).
- The schema is per-user: a field you can't read is not in your schema, so queries fail validation instead of
  returning `null`.

## Sources

- https://directus.com/docs/guides/connect/query-parameters
- https://directus.com/docs/guides/connect/errors
- https://directus.com/docs/guides/realtime/subscriptions
- https://directus.com/docs/configuration/general
- https://directus.com/docs/configuration/security-limits
- https://directus.com/docs/licensing/overview
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/graphql.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/graphql/schema/index.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/server.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/env/src/constants/defaults.ts
