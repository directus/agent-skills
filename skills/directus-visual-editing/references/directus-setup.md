# Directus-side setup

## Contents

- [Live Preview vs Visual Editor](#live-preview-vs-visual-editor)
- [Preview URL (per collection)](#preview-url-per-collection)
- [Visual Editor URLs (global)](#visual-editor-urls-global)
- [Visual editing inside Live Preview](#visual-editing-inside-live-preview)
- [Environment variables](#environment-variables)
- [Versioning and permissions](#versioning-and-permissions)

## Live Preview vs Visual Editor

| | Live Preview | Visual Editor |
| --- | --- | --- |
| Configured in | Settings > Data Model > collection > **Preview URL** (`directus_collections.preview_url`) | Settings > Project > **Visual Editor URLs** (`directus_settings.visual_editor_urls`, `{ url }[]`) |
| Opens from | The item page (split pane, or pop-out window) | Its own module (enable it under Settings > Modules / module bar) |
| Scope | One item; the iframe reloads after each save of the form | The whole site; editors navigate freely and edit any element with `data-directus` |
| Frontend work | Render the URL, read `version` | Same, plus `@directus/visual-editing` and `data-directus` attributes |

## Preview URL (per collection)

Template variables (`app/src/composables/use-preview-url.ts`):

| Variable | Value |
| --- | --- |
| `{{field}}`, for example `{{slug}}`, `{{permalink}}`, `{{id}}` | The item's field value. |
| `{{$version}}` | The selected version key. `published` when no version is selected or the version is still unsaved (`app/src/utils/get-preview-version-key.ts`). |
| `{{$preview_base_url}}` | Settings > Project > **Preview Base URL**, trailing slash stripped. If the template uses it and the setting is empty, the Live Preview button is hidden. |

```text
{{$preview_base_url}}/blog/{{slug}}?version={{$version}}&preview_secret=<random-string>
```

- **House rule:** use `{{$preview_base_url}}`, not a hardcoded host. The Preview URL is part of the schema, so a host would be copied to every environment by schema apply or Environment Sync. Each instance sets its own base URL.
- Environment Sync's `settings` resource is the whole settings row, including Preview Base URL. Exclude it (`--no-settings` or `excludeResources: ["settings"]`) or reset the value after a push.
- `preview_secret`: see [preview-security.md](preview-security.md). Never put a Directus token in the Preview URL; it is stored in collection metadata, schema snapshots, and sync files.
- The CMS starters use `http://localhost:3000{{permalink}}?preview=true&version={{$version}}` (`pages`) and `http://localhost:3000/blog/{{slug}}?preview=true&version={{$version}}` (`posts`).

## Visual Editor URLs (global)

One entry per site (or entry point); the first opens by default. Use the same `preview_secret` gate as the Preview URL, or the site renders the published page with no `data-directus` attributes:

```text
https://site.example.com?preview_secret=<random-string>&version={{$version}}
```

How the Studio uses them (`app/src/modules/visual`):

- A URL is allowed when its origin matches a configured URL's origin. Any page on that origin can be opened; the path in the setting is just the start page.
- `{{$version}}` can sit in a query param, a path segment, a subdomain label, or the hash. The Studio reads the current version from the iframe URL and rewrites it when the editor picks a version.
- The version dropdown lists **Published**, **Draft**, and any other key found in the current URL. It needs read on `directus_versions`, and only appears when the URL template contains `{{$version}}`.
- **House rule:** always include `{{$version}}` when any collection is versioned. Without it, clicking edit on a versioned item cannot switch the frame to the draft, and the Visual Editor module saves the edit to the published item (`editing-layer.vue` falls through to `PATCH /items`), even though it shows an "editing draft" notice.
- The starters ship `http://localhost:3000?visual-editing=true` and `http://localhost:3000/blog?visual-editing=true`, without `{{$version}}` and with an ungated flag. Add `{{$version}}`, and replace the flag with the secret once the site checks it on the server.

## Visual editing inside Live Preview

The Live Preview pane becomes editable (pencil button in its toolbar) when all of these hold (`app/src/composables/use-visual-editing.ts`, `app/src/views/private/components/live-preview.vue`):

- The collection has a Preview URL and the item is saved (not `+`).
- The preview URL's origin matches at least one Visual Editor URL, rendered with the current version.
- The site runs `@directus/visual-editing`.

The Visual Editor module does not need to be enabled for this. Visual editing in the pane **does** work while a content version is selected; saves go to that version. The Live Preview docs' Requirements list says it is "not available when ... viewing content versions"; the v12.5.1 source and the callout on the same page say otherwise.

## Environment variables

| Variable (on Directus) | Value | Why |
| --- | --- | --- |
| `CONTENT_SECURITY_POLICY_DIRECTIVES__FRAME_SRC` | `https://site.example.com` (comma separated for several: `https://site.example.com,http://localhost:3000`) | Directus sends a CSP via helmet with no `frame-src`, so frames fall back to its `child-src 'self' blob:` and your site is blocked. |
| `CACHE_AUTO_PURGE` | `true` | Default `false`. With `CACHE_ENABLED`, saved edits stay invisible to the site until the TTL expires. |
| `CORS_ENABLED`, `CORS_ORIGIN` | `true`, your site origin | Only if the site's **browser** code calls Directus (for example a client-side refetch in `onSaved`). The iframe and `postMessage` don't need CORS. |

On the site, send `Content-Security-Policy: frame-ancestors 'self' <directus origin>` and drop any `X-Frame-Options: DENY`/`SAMEORIGIN`. Per framework: [frameworks.md](frameworks.md#csp-per-framework).

Directus Cloud with a local site: the iframe parent is HTTPS, so expose localhost over HTTPS (ngrok, localtunnel, or a local certificate such as Vite's basic SSL plugin).

## Versioning and permissions

Turn on **Enable Versions** per collection (`meta.versioning: true`). The CMS starters version `pages` and `posts`, not the block collections.

| Who | Needs |
| --- | --- |
| Editors (Studio) | The collection: read, create, update. `directus_versions`: read, create, update, delete. `directus_revisions`: read. |
| Visual Editor, non-admin | Update permission on at least one field listed in the element's `fields` (exact top-level names) or the element stays inert. With a version selected: read on `directus_versions` plus create or update. |
| Preview token (frontend) | Read on the previewed collections, their related collections, and `directus_versions`. Nothing else. |

Version API and promote: the `directus` skill (`references/content-versioning.md`).

Collaborative editing (field locking and presence between Studio users; Directus 11.15+, `WEBSOCKETS_ENABLED=true`, toggled in project settings, shared Redis for multiple instances) is Studio-only and needs no frontend code.

## Sources

- https://directus.com/docs/guides/content/live-preview
- https://directus.com/docs/guides/content/visual-editor/studio-module
- https://directus.com/docs/guides/content/content-versioning
- https://directus.com/docs/guides/content/collaborative-editing/configuration
- https://directus.com/docs/configuration/security-limits
- https://github.com/directus/directus/blob/v12.5.1/app/src/composables/use-preview-url.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/utils/get-preview-version-key.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/composables/use-visual-editing.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/views/private/components/live-preview.vue
- https://github.com/directus/directus/blob/v12.5.1/app/src/modules/visual/index.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/modules/visual/routes/visual-editor.vue
- https://github.com/directus/directus/blob/v12.5.1/app/src/modules/visual/components/editing-layer.vue
- https://github.com/directus/directus/blob/v12.5.1/app/src/modules/visual/utils/version-url.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/modules/visual/composables/use-visual-editor-urls.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/app.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/env/src/constants/defaults.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/env/src/utils/guess-type.ts
- https://github.com/directus-labs/starters/tree/main/cms/directus/template/src
