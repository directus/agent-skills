# Framework wiring

All four CMS starters pin `@directus/visual-editing` 2.1.0 and `@directus/sdk` 22.0.0. Their preview gating is unsafe (per-starter details: [preview-security.md](preview-security.md#what-the-starters-do)); fix it before copying the data-fetching half.

## Shape that works everywhere

1. **Server:** decide `preview` (secret check) and `version` from the request URL. Read with the preview token and `version` when previewing, published otherwise. Mark preview responses uncacheable.
2. **Server to client:** pass `visualEditing: boolean`, `version`, and the parent item id as props or page data.
3. **Client:** render `data-directus` only when `visualEditing` is true. After render, `apply({ directusUrl, onSaved })`. Re-run after data changes. `onSaved` refetches with the same `version`.
4. **Links:** keep the preview params on internal links while previewing, or the next page renders published data. In the Visual Editor a page without the version param shows as **Published** in the dropdown.

## Next.js App Router

Complete setup: [nextjs-example.md](nextjs-example.md). Starter notes:

- Reads `searchParams` (a promise in Next 15) in the server `page.tsx` and passes `contentVersion` and `pageId` to a `'use client'` component, which calls `apply()` in `useEffect` with `router.refresh()` in `onSaved`. The hook (`useVisualEditing`) checks `NEXT_PUBLIC_ENABLE_VISUAL_EDITING !== 'false'` and the URL flag, persists it in `localStorage`, and turns off with `?visual-editing=false`.
- `generateMetadata` skips Directus calls in preview and returns a placeholder title.
- **Draft mode:** `(await draftMode()).enable()` sets the `__prerender_bypass` cookie, `SameSite=None; Secure` in production and `Lax` in development. The Studio iframe is cross-site in production, so browsers that block third-party cookies drop it and the page renders as published. If preview works in a new tab but not in the pane, check the secret per request from the URL instead of relying on the cookie.

## Nuxt

- Fetches through a server route (`server/api/pages/one.get.ts`) with `useFetch`, passing `preview`, `id`, and `version` as query. `refresh` from `useFetch` is the `onSaved` callback.
- `useVisualEditing()` keeps a `useState('visual-editing-enabled')` flag set from `?visual-editing=true` or `?preview=true` and `runtimeConfig.public.enableVisualEditing`.
- Calls `apply()` in `onMounted` and in a `watch` on the blocks after `await nextTick()`.
- `provideVisualEditingPageContext({ pageId, contentVersion })` and `useVisualEditingAttrs()` give block components `setBlockAttr`. Unlike the other starters, Nuxt's `setAttr` always renders the attribute, even on the public site.
- `useLivePreview()` wraps Nuxt's `usePreviewMode` with `shouldEnable: () => !!route.query.preview`.

## SvelteKit

- Decides `visualEditingEnabled` and `contentVersion` in `+layout.server.ts`; loads page data in `[...permalink]/+page.server.ts` with the token from `$env/static/private`.
- In `+layout.svelte`: `afterNavigate(async () => { await tick(); await apply({ directusUrl: PUBLIC_DIRECTUS_URL, onSaved: () => invalidateAll() }); })`, then a second scoped `apply` for the Edit All Blocks button.
- `setAttr` renders only when `page.data.visualEditingEnabled` or `sessionStorage['visual-editing']` is set.

## Astro

- Pages are prerendered (`export const prerender = true`), so `Astro.url.searchParams` is empty at build time and preview can't happen in the `.astro` page.
- Preview runs client-side: a React island (`PageClient.tsx`) detects `?preview=true`, `?version=`, or `?id=`, and uses SWR to call a `prerender = false` endpoint (`/api/page-blocks`, `/api/blog-post/[slug]`) that reads with the token. `mutate()` is the `onSaved` callback; `apply()` runs in a `useEffect` keyed on the sections.
- Needs a server adapter (the starter uses `@astrojs/vercel`) for the on-demand endpoints.

## CSP per framework

Value: `frame-ancestors 'self' https://directus.example.com`, with every Studio origin that previews the site (staging and production Directus).

| Framework | Starter | Where to set `frame-ancestors` |
| --- | --- | --- |
| Next.js | `next.config.ts` `headers()` returns `Content-Security-Policy` with `frame-ancestors 'self' http://localhost:3000 ${NEXT_PUBLIC_DIRECTUS_URL}` | Same place. |
| Nuxt | `nuxt-security` module: `security.headers.contentSecurityPolicy['frame-ancestors']: ["'self'", DIRECTUS_URL]` | Same place. |
| SvelteKit | Not set | `handle` in `hooks.server.ts`: set the header on the response, or your host's header config. |
| Astro | Not set | Host header config (prerendered pages never hit middleware), plus middleware for on-demand routes. |

## Starter file map

| Concern | Next.js | Nuxt | SvelteKit | Astro |
| --- | --- | --- | --- | --- |
| Attr helpers, `setBlockAttr` | `src/lib/directus/visualEditing.ts` | `app/utils/visualEditing.ts`, `app/composables/useVisualEditingAttrs.ts` | `src/lib/directus/visualEditing.ts` | `src/lib/directus/visualEditing.ts` |
| Enable flag, `apply` | `src/hooks/useVisualEditing.ts`, `src/app/[[...permalink]]/PageClient.tsx` | `app/composables/useVisualEditing.ts`, `app/pages/[...permalink].vue` | `src/routes/+layout.svelte`, `+layout.server.ts` | `src/hooks/useVisualEditing.ts`, `src/components/layout/PageClient.tsx` |
| Version and preview reads | `src/app/[[...permalink]]/page.tsx`, `src/lib/directus/fetchers.ts` | `server/api/pages/one.get.ts` | `src/routes/[...permalink]/+page.server.ts`, `src/lib/directus/fetchers.ts` | `src/pages/api/page-blocks.ts`, `src/lib/directus/fetchers.ts` |
| Draft route | `src/app/api/draft/route.ts` | none | none | none |

## Sources

- https://directus.com/docs/guides/content/visual-editor/frontend-library
- https://directus.com/docs/frameworks/nextjs/live-preview
- https://directus.com/docs/frameworks/nextjs/live-preview-draft-mode
- https://directus.com/docs/frameworks/nextjs/visual-editor
- https://directus.com/docs/frameworks/nuxt/visual-editor
- https://directus.com/docs/frameworks/sveltekit/visual-editor
- https://directus.com/docs/frameworks/astro/live-preview
- https://github.com/vercel/next.js/blob/v15.2.8/packages/next/src/server/async-storage/draft-mode-provider.ts
- https://github.com/directus-labs/starters/tree/main/cms/nextjs
- https://github.com/directus-labs/starters/tree/main/cms/nuxt
- https://github.com/directus-labs/starters/tree/main/cms/sveltekit
- https://github.com/directus-labs/starters/tree/main/cms/astro
