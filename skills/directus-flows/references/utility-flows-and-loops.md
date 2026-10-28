# Utility flows and loops

- [Utility flows](#utility-flows)
- [Loops](#loops)
- [Licensing](#licensing)
- [Testing a utility](#testing-a-utility)

## Utility flows

A utility flow is a small flow with `trigger: "operation"` that other flows call with a `trigger` operation. Use one for
work you'd otherwise copy into several flows (render a template, send an email, read globals), and as the loop body when
you need to run steps per item.

**Recommended:**

- Name them `Utils → <Verb Noun>` (`Utils → Send Email`). Match the project if it already uses a variant (the CMS
  starter writes `Utils -> Duplicate Page`).
- Write the input and output in the flow's `description`: `In: { to, subject, html }. Out: { ok, error }`.
- Keep each one to a single job. Put them in a `Utils` flow folder.
- Return a status object (`{ ok, id }`) from the last operation, not just its result, so callers can branch.

**How the call works:**

```json
{ "type": "trigger", "key": "send", "options": { "flow": "<utility-flow-uuid>", "payload": "{{ build_email }}" } }
```

- The child's `$trigger` is the payload value itself: `{{ $trigger.to }}`, not `{{ $trigger.body.to }}`.
- The child inherits the parent's `$accountability`, so `$trigger` permissions inside it act as the original caller.
- The child's `options.return` (an operation key, `$last`, or `$all`) lands under the parent operation's key:
  `{{ send.ok }}`. No `return`, or an inactive or deleted child (server warning only), means `null`. Utilities must
  stay `active`.

Typical utilities: Get Globals, Render Template (`@directus-labs/liquidjs-operation`, which uses `{# #}` because
`{{ }}` belongs to flows), Send Email, Post to Slack. `mail` returns before delivery, so Send Email can only report the
send was queued. With `RATE_LIMITER_EMAIL_FLOWS_ENABLED=true`, every child shares the calling flow's mail budget
(default 1 per 60 seconds), so a send loop stops after the first email ([operations.md](operations.md#mail)).

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

`iterationMode`: `parallel` (default, all at once), `batch` (`batchSize`, default 10; use for email and external
APIs), or `serial` (one at a time, when order matters).

- **Don't loop when one write will do.** `item-create` takes an array payload, and `item-update` takes an array of
  objects that each include the primary key. Loop only when each item needs its own branch, request, or email.
- **Long loops block the caller.** A webhook or manual flow waits for every child. Set `async: true` on the trigger, or
  start the loop from an action event or schedule.
- **Results are all in memory**, and a flow can trigger itself with no depth limit. For thousands of items, page
  through with a schedule (`limit` + a "processed" flag).

## Licensing

On the core tier, **active** flows are capped (`GET /license` → `entitlements.flows.limit`), and every utility counts. Creating or activating a flow past the
limit fails with `LIMIT_EXCEEDED`; inactive flows are free but a parent can't call them. On a core-tier project:

- Inline steps that only one flow uses. A utility earns its slot when two or more flows call it, or when it's a loop body.
- Merge related event flows: one `items.update` flow over several `collections`, branching on `$trigger.collection`.

## Testing a utility

`trigger-flow` and `POST /flows/trigger/<id>` can't run a utility. Add a temporary manual flow with one `trigger`
operation that calls it with a fixed payload, run that, [read the log](building-and-debugging.md#reading-flow-logs),
then delete the wrapper (it uses a license slot).

## Sources

- https://github.com/directus/directus/blob/v12.6.0/api/src/operations/trigger/index.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/flows.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/flows.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/license/entitlements/lib/flows.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/flows/prompt.md
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/trigger-flow/index.ts
- https://github.com/directus-labs/starters/blob/main/cms/directus/template/src/flows.json
- https://github.com/directus-labs/starters/blob/main/cms/directus/template/src/operations.json
- https://github.com/directus-labs/extensions/tree/main/packages/liquidjs-operation
- https://directus.com/docs/guides/flows/operations
