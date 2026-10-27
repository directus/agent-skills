# Realtime with `realtime()`

The WebSocket message protocol (message types, `items` actions, server events) belongs to the `directus` skill. This file covers the SDK composable.

## Server prerequisites

- Self-hosted: `WEBSOCKETS_ENABLED=true` (default `false`). Directus Cloud has it on.
- Path: `WEBSOCKETS_REST_PATH`, default `/websocket`.
- Server auth mode `WEBSOCKETS_REST_AUTH`: `public`, `handshake` (default), or `strict`. The client `authMode` must match.
- Unauthenticated connections close after `WEBSOCKETS_REST_AUTH_TIMEOUT` seconds (default 10 in source; the configuration docs say 30).
- `CORS_ORIGIN` applies to WebSocket connections. Subscriptions respect the user's read permissions, same as REST.

## Create a realtime client

```ts
// server-side worker with a token
const client = createDirectus<Schema>(url).with(staticToken(process.env.DIRECTUS_TOKEN!)).with(realtime());

// browser app with a logged-in user
const app = createDirectus<Schema>(url).with(authentication('json')).with(rest()).with(realtime());
await app.login({ email, password });
await app.connect();
```

- The socket URL comes from the client URL: `https:` becomes `wss:`, `http:` becomes `ws:`, path `/websocket`. Override with `realtime({ url: 'wss://example.com/custom-path' })`, or pass a `ws:`/`wss:` URL to `createDirectus`.
- Defaults: `realtime({ authMode: 'handshake', heartbeat: true, debug: false, connect: { timeout: 10000 }, reconnect: { delay: 1000, retries: 10 } })`. `heartbeat` answers server pings; `debug` logs through `globals.logger`; `reconnect` can be `false`.
- Node versions without a global `WebSocket`: `createDirectus(url, { globals: { WebSocket } })` (for example from `ws`).

## Auth modes

| `authMode` | What the SDK does | Token source |
| --- | --- | --- |
| `public` | Sends no auth. | none |
| `handshake` (default) | After `open`, sends `{ type: 'auth', access_token }` and waits for `status: 'ok'`. Rejects `connect()` if the client has a token composable but `getToken()` returns nothing. | `getToken()` from `staticToken()` or `authentication()` |
| `strict` | Appends `?access_token=...` to the socket URL. | `getToken()` |

- `handshake` with **no** token composable: the SDK sends nothing and the server closes the socket after its auth timeout.
- If the server replies `AUTH_FAILED` or `AUTH_TIMEOUT` to the first message while `authMode` is `public`, the SDK logs a hint to use `handshake` and turns off reconnects.
- On `TOKEN_EXPIRED` the SDK calls `getToken()` (which refreshes under `authentication()`) and re-sends auth.
- **Session cookies authenticate the upgrade.** If the browser sends `directus_session_token` with the WebSocket request (same site as Directus), the server authenticates from it in every server auth mode. `authentication('session')` has no bearer token, so `handshake` rejects `connect()`. Use `realtime({ authMode: 'public' })` on the client so the cookie does the work.
- A `?access_token=` on the socket URL (what `strict` sends) is also accepted when the server mode is `handshake`.

**House rule:** in browsers, authenticate realtime as the logged-in user. Never ship a static token for realtime.

## Subscribe

```ts
const { subscription, unsubscribe } = await client.subscribe('messages', {
	event: 'create', // optional: 'create' | 'update' | 'delete'; omit for all
	query: { fields: ['id', 'text', { user_created: ['first_name'] }], sort: ['-date_created'] },
});

for await (const message of subscription) {
	if (message.event === 'init') render(message.data); // current items on subscribe
	if (message.event === 'delete') remove(message.data); // array of primary keys
	if (message.event === 'error') console.error(message.error);
}
```

- `subscribe()` connects if needed. Each subscription gets a `uid`; pass your own with `uid`.
- `data` is an array for `init`, `create`, and `update`; for `delete` it is the list of deleted keys.
- Send `query.fields` to expand relations, as with REST. Output types follow `fields`.
- A `{ type: 'subscribe', status: 'error' }` reply makes the generator throw. Wrap the loop in `try`.
- The `for await` loop blocks. Run it in its own async function (or a framework effect) and call `unsubscribe()` on teardown.

## Lifecycle and raw messages

- `connect()` resolves with the socket once open (and authenticated in `handshake` mode). Calling it while connecting returns the same promise; calling it in an error state throws.
- `disconnect()` closes the socket and disables reconnects until the next `connect()`.
- After an unexpected close the SDK retries up to `reconnect.retries` times, waiting `reconnect.delay` ms (minimum 100). On success it re-sends every active subscription and existing generators keep yielding.
- `isConnected()` reports socket state only, not auth state.
- `client.onWebSocket(event, handler)` takes `'open' | 'close' | 'error' | 'message'` and returns a remover. `message` handlers get parsed JSON; pings are answered automatically when `heartbeat` is on and are not passed to them.
- `client.sendMessage({ type: 'items', collection, action: 'create', data })` throws unless the socket is open (`await client.connect()` first). Objects without a `uid` get one.

## Sources

- https://directus.com/docs/getting-started/connect-to-realtime
- https://directus.com/docs/guides/realtime/authentication
- https://directus.com/docs/guides/realtime/subscriptions
- https://directus.com/docs/configuration/realtime
- https://directus.com/docs/guides/connect/sdk
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/realtime/composable.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/realtime/types.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/readme.md
- https://github.com/directus/directus/blob/v12.5.1/api/src/websocket/controllers/base.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/env/src/constants/defaults.ts
