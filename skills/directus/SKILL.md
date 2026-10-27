---
name: directus
description: "Use when calling a running Directus instance over REST, GraphQL, WebSockets, or /mcp: reading and writing items, filters and relations, auth, error codes, slow queries and caching, files, content versions, import and export, revisions, signup, AI settings, and older Directus versions. Also for an unexplained 403 or 400, or calling Directus from Python or PHP. Other directus-* skills own SDK code, schema, permissions, Flows, and hosting."
metadata:
  author: directus
  directus-version: '12.6.0'
---

# Directus

Work with a running Directus instance over REST, GraphQL, WebSockets, or the built-in MCP server. Read the traps, then
load the reference that matches the task.

_Verified against Directus v12.6.0. If the instance behaves differently, trust the instance and its error messages._

## First checks

1. **Check the version before anything else.** `GET /server/info` with a token returns `data.version`. Older than
   12.6: read the notes for its major first: [v9](references/versions-v9.md), [v10](references/versions-v10.md),
   [v11](references/versions-v11.md), [12.0 to 12.5](references/versions-v12.md). Newer: read the release notes since
   12.6.0 first.
2. **Which instance, which credential.** `GET /users/me?fields=id,email,role` proves the token works. `GET /server/info`
   with a token also returns the version, query limits, and WebSocket and upload settings.
3. **Discover the schema before touching data.** MCP: `schema` with no args, then `schema` with `keys` for the
   collections you need. REST: `GET /collections`, `GET /fields/<collection>`, `GET /relations/<collection>`. Never
   guess field names.
4. **Check what the token can do.** `GET /permissions/me`. A 403 often means "missing permission or the field/collection
   doesn't exist", not a bug.
5. **Changing access?** Use `directus-access-control`. On the unlicensed core tier, permission rows with custom rules
   are dropped, so the action is denied.

## Critical traps

- **Send `fields` on every read.** Relations come back as bare keys unless you ask: `fields=title,author.name`. `*.*` is
  slow and leaks more than you need. Many-to-any needs per-collection syntax:
  `fields=blocks.item:block_hero.*,blocks.item:block_text.content`.
- **Permissions filter silently.** Item rules drop rows without error, and `*` drops fields you can't read. But an
  explicitly requested forbidden or misspelled field returns **403 FORBIDDEN** ("...or it does not exist"). A missing
  item also returns 403, never 404.
- **Top-level `filter` narrows parents; `deep[rel][_filter]` narrows nested rows.** Use both when you need both.
  `_some`/`_none` work on one-to-many, many-to-many, and many-to-any fields, as the top-level key on the alias
  field.
- **Array writes to to-many fields replace the set, and many-to-many arrays hold junction rows.** In `{"tags": [1, 2]}`
  the ids are junction row ids (`post_tags`), not tag ids. Re-sending `[{"tag": 12}]` for a tag that's already linked
  adds a second junction row and orphans the old one. To add or remove a few, use
  `{"tags": {"create": [{"tag": 12}], "delete": [<junction-id>]}}`. Junction field names vary: read them from the schema
  ([rest-api.md](references/rest-api.md#relational-writes)).
- **`/items/directus_*` is refused**: 403 over REST, 400 `INVALID_PAYLOAD` from the MCP `items` tool. Use the system
  endpoints (`/users`, `/files`, `/roles`, `/policies`, `/permissions`, `/flows`).
- **Writes can succeed with an empty body.** If the token can write but not read the result, create and update
  return 204. Read back with the same key to verify.
- **Versioned collections:** `?version=draft` on a single item with no saved draft returns 403, and a list with
  `?version=draft` returns only items that have a draft. Fall back to the published read.
- **Confirm destructive or bulk changes.** Ask before deletes, dropping or renaming a collection or field, changing a
  field's type, flow changes, bulk updates (say how many items), or when intent is ambiguous. For additive schema
  changes the user asked for, show the plan and proceed. Routine writes the user asked for need no second confirmation.
  Delete by explicit keys, never by an open query.
- **Diagnose failures, don't loop.** Read `extensions.code` and the message, re-check the schema and
  `GET /permissions/me`, fix the cause, then retry. Still stuck, tell the user what you tried and ask.

## Ground rules for agents

- One line per confirmation ("Created item 12 in `posts`"). Show the item URL when a tool returns one.
- Don't guess intent or values; ask. Check for an existing item before creating, so you don't make duplicates.
- In rich-text fields write plain semantic HTML: no classes, ids, or inline styles unless asked.
- Respect publishing workflows: check `status` or the version context before editing published content.

## References

| Load when                                                                                    | Reference                                                            |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Calling REST: endpoints, envelopes, query params, aggregates, relational writes, error codes | [references/rest-api.md](references/rest-api.md)                     |
| Writing filters: operators, dynamic variables, relational and logical filters, functions     | [references/filters.md](references/filters.md)                       |
| Logging in, tokens, cookies, SSO, inspecting a caller                                        | [references/auth-and-access.md](references/auth-and-access.md)       |
| Connecting an AI client to `/mcp`, choosing a tool mode, tool workflow, MCP errors           | [references/mcp.md](references/mcp.md)                               |
| Uploading or importing files, folders, `/assets` transforms and presets                      | [references/files-and-assets.md](references/files-and-assets.md)     |
| WebSockets or GraphQL subscriptions, auth on the socket, CRUD over the socket                | [references/realtime.md](references/realtime.md)                     |
| Versions API: `version` param, save, compare, promote                                        | [references/content-versioning.md](references/content-versioning.md) |
| Using GraphQL instead of REST                                                                | [references/graphql.md](references/graphql.md)                       |
| Slow queries: `fields` and relation cost, limits and paging, counts, `search`, data caching  | [references/performance.md](references/performance.md)               |
| Member signup: `/users/register`, email verification, password reset, invites, seats         | [references/users-and-signup.md](references/users-and-signup.md)     |
| Bulk import (CSV/JSON, `/utils/import`), upsert by slug, export, migrating from another CMS  | [references/import-and-export.md](references/import-and-export.md)   |
| Activity log, revisions, who changed what, reverting, recovering deleted items, retention    | [references/audit-and-restore.md](references/audit-and-restore.md)   |
| AI Assistant, AI Translations, provider keys, which AI features need a license               | [references/ai-settings.md](references/ai-settings.md)               |

**Related skills:** `directus-flows`, `directus-insights`, `directus-access-control`, `directus-content-modeling`, `directus-sdk`,
`directus-visual-editing`, `directus-extensions`, `directus-environment-sync` (promoting schema and config with `d6s`),
`directus-self-hosting`, `directus-upgrade`.

## Go deeper

1. Directus docs MCP server: `https://directus.com/docs/mcp` (no auth; tools `search-docs`, `get-doc`, `list-docs`,
   `search-directus-code`, `get-directus-file`).
2. Raw markdown for any docs page: `https://directus.com/docs/raw/<path>.md`. Index:
   `https://directus.com/docs/llms.txt`.
3. The instance itself: its error messages, `GET /server/info`, `GET /server/specs/oas` (OpenAPI for this instance's
   schema), and the schema endpoints above.
