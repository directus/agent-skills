# Permission rules

Anatomy of one `directus_permissions` row, the dynamic variables you can use in it, and what each part does at request
time. What callers see when a rule bites: [applying-and-testing.md](applying-and-testing.md#reading-failures).

## Anatomy

A full row in context: [applying-and-testing.md](applying-and-testing.md#create-with-rest).

| Key | Applies to | Meaning |
| --- | --- | --- |
| `action` | - | `create`, `read`, `update`, `delete`, or `share` |
| `permissions` | read, update, delete, share | Item rule: a filter rows must match. `{}` or null means all rows |
| `fields` | read, create, update | Allowed fields. `["*"]` is all fields. `null` or `[]` means no fields. Ignored for delete and share, but on core those rows still need `["*"]` or they count as custom |
| `validation` | create, update | Filter the incoming payload (after presets) must satisfy |
| `presets` | create, update | Default values merged under the payload |

One row per policy + collection + action. Everything except `["*"]` fields and empty rules is a **custom rule** and is
licensed on v12. See [licensing.md](licensing.md).

## Item rules

Normal filter syntax, including relational paths and `_and` / `_or`. Examples: [recipes.md](recipes.md).

- Reads: rows that don't match are silently left out. Update, delete, share: the targeted keys must all match, or the
  request fails with 403.
- Create has no item rule. Use `validation` to constrain what can be created.
- Item rules on junction collections matter. Unfiltered create on `post_tags` lets a user attach any tag to any post
  even without update on `posts`.

## Dynamic variables

| Variable | Resolves to |
| --- | --- |
| `$CURRENT_USER` / `$CURRENT_USER.<field>` | The user's primary key / a field on the user, including relational paths (`$CURRENT_USER.department`) |
| `$CURRENT_ROLE` / `$CURRENT_ROLE.<field>` | The user's own role id / a field on that role |
| `$CURRENT_ROLES` | Array of the role id and all ancestor role ids. Use with `_in` / `_nin` |
| `$CURRENT_POLICIES` | Array of the request's policy ids (after IP filtering). Use with `_in` / `_nin` |
| `$NOW`, `$NOW(-1 year)` | Current timestamp, optionally adjusted |

- `$CURRENT_ROLES` and `$CURRENT_POLICIES` aren't on the docs' filter-rules page; they come from the source
  (`parse-filter.ts`, `fetch-dynamic-variable-data.ts`) and the Studio's own built-in permissions use them.
- For an anonymous request every `$CURRENT_*` variable is null, so a rule like `owner = $CURRENT_USER` matches nothing.

```json
{ "_or": [{ "owner": { "_eq": "$CURRENT_USER" } }, { "team": { "_eq": "$CURRENT_USER.team" } }] }
```

## Fields

- `["*"]` grants every field, including ones added later. A list grants only those fields; new fields stay hidden until
  you add them.
- Reads: `fields=*` silently expands to only the allowed fields; asking explicitly for a forbidden field is a 403.
  Create and update: any payload key outside the allowed list is a 403 naming the fields.
- Alias fields (O2M, M2M, M2A) must be in the list for nested writes and reads through them, and the related collection
  needs its own permissions.

## Validation

- A filter applied to the payload with presets already merged in. Failures return `FAILED_VALIDATION` per field.
  `_regex` works only here.
- All validation rules from every policy granting the action must pass (AND), plus schema-level field validation and
  required/non-nullable checks ([model.md](model.md#how-stacked-policies-combine)).
- Validation only sees the payload, not the stored item. `{"status": {"_neq": "published"}}` on update blocks sending
  `status: published`, but a payload that omits `status` passes (keys are optional unless the rule uses `_submitted`).

## Presets

- Default values, with dynamic variables: `{ "author": "$CURRENT_USER" }`, `{ "folder": "<folder-id>" }`. Applied on
  create and update before validation; merged across policies in policy order, later wins.
- The payload wins over a preset when the caller can write that field. To **force** a value, keep the field out of
  `fields` (then the caller can't send it) and set it in `presets`.

## Sources

- https://directus.com/docs/guides/auth/access-control
- https://directus.com/docs/guides/connect/filter-rules
- https://directus.com/docs/guides/security/best-practices
- https://github.com/directus/directus/blob/v12.6.0/packages/types/src/permissions.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/constants/src/permissions.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/utils/shared/parse-filter.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/utils/shared/is-dynamic-variable.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/permissions/utils/fetch-dynamic-variable-data.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/permissions/utils/process-permissions.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/permissions/modules/process-payload/process-payload.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/permissions/modules/process-ast/utils/validate-path/validate-path-permissions.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/permissions/modules/validate-access/validate-access.ts
