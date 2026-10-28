---
name: directus-sdk
description: "Load first, before exploring code, when writing JavaScript or TypeScript with @directus/sdk: client setup (rest, graphql, realtime), auth and tokens, typed schemas, reading and writing items, files and asset URLs, CORS and cookies, and data fetching in Next.js, Nuxt, Astro, or SvelteKit. Load directus alongside for complex queries. Not for live preview or drafts (directus-visual-editing) or SDK version migrations (directus-upgrade)."
metadata:
  author: directus
  directus-version: '12.6.0'
  sdk-version: '27.1.0'
---

# Directus SDK

How `@directus/sdk` composes a client, authenticates, sends queries, types results, and subscribes to realtime. Query
semantics (filters, `deep`, relational writes) live in `directus`. Drafts, live preview, and visual editing live in
`directus-visual-editing`.

_Verified against Directus v12.6.0, `@directus/sdk` 27.1.0, and `@directus/visual-editing` 2.1.0. The CMS starters pin
SDK 22.0.0. If the instance disagrees, trust the instance._

## First checks

1. **Check the version before anything else.** `GET /server/info` with a token returns `data.version`. Older than
   12.6: read the version notes for its major in the `directus` skill (`references/versions-v<major>.md`), or without
   that skill `https://directus.com/docs/raw/releases/breaking-changes/version-<major>.md`. Newer: read the release
   notes since 12.6.0 first.
2. **Where does this code run?** Server (SSR, route handler, script) or browser. That decides the auth strategy and
   whether a token is allowed at all.
3. **Installed versions:** `npm ls @directus/sdk`. Older than above? Check `directus-upgrade` before copying examples.
4. **Reuse what exists:** the project's `Schema` type (`directus-schema.ts`) and fetch patterns, or a
   [CMS starter](https://github.com/directus-labs/starters/tree/main/cms)'s.
5. **Is the data public?** Check the Public policy before reaching for a token. Browser calls to another origin need
   `CORS_ENABLED=true` and `CORS_ORIGIN` on Directus.

## Critical traps

- **The client starts empty.** `createDirectus(url)` has no methods. Add `.with(rest())` for `.request()`,
  `.with(staticToken(t))` or `.with(authentication(mode))` for tokens, `.with(realtime())` for sockets. "`request` is
  not a function" means a missing composable.
- **Commands are positional functions passed to `request()`.** `client.request(readItem('posts', id, { fields }))`,
  `updateItem('posts', id, data)`, `updateItems('posts', keysOrQuery, data)`. Not `client.items('posts').readOne()`, not
  an options object. `login` is the exception: `client.login({ email, password }, { otp, mode })` (the SDK readme's
  positional `login(email, password)` is outdated).
- **Without `fields`, relations come back as bare ids.** The API default is `*`. Expand with nested objects:
  `fields: ['id', { author: ['name'] }, { blocks: ['collection', { item: { block_hero: ['headline'] } }] }]`. Keep
  `fields` literal (inline or `as const`) or output types collapse.
- **Never ship a privileged token to the browser.** Anything in `NEXT_PUBLIC_*`, `PUBLIC_*`, `VITE_*`, or Nuxt
  `runtimeConfig.public` is public. Keep static tokens in server-only env and use `withToken(token, cmd)` on the server.
  Don't keep per-user auth state in a module-level client on the server; it is shared across requests.
- **Only `data` is returned.** `meta` (`total_count`, `filter_count`) is dropped. Count with
  `aggregate('posts', { aggregate: { count: '*' }, query: { filter } })`. A top-level `filter` on `aggregate`
  type-checks but is silently ignored. Counts are typed as strings (and are strings at runtime on Postgres); wrap them
  in `Number()`.
- **Core collections have their own commands.** `readItems('directus_users')` throws; use `readUsers`, `readMe`,
  `readFiles`, `uploadFiles`. In the Schema, add `directus_files: DirectusFile[]` (and `directus_users`) or nested
  fields on file/user relations fail to type-check.
- **`withOptions(cmd, { headers })` drops auth.** The object form replaces the headers holding `Authorization` and
  `Content-Type`; the request runs as Public. Merge instead:
  `withOptions(cmd, (init) => ({ ...init, headers: { ...init.headers, 'X-Foo': '1' } }))`.
- **Auth mode by where the code runs.** Browser on another site: `authentication('cookie', { credentials: 'include' })`
  and `rest({ credentials: 'include' })`, plus CORS. Server holding a user's tokens: `authentication('json', { storage })`
  with one client per user session. SSO: redirect to `/auth/login/<provider>`, then `client.refresh()`; `login()` can't do it.
- **The Next.js CMS starter reads everything as admin.** Its fetchers fall back to `DIRECTUS_SERVER_TOKEN` (an admin
  token). Remove the fallback and read publicly or with a least-privilege token before deploying.
- **Drafts and preview aren't SDK topics** beyond `readItem(c, id, { version: 'draft' })`. Use
  `directus-visual-editing`, and don't copy starter preview code (it leaks the admin server token).

## Minimal setup

```ts
import { createDirectus, rest, staticToken, readItems } from '@directus/sdk';
import type { Schema } from './directus-schema';

// server-only module
export const directus = createDirectus<Schema>(process.env.DIRECTUS_URL!)
	.with(staticToken(process.env.DIRECTUS_TOKEN!)) // omit for Public reads
	.with(rest());

const posts = await directus.request(
	readItems('posts', {
		fields: ['id', 'title', 'slug', { author: ['name'] }],
		filter: { status: { _eq: 'published' } },
		sort: ['-published_at'],
		limit: 10,
	}),
);
```

## Go deeper

1. Directus docs MCP server: `https://directus.com/docs/mcp` (no auth; tools `search-docs`, `get-doc`, `list-docs`,
   `search-directus-code`, `get-directus-file`). Use `search-directus-code` / `get-directus-file` on `sdk/src` for exact
   signatures.
2. Raw markdown for any docs page: `https://directus.com/docs/raw/<path>.md`. Index: `https://directus.com/docs/llms.txt`.
3. The instance: `error.errors[0].extensions.code`, `serverInfo()`, `readOpenApiSpec()`, and the schema.
