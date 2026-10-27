# Files, asset URLs, and image transforms

Transform params, the **Allowed Transformations** setting, limits, and `system-*` presets are API behavior owned by the `directus` skill (`references/files-and-assets.md`). This file covers building URLs and calling file commands from SDK code.

## Asset URLs

Files are served from `/assets/<file-id>`. A file field holds the file id (a UUID string) unless you expand it in `fields`. Handle both shapes in one helper, as every starter does:

```ts
export function assetUrl(file: string | { id: string } | null | undefined, params?: Record<string, string | number>) {
	if (!file) return '';
	const id = typeof file === 'string' ? file : file.id;
	const qs = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : '';
	return `${DIRECTUS_URL}/assets/${id}${qs}`;
}
```

- Expand `{ image: ['id', 'width', 'height', 'description'] }` when you need layout size or alt text; they are not on the bare id.
- Optional SEO filename: `/assets/<id>/<any-name.jpg>` (also used for `Content-Disposition` with `?download`). `?download` forces a download.
- Browser caching follows `ASSETS_CACHE_TTL` (default `30d`).

## Who can load an asset

An `<img>` request carries no `Authorization` header. Directus authenticates it with Directus cookies (session mode on a shared site) or `?access_token=<token>` in the URL. Otherwise it runs as Public, so public site images need Public read on `directus_files` (scope it with a filter, for example by folder).

**House rule:** don't put a static or admin token in `access_token` on public pages; it lands in HTML, logs, and caches. For private files, proxy through your server (`readAssetRaw` with a server token, streamed after your own auth check) or use the logged-in user's short-lived access token.

## Transforms and presets

- Pass params to `assetUrl(file, { width: 800, format: 'auto' })` or to `readAssetRaw`/`readAssetBlob`. With a `key`, the preset's params apply first and params you also send override them (`{ ...preset, ...query }`), but only when **Allowed Transformations** is `all`. In `presets` mode, `key` plus any other param returns 400 `INVALID_QUERY`; send `key` alone.
- `format=auto` returns AVIF if `Accept` allows it, else WebP, else the source format (AVIF/WebP/TIFF sources come back as PNG). It never forces JPEG.
- The SDK `AssetsQuery` type omits `avif` from `format`, though the API accepts it. Cast or use `auto`.

**House rule:** define presets for the sizes your site uses and request `?key=card` style URLs. Each distinct param combination creates and stores a new derivative.

## Framework image components

| Framework | Config used by the starters |
| --- | --- |
| Next.js | `images.remotePatterns` with the Directus host and `pathname: '/assets/**'` ([next.config.ts](https://github.com/directus-labs/starters/tree/main/cms/nextjs/next.config.ts)). `dangerouslyAllowSVG: true` for SVG assets. |
| Nuxt | `@nuxt/image` with `image.directus.baseURL = <DIRECTUS_URL>/assets/` |
| Astro | `image.remotePatterns` with the Directus host and `/assets/**` |
| SvelteKit | plain `<img>` with the asset URL |

If the framework optimizes, request the original (no Directus transforms) or a large preset, so you don't resize twice.

## Reading and uploading files

```ts
const meta = await directus.request(readFile(id, { fields: ['id', 'type', 'filesize', 'filename_download'] }));
const stream = await directus.request(readAssetRaw(id, { key: 'card' })); // ReadableStream
const blob = await directus.request(readAssetBlob(id, { width: 400, format: 'webp' }));

const form = new FormData();
form.append('folder', folderId); // metadata fields FIRST
form.append('title', 'Hero image');
form.append('file', fileBlob, 'hero.jpg'); // file LAST
const uploaded = await directus.request(uploadFiles(form, { fields: ['id'] }));
const imported = await directus.request(importFile('https://example.com/photo.jpg', { title: 'Photo' }));
```

- `readAssetRaw`/`Blob`/`ArrayBuffer` take the same params as the URL. `downloadFilesZip(ids)` and `downloadFolderZip(folderId)` return a ZIP. Use `readFiles`/`readFile`, not `readItems('directus_files')`, which throws.
- **Order matters.** The API reads multipart fields that arrive before each file; fields appended after the `file` part are not applied to it. The file part needs a filename; its field name is ignored (`file` by convention).
- `storage` must be one of `STORAGE_LOCATIONS` exactly, or `INVALID_PAYLOAD`. Omit it to use the first location.
- The SDK removes its `Content-Type` header for `FormData` so fetch sets the multipart boundary.
- Uploading needs create on `directus_files`. **House rule:** for public forms, upload from a server route with a narrow-permission token, not from the browser with a privileged one (as the starters' form handlers do).

## Sources

- https://directus.com/docs/guides/files/access
- https://directus.com/docs/guides/files/transform
- https://directus.com/docs/guides/files/upload
- https://directus.com/docs/configuration/files
- https://github.com/directus/directus/blob/v12.6.0/sdk/src/rest/commands/read/assets.ts
- https://github.com/directus/directus/blob/v12.6.0/sdk/src/types/assets.ts
- https://github.com/directus/directus/blob/v12.6.0/sdk/src/rest/commands/create/files.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/files.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/assets.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/transformations.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/types/src/assets.ts
- https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/lib/directus/directus-utils.ts
- https://github.com/directus-labs/starters/tree/main/cms/nextjs/next.config.ts
- https://github.com/directus-labs/starters/tree/main/cms/nuxt/nuxt.config.ts
