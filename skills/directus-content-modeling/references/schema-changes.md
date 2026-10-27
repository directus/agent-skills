# Changing a schema that holds data

- [What Directus does natively](#what-directus-does-natively)
- [The safe pattern](#the-safe-pattern)
- [Recipes](#recipes)
- [Making a field required or unique](#making-a-field-required-or-unique)
- [Deleting](#deleting)

Get the user's approval before any of these (see the router). This file is the path to take once they say yes.

## What Directus does natively

Observed on 12.5.1 against Postgres 16 and SQLite:

| Change                                                                    | What happens                                                                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Rename a field: `PATCH /fields/posts/title` with `field` or `schema.name` | **No rename.** Returns 200 and the old field. With `meta` in the body it also inserts a stray `directus_fields` row for the new name (no column). Never send `field` in a PATCH. |
| Rename a collection: `PATCH /collections/posts` with `collection`         | **Ignored.** Returns 200, nothing changes.                                                                     |
| Rename in a snapshot or `d6s` push                                        | Diffs match by name, so a rename is a delete of the old field plus a create of an empty new one. Data is lost. |
| Change type with `{ "type": "integer" }` only                             | **Ignored.** The column is altered only when the body has a `schema` object (`"schema": {}` is enough).        |
| Change type, Postgres                                                     | `ALTER ... USING (col::type)`. Any value that can't cast fails the whole change (500, nothing altered).        |
| Change type, SQLite                                                       | Succeeds, and values that can't convert stay as text (`"draft"` in an `integer` column).                       |
| Lower `schema.max_length`                                                 | **Postgres truncates silently** (`"T149"` became `"T"`). SQLite keeps the long values.                         |
| `is_nullable: false` on a column with nulls                               | 400 `CONTAINS_NULL_VALUES`, nothing changes                                                                    |
| `is_unique: true` on a column with duplicates                             | 400 `RECORD_NOT_UNIQUE`, nothing changes                                                                       |
| Alias (O2M, M2M, group) to a real type or back                            | 400 `INVALID_PAYLOAD`: "Alias type cannot be changed"                                                          |
| Primary key type                                                          | Can't be changed                                                                                               |
| `DELETE /fields/posts/title`                                              | 204. The column and its data are gone at once. Recreating the field gives nulls.                               |

So a "rename" or a lossy type change is always: new field, copy, switch, delete.

## The safe pattern

Expand, copy, switch callers, contract. Every step is reversible until the last one.

1. **Expand.** Add the new field or collection next to the old one. Copy `meta` from the old field
   (`GET /fields/posts/title`). Leave it nullable and not unique for now.
2. **Copy.** Page through the old values and write them to the new field:

   ```
   GET   /items/posts?fields=id,title&sort=id&limit=500&page=1      # repeat until a page comes back short
   PATCH /items/posts   [{ "id": "…", "headline": "…" }, …]          # one batch per page, transactional
   ```

   Item writes run hooks and Flows, write revisions and activity, and bump `date_updated` / `user_updated` on every
   row. If that matters (or the table is large) and the instance is self-hosted, copy in a custom migration instead
   (`MIGRATIONS_PATH`, see [indexes.md](indexes.md#composite-and-other-custom-indexes)):
   `await knex('posts').update({ headline: knex.ref('title') });`

3. **Verify.** `GET /items/posts?aggregate[count]=*&filter[title][_nnull]=true&filter[headline][_null]=true` must be 0.
4. **Switch callers.** Everything that names the old field: frontend queries and SDK types, permission field lists
   and item rules, presets and bookmarks, Flows, `display_template`, `sort_field` / `archive_field`, conditions and
   validation, Insights panels, Visual Editor bindings. Callers without read access to the new field get 403 when they
   request it.
5. **Tighten.** Now set `is_nullable: false`, `is_unique`, or an index on the new field.
6. **Contract.** After callers are deployed and the user confirms, export the old data, then delete the old field.

Do the same steps on dev first, then promote with Environment Sync. Run the data copy separately in each environment:
sync moves schema, not content.

## Recipes

**Rename a field.** The pattern above. If only the label is wrong, set `meta.translations` instead and skip all of it.

**Rename a collection.** Create the new collection with the same fields and PK type, recreate every relation that
points to it (`PATCH /relations` can't change the target), copy items with their primary keys so references and URLs
survive, switch callers, delete the old one. This is costly; prefer a new display name via `meta.translations`.

**Change a field's type.** New field with the target type, copy with conversion in your script (parse, round, map
unknown values), verify, switch, delete. Only `PATCH` the type in place on dev, after checking every value converts.

**Text field to a relation** (`posts.category` holds `"News"`, should point to `categories`):

1. Create `categories`. Get the distinct values: `GET /items/posts?groupBy[]=category&aggregate[count]=*`. Create one
   category per value and keep the value-to-key map.
2. Add the M2O field and relation. It needs a new name (`primary_category`), since `category` is taken. If the final
   name must be `category`, run a second rename cycle after the old field is gone.
3. Copy: for each post set the FK from the map. Verify no post with a `category` value lacks the FK. Switch, delete.

**Split a collection** (move `seo_*` fields from `posts` into `seo`): create `seo` and an M2O `posts.seo`, create one
`seo` row per post with the copied values and link it, verify, switch, delete the old fields.

**Merge collections** (`news` into `posts`): add a discriminator (`type`) to `posts`, copy `news` items keeping their
UUIDs, recreate relations that pointed at `news`, add redirects for old URLs (see
[routing-and-seo.md](routing-and-seo.md)), switch, delete `news`. Integer keys from two collections collide; this is
one reason for the UUID house rule.

## Making a field required or unique

Find the rows that would fail before you change the schema:

```
GET /items/posts?filter[slug][_null]=true&aggregate[count]=*       # nulls block is_nullable: false
GET /items/posts?groupBy[]=slug&aggregate[count]=*                 # any count > 1 blocks is_unique
```

Fix them with the user (fill, merge, or suffix duplicates), then apply. Empty strings are not null and count as
duplicates of each other. On Postgres, aggregate counts come back as strings (`"150"`). `meta.required` alone is only
enforced by the Studio; see [fields-and-interfaces.md](fields-and-interfaces.md#conditions-and-validation).

## Deleting

- Deleting a field or collection drops the column or table immediately. There is no trash.
- Export first: `GET /items/posts?fields=id,title&limit=-1&export=json` (or `csv`) returns a download.
- Delete by explicit name, one at a time, after the user confirms. Never delete and recreate a field to "fix" it.

## Sources

- https://directus.com/docs/guides/data-model/fields
- https://directus.com/docs/guides/connect/query-parameters
- https://directus.com/docs/configuration/migrations
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/fields.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/controllers/fields.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/collections.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/payload.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/utils/schema/get-snapshot-diff.ts
- https://github.com/directus/directus/tree/v12.5.1/packages/errors/src/errors
