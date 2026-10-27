# Preview security

## What the starters do

Copy the starters' visual editing UI, not their preview access control:

| Starter | Behavior |
| --- | --- |
| Next.js | Every read uses `DIRECTUS_SERVER_TOKEN` (an admin static token per `.env.example`). `?preview=true` drops the `status = published` filter. Any `?version=<key>` reads that version with the admin token, preview or not. `/api/draft` compares `?token=` to the admin token, so the admin token sits in the Preview URL. |
| Nuxt | Public policy by default. `?preview=true` swaps in the server token for the page read and version read. |
| SvelteKit | `?preview=true` swaps in the server token. Without it, reads (versions included) run with no token, under the Public policy. |
| Astro | The on-demand `/api/page-blocks` and `/api/blog-post/[slug]` endpoints swap in the server token on `?preview=true`. Anyone can call them. |

Result: anyone who adds `?preview=true` (or `?version=draft` on Next.js) sees unpublished pages and drafts, read with admin rights. Visual editing itself is safe (the Studio enforces the editor's own permissions on every save); the leak is on the read side.

## Recommended setup

**House rule:** for anything public, do all of these.

1. **Preview user and token.** A user (for example `preview-bot`) whose policy can only **read** the previewed collections, the related collections you expand (blocks, files, authors), and `directus_versions`. Store its static token server-side as `DIRECTUS_PREVIEW_TOKEN`. Never the admin token.
2. **Separate preview secret.** A random string (`PREVIEW_SECRET`, 32+ bytes) that is **not** a Directus token, in the Preview URL and Visual Editor URLs:
   ```text
   {{$preview_base_url}}/blog/{{slug}}?preview_secret=<secret>&version={{$version}}
   https://site.example.com?preview_secret=<secret>&version={{$version}}
   ```
   These URLs live in `directus_collections` / `directus_settings`, schema snapshots, and sync files, and any Studio user who can read them sees the secret. A leaked secret grants read-only preview through your site; rotate it by changing the env var and the URLs.
3. **Check on the server, every request.** Honor `version`, drop status filters, and use the preview token only when the secret matches. Otherwise ignore those params and do the normal published read.
4. **No caching** of preview responses (see below).
5. **Keep it server-side.** The preview token and secret never go in `NEXT_PUBLIC_*`, `PUBLIC_*`, `VITE_*`, or Nuxt `runtimeConfig.public`.

To persist preview across navigation inside the iframe, a cookie set after the check must be `SameSite=None; Secure` to reach a cross-site iframe, and browsers that block third-party cookies may drop it. Carrying `preview_secret` and `version` on internal links avoids the cookie.

## Gate helper

Use `getPreviewContext()` from `lib/preview.ts` in [nextjs-example.md](nextjs-example.md#server-code). It is framework-neutral except the Next.js-only `import 'server-only'` line: constant-time secret check, `published`/`main` stripped from `version`, and the preview token returned only when the secret matches.

Call it in the page loader with the `preview_secret` and `version` query values (Next.js `await searchParams`; Nuxt `getQuery(event)`; SvelteKit `event.url.searchParams`; Astro endpoint `new URL(request.url).searchParams`), then read as in [content-versions.md](content-versions.md#reading-a-version). Pass `preview` to the client as the visual editing flag.

## Hide attributes from the public site

`data-directus` exposes collection names and primary keys, and `apply()` costs about a second of polling on every page view outside the Studio.

- Render attributes and call `apply()` only when the server said `preview: true` (or an explicit, server-checked visual editing flag). The starters' client-side `?visual-editing=true` flag hides attributes from casual visitors but is not access control; the Next.js and Astro starters also persist it in `localStorage`.
- The starters' env switch (`NEXT_PUBLIC_ENABLE_VISUAL_EDITING=false`, `PUBLIC_ENABLE_VISUAL_EDITING=false`, `NUXT_PUBLIC_ENABLE_VISUAL_EDITING=false`) turns it off for a whole deployment.

## Caching

- Send `Cache-Control: private, no-store` on preview responses so a CDN never serves a draft to the public.
- Next.js: preview pages must render dynamically. Reading `searchParams` opts the route into dynamic rendering; draft mode also bypasses the static cache.
- Static and prerendered pages can't show versions; preview needs an on-demand route (the Astro starter's pattern).

## Sources

- https://directus.com/docs/guides/content/live-preview
- https://directus.com/docs/guides/content/visual-editor/frontend-library
- https://directus.com/docs/guides/content/content-versioning
- https://directus.com/docs/frameworks/nextjs/live-preview
- https://directus.com/docs/frameworks/nextjs/live-preview-draft-mode
- https://github.com/directus/directus/blob/v12.5.1/app/src/modules/visual/components/editing-layer.vue
- https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/lib/directus/fetchers.ts
- https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/app/api/draft/route.ts
- https://github.com/directus-labs/starters/tree/main/cms/nextjs/.env.example
- https://github.com/directus-labs/starters/tree/main/cms/nuxt/server/api/pages/one.get.ts
- https://github.com/directus-labs/starters/tree/main/cms/sveltekit/src/routes/%5B...permalink%5D/+page.server.ts
- https://github.com/directus-labs/starters/tree/main/cms/astro/src/pages/api/page-blocks.ts
