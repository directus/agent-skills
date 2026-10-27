# Filters

One filter syntax everywhere: the `filter` and `deep[*][_filter]` query params, permission item rules, validation
rules, presets, Flow condition operations, and the MCP `items` tool. Full operator list:
https://directus.com/docs/guides/connect/filter-rules.

## Shape and operators

```json
{ "<field>": { "<operator>": <value> } }
```

Keys at the same level are AND-ed. `_and` and `_or` take arrays, nest inside each other, and can't sit inside a field
rule. The strings `"true"`, `"false"`, and `"null"` are coerced to their JSON values.

Operators that trip agents up:

- **There is no `_not`.** Use the negated operator: `_neq`, `_nin`, `_ncontains`, `_nbetween`, `_nnull`, `_none`.
- `_eq: null` means is null. `_eq` / `_neq` compare numbers and numeric strings loosely.
- `_null` / `_nnull` / `_empty` / `_nempty` take the value `true`. `_empty` means null or falsy (empty string, empty
  array).
- `_contains`, `_starts_with`, `_ends_with` are case-sensitive; the `_i` forms (`_icontains`, `_istarts_with`, ...)
  are not.
- `_between` is inclusive: `[min, max]`. `_in` / `_nin` take an array.
- `_some` / `_none` work only on one-to-many and many-to-many fields.
- `_regex` works only in validation rules. Escape backslashes.
- `_json` compares a value inside a JSON field; `_intersects` and the `_bbox` forms are for geometry fields (GeoJSON).

## Dynamic variables

Resolved on the server for the current request.

| Variable                                 | Value                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `$CURRENT_USER` / `$CURRENT_USER.<path>` | User primary key / any field on the user, including relations (`$CURRENT_USER.avatar.filesize`) |
| `$CURRENT_ROLE` / `$CURRENT_ROLE.<path>` | Primary key of the user's role / any field on the role                                          |
| `$CURRENT_ROLES`                         | Array of role keys (the role plus its parent roles)                                             |
| `$CURRENT_POLICIES`                      | Array of the caller's policy keys                                                               |
| `$NOW`, `$NOW(<adjustment>)`             | Current timestamp, optionally offset: `$NOW(-7 days)`, `$NOW(+2 hours)`                         |

```json
{ "_and": [{ "user_created": { "_eq": "$CURRENT_USER" } }, { "publish_date": { "_lte": "$NOW" } }] }
```

- Unauthenticated: `$CURRENT_USER` and `$CURRENT_ROLE` resolve to `null`.
- `$CURRENT_ROLES` and `$CURRENT_POLICIES` (use with `_in`) work in the API and the Studio but aren't in the docs.

## Relational filters

```json
{ "author": { "name": { "_eq": "Rijk van Zanten" } } }
{ "comments": { "_none": { "status": { "_eq": "spam" } } } }
{ "tags": { "tag": { "name": { "_eq": "News" } } } }
{ "blocks": { "item:block_hero": { "headline": { "_icontains": "launch" } } } }
{ "$FOLLOW(cities, country_id)": { "name": { "_eq": "Berlin" } } }
```

- **Many-to-one:** nest the related field.
- **One-to-many:** `_some` is the default when you nest without a quantifier.
- **Many-to-many:** the filter walks through the junction, so include the junction's foreign key field (`tag`).
- **Many-to-any:** scope with `item:<collection>`. In GraphQL `:` becomes `__` (`item__block_hero`).
- **Reverse relation with no alias field:** `$FOLLOW(<collection>, <fk_field>)`.
- A relational `filter` selects parent items; it doesn't trim the nested array. Use `deep[<relation>][_filter]` for that
  ([rest-api.md](rest-api.md#query-parameters)).

## Functions

Wrap a field (in `fields`, `filter`, `sort`, `groupBy`, `aggregate`): `year`, `month`, `week`, `day`, `weekday`,
`hour`, `minute`, `second`, and `count` (items in a JSON array or relation).

```json
{ "_and": [{ "year(published_date)": { "_eq": 2024 } }, { "count(comments)": { "_gt": 5 } }] }
```

GraphQL uses `<field>_func: { year: { _eq: 2024 } }` instead.

## Where filters show up

| Context                  | Behavior                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Permission item rule     | Rows the policy can see or change. Rules from several policies are OR'ed. Needs a license on v12 (see `directus-access-control`).           |
| Validation rule          | Payload must match or the write fails with `FAILED_VALIDATION`. Only place `_regex` works.                                                  |
| Permission presets       | Default values on create or update, may use variables.                                                                                      |
| Flow condition operation | Filter runs against the data chain: nest from the root key, `{"$trigger": {"payload": {"status": {"_eq": "published"}}}}`. Never dot paths. |

## Sources

- https://directus.com/docs/guides/connect/filter-rules
- https://directus.com/docs/guides/connect/query-parameters
- https://directus.com/docs/guides/connect/json/quickstart
- https://directus.com/docs/guides/auth/access-control
- https://github.com/directus/directus/blob/v12.6.0/packages/types/src/filter.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/utils/shared/parse-filter.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/database/run-ast/lib/apply-query/filter/operator.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/items/prompt.md
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/operations/prompt.md
