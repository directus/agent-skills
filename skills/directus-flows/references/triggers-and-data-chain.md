# Triggers and the data chain

## Triggers

| `trigger` | Starts on | Key `options` | `$trigger` holds |
| --- | --- | --- | --- |
| `event` | Data or system events | `type` (`filter` or `action`), `scope` (`["items.create", "items.update", "items.delete"]` or hook events like `auth.login`), `collections`, `return` | `payload`, `event`, `collection`, and `key` (create) or `keys` (update, delete) |
| `webhook` | `GET` or `POST /flows/trigger/<flow-id>` | `method` (default `GET`), `async`, `return`, `error_on_reject`, `cacheEnabled` | `path`, `query`, `body`, `method`, `headers` |
| `schedule` | Cron | `cron`, 5 or 6 fields; a 6th leading field is seconds: `"0 */15 * * * *"` | `null` |
| `operation` | A `trigger` operation in another flow | `return` | exactly the payload the caller passed |
| `manual` | Studio button, or `POST /flows/trigger/<flow-id>` | `collections`, `location` (`item`, `collection`, `both`, `hidden`), `requireSelection` (default `true`), `requireConfirmation`, `fields`, `async` | `body.collection`, `body.keys`, and confirmation inputs in `body` |

- Only `active` flows run. Saving a flow reloads every flow on the instance.
- Schedules run once across instances only with `SYNCHRONIZATION_STORE=redis`. The default store is in memory, so
  every container runs every schedule. An invalid cron registers nothing and only logs a warning.
- Manual flows require an authenticated user with read access to the selected keys. A public caller gets a bare 403.
  Use a webhook trigger for public callers.

## Event flows: filter vs action

- **`filter`** runs inside the request, before the write. Its `return` value replaces the payload, so return the whole
  payload (`{ ...$trigger.payload, slug }`), not just the new field. A `return` that resolves to `undefined` leaves the
  payload unchanged. Ending on a reject (including a `condition` that didn't match) cancels the write and sends the
  error to the caller, so link every "nothing to do" branch to a harmless `log`.
- **`action`** runs after commit. It can't change or stop the write. Prefer it unless you must validate or transform.
- `items.create` filters see no primary key yet. `items.update` payloads hold only the changed fields; read the item
  for the rest.
- **How many runs a bulk write gives:**
  - Creating several items, or a batch update (an array of objects, each with its own key): once per item.
  - One change applied to many items (`{ "keys": [...], "data": {...} }`, `{ "query": ..., "data": ... }`, or an
    `item-update` with several keys) and deletes: **once**, with all of them in `$trigger.keys`.

  Handle every key in `keys`, not just `keys[0]`.
- System collections use their short name: `directus_users` becomes `users.create`.
- Keep filter flows short. They hold the request (and its transaction) open.

## Return values and errors to the caller

| Trigger | Default `return` | Notes |
| --- | --- | --- |
| `webhook` | `$last` | `async: true` responds right away with no body. `error_on_reject: true` turns a final reject into an error. |
| `manual` | always `$last` | Same `async` and `error_on_reject` behavior. |
| `operation` | none (`undefined`) | Set `return` to an operation key, `$last`, or `$all`, or the parent gets nothing. |
| `event` (filter) | none | The value becomes the new payload. A final reject throws. |

Without `error_on_reject`, a webhook or manual flow that ends on a reject still returns 200 with the error as `$last`.

**Webhook caching:** `GET` webhook responses are cached unless `options.cacheEnabled` is `false`. The MCP `flows` tool
calls it `cache`, which the API ignores.

**Webhook auth:** the URL needs no token. Protect it with a `condition` on `$accountability.user` or a shared secret
header (`$trigger.headers`), and treat `$trigger.body` as untrusted.

## Data chain

Every run starts with `$trigger`, `$last` (same as `$trigger` at first), `$accountability`, and `$env`. Each operation's
result is stored under its `key`, and `$last` moves to it.

```json
{ "$trigger": {}, "$last": {}, "$accountability": {}, "$env": {}, "read_post": { "title": "Hi" }, "notify": null }
```

Reference values in any option with `{{ }}`. Dot paths and array indexes work:

```json
{ "title": "{{ $trigger.payload.title }}", "first": "{{ read_items[0].id }}", "user": "{{ $accountability.user }}" }
```

- **Use operation keys, not `$last`.** `$last` changes meaning when someone inserts an operation.
- An option that is exactly `"{{ key }}"` passes the raw value (object, array). Mixed text (`"Hi {{ name }}"`) becomes a
  string.
- `$env` holds only variables named in `FLOWS_ENV_ALLOW_LIST` (default: none). Values are redacted from flow logs.
- There's no `{{ $NOW }}`. `$NOW` works only inside filter objects (condition rules, item queries). For a timestamp in a
  payload, return one from Run Script.
- Every result must be JSON-serializable. `undefined` values become `null`.

## Who the flow runs as

`$accountability` is the caller of the trigger:

| Trigger | `$accountability` |
| --- | --- |
| event | the user whose request fired the event |
| manual, webhook | the requesting user; public (no user) if anonymous |
| schedule | `null` |
| operation | inherited from the parent flow |

Item operations with `permissions: "$trigger"` use this. `null` means no permission checks at all.

## Sources

- https://directus.com/docs/guides/flows/triggers
- https://directus.com/docs/guides/flows/data-chain
- https://directus.com/docs/configuration/flows
- https://github.com/directus/directus/blob/v12.6.0/api/src/flows.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/emitter.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/flows.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/flows/prompt.md
