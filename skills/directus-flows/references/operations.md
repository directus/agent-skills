# Operations

- [Resolve, reject, and errors](#resolve-reject-and-errors)
- [Operation table](#operation-table)
- [Condition](#condition)
- [Item operations](#item-operations)
- [Run Script](#run-script)
- [Request](#request)
- [Mail](#mail)
- [Marketplace operations](#marketplace-operations)

## Resolve, reject, and errors

Each operation has `resolve` (success) and `reject` (failure) links to the next operation's UUID. If an operation throws,
the error is stored under its key (and `$last`) and the flow follows `reject`. No `reject` link means the flow stops
there. What a final reject does depends on the trigger ([triggers-and-data-chain.md](triggers-and-data-chain.md#return-values-and-errors-to-the-caller)).
An unknown operation `type` (a missing extension) ends the run with only a server warning.

## Operation table

| `type`                                                      | Does                 | Notes                                                                                                                  |
| ----------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `condition`                                                 | Branch on a filter   | Resolves with `null` when the filter passes, rejects when it fails. See below.                                         |
| `item-create` / `item-read` / `item-update` / `item-delete` | CRUD                 | `collection`, `key` or `query` (not both), `payload`, `permissions`, `emitEvents`. See below.                          |
| `exec`                                                      | Run Script           | Sandboxed JS. See below.                                                                                               |
| `request`                                                   | HTTP call            | Rejects on non-2xx. See below.                                                                                         |
| `mail`                                                      | Send email           | Fire and forget. See below.                                                                                            |
| `notification`                                              | In-app notification  | `recipient` (user id, array, or comma-separated ids), `subject`, `message`                                                                    |
| `transform`                                                 | Build JSON           | `json` with `{{ }}` values. Use it to shape a payload or a return value.                                               |
| `trigger`                                                   | Run another flow     | `flow` (UUID), `payload`, `iterationMode`, `batchSize`. See [utility-flows-and-loops.md](utility-flows-and-loops.md).  |
| `json-web-token`                                            | Sign, verify, decode | Keep secrets in `$env`                                                                                                 |
| `sleep`                                                     | Wait                 | `milliseconds`                                                                                                         |
| `log`                                                       | Write to server log  | `message`. Goes to the server log at `info`, not the flow log. Secrets in `headers` and `payload` are redacted.        |
| `throw-error`                                               | Fail on purpose      | `code`, `status`, `message`. Use at the end of a branch to cancel a filter event or fail a webhook with a real status. |

## Condition

```json
{ "filter": { "$trigger": { "payload": { "status": { "_eq": "published" } } } } }
```

- The filter runs against the whole data chain. Nest from the root (`$trigger` → `payload` → field). Dot paths like
  `"$trigger.payload.status"` don't work.
- **Every field in the rule must be present.** A missing key fails the condition, even with `_null`. On `items.update`
  the payload holds only changed fields, so `status: { _eq: "published" }` fails when the update didn't touch `status`.
  Read the item first and test the read result when you need the stored value.
- A failed condition rejects with an array of `FailedValidationError`s.
- `$NOW`, `$CURRENT_USER`, and other filter variables work here.

## Item operations

| Option        | Meaning                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`         | One key or an array. Use it or `query`, not both.                                                                                                    |
| `query`       | A normal query (`filter`, `fields`, `limit`, `sort`). For update and delete, no `key` and no `query` returns `null` instead of touching every item; to hit all, use `{"limit": -1}`. A read with neither returns the first page.    |
| `payload`     | Object, or an **array** for `item-create` (creates many) and `item-update` (batch update; each object carries its primary key, no `key` or `query`). |
| `permissions` | `$trigger` (default), `$public`, `$full`, or a role UUID                                                                                             |
| `emitEvents`  | Default `false`. When `true`, the write fires hooks and event flows.                                                                                 |

- **`$trigger` permissions** run as the trigger's caller
  ([who the flow runs as](triggers-and-data-chain.md#who-the-flow-runs-as)). An anonymous webhook usually reads nothing.
- **`$full`** bypasses permissions. Fine for internal glue, but never feed untrusted webhook input straight into a
  `$full` write.
- **`emitEvents: true` can recurse** (an action flow on `posts.items.update` that updates `posts`). Leave it off unless
  another flow or hook must see the write.
- `item-read` with one key (or a one-element array) returns an object. Several keys or a `query` return an array.

## Run Script

Shape: `module.exports = async function (data) { ... }`, returning the result. Full example:
[recipes.md](recipes.md#slug-on-create).

- Runs in an `isolated-vm` sandbox: no `require`, no file system, no network, no `fetch`. Use a `request` operation for
  HTTP and an operation extension for npm packages.
- `data` is the whole data chain. `process.env` holds only allow-listed `$env` values.
- `console.log` writes to the **server** log, not the flow log. Return what you want to inspect.
- Limits: `FLOWS_RUN_SCRIPT_TIMEOUT` (default `10000` ms) and `FLOWS_RUN_SCRIPT_MAX_MEMORY` (default `32` MB).
- Return JSON-serializable data. Throwing takes the reject path.

## Request

```json
{
	"method": "POST",
	"url": "https://api.example.com/hooks/{{ $trigger.key }}",
	"headers": [{ "header": "Authorization", "value": "Bearer {{ $env.EXAMPLE_TOKEN }}" }],
	"body": "{{ build_payload }}"
}
```

- `headers` is an array of `{ header, value }`. `Content-Type: application/json` is added when the body is JSON.
- Resolves with `{ status, statusText, headers, data }`. Use `{{ call_api.data.id }}` downstream.
- Rejects on non-2xx with the same shape, so the reject branch can read `{{ call_api.status }}`.
- Outbound requests go through the same IP deny list as file imports (`IMPORT_IP_DENY_LIST`, which blocks `0.0.0.0` and
  the cloud metadata address by default).

## Mail

```json
{ "to": ["{{ user.email }}"], "subject": "Welcome", "type": "wysiwyg", "body": "<p>Hi {{ user.first_name }}</p>" }
```

- `type`: `markdown` (default editor), `wysiwyg` (HTML), or `template` (a Liquid file from `EMAIL_TEMPLATES_PATH`, with
  `template` and `data`). Templates on disk aren't an option on Directus Cloud; render the HTML in the flow instead.
- It resolves before the email is sent. Check SMTP config with a test run, not by branching on the result.
- For one email per person instead of one shared email, loop (see [utility-flows-and-loops.md](utility-flows-and-loops.md#loops)).
- `RATE_LIMITER_EMAIL_FLOWS_ENABLED` (default `false`) caps mail per flow. When it trips, the operation rejects.

## Marketplace operations

Directus Labs publishes operations for common jobs, installable from the Marketplace (sandboxed, so they work on Cloud):
`@directus-labs/liquidjs-operation` (render Liquid templates, single or batch), `resend-operation`, AI operations
(writer, translator, image generation, moderation), and search sync (Algolia, Meilisearch, Elasticsearch, OpenSearch).
Check `GET /extensions` before using one; a flow pushed to an instance without it fails silently.

## Sources

- https://directus.com/docs/guides/flows/operations
- https://directus.com/docs/configuration/flows
- https://github.com/directus/directus/tree/v12.5.1/api/src/operations
- https://github.com/directus/directus/blob/v12.5.1/api/src/flows.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/utils/shared/generate-joi.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/utils/shared/apply-options-data.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/env/src/constants/defaults.ts
- https://github.com/directus-labs/extensions/tree/main/packages
