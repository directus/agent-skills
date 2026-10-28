# Realtime

Two realtime endpoints: a JSON message WebSocket at `/websocket` and GraphQL subscriptions at `/graphql` (via
`graphql-ws`). Both respect the caller's permissions. For a typed client with reconnect handling, use `@directus/sdk`
`realtime()` (the `directus-sdk` skill).

## Enable

WebSockets are **off by default**: set `WEBSOCKETS_ENABLED=true`; nothing else works until you do. All settings:
https://directus.com/docs/configuration/realtime.

- Auth mode (`WEBSOCKETS_REST_AUTH` / `WEBSOCKETS_GRAPHQL_AUTH`) defaults to `handshake`.
- `WEBSOCKETS_REST_AUTH_TIMEOUT` / `WEBSOCKETS_GRAPHQL_AUTH_TIMEOUT` default to `10` seconds (some docs say 30; the
  source wins).
- Heartbeat is on, every `30` seconds (`WEBSOCKETS_HEARTBEAT_PERIOD`), and is also the idle timeout. Behind a proxy or
  load balancer, allow WebSocket upgrades and keep idle timeouts above the heartbeat period.
- `GET /server/info` (with a token) reports whether each socket is enabled. `CORS_ORIGIN` also applies to WebSocket
  connections. A locked-down instance answers WebSocket upgrades with a plain 403 (see `directus-access-control`).

## Authenticate the socket

| Mode | Behavior |
| --- | --- |
| `public` | No auth. Runs with the public policy until you send an auth message. |
| `handshake` | Connect, then the **first message** must be `auth` before the timeout. |
| `strict` | Pass `?access_token=<token>` on the connection URL. |

```json
{ "type": "auth", "access_token": "<token>" }
{ "type": "auth", "email": "user@example.com", "password": "secret" }
{ "type": "auth", "refresh_token": "<token>" }
```

Success: `{ "type": "auth", "status": "ok" }` (plus a `refresh_token` when you logged in with email/password or a
refresh token). When the token expires the server sends an auth error; send a new `auth` message before the timeout
or the socket closes.

## Subscribe

```json
{ "type": "subscribe", "collection": "messages", "query": { "fields": ["id", "text"] }, "uid": "chat" }
```

- Optional `event`: `create`, `update`, or `delete` to receive only one kind. Without `event`, the `init` message also
  carries the current matching items in `data`, so you can skip a separate initial fetch.
- Optional `item`: a primary key to watch a single item. Optional `query` with normal query params (`fields`, `filter`).
- `uid` labels responses. The server doesn't make one up (the SDK does): without it, responses carry no `uid` and
  you can't unsubscribe from just that subscription. Subscribing again with the same `uid` replaces the earlier
  subscription. Unsubscribe with `{ "type": "unsubscribe", "uid": "chat" }`; omit `uid` to drop all.
- Subscriptions only send what the caller can read. A missing event usually means a permission or `fields` problem.
- **Heartbeat:** reply to `{ "type": "ping" }` with `{ "type": "pong" }` to keep the connection alive.

```json
{ "type": "subscription", "event": "init", "data": [ { "id": 1, "text": "hi" } ], "uid": "chat" }
{ "type": "subscription", "event": "delete", "data": ["1"], "uid": "chat" }
```

## CRUD over the socket

```json
{ "type": "items", "action": "read", "collection": "messages", "query": { "fields": ["id", "text"], "limit": 20 }, "uid": "r1" }
{ "type": "items", "action": "create", "collection": "messages", "data": { "text": "hi" } }
{ "type": "items", "action": "update", "collection": "messages", "id": "1", "data": { "text": "edited" } }
{ "type": "items", "action": "delete", "collection": "messages", "ids": ["1", "2"] }
```

- Use `id` for one item or `ids` for several. `read` with neither runs the `query`, which returns the first 100
  items (`QUERY_LIMIT_DEFAULT`) unless you set `limit`.
- `update` with no `id`/`ids` (and object `data`) runs by `query`; a missing or empty query **updates the first 100
  items**. `delete` with no `id`, `ids`, or `query` fails with `INVALID_PAYLOAD`, but `"query": {}` deletes the first
  100, and `limit: -1` deletes all. Always send `id` or `ids`.
- `uid` is echoed back so you can match responses to requests.

## GraphQL subscriptions

Connect with `graphql-ws`: `createClient({ url: 'wss://example.com/graphql', keepAlive: 30000, connectionParams: async () => ({ access_token: 'MY_TOKEN' }) })`,
then subscribe with `subscription { posts_mutated(event: create) { key event data { id title } } }`.

- One `<collection>_mutated` subscription per collection. `event` is `create`, `update`, or `delete`. On `delete` only
  `key` is set.
- GraphQL sockets only accept `access_token`. When it expires the server closes the socket with `Forbidden`; refresh
  and reconnect.
- No CRUD over GraphQL subscriptions. Use HTTP mutations.

## Sources

- https://directus.com/docs/guides/realtime/authentication
- https://directus.com/docs/guides/realtime/subscriptions
- https://directus.com/docs/guides/realtime/actions
- https://directus.com/docs/configuration/realtime
- https://directus.com/docs/releases/breaking-changes/version-12
- https://github.com/directus/directus/blob/v12.6.0/api/src/websocket/messages.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/websocket/handlers/subscribe.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/websocket/handlers/items.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/items.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/env/src/constants/defaults.ts
