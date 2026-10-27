---
name: directus-sdk
description: 'Use when writing JavaScript/TypeScript that talks to Directus through @directus/sdk: createDirectus, rest(), graphql(), authentication(), staticToken(), realtime(), readItems and other commands, withToken/withOptions, typing the Schema generic, login and token refresh, CORS and cookies, server tokens, Next.js/Nuxt/Astro/SvelteKit data fetching, asset URLs, file uploads. Load `directus` alongside for complex filters, deep queries, and relational writes. Not for live preview, drafts in a frontend, or @directus/visual-editing (directus-visual-editing), permissions (directus-access-control), schema design (directus-content-modeling), extensions (directus-extensions), or version migrations (directus-upgrade).'
metadata:
  author: directus
  directus-version: '12.5.1'
  sdk-version: '27.0.0'
---

# Directus SDK

How `@directus/sdk` composes a client, authenticates, sends queries, types results, and subscribes to realtime. Query semantics (filters, `deep`, relational writes) live in `directus`. Drafts, live preview, and visual editing live in `directus-visual-editing`.

_Verified against Directus v12.5.1, `@directus/sdk` 27.0.0, and `@directus/visual-editing` 2.1.0. The CMS starters pin SDK 22.0.0. If the instance disagrees, trust the instance._

## First checks

1. **Where does this code run?** Server (SSR, route handler, script) or browser. That decides the auth strategy and whether a token is allowed at all.
2. **Installed versions:** `npm ls @directus/sdk @directus/visual-editing`. If older than the versions above, check `directus-upgrade` before copying examples.
3. **Is there a Schema type?** Look for a generated `directus-schema.ts` or hand-written `Schema`. Reuse it; don't write a second one.
4. **Is the data public?** Check the Public policy before reaching for a token. Browser calls to another origin need `CORS_ENABLED=true` and `CORS_ORIGIN` on Directus.
5. **Copy an existing pattern** from the project or the matching [CMS starter](https://github.com/directus-labs/starters/tree/main/cms) before inventing one.

## Critical traps

- **The client starts empty.** `createDirectus(url)` has no methods. Add `.with(rest())` for `.request()`, `.with(staticToken(t))` or `.with(authentication(mode))` for tokens, `.with(realtime())` for sockets. "`request` is not a function" means a missing composable.
- **Commands are positional functions passed to `request()`.** `client.request(readItem('posts', id, { fields }))`, `updateItem('posts', id, data)`, `updateItems('posts', keysOrQuery, data)`. Not `client.items('posts').readOne()`, not an options object. `login` is the exception: `client.login({ email, password }, { otp, mode })` (the SDK readme's positional `login(email, password)` is outdated).
- **Without `fields`, relations come back as bare ids.** The API default is `*`. Expand with nested objects: `fields: ['id', { author: ['name'] }, { blocks: ['collection', { item: { block_hero: ['headline'] } }] }]`. Keep `fields` literal (inline or `as const`) or output types collapse.
- **Never ship a privileged token to the browser.** Anything in `NEXT_PUBLIC_*`, `PUBLIC_*`, `VITE_*`, or Nuxt `runtimeConfig.public` is public. Keep static tokens in server-only env and use `withToken(token, cmd)` on the server. Don't keep per-user auth state in a module-level client on the server; it is shared across requests.
- **Only `data` is returned.** `meta` (`total_count`, `filter_count`) is dropped. Count with `aggregate('posts', { aggregate: { count: '*' }, query: { filter } })`. A top-level `filter` on `aggregate` type-checks but is silently ignored. Counts come back as strings.
- **Core collections have their own commands.** `readItems('directus_users')` throws; use `readUsers`, `readMe`, `readFiles`, `uploadFiles`. In the Schema, add `directus_files: DirectusFile[]` (and `directus_users`) or nested fields on file/user relations fail to type-check.
- **`withOptions(cmd, { headers })` drops auth.** The object form replaces the headers holding `Authorization` and `Content-Type`; the request runs as Public. Merge instead: `withOptions(cmd, (init) => ({ ...init, headers: { ...init.headers, 'X-Foo': '1' } }))`.
- **Drafts and preview are not SDK topics.** The only SDK piece is the `version` query param (`readItem(c, id, { version: 'draft' })`). Draft reads and preview gating: `directus-visual-editing`. Versions API: `directus`. Don't copy starter preview code: the Next.js starter sends its admin `DIRECTUS_SERVER_TOKEN` on every read, and the others switch to it on bare `?preview=true`.

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

## References

| Load when | Reference |
| --- | --- |
| Composables, login/refresh/logout, `json`/`cookie`/`session` modes, token storage, SSO, CORS and cross-site cookies, custom fetch, polyfills | [references/setup-and-auth.md](references/setup-and-auth.md) |
| Writing or fixing the `Schema` type: singletons, M2O/O2M/M2M/M2A, `directus_users` custom fields, `'datetime'`/`'json'` markers, output inference, type generation, TS errors | [references/typing.md](references/typing.md) |
| CRUD signatures, query keys the SDK sends, response unwrapping, counting and pagination, `withToken`/`withOptions`/`withSearch`/`customEndpoint`, `isDirectusError`, GraphQL | [references/queries.md](references/queries.md) |
| Subscribing to changes, WebSocket auth modes, reconnects, raw messages | [references/realtime.md](references/realtime.md) |
| Next.js App Router, Nuxt, Astro, SvelteKit: client placement, env vars, caching and revalidation, M2A page fetching, starter file map | [references/frameworks.md](references/frameworks.md) |
| Asset URLs, private files, transform params in URLs, framework image config, uploads | [references/files-and-images.md](references/files-and-images.md) |

## Go deeper

1. Directus docs MCP server: `https://directus.com/docs/mcp` (no auth; tools `search-docs`, `get-doc`, `list-docs`, `search-directus-code`, `get-directus-file`). Use `search-directus-code` / `get-directus-file` on `sdk/src` for exact signatures.
2. Raw markdown for any docs page: `https://directus.com/docs/raw/<path>.md` (for example `https://directus.com/docs/raw/guides/connect/sdk.md`). Index: `https://directus.com/docs/llms.txt`.
3. The instance itself: its error messages (`error.errors[0].extensions.code`), `GET /server/info` (SDK `serverInfo()`), `GET /server/specs/oas` (SDK `readOpenApiSpec()`), and the schema.
