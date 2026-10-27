# Files and assets

Files are rows in `directus_files` (metadata) plus the binary in a storage location. `/files` manages both;
`/assets/<id>` serves the binary, optionally transformed.

## Upload and import

`POST /files` with `multipart/form-data`. Metadata fields first, the `file` part **last**. Several `file` parts upload
several files.

```bash
curl -X POST "$DIRECTUS_URL/files" -H "Authorization: Bearer $TOKEN" \
  -F "title=Hero image" -F "folder=$FOLDER_ID" -F "file=@./hero.jpg"
```

- Send other file fields before the `file` part. `filename_download` and `filename_disk` are accepted too (the docs
  say otherwise; 12.5.1 keeps both). Replace the binary of an existing file
  with a multipart `PATCH /files/<id>`.
- `storage` defaults to the first entry in `STORAGE_LOCATIONS` (default `local`). Any other value must match a
  configured location exactly or the upload fails with `INVALID_PAYLOAD`.
- Size cap: `FILES_MAX_UPLOAD_SIZE` (`CONTENT_TOO_LARGE`, 413). Resumable chunked uploads need `TUS_ENABLED=true`.
- Uploads from the public role are a common abuse vector. See the security best practices before enabling them.

Import from a URL (MCP: the `files` tool's `import` action does the same):

```bash
curl -X POST "$DIRECTUS_URL/files/import" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/photo.jpg","data":{"title":"Photo","folder":"<folder-uuid>"}}'
```

- `data` holds file metadata. Optional `options.filterMimeType` restricts allowed MIME types.
- The server fetches the URL. Default `IMPORT_IP_DENY_LIST` is `0.0.0.0,169.254.169.254`: `0.0.0.0` blocks the
  server's own interfaces (loopback and its local addresses), plus the cloud metadata IP. Other private hosts
  (`10.x`, `192.168.x`) are **not** blocked unless you add them.

## Metadata and folders

- Update with `PATCH /files/<id>`, e.g. `{"title": "Red leather handbag", "tags": ["handbag", "red"], "focal_point_x": 512}`.
  `tags` is an array, even for one value. `focal_point_x` / `focal_point_y` are pixels from the top-left, used when
  cropping. Deleting a file row deletes the binary too; confirm first.
- **Folders** (`/folders`) are virtual, stored only in the database, not mirrored to storage. A folder's `type` is
  `files` (default) or `flows`. Flow folders are admin-only; when reading as admin, filter `filter[type][_eq]=files`
  to build a file tree.

## Serving and transforming assets

```
/assets/<file-id>    /assets/<file-id>/<seo-filename.jpg>    /assets/<file-id>?download
/assets/<id>?width=800&height=450&fit=cover&format=auto&quality=80
/assets/<id>?key=system-medium-cover
```

- Access follows read permission on `directus_files`. The browser session cookie works; otherwise add
  `?access_token=<token>`. Public assets need public read on `directus_files`. Always go through `/assets`, not the
  storage bucket, so permissions and transforms apply. `?download` sets `Content-Disposition: attachment`.
- Params: `width`, `height`, `fit` (`cover` default, `contain`, `inside`, `outside`), `quality` (1-100), `format`,
  `focal_point_x`/`focal_point_y` (override for this crop), `withoutEnlargement`, `transforms` (Sharp chain as JSON:
  `[["rotate",90],["blur",10]]`), `key` (a preset). Details: https://directus.com/docs/guides/files/transform.
- `format=auto` picks avif, then webp, from the `Accept` header; otherwise the source format (png for avif/webp/tiff
  sources).
- Built-in presets: `system-small-cover` (64x64), `system-small-contain` (64 wide), `system-medium-cover` (300x300),
  `system-medium-contain`, `system-large-cover` (800x800), `system-large-contain`.

The project setting `storage_asset_transform` (**Allowed Transformations**) controls what is allowed:

| Setting         | Allowed requests                          |
| --------------- | ----------------------------------------- |
| `all` (default) | Any params, plus configured preset keys   |
| `presets`       | Only `?key=<preset>` with no other params |
| `none`          | Only built-in `system-*` keys             |

Disallowed requests fail with `INVALID_QUERY`. Limits: `ASSETS_TRANSFORM_IMAGE_MAX_DIMENSION` (source, default 6000),
`ASSETS_TRANSFORM_IMAGE_MAX_OUTPUT_DIMENSION` (every step of the output, default 6000), `ASSETS_TRANSFORM_MAX_OPERATIONS`
(default 5). Over the limit: `ILLEGAL_ASSET_TRANSFORMATION`.

## Linking files to items

Single file field (many-to-one): `{"cover": "<file-id>"}`, read with `fields=cover.id,cover.title,cover.width`. Multiple
files (many-to-many, junction often `<collection>_files`): `{"gallery": [{"directus_files_id": "<file-id>"}]}`. Check the
junction field name in the schema.

## Sources

- https://directus.com/docs/guides/files/upload
- https://directus.com/docs/guides/files/manage
- https://directus.com/docs/guides/files/access
- https://directus.com/docs/guides/files/transform
- https://directus.com/docs/configuration/files
- https://directus.com/docs/guides/security/best-practices
- https://directus.com/docs/releases/breaking-changes/version-12
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/files.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/assets.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/constants.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/transformations.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/request/is-denied-ip.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/types/src/assets.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/env/src/constants/defaults.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/files/prompt.md
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/folders/prompt.md
