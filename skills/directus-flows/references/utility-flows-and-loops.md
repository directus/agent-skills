# Utility flows and loops

- [Utility flows](#utility-flows)
- [Common utilities](#common-utilities)
- [Loops](#loops)
- [Licensing](#licensing)
- [Testing a utility](#testing-a-utility)

## Utility flows

A utility flow is a small flow with `trigger: "operation"` that other flows call with a `trigger` operation. Use one for
work you'd otherwise copy into several flows (render a template, send an email, read globals), and as the loop body when
you need to run steps per item.

**House rules:**

- Name them `Utils → <Verb Noun>` (`Utils → Send Email`). Match the project if it already uses a variant (the CMS
  starter writes `Utils -> Duplicate Page`).
- Write the input and output in the flow's `description`: `In: { to, subject, html }. Out: { ok, error }`.
- Keep each one to a single job. Put them in a `Utils` flow folder.
- Return a status object, not just the last result, so callers can branch:

```js
// Last operation of the utility (Run Script), with the flow's options.return set to this key
module.exports = async function (data) {
	return { ok: true, id: data.create_item?.id ?? null };
};
```

**How the call works:**

```json
{ "type": "trigger", "key": "send", "options": { "flow": "<utility-flow-uuid>", "payload": "{{ build_email }}" } }
```

- The child's `$trigger` is the payload value itself: `{{ $trigger.to }}`, not `{{ $trigger.body.to }}`.
- The child inherits the parent's `$accountability`, so `$trigger` permissions inside it act as the original caller.
- The child's `options.return` (an operation key, `$last`, or `$all`) lands under the parent operation's key:
  `{{ send.ok }}`. No `return`, or an inactive or deleted child (server warning only), means `null`. Utilities must
  stay `active`.

## Common utilities

| Utility                   | In                      | Body                                                                                                                                            | Out                |
| ------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `Utils → Get Globals`     | nothing                 | `item-read` on the `globals` singleton, `permissions: "$full"`, only the fields needed                                                          | the globals object |
| `Utils → Render Template` | `{ template, data }`    | `@directus-labs/liquidjs-operation` (uses `{# #}` for output tags, since `{{ }}` belongs to flows), or Run Script for simple string replacement | `{ html }`         |
| `Utils → Send Email`      | `{ to, subject, html }` | `mail` with `type: "wysiwyg"`, `to: ["{{ $trigger.to }}"]`                                                                                      | `{ ok }`           |
| `Utils → Post to Slack`   | `{ text }`              | `request` to an incoming webhook URL from `$env`, reject branch returns `{ ok: false }`                                                         | `{ ok, status }`   |

Chain them: a form-notification flow reads the form, calls Render Template, then calls Send Email with the result.
`mail` returns before delivery, so `Send Email` can only report that the send was queued.

## Loops

Flows have no loop operation. To run steps once per item, make the steps a utility flow and pass an **array** as the
`trigger` operation's `payload`. The child runs once per element, with that element as `$trigger`. The result is an
array of the children's return values, in input order.

```json
[
	{ "key": "subscribers", "type": "item-read", "options": { "collection": "subscribers",
		"query": { "filter": { "active": { "_eq": true } }, "fields": ["email", "name"], "limit": -1 } } },
	{ "key": "send_each", "type": "trigger", "options": { "flow": "<utils-send-welcome-uuid>",
		"payload": "{{ subscribers }}", "iterationMode": "batch", "batchSize": 10 } }
]
```

| `iterationMode`                   | Runs                                         | Use for                                         |
| --------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| `parallel` (default)              | all children at once                         | a few items, cheap work                         |
| `batch` (`batchSize`, default 10) | groups in parallel, groups one after another | email, external APIs, anything rate limited     |
| `serial`                          | one at a time                                | order matters, or each step depends on the last |

- **Don't loop when one write will do.** `item-create` takes an array payload, and `item-update` takes an array of
  objects that each include the primary key. Loop only when each item needs its own branch, request, or email.
- **Shape the array first.** If each child needs more than the raw item, map it in Run Script and pass that key:
  `return data.subscribers.map((s) => ({ to: s.email, name: s.name, site: data.globals.site_name }))`.
- **Long loops block the caller.** A webhook or manual flow waits for every child. Set `async: true` on the trigger, or
  start the loop from an action event or schedule.
- **Results are all in memory.** For thousands of items, page through with a schedule (`limit` + a "processed" flag)
  instead of one huge array.
- **A flow can trigger itself.** That's recursion with no depth limit. Don't.

## Licensing

On the core tier, five **active** flows is the limit, and every utility counts. Creating or activating a flow past the
limit fails with `LIMIT_EXCEEDED`; inactive flows are free but a parent can't call them. On a core-tier project:

- Inline steps that only one flow uses. A utility earns its slot when two or more flows call it, or when it's a loop body.
- Merge related event flows: one `items.update` flow over several `collections`, branching on `$trigger.collection`.

## Testing a utility

`trigger-flow` and `POST /flows/trigger/<id>` can't run a utility. Add a temporary manual flow with one `trigger`
operation that calls it with a fixed payload, run that, [read the log](building-and-debugging.md#reading-flow-logs),
then delete the wrapper (it uses a license slot).

## Sources

- https://github.com/directus/directus/blob/v12.5.1/api/src/operations/trigger/index.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/flows.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/flows.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/license/entitlements/lib/flows.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/ai/tools/flows/prompt.md
- https://github.com/directus/directus/blob/v12.5.1/api/src/ai/tools/trigger-flow/index.ts
- https://github.com/directus-labs/starters/blob/main/cms/directus/template/src/flows.json
- https://github.com/directus-labs/starters/blob/main/cms/directus/template/src/operations.json
- https://github.com/directus-labs/extensions/tree/main/packages/liquidjs-operation
- https://directus.com/docs/guides/flows/operations
