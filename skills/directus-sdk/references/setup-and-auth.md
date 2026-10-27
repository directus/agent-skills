# Client setup and authentication

## Contents

- [Composables](#composables)
- [Pick an auth strategy](#pick-an-auth-strategy)
- [`authentication()` in detail](#authentication-in-detail)
- [Static and per-request tokens](#static-and-per-request-tokens)
- [CORS and cookies](#cors-and-cookies)
- [Request hooks, custom fetch, polyfills](#request-hooks-custom-fetch-polyfills)

## Composables

`createDirectus(url, options?)` returns a client with only `url`, `globals`, and `with()`. Add capabilities with `.with()`:

| Composable | Adds | Notes |
| --- | --- | --- |
| `rest(config?)` | `.request(command)` | Needed for every command. |
| `graphql(config?)` | `.query(query, variables?, scope?)` | `scope` is `'items'` (default, `/graphql`) or `'system'` (`/graphql/system`). |
| `authentication(mode?, config?)` | `.login()`, `.logout()`, `.refresh()`, `.stopRefreshing()`, `.getToken()`, `.setToken()` | `mode` defaults to `'cookie'`. |
| `staticToken(token)` | `.getToken()`, `.setToken()` | Fixed token, no refresh. |
| `realtime(config?)` | `.connect()`, `.disconnect()`, `.subscribe()`, `.sendMessage()`, `.onWebSocket()`, `.isConnected()` | See [realtime.md](realtime.md). |

`rest()` and `graphql()` call `getToken` on the composed client and send `Authorization: Bearer <token>` when it returns a value. The order of `.with()` calls does not matter for this.

## Pick an auth strategy

| Situation | Use |
| --- | --- |
| Public content (Public policy has read access) | `rest()` only, no token. |
| Server-side code reading non-public content | `staticToken()` with a token from a dedicated, least-privilege user, or `withToken()` per request. |
| Browser app with user login, same site as Directus | `authentication('session', { credentials: 'include' })` + `rest({ credentials: 'include' })`. |
| Browser app with user login, cross-site, cookie refresh | `authentication('cookie', { credentials: 'include' })` + `rest({ credentials: 'include' })`. |
| Server holds the user's tokens (BFF, mobile, CLI) | `authentication('json', { storage })` with your own storage. |
| SSO (Google, GitHub, OIDC, SAML) | Redirect to `/auth/login/<provider>?redirect=...`, then `client.refresh()` on return. `login()` does not work for redirect providers. |

**House rule:** never put an admin token or any static token in browser code. `PUBLIC_*` includes Astro/SvelteKit `$env/static/public`.

**Server vs browser.** `authentication()` and `staticToken().setToken()` keep the token in the client closure, so a module-level client in Next.js, Nuxt (Nitro), SvelteKit, or Astro SSR is shared by every request. For per-user calls on the server, create a client per request or use `withToken()`. A module-level client with a fixed server token or no token is fine; all four CMS starters do this. Their `DIRECTUS_SERVER_TOKEN` is an admin static token. **House rule:** for production, mint a token for a dedicated user whose policy reads only what the site needs (including `directus_versions` if you preview drafts).

## `authentication()` in detail

```ts
const client = createDirectus<Schema>('https://directus.example.com').with(authentication('json')).with(rest());

await client.login({ email: 'user@example.com', password: 'secret' });
// LDAP: client.login({ identifier: 'jdoe', password: '...' }, { provider: 'ldap' })
// MFA:  client.login({ email, password }, { otp: '123456' })
const me = await client.request(readMe({ fields: ['id', 'email'] }));
await client.logout();
```

`login(payload, options?)`: payload is `{ email, password }` or `{ identifier, password }`; `options` is `{ otp?, mode?, provider? }`. Config (second argument of `authentication()`): `{ autoRefresh = true, msRefreshBeforeExpires = 30000, credentials?, storage? }`.

| Mode | Login/refresh response | Refresh token lives in | `getToken()` returns |
| --- | --- | --- | --- |
| `json` | `access_token`, `refresh_token`, `expires` | SDK storage (sent in body on refresh) | access token |
| `cookie` (default) | `access_token`, `expires` | httpOnly `directus_refresh_token` cookie | access token |
| `session` | `expires` only | httpOnly `directus_session_token` cookie (the session itself) | `null` |

- Default storage is **in memory**; a page reload loses the access token. In `cookie` or `session` mode call `await client.refresh()` on startup to restore the session from the cookie.
- `session` mode has no bearer token, so `rest()` must send `credentials: 'include'`. Realtime in this mode: [realtime.md](realtime.md#auth-modes).
- `autoRefresh` schedules a timer from `expires`; `getToken()` also refreshes within `msRefreshBeforeExpires` of expiry. Refresh failures in these paths are swallowed; the next request fails with 401.
- `setToken(token)` on an `authentication()` client clears the refresh token and expiry, so auto refresh stops.
- The standalone `refresh()` command is not `client.refresh()`: it defaults to `mode: 'cookie'` and does not update client storage.

Custom storage implements `get()` and `set(value)` (sync or async) with the shape `{ access_token, refresh_token, expires, expires_at }`:

```ts
const storage = {
	get: () => JSON.parse(localStorage.getItem('directus-auth') ?? 'null'),
	set: (value) => localStorage.setItem('directus-auth', JSON.stringify(value)),
};
const client = createDirectus<Schema>(url).with(authentication('json', { storage })).with(rest());
```

**House rule:** prefer `cookie` or `session` mode in browsers so the refresh token stays httpOnly. `localStorage` storage in `json` mode exposes the refresh token to any script on the page.

## Static and per-request tokens

- `withToken(token, cmd)` sets the token for one request and overrides any client token.
- `withToken('', cmd)` sets no header. With no `staticToken()`/`authentication()` on the client the request runs as Public; with a token composable, the client token is used instead.
- Static tokens come from a user's **Token** field in the Studio (Users > user > Token > save). They do not expire.

## CORS and cookies

Browser calls to Directus on another origin need these on Directus ([security-limits](https://directus.com/docs/configuration/security-limits)):

| Variable | Default | Set |
| --- | --- | --- |
| `CORS_ENABLED` | `false` | `true` |
| `CORS_ORIGIN` | `false` | your site origin(s), or `true` to reflect the request origin |
| `CORS_METHODS` | `GET,POST,PATCH,DELETE` | add `SEARCH` if you use `withSearch()` |
| `CORS_ALLOWED_HEADERS` | `Content-Type,Authorization` | keep both; `rest()` sets `Content-Type: application/json` on every request, including GETs, so every call is preflighted |
| `CORS_CREDENTIALS` | `true` | keep `true` for cookie/session auth |

Cross-site cookie auth also needs `REFRESH_TOKEN_COOKIE_SECURE=true` and `REFRESH_TOKEN_COOKIE_SAME_SITE=None` (or `SESSION_COOKIE_*` for session mode), and `credentials: 'include'` on **both** `authentication()` and `rest()` (and `graphql()` if used). Without it fetch uses the browser default (`same-origin`). One request only: `withOptions(cmd, { credentials: 'include' })`.

## Request hooks, custom fetch, polyfills

- `rest({ onRequest, onResponse, credentials })`: `onRequest(fetchOptions)` runs on every request after the per-command hook and returns the `RequestInit` to use (headers, framework cache options). `onResponse(result, fetchOptions)` receives the **already unwrapped** `data`, not the raw `Response`.
- Per command: `withOptions(command, init)` or `withOptions(command, (init) => newInit)`.
- Replace fetch (rate limiting, retries, a framework's fetch) with `createDirectus(url, { globals: { fetch: myFetch } })`. The Next.js, Astro, and SvelteKit starters wrap fetch in a `p-queue` limiter that retries 429s; Nuxt passes `ofetch`'s `$fetch`. See [frameworks.md](frameworks.md).
- The SDK has no runtime dependencies; it uses global `fetch`, `URL`, and (for `realtime()`) `WebSocket`. Pass polyfills through `globals: { fetch, URL, WebSocket, logger }` or assign them on `globalThis` first. React Native needs a `URL` polyfill (`react-native-url-polyfill`). Node versions without a global `WebSocket` need one (for example `ws`) for `realtime()`.

## Sources

- https://directus.com/docs/guides/connect/sdk
- https://directus.com/docs/guides/auth/tokens-cookies
- https://directus.com/docs/guides/auth/sso/seamless
- https://directus.com/docs/configuration/security-limits
- https://github.com/directus/directus/blob/v12.6.0/sdk/src/client.ts
- https://github.com/directus/directus/blob/v12.6.0/sdk/src/auth/composable.ts
- https://github.com/directus/directus/blob/v12.6.0/sdk/src/auth/static.ts
- https://github.com/directus/directus/blob/v12.6.0/sdk/src/auth/types.ts
- https://github.com/directus/directus/blob/v12.6.0/sdk/src/rest/composable.ts
- https://github.com/directus/directus/blob/v12.6.0/sdk/src/rest/helpers/with-token.ts
- https://github.com/directus/directus/blob/v12.6.0/sdk/src/rest/helpers/with-options.ts
- https://github.com/directus/directus/blob/v12.6.0/sdk/src/rest/commands/auth/refresh.ts
- https://github.com/directus/directus/blob/v12.6.0/sdk/readme.md
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/auth.ts
- https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/lib/directus/directus.ts
