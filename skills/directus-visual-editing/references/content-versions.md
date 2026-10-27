# Content versions in the frontend

## Keys

| Key | Meaning |
| --- | --- |
| `published` | The real row. Same as sending no `version`. Directus 12 name. |
| `main` | Legacy alias for `published`. Still accepted; don't emit it in new code. |
| `draft` | Reserved global version, available on every item of a versioned collection. Virtual until first saved. |
| anything else | A custom version, created per item from the Studio or `POST /versions`. |

`isPublishedVersionKey()` in `packages/constants` treats `published` and `main` the same. Strip both before the read.

## Reading a version

```ts
import { isDirectusError, readItem, withToken } from '@directus/sdk';
import type { PreviewContext } from './preview'; // lib/preview.ts in nextjs-example.md

const fields = ['id', 'title', 'slug', 'content'] as const;

// directus = createDirectus<Schema>(url).with(rest()), no token composable
export async function readPost(id: string, ctx: PreviewContext) {
	const token = ctx.token ?? ''; // same credentials for both reads; '' sends no header (Public)

	if (ctx.version) {
		try {
			return await directus.request(withToken(token, readItem('posts', id, { fields, version: ctx.version })));
		} catch (error) {
			// FORBIDDEN when this item has no saved version under that key (or the token can't read it)
			if (!isDirectusError(error) || error.errors[0]?.extensions?.code !== 'FORBIDDEN') throw error;
		}
	}

	return directus.request(withToken(token, readItem('posts', id, { fields })));
}
```

- `ctx.version` and `ctx.token` are set only after the server checked the preview secret ([preview-security.md](preview-security.md)). Never read `version` straight from the URL, or anyone can append `?version=draft`.
- The fallback keeps the preview token; dropping it would read as Public and 403 on anything unpublished. It renders the published item for items with no draft yet, matching the Studio docs (items without content in the selected version show their published content).
- The preview token needs read on the collection, the relations you expand, and `directus_versions`.
- Drafts can be saved with required fields empty (validation runs on publish). Render defensively.
- `version` is a URL parameter, so pages that read it must render per request. Prerendered pages show whatever existed at build time.

## What the API returns

From `api/src/services/items.ts` and `api/src/utils/versioning/handle-version.ts`:

| Call | Result |
| --- | --- |
| `readItem(c, id, { version: 'draft' })`, draft saved | The published item with the draft's delta merged in, including relational changes. Adds `$meta.version_id`. |
| `readItem(c, id, { version: 'draft' })`, no draft for this item | **403 FORBIDDEN** (`ForbiddenError`), not the published item. |
| `readItems(c, { version: 'draft' })` | Only items that have that version, including item-less drafts (`null` primary key). Not "every item, draft where available". |
| `readSingleton(c, { version })` | The singleton's version; 403 when the singleton has none. |
| `versionRaw: true` | Single item only. Relational changes come back in raw `create`/`update`/`delete` form. |
| `version: 'published'` / `'main'` | Normal read. |

Look up by slug or permalink first, then read by id. The starters run `getPageIdByPermalink` (a published read with the same token), then `readItem('pages', id, { version })`, because a version read by filter only returns items that have that version. A page that only exists as an item-less draft has no published row, so those starters 404 on it.

## How the Studio writes versions

- In a versioned collection, the published item is read-only in the item form. Clicking **Edit** switches to `draft`.
- In the Visual Editor with **Published** selected, clicking edit on a versioned item switches the frame to `draft` first by rewriting `{{$version}}` ([directus-setup.md](directus-setup.md#visual-editor-urls-global)).
- With a version selected, a save calls `GET /versions` for that item and key, creates it with `POST /versions` if missing, then `POST /versions/<id>/save`. So "items are only editable when they exist in the version" (content versioning docs) is not what the v12.5.1 source does: the version is created on first save.
- The API doesn't lock published items: `PATCH /items/<collection>/<id>` writes the published row directly.
- Publishing (promote) is a Studio or API action, not frontend code (SDK `compareContentVersion`, then `promoteContentVersion` with the `mainHash`; full flow: the `directus` skill, `references/content-versioning.md`). After promote, purge any CDN or framework cache for that path.

## Sources

- https://directus.com/docs/guides/content/content-versioning
- https://directus.com/docs/guides/content/visual-editor/studio-module
- https://directus.com/docs/guides/connect/query-parameters
- https://directus.com/docs/releases/breaking-changes/version-12
- https://github.com/directus/directus/blob/v12.5.1/packages/constants/src/versions.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/items.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/utils/versioning/handle-version.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/versions.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/modules/visual/components/editing-layer.vue
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/rest/commands/utils/versions.ts
- https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/lib/directus/fetchers.ts
