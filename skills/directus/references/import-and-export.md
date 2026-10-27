# Import and export

Bulk loading content, upserts, exports, and moving content in from another CMS. Seed scripts for demo data and
fixtures: `directus-content-modeling` (`references/applying-schema.md`). Batch `/items` request shapes:
[rest-api.md](rest-api.md).

## Contents

- [Pick the tool](#pick-the-tool)
- [File import into one collection](#file-import-into-one-collection)
- [Multi-collection import](#multi-collection-import)
- [Upsert by a natural key](#upsert-by-a-natural-key)
- [Export](#export)
- [Moving in from another CMS](#moving-in-from-another-cms)

## Pick the tool

| Task                                                             | Use                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A CSV or JSON file into one collection, matched by primary key   | `POST /utils/import/<collection>` (multipart)                                  |
| Several related collections at once, source ids remapped for you | `POST /utils/import` (JSON array of `{ collection, items }`)                   |
| Upsert by `slug`, `sku`, or another non-primary key              | Script: read the key → id map, then `PATCH` / `POST` arrays                    |
| Nested writes (create an item with its children in one payload)  | `POST /items/<collection>`; the import endpoints reject nesting                |
| Files                                                            | `POST /files/import` from URLs, see [files-and-assets.md](files-and-assets.md) |

All imports run as the caller, in one transaction: any failing row rolls back the whole request. They fire hooks and
flows and write activity and revisions per row like normal writes. `directus_*` collections are admin-only. At most
`IMPORT_MAX_CONCURRENCY` (20) imports run at once; more return 403 `LIMIT_EXCEEDED`.

## File import into one collection

```bash
curl -X POST "$DIRECTUS_URL/utils/import/posts" -H "Authorization: Bearer $TOKEN" -F "file=@posts.csv;type=text/csv"
```

- MIME type must be `text/csv`, `application/json`, or `application/vnd.ms-excel`. JSON is an array of objects. CSV
  headers are field keys; a dotted header (`seo.title`) builds a nested value. Cells that parse as JSON become JSON.
- **Upsert by primary key.** A row whose primary key exists is updated; any other row is created. No primary key
  column means every row is created. There is no match on other fields: re-importing a file without ids duplicates it.
- Needs create **and** update permission on the collection. Size cap `IMPORT_MAX_FILE_SIZE` (50mb, 413 over it).
- Errors return 400 with `extensions.rows` (data row numbers). The import stops collecting after `MAX_IMPORT_ERRORS` (1000).
- `?background=true` returns at once and sends the caller a Directus notification on success or failure.

Checked on 12.5.1: a CSV with `id` 1 (existing) and 3 (new) updated 1 and created 3; a CSV whose second row broke a
unique `slug` created nothing.

## Multi-collection import

`POST /utils/import` takes flat items for several collections and orders them by their relations:

```bash
curl -X POST "$DIRECTUS_URL/utils/import?dryRun=true" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '[{"collection":"posts","items":[{"id":1,"title":"Hello","author":500}]},
       {"collection":"authors","items":[{"id":500,"name":"Ann"}]}]'
# => {"data":{"applied":false,"mode":"add","collections":{"authors":{"new":[12],"mapped":{"500":12},...},"posts":{...}}}}
```

| Query                         | Effect                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `mode=add` (default)          | Always creates. Auto-increment ids are reassigned; a clashing UUID is regenerated; a clashing string key fails |
| `mode=merge`                  | Upsert by primary key                                                                                          |
| `dryRun=true`                 | Runs everything, returns the result, rolls back                                                                |
| `dangerouslyAllowDelete=true` | Merge only. Deletes every row in the listed collections that isn't in the payload. Confirm with the user first |

- Source ids in many-to-one fields and in one-to-many or many-to-many arrays are rewritten to the new ids. `mapped`
  shows old → new. Include junction collections as their own entries.
- Relational values must be scalar ids. A nested object returns 400 ("Nested relational data is not supported").
- Ids pointing at collections **not** in the payload pass through unchanged. Swap in new file ids yourself.
- JSON bodies are capped by `MAX_PAYLOAD_SIZE` (1mb). For more, send the JSON as a multipart file (`IMPORT_MAX_FILE_SIZE`).

**House rule:** run with `dryRun=true` first, show the user the counts, then run for real.

## Upsert by a natural key

Neither `/items` nor the import endpoints match on anything but the primary key. To make a re-runnable import keyed by
`slug`:

1. Make the key field unique in the schema, so a mistake fails instead of duplicating.
2. `GET /items/posts?fields=id,slug&filter[slug][_in]=a,b,c&limit=-1` to build `slug → id`.
3. `PATCH /items/posts` with an array of objects that include `id` for the matches; `POST /items/posts` with an array
   for the rest. Each batch is one transaction. Chunk large sets (a few hundred per request) to stay under
   `MAX_PAYLOAD_SIZE` and `MAX_BATCH_MUTATION`.

## Export

- `GET /items/<collection>?export=csv&fields=...&filter=...&limit=-1` returns a download
  (`csv`, `csv_utf8`, `json`, `xml`, `yaml`). Normal permissions and query limits apply.
- `POST /utils/export/<collection>` with `{"query": {...}, "format": "csv", "file": {"folder": "<uuid>"}}` returns 204
  at once, writes the file to the File Library in batches of `EXPORT_BATCH_SIZE` (5000), and notifies the caller.
  Without `file.folder`, 12.6.0+ uses `directus_settings.default_exports_folder` if set. Exported files are ordinary files: anyone with read access to them in `directus_files` can download them
  (folder access is a separate permission and doesn't grant it).

## Moving in from another CMS

Same steps for WordPress, Contentful, Strapi, or anything else with an export or API:

1. **Model first.** Design collections in Directus (`directus-content-modeling`); don't mirror the old CMS's quirks.
   Check the collection limit before creating (`GET /license`: `usage.collections` vs `entitlements.collections.limit`; junctions count).
2. **Map fields.** One table per collection: source field → Directus field, type change, transform (HTML cleanup,
   date format, status values). Get the user to confirm it.
3. **Files first.** `POST /files/import` each media URL, record `source id → file id`. Rewrite image URLs inside rich
   text to `/assets/<id>`.
4. **Items.** Lookups (categories, tags, authors) before the content that points at them. Either one
   `POST /utils/import` with source ids and let it remap, or your own `source id → new id` map per collection. Keep a
   `legacy_id` field if you need to re-run or redirect old URLs.
5. **Verify.** Compare counts per collection, spot-check items with relations, check `/assets` links, and test as the
   public role that published content is readable.

## Sources

- https://directus.com/docs/guides/content/import-export
- https://directus.com/docs/configuration/security-limits
- https://directus.com/docs/releases/changelog
- https://directus.com/docs/releases/breaking-changes/version-12
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/utils.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/import/import.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/import/remap-foreign-keys.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/import/validate-flat-data.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/middleware/read-file-upload-body.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/export.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/items.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/env/src/constants/defaults.ts
