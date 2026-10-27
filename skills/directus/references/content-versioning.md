# Content versioning

Versions let editors change an item without touching the published row. Enable per collection (**Enable Versions**,
`meta.versioning`). Which collections to version: `directus-content-modeling`. Live Preview, the Visual Editor, and
reading drafts in a frontend: `directus-visual-editing`.

## Concepts

- **Published** is the real row. Reserved key `published`; `main` still works as an alias, but don't use it in new code.
- **Draft** is the reserved global key `draft`. Every versioned item can have one; it's virtual until first saved.
  Custom versions use any other key (not `published`, `main`, or `draft`) and start from the published item.
- A version stores only changed fields in `delta`. **Promote** applies the delta to the published row (Studio:
  **Publish**).
- **Item-less draft:** a draft for an item that doesn't exist yet (`item: null`). Promoting it creates the item. Only
  key `draft` can be item-less.
- In the Studio, published items in versioned collections are read-only; edits go to the draft. **The API does not
  enforce this.** `PATCH /items/<collection>/<id>` still writes the published row directly.

## Reading versions

```
GET /items/posts/42?version=draft&fields=id,title,blocks.*
GET /items/posts?version=draft&fields=id,title
```

- The response is the published item with the delta merged in, plus `$meta`: `version_id` (the `directus_versions` row
  id, not the key), and `delta` and `error` when the version has no changes or couldn't be applied.
- **Single item with no saved version under that key returns 403 FORBIDDEN.** Fall back to the published read.
- **Lists only include items that have that version.** `?version=draft` on a list is "items with pending drafts", not
  "all items, draft where available". Merge with a published list if you need both. Item-less drafts appear with a
  `null` primary key.
- `versionRaw=true` (single item only) returns relational changes in the detailed `create`/`update`/`delete` form
  instead of merged objects.
- GraphQL: `version` works only on `<collection>_by_id`, singleton queries, and `<collection>_by_version`.

## Version API

| Purpose       | Request                                                            | Body / notes                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List versions | `GET /versions?filter[collection][_eq]=posts&filter[item][_eq]=42` |                                                                                                                                                                                                     |
| Create        | `POST /versions`                                                   | `{ "key": "draft", "collection": "posts", "item": "42", "name": "Draft" }`. `item: null` only with `key: "draft"`. Fails if the collection isn't versioned or the key already exists for that item. |
| Save changes  | `POST /versions/<version-id>/save`                                 | Partial item payload, merged into the delta. Required fields are only validated on promote.                                                                                                         |
| Compare       | `GET /versions/<version-id>/compare`                               | Returns `outdated`, `mainHash`, `current` (delta), `main` (published item).                                                                                                                         |
| Promote       | `POST /versions/<version-id>/promote`                              | `{ "mainHash": "<from compare>", "fields": ["title"] }`. `mainHash` is required when the version has an item; `fields` limits what gets applied.                                                    |
| Delete        | `DELETE /versions/<version-id>`                                    | Discards the version.                                                                                                                                                                               |

Promote flow:

1. `GET /versions/<id>/compare`. If `outdated` is true the published item changed since the version was created;
   review before promoting.
2. `POST /versions/<id>/promote` with that `mainHash`. A stale hash fails with 422 `VERSION_HASH_MISMATCH`. No delta
   fails with "No changes to promote".
3. Promote doesn't delete the version. The Studio deletes it afterwards when the user may delete `directus_versions`.
   Over the API, `DELETE /versions/<id>` yourself if you want the draft cleared.

Promote checks `update` permission on the item (or `create` for an item-less draft) and fires `items.promote` filter
and action events.

## Permissions

| Collection               | Editors need                                            | Read-only frontends need |
| ------------------------ | ------------------------------------------------------- | ------------------------ |
| The versioned collection | Read, Create, Update                                    | Read                     |
| `directus_versions`      | Read, Create, Update, Delete (all fields, no item rule) | Read                     |
| `directus_revisions`     | Read (scope by `collection`)                            | none                     |

Missing pieces show up as a disabled Create button, a read-only form, or FORBIDDEN on publish. Clearing
`directus_revisions` by hand can break versions still in use.

## Sources

- https://directus.com/docs/guides/content/content-versioning
- https://directus.com/docs/guides/content/live-preview
- https://directus.com/docs/guides/connect/query-parameters
- https://directus.com/docs/api/versions
- https://directus.com/docs/releases/breaking-changes/version-12
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/versions.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/versions.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/versioning/handle-version.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/constants/src/versions.ts
- https://github.com/directus-labs/starters/tree/main/cms
