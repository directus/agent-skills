# Building and debugging flows

- [Build order](#build-order)
- [With MCP](#with-mcp)
- [Running a flow](#running-a-flow)
- [Reading flow logs](#reading-flow-logs)
- [When a flow doesn't fire or misbehaves](#when-a-flow-doesnt-fire-or-misbehaves)

## Build order

Operation links need UUIDs that only exist after creation, so build in this order:

1. **Create the flow** as `inactive` while you wire it: `name`, `trigger`, `options`, `accountability: "all"` (logs),
   `status: "inactive"`. Options go inside `options`, not beside them.
2. **Create each operation** with `flow`, a unique `key` (snake_case, it becomes the data chain name), `type`,
   `options`, `resolve: null`, `reject: null`. Over REST, `position_x` and `position_y` are required too (any
   integers, e.g. `19`, `37`, `55` along one row). The MCP `operations` tool works them out from the links.
3. **Link them:** patch each operation's `resolve` / `reject` to the next operation's **UUID**, not its key.
4. **Set the entry point:** patch the flow's `operation` to the first operation's UUID.
5. **Activate:** patch `status: "active"`. This is the step that counts against the license, and the moment an event
   flow starts firing on real writes.

```bash
# 1. flow
curl -s -X POST "$URL/flows" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
  "name": "Notify on publish", "status": "inactive", "accountability": "all", "trigger": "event",
  "options": { "type": "action", "scope": ["items.update"], "collections": ["posts"] }
}' | jq -r .data.id
# 2. operations (repeat per operation), 3. PATCH /operations/<id> {"resolve": "<next-uuid>"}
# 4. PATCH /flows/<flow-id> {"operation": "<first-uuid>"}, 5. PATCH /flows/<flow-id> {"status": "active"}
```

Read the result back with
`GET /flows/<id>?fields=*,operations.*` and check every link. Deleting a flow deletes its operations. Deleting an operation that another one points to
fails (500 on 12.5.1: `resolve`/`reject` are foreign keys with no delete rule). PATCH the previous operation's
`resolve` or `reject` to the next one (or `null`) first, then delete. `resolve` is unique across operations, and so
is `reject`: two operations can't both `resolve` to the same next step (one `resolve` and another's `reject` can).
Duplicate a shared tail or call a utility.

## With MCP

- `flows` and `operations` are admin-only tools. Same build order as above, but leave out positions: the tool lays
  out the graph from the links.
- `trigger-flow` (active manual flows only) takes `id`, `collection` (required), and optional `keys`, `data`, `query`,
  `headers`. Nothing else: extra keys fail validation. `data` is merged into `$trigger.body` with `collection` and
  `keys`, and the flow's required confirmation fields must be in `data`.
- Flow folders are `folders` with `type: "flows"`.

## Running a flow

| Trigger | Run it with |
| --- | --- |
| manual | Studio button, `POST /flows/trigger/<id>` with `{ "collection", "keys", ...inputs }`, or MCP `trigger-flow` |
| webhook | `GET` or `POST /flows/trigger/<id>` (method must match `options.method`) |
| event | Make the write it listens for, on a test item |
| schedule | Temporarily set the cron to every minute (`"0 * * * * *"`), or call its body as a utility |
| operation | From a parent flow, or a temporary manual wrapper |

```bash
curl -X POST "$URL/flows/trigger/$FLOW_ID" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"collection":"posts","keys":["<id>"],"reason":"test"}'
```

Manual flow failures (wrong collection, no keys when `requireSelection` is on, no read access to the keys, no token)
are all a bare 403.

## Reading flow logs

With `accountability: "all"`, each run writes an activity row and a revision holding every step and the final data
chain (secrets and allow-listed env values redacted). `"activity"` writes only the activity row; `null` writes nothing.

```bash
curl -s -g -H "Authorization: Bearer $TOKEN" \
  "$URL/revisions?filter[collection][_eq]=directus_flows&filter[item][_eq]=$FLOW_ID&sort=-id&limit=3&fields=activity.timestamp,data" \
  | jq '.data[] | {at: .activity.timestamp, steps: .data.steps, chain: .data.data}'
```

Each step is `{ operation, key, status, options }`: `options` are the values after `{{ }}` was filled in, which shows
exactly what each operation received. `status: "reject"` marks where it went wrong, and the error sits under that key in
the chain.

`log` operations and Run Script `console.log` go to the **server** log, not here.

**House rule:** keep `accountability: "all"` while building. For hot event flows in production, consider `"activity"`
so you're not writing a revision with the full payload on every save.

## When a flow doesn't fire or misbehaves

| Symptom | Check |
| --- | --- |
| Event flow never runs | `status: "active"`; `collections` set for `items.*` scopes; system collection uses the short scope (`users.update`) |
| Runs, then stops after the first operation | `resolve` links are UUIDs; the flow's `operation` points at the first one |
| Condition always fails | Filter nested from the root, and every field in it exists in the data (update payloads hold only changed fields) |
| Item read returns nothing in a webhook flow | `permissions: "$trigger"` with an anonymous caller is the public policy. Use a role or `$full` |
| A value arrives as the string `"undefined"` | The `{{ }}` path doesn't exist in the data chain (wrong key or typo). Check the step `options` in the log |
| Utility returns `null` | Child inactive or missing, or no `options.return` on the child |
| Email never arrives, flow shows success | `mail` doesn't wait for delivery. Check the server log and `EMAIL_*` config |
| Webhook returns stale data | `GET` responses are cached. Set `cacheEnabled: false` |
| Flow fires twice or forever | An item operation with `emitEvents: true` writing to the collection the flow listens on |
| Custom operation flows break after a push | The operation's extension isn't installed on the target |

## Sources

- https://directus.com/docs/guides/flows
- https://github.com/directus/directus/blob/v12.6.0/api/src/flows.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/flows.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/flows.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/flows/prompt.md
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/operations/prompt.md
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/operations/position.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/trigger-flow/index.ts
