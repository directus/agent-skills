---
name: directus-flows
description: "Use when automating Directus with Flows: event, webhook, schedule, and manual triggers, the data chain and {{ }} templates, operations (condition, item CRUD, Run Script, request, mail), reusable utility flows and loops, and building or debugging flows over the API or MCP. Not for hook or operation extensions (directus-extensions) or promoting flows (directus-environment-sync)."
metadata:
  author: directus
  directus-version: '12.6.0'
---

# Directus Flows

Flows are Directus's built-in automation: one trigger, then a chain of operations that share a data chain. Build them in
the Studio, over REST (`/flows`, `/operations`), or with the MCP `flows` and `operations` tools (admin only).

## First checks

1. **Check the version before anything else.** `GET /server/info` with a token returns `data.version`. Not 12.6? Read
   the version notes for its major in the `directus` skill (`references/versions-v<major>.md`) first.
2. **Read what exists.** `GET /flows?fields=id,name,status,trigger,options,operation&limit=-1`. Reuse or extend an
   existing utility flow before building a new one.
3. **Check the license.** Active flows count toward the core-tier limit (`GET /license`), and that includes every
   utility flow. Inactive flows don't count. See
   [utility-flows-and-loops.md](references/utility-flows-and-loops.md#licensing).
4. **Ask where it's hosted** before suggesting a hook instead. Directus Cloud runs custom extensions only on Enterprise.
5. **Confirm before changing a flow that's already active.** Event flows fire on real writes as soon as they're saved.

## Critical traps

- **There's no loop operation.** To run steps per item, put them in a child flow (`trigger: "operation"`) and call it
  with a `trigger` operation whose `payload` is an array. Default `iterationMode` is `parallel`: use `batch` or `serial`
  for mail or external APIs. Bulk writes don't need a loop: `item-create` and `item-update` take arrays.
- **A child flow's `$trigger` is the payload itself**, not `$trigger.body`. Only webhook and manual flows wrap input in
  `body`.
- **Child failures don't fail the parent.** The parent's `trigger` operation resolves with whatever the child returns
  (`null` if the child is inactive, missing, or has no `return` set). Return a status from the child and check it with a `condition`.
- **`mail` doesn't fail on delivery.** It queues the send and resolves; SMTP errors only reach the server log (it
  rejects only when the flow mail rate limit is on and spent). `to` with
  several addresses sends one email everyone can see. Loop for one email per person.
- **`request` rejects on non-2xx** with `{ status, statusText, headers, data }`. Network errors and timeouts reject
  with no `status`.
- **Item operations default to `emitEvents: false`.** Writes from a flow don't fire other flows or hooks unless you turn
  it on. Turning it on in a flow that listens to the same collection loops forever.
- **Permissions follow the trigger.** `permissions: "$trigger"` (the default) uses the caller: public for an anonymous
  webhook, nobody (no checks) for a schedule. Pick `$full` or a role on purpose.
- **In a filter event flow, a final reject cancels the save.** A `condition` that doesn't match is a reject. Link every
  "nothing to do" branch to a `log` operation so the write still goes through.
- **To block a save with a clear error, end the branch with `throw-error`** (`status: "400"`, your `code` and
  `message`). A throw in Run Script reaches the caller as a 500; a failed `condition` as a generic 400.
  `throw-error` needs 11.10.1+. Older versions: compute the check in Run Script and return a flag (`{ ok: false }`),
  then end on a `condition` over that flag. It fails with a 400. Don't throw from Run Script: that's a 500.
- **Event scopes need `collections`.** `items.create` with no `collections` registers nothing, silently.
- **The MCP `trigger-flow` tool runs only active `manual` flows.** Its prompt says otherwise. Test a utility flow
  through a parent flow or a temporary manual wrapper.

## Routing

| Load when                                                                                               | Reference                                                                      |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Picking a trigger, event scopes, filter vs action, return values, `$trigger` shapes, the data chain     | [references/triggers-and-data-chain.md](references/triggers-and-data-chain.md) |
| Configuring an operation: condition, item CRUD, Run Script, request, mail, trigger, errors              | [references/operations.md](references/operations.md)                           |
| Reusable utility flows, loops, iteration modes, render and send patterns, flow limits                   | [references/utility-flows-and-loops.md](references/utility-flows-and-loops.md) |
| Creating flows over REST or MCP, linking operations, running, reading flow logs, debugging              | [references/building-and-debugging.md](references/building-and-debugging.md)   |
| Ready-made flows: slug on create, notify on publish, form emails, redirects, nightly jobs; flow vs hook | [references/recipes.md](references/recipes.md)                                 |

## Related skills

`directus` (REST, filters, MCP setup) · `directus-extensions` (hooks, endpoints, custom operations) ·
`directus-access-control` (who can trigger a manual flow, licensing) · `directus-environment-sync` (move flows between
instances)

## Go deeper

1. Directus docs MCP server: `https://directus.com/docs/mcp` (`search-docs`, `get-doc`, `search-directus-code`).
2. Raw docs: https://directus.com/docs/raw/guides/flows.md (and `guides/flows/triggers.md`, `data-chain.md`,
   `operations.md`). Index: https://directus.com/docs/llms.txt
3. The instance: flow logs (`GET /revisions` on `directus_flows`), server logs for `log` and Run Script `console.log`,
   and `GET /flows/<id>?fields=*,operations.*` for how a working flow is wired.
