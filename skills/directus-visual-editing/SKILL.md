---
name: directus-visual-editing
description: "Use when a website shows Directus drafts or in-Studio edits: Live Preview, the Visual Editor, @directus/visual-editing, reading content versions (?version=draft) in a frontend, preview URLs and tokens, CSP framing, and draft mode in Next.js, Nuxt, Astro, or SvelteKit. Also debugging a blocked iframe, nothing highlighting, or stale data after save. Not for SDK setup (directus-sdk) or page builder schema (directus-content-modeling)."
metadata:
  author: directus
  directus-version: '12.6.0'
  visual-editing-version: '2.1.0'
---

# Directus visual editing and preview

Connect a frontend to the Studio's Live Preview pane, the Visual Editor module, and content versions (`draft`,
`published`, custom keys). Directus only loads your URL in an iframe and talks to it over `postMessage`; reading the
version, auth, and refreshing are frontend code.

_Verified against Directus v12.6.0 (`packages/visual-editing`, `app/src/modules/visual`), `@directus/visual-editing`
2.1.0, and the CMS starters. The standalone `directus/visual-editing` repo is archived (last release 2.0.0); use
the monorepo package._

## First checks

1. **Check the version before anything else.** `GET /server/info` with a token returns `data.version`. Older than
   12.6: read the version notes for its major in the `directus` skill (`references/versions-v<major>.md`), or without
   that skill `https://directus.com/docs/raw/releases/breaking-changes/version-<major>.md`. Newer: read the release
   notes since 12.6.0 first.
2. **Library version:** `npm ls @directus/visual-editing`. Library 2.x waits
   for a field access reply that only Directus 11.16+ sends; on older instances nothing activates.
3. **Studio config:** the collection's **Preview URL** (`meta.preview_url`), **Settings > Project > Visual Editor URLs**
   (`visual_editor_urls`), and which collections have **Enable Versions** (`meta.versioning`). MCP: `collections` and
   `schema`. REST: `GET /collections/<name>`, `GET /settings`.
4. **Starter or custom?** Sites from `directus-labs/starters` (`cms` or `cms-i18n`) have the wiring. Fix their preview
   gating before shipping.
5. **Where the site fetches:** server or browser. That decides the token and whether CORS matters.

## Critical traps

- **Two headers, two sides.** Directus needs `CONTENT_SECURITY_POLICY_DIRECTIVES__FRAME_SRC=<site origin>` (comma
  separate several). The site must allow `frame-ancestors 'self' <directus origin>`. Missing either blocks the iframe.
- **`directusUrl` in `apply()` must be the Studio's exact origin.** The library drops messages from any other origin,
  and the Studio drops messages from any origin but the iframe's. A mismatch fails silently.
- **`?preview=true` is not auth.** The Nuxt, SvelteKit, and Astro starters swap in an admin token on bare
  `?preview=true`; the Next.js starter reads with the admin token on every request. **House rule:** gate preview with a
  server-checked secret that is not a Directus token, and read drafts with a least-privilege preview token. See
  [preview-security.md](references/preview-security.md).
- **`readItem` with a version the item doesn't have returns 403**, not the published item. Catch it and fall back with
  the same preview token, or restricted items 403 again as Public. `version=published` (or legacy `main`) means "no
  version": strip it before the read.
- **Put `{{$version}}` in every Visual Editor URL when any collection is versioned.** Without it there is no version
  dropdown, and in the Visual Editor module, edits to versioned items are saved straight to the published item.
- **In a version, only versioned collections are editable.** M2A blocks usually aren't versioned, so target the
  versioned parent (`pages`). See [page-builder-blocks.md](references/page-builder-blocks.md).
- **`data-directus` values can't nest colons.** The parser keeps only the text between the first and second `:`, so the
  starters' `fields: 'blocks.item:block_hero.headline'` arrives as `blocks.item`. Use top-level field names.
- **Stale after save** is a cache problem: `CACHE_AUTO_PURGE=true` on Directus, an `onSaved` that refetches, and no
  framework or CDN cache on preview responses.

## Routing

| Load when                                                                                                                                 | Reference                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Configuring Directus: Preview URL variables, Visual Editor URLs, CSP, CORS, cache, versioning, permissions, Live Preview vs Visual Editor | [references/directus-setup.md](references/directus-setup.md)                 |
| `@directus/visual-editing` API: `apply`, `setAttr`, attribute format, `onSaved`, scoping, `remove`/`disable`, styling                     | [references/visual-editing-library.md](references/visual-editing-library.md) |
| Reading `draft`/`published`/custom versions in the frontend, 403 fallback, lists, how the Studio saves into versions                      | [references/content-versions.md](references/content-versions.md)             |
| Making M2A page builder blocks editable, editing blocks in a draft, "Edit All Blocks", translated blocks                                  | [references/page-builder-blocks.md](references/page-builder-blocks.md)       |
| Next.js App Router, Nuxt, Astro, SvelteKit: where to read params, call `apply`, refresh, set CSP; starter file map                        | [references/frameworks.md](references/frameworks.md)                         |
| Preview tokens, gating preview, draft mode, hiding attributes from the public site, caching preview                                       | [references/preview-security.md](references/preview-security.md)             |
| Complete working Next.js App Router setup: secret gate, preview token, versioned read with fallback, `apply` + `onSaved`                  | [references/nextjs-example.md](references/nextjs-example.md)                 |
| Iframe blocked, nothing highlights, no version dropdown, stale data, 403/404 in draft, edits landing in published                         | [references/troubleshooting.md](references/troubleshooting.md)               |

## Related skills

`directus-sdk` (client setup, `readItem`/`withToken`, typing) · `directus` (versions REST API, promote) ·
`directus-access-control` (preview user policy, Public policy) · `directus-content-modeling` (page builder schema, which
collections to version) · `directus-environment-sync` (Preview URL lives in schema; settings sync can overwrite Preview
Base URL)

## Go deeper

1. Directus docs MCP server: `https://directus.com/docs/mcp` (no auth; tools `search-docs`, `get-doc`, `list-docs`,
   `search-directus-code`, `get-directus-file`). Library: `packages/visual-editing`; Studio side:
   `app/src/modules/visual`.
2. Raw markdown for any docs page: `https://directus.com/docs/raw/<path>.md`, for example
   `https://directus.com/docs/raw/guides/content/visual-editor/frontend-library.md`. Index:
   `https://directus.com/docs/llms.txt`.
3. The instance: the browser console inside the iframe (a wrong `directusUrl` shows a postMessage target origin
   mismatch), `GET /server/info`, `GET /settings` (`visual_editor_urls`, `preview_base_url`), `GET /collections/<name>`
   (`meta.preview_url`, `meta.versioning`).
