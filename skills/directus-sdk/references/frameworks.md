# Framework patterns (Next.js, Nuxt, Astro, SvelteKit)

The CMS starters in `directus-labs/starters` are the canonical examples: the same Directus template (M2A page blocks, posts, forms, globals, navigation) and data layer in each. Copy their structure, not their preview code. Visual editing wiring per framework: `directus-visual-editing`.

## Contents

- [What every starter does](#what-every-starter-does)
- [Fetching an M2A page](#fetching-an-m2a-page)
- [Next.js (App Router)](#nextjs-app-router)
- [Nuxt](#nuxt)
- [Astro](#astro)
- [SvelteKit](#sveltekit)

## What every starter does

| Concern | Starter approach |
| --- | --- |
| Client | One module-level `createDirectus<Schema>(url).with(rest())`, no token composable. |
| Public reads | Nuxt, Astro, SvelteKit: Public policy (no token). **Next.js: every fetcher falls back to `DIRECTUS_SERVER_TOKEN` (admin), so all reads run as admin.** Remove the `token \|\| process.env.DIRECTUS_SERVER_TOKEN` fallback (an empty token still falls back) and read publicly or with a least-privilege token. |
| Privileged reads (preview, forms) | `withToken(DIRECTUS_SERVER_TOKEN, cmd)` in server-only code. |
| Env | Directus URL: `NEXT_PUBLIC_DIRECTUS_URL`, `DIRECTUS_URL` (Nuxt), `PUBLIC_DIRECTUS_URL` (Astro/SvelteKit). `DIRECTUS_SERVER_TOKEN` server-only. `DIRECTUS_ADMIN_TOKEN` for type generation only. |
| Rate limits | `globals.fetch` wrapped in a `p-queue` (10 requests per 500 ms) that retries 429s up to 3 times (Next.js, Astro, SvelteKit). |
| Data layer | `fetchers.ts` with explicit `fields` for every query and typed returns. Types from a `generate:types` script ([typing.md](typing.md)). |
| Preview | Unsafe. Nuxt, Astro, SvelteKit: bare `?preview=true` switches to the admin token and drops the `status` filter. Next.js: reads already run as admin; `?preview=true` drops the `status` filter and any `?version=<key>` reads that version, no secret needed. Use `directus-visual-editing` for gating and draft reads. |
| Images | `getDirectusAssetURL(fileOrId)` builds `/assets/<id>` ([files-and-images.md](files-and-images.md)). |

The starters pin `@directus/sdk` 22.0.0. Before mixing their code with a newer SDK, check the SDK majors in between
(`directus-upgrade`, `references/sdk-and-extensions.md`).

## Fetching an M2A page

```ts
const pages = await directus.request(
	withToken(
		token, // undefined/'' for public
		readItems('pages', {
			filter: { permalink: { _eq: permalink }, status: { _eq: 'published' } },
			limit: 1,
			fields: [
				'id',
				'title',
				{ seo: ['title', 'meta_description'] },
				{
					blocks: [
						'id',
						'collection',
						'sort',
						{ item: { block_hero: ['id', 'headline', 'image'], block_richtext: ['id', 'headline', 'content'] } },
					],
				},
			] as any, // the starters cast deep M2A field lists
			deep: { blocks: { _sort: ['sort'], _filter: { hide_block: { _neq: true } } } },
		}),
	),
);
```

Render by switching on `block.collection` and passing `block.item` to the matching component. Full field list: [nextjs fetchers.ts](https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/lib/directus/fetchers.ts). Data a block needs at runtime (a "latest posts" block) is fetched in a second query after the page loads.

## Next.js (App Router)

Canonical files: [lib/directus/directus.ts](https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/lib/directus/directus.ts), [fetchers.ts](https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/lib/directus/fetchers.ts), [app/[[...permalink]]/page.tsx](https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/app/%5B%5B...permalink%5D%5D/page.tsx), [app/blog/[slug]/page.tsx](https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/app/blog/%5Bslug%5D/page.tsx).

- Fetch in Server Components, route handlers, and server actions. Never import a module that reads `DIRECTUS_SERVER_TOKEN` from a `'use client'` file.
- The starter pages await `params` and `searchParams` as promises (Next 15+).
- **Caching.** Directus requests go through `fetch`, so Next's fetch cache rules apply. Next 15+ does not cache fetch by default, but a route with no request-time APIs is still prerendered once at build. Next 14 cached fetch by default (why older docs add `cache: 'no-store'`). Set it explicitly:

  ```ts
  await directus.request(withOptions(readItems('posts', query), { next: { revalidate: 300, tags: ['posts'] } }));
  // or for every request: rest({ onRequest: (init) => ({ ...init, next: { revalidate: 60 } }) })
  ```

  On-demand: call `revalidateTag('posts', 'max')` (Next 16; on Next 15 it's `revalidateTag('posts')`) from a route handler that a Directus Flow (on item create/update) calls with a shared secret. The starters don't; they render dynamically because pages read `searchParams`.

- **Draft mode** and preview gating: `directus-visual-editing` (`references/preview-security.md`). Never cache preview responses.
- **Images.** `next/image` needs `images.remotePatterns` for the Directus host and `/assets/**`.

## Nuxt

Canonical files: [server/utils/directus-server.ts](https://github.com/directus-labs/starters/tree/main/cms/nuxt/server/utils/directus-server.ts), [server/api/pages/one.get.ts](https://github.com/directus-labs/starters/tree/main/cms/nuxt/server/api/pages/one.get.ts), [nuxt.config.ts](https://github.com/directus-labs/starters/tree/main/cms/nuxt/nuxt.config.ts).

- The starter uses the SDK **only in Nitro server routes** (`server/api/*`); pages call them with `useFetch`/`$fetch`. The token never reaches the client bundle.
- The client is created with `globals: { fetch: $fetch }` (ofetch). The SDK handles ofetch's already-parsed responses.
- Config: `runtimeConfig.directusServerToken` (private) and `runtimeConfig.public.directusUrl`. Only `runtimeConfig.public` reaches the browser.
- The docs tutorial instead provides `$directus` from a Nuxt plugin that runs on server and client. That only suits public data with no token.

## Astro

Canonical files: [lib/directus/directus.ts](https://github.com/directus-labs/starters/tree/main/cms/astro/src/lib/directus/directus.ts), [pages/[...permalink].astro](https://github.com/directus-labs/starters/tree/main/cms/astro/src/pages/%5B...permalink%5D.astro), [pages/api/page-blocks.ts](https://github.com/directus-labs/starters/tree/main/cms/astro/src/pages/api/page-blocks.ts).

- Env: `import.meta.env.PUBLIC_DIRECTUS_URL` (exposed) and `import.meta.env.DIRECTUS_SERVER_TOKEN` (server only; never in client islands).
- Pages are **prerendered** (`export const prerender = true` with `getStaticPaths`). Content changes need a rebuild (deploy hook from a Directus Flow) unless you switch to on-demand rendering.
- Preview can't work on a prerendered page, so the starter adds `prerender = false` API routes (`/api/page-blocks`, `/api/blog-post/[slug]`) that a React island fetches.

## SvelteKit

Canonical files: [lib/directus/directus.ts](https://github.com/directus-labs/starters/tree/main/cms/sveltekit/src/lib/directus/directus.ts), [routes/[...permalink]/+page.server.ts](https://github.com/directus-labs/starters/tree/main/cms/sveltekit/src/routes/%5B...permalink%5D/+page.server.ts).

- Load data in `+page.server.ts`/`+layout.server.ts`. Token from `$env/static/private`; `$env/static/public` is for the URL only.
- The starter builds the client per call (`getDirectus()`) and, on the server, uses `getRequestEvent().fetch` as `globals.fetch`.
- If you load in universal `+page.ts` with `event.fetch`, add `filterSerializedResponseHeaders: (key) => key.toLowerCase() === 'content-type'` in `hooks.server.ts`. The SDK parses by `Content-Type`; without it, responses replayed during hydration are not parsed as JSON.

## Sources

- https://github.com/directus-labs/starters/tree/main/cms
- https://github.com/directus-labs/starters/tree/main/cms/nextjs
- https://github.com/directus-labs/starters/tree/main/cms/nuxt
- https://github.com/directus-labs/starters/tree/main/cms/astro
- https://github.com/directus-labs/starters/tree/main/cms/sveltekit
- https://directus.com/docs/frameworks/nextjs/data-fetching
- https://directus.com/docs/frameworks/nextjs/live-preview
- https://directus.com/docs/frameworks/nuxt/data-fetching
- https://directus.com/docs/frameworks/astro/data-fetching
- https://directus.com/docs/frameworks/sveltekit/data-fetching
- https://github.com/directus/directus/blob/v12.6.0/sdk/src/utils/extract-data.ts
- https://github.com/directus/directus/blob/v12.6.0/sdk/src/rest/helpers/with-options.ts
- https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/04-functions/fetch.mdx
- https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/04-functions/revalidateTag.mdx
