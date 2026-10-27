# Troubleshooting

## Iframe is blank or refused

| Symptom | Cause | Fix |
| --- | --- | --- |
| Console on the Studio page: "Refused to frame ... violates ... frame-src" (or `child-src`) | Directus CSP has no `frame-src` for your site | `CONTENT_SECURITY_POLICY_DIRECTIVES__FRAME_SRC=https://site.example.com` (comma separate several), restart Directus |
| Console: "Refused to display ... in a frame because an ancestor violates ... frame-ancestors" or "X-Frame-Options" | The site forbids being framed | Site header `frame-ancestors 'self' <directus origin>`; remove `X-Frame-Options` |
| Mixed content blocked | HTTPS Studio framing an `http://` site (Directus Cloud + localhost) | Serve the site over HTTPS (ngrok, localtunnel, local certificate) |
| Visual Editor shows "invalid URL" | The address isn't on the origin of any Visual Editor URL | Add the origin in Settings > Project > Visual Editor URLs |

## Nothing highlights or the pencil does nothing

Work through in order:

1. **Attributes in the DOM?** Inspect an element for `data-directus`. The starters render them only when the URL has `?visual-editing=true` or `?preview=true` (or a stored flag); a gated site only when `preview_secret` matches. Check the Visual Editor URL carries the flag or secret the site expects.
2. **`apply()` ran in the browser after render?** Not in SSR, not before the elements mount. Call it again after late-loading lists render.
3. **`directusUrl` exact?** Must equal the Studio's origin as the browser sees it (scheme, host, port). A mismatch shows a postMessage "target origin ... does not match" error in the iframe console. Check env values that differ between local and deployed builds.
4. **Directus 11.16+ and library 2.x?** Library 2.x activates elements only after the Studio's field access reply.
5. **Permissions.** Non-admins need update permission on at least one listed field (exact top-level names; a dot path never matches a restricted field list). Elements with an empty `item` never activate.
6. **Version selected?** Only versioned collections are editable, and the user needs read plus create or update on `directus_versions`. Blocks on a non-versioned collection go inert; see [page-builder-blocks.md](page-builder-blocks.md).
7. **Overlays hidden?** Check `--directus-visual-editing--overlay--z-index` and any `overflow` or stacking context that clips `#directus-visual-editing`.
8. **Script-tag install?** The 2.1.0 IIFE build throws `observeRect is not defined`. Use the npm package or an ESM CDN ([visual-editing-library.md](visual-editing-library.md#without-a-bundler)).

## Edit form shows the wrong fields

- **Every field appears:** no `fields` name matched a top-level field. Common cause: nested paths like `blocks.item:block_hero.headline`, which the parser cuts to `blocks.item`.
- **Default language edited on a translated page:** list `translations` in `fields` for non-default locales.
- **Popover too small for rich content:** use `mode: 'modal'` or `'drawer'` for WYSIWYG, files, and relational fields.

## Stale data after save

| Cause | Fix |
| --- | --- |
| Directus API cache | `CACHE_AUTO_PURGE=true` (default `false`) |
| No `onSaved`, but the page reloads to cached HTML | Mark preview responses `no-store`; render preview routes dynamically |
| `onSaved` refetches without the `version` | Re-read with the same `version` the page was loaded with |
| Element had no `onSaved` and you expected a refetch | Elements applied without `onSaved` fall back to `window.location.reload()`. Elements applied with `elements` lock their options on the first call |
| Static/prerendered page | Preview needs an on-demand route (Astro starter: `prerender = false` endpoints + SWR) |
| AI Assistant changed content | Always a full reload; nothing to wire |

## Version problems

| Symptom | Cause | Fix |
| --- | --- | --- |
| 403 `FORBIDDEN` reading `?version=draft` | That item has no saved draft (or the token can't read `directus_versions`) | Catch and fall back to the published read; grant read on `directus_versions` |
| 404 in draft for a page that exists | Starter looked up the id with a published-only filter, or the item is an item-less draft | Look up by slug without the status filter using the preview token; item-less drafts only appear in `readItems` with `version` |
| No version dropdown in the Visual Editor | URL lacks `{{$version}}`, or the user can't read `directus_versions` | Add `{{$version}}` to every Visual Editor URL |
| Dropdown jumps back to Published after clicking a link | The site dropped the `version` param on navigation | Carry `version` (and the preview secret) on internal links while previewing, or place `{{$version}}` in the path |
| Edits in the Visual Editor changed the live site | No `{{$version}}` in the URL (versioned item saved to published), or the element targets a non-versioned collection (blocks) in Published view | Add `{{$version}}`; target the versioned parent |
| Frontend ignores the version | Code doesn't read `version`, or reads it on a statically built page | Read it server-side per request |
| `version=main` in old URLs | Legacy key | Treat `main` like `published` |

## Live Preview button or pane missing

- No Preview URL on the collection, or it uses `{{$preview_base_url}}` and Settings > Project > Preview Base URL is empty on this instance (common after a schema push to a new environment).
- Pencil missing in the pane: the item is new and unsaved, or no Visual Editor URL shares the preview URL's origin.

## Sources

- https://directus.com/docs/guides/content/live-preview
- https://directus.com/docs/guides/content/visual-editor/studio-module
- https://directus.com/docs/guides/content/visual-editor/frontend-library
- https://directus.com/docs/guides/content/content-versioning
- https://github.com/directus/directus/blob/v12.5.1/packages/visual-editing/src/lib/directus-frame.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/visual-editing/src/lib/editable-element.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/modules/visual/components/editing-layer.vue
- https://github.com/directus/directus/blob/v12.5.1/app/src/modules/visual/routes/visual-editor.vue
- https://github.com/directus/directus/blob/v12.5.1/app/src/composables/use-preview-url.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/utils/versioning/handle-version.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/env/src/constants/defaults.ts
