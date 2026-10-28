---
name: directus-access-control
description: "Use when deciding who can do what in Directus or debugging access: roles, policies, permissions, the public policy, item and field rules, an unexpected 403 or missing field, editors who can't publish, multi-tenant setups, and licensing: license keys, core-tier limits, RESOURCE_RESTRICTED, lockdown. Not for login and tokens (directus) or promoting permissions (directus-environment-sync)."
metadata:
  author: directus
  directus-version: '12.6.0'
---

# Directus access control

Design access as small, focused policies stacked on roles and users. Permissions live on policies, never on roles. Lines
marked **House rule** are Directus's recommended approach; the rest is product behavior.

_Verified against Directus v12.6.0 source (`api/src/permissions`, `api/src/services/permissions.ts`) and the docs._

## First checks

1. **Check the version before anything else.** `GET /server/info` with a token returns `data.version`. Older than
   12.6: read the version notes for its major in the `directus` skill (`references/versions-v<major>.md`), or without
   that skill `https://directus.com/docs/raw/releases/breaking-changes/version-<major>.md`. Newer: read the release
   notes since 12.6.0 first.
2. **Read what exists.** As admin: `GET /roles?fields=id,name,parent,policies.policy.name`,
   `GET /policies?fields=id,name,admin_access,app_access,ip_access`, then
   `GET /permissions?filter[policy][_eq]=<id>&limit=-1` per policy. Extend the existing layout before inventing one.
3. **Check the license.** `GET /license` (admin). Unlicensed v12 can't use item rules, field lists, validation, or
   presets. That decides the whole design. See [licensing.md](references/licensing.md).
4. **List the audiences.** Public visitors, Studio staff by job, API integrations, agents. Each job becomes a policy.
5. **Confirm risky changes.** Show the planned rows before anything that widens public access, touches `directus_*`
   write access, or removes access. Never touch the Administrator policy or the last admin.

## Critical traps

- **Unlicensed custom rules deny, not widen.** On the core tier a row with any rule is hidden from `/permissions` and
  dropped at evaluation: the whole collection + action is denied. Saving one returns 403 `RESOURCE_RESTRICTED`.
- **`fields` must be `["*"]` on core, on every row and every write (delete and share rows too).** Omitted or `null`
  fields count as a custom rule, and a `PATCH` without `"fields": ["*"]` is refused even when you change something
  else. The exception is a row that exactly matches a Studio recommended permission
  ([licensing.md](references/licensing.md#what-counts-as-a-custom-rule)).
- **Policies only add, except validation.** Item rules and fields union (OR) across policies. Validation rules from
  every policy must all pass (AND). IP allowlists drop the whole policy for other IPs; behind a proxy set
  `IP_TRUST_PROXY` (default `false`) or Directus sees the proxy's IP.
- **A field can come back `null`** when one policy grants it only for rows matching its rule. Not empty, hidden.
- **Users with no role get the public policy too.** An API-only user without a role reads everything the public can.
- **Public read with no item rule exposes every row**, drafts included. That includes block collections behind a
  filtered junction: rule them with `$FOLLOW` ([recipes.md](references/recipes.md)). Public read on `directus_files`
  opens `/assets` for every file. Never grant public writes on `directus_*`.
- **Write on `directus_users`, `directus_roles`, `directus_policies`, `directus_access`, or `directus_permissions` is
  admin.** Unscoped update on users lets the holder set anyone's `role` to Administrator.
- **MCP can't manage access.** `items` refuses `directus_*`; schema tools (`collections`, `fields`, `relations`,
  `flows`, `operations`) are admin-only. Use REST as an admin.

## House rules

- **One policy per job, many policies per role.** The CMS starter is the recommended starting layout (one way, not the
  only way): [cms-starter-blueprint.md](references/cms-starter-blueprint.md). Its core template grants public read on
  all users and files and unscoped staff update on users; fix those first.
- Only one policy carries `app_access` (for example `Team - App Access`), so seats are easy to count.
- A dedicated user per integration, agent, and MCP client. A dedicated admin user per instance for Environment Sync and
  automation.
- Test as the user, never with an admin token.

## Routing

- Users, roles, policies, access rows, nesting, flags, public policy, how stacked policies combine → [model.md](references/model.md)
- Writing one permission: item rules, dynamic variables, fields, validation, presets → [permission-rules.md](references/permission-rules.md)
- Core limits, lockdown, `RESOURCE_RESTRICTED`, designing without custom rules, upgrading to licensed → [licensing.md](references/licensing.md)
- Laying out policies and roles for a project, the CMS starter's policies explained → [cms-starter-blueprint.md](references/cms-starter-blueprint.md)
- Public published content, own items, editors, live preview, forms, service users, MCP agents, invites → [recipes.md](references/recipes.md)
- Creating via REST, promoting with Environment Sync, testing as a user, 403 vs filtered results, failures → [applying-and-testing.md](references/applying-and-testing.md)
- One Directus for several sites, brands, or clients: tenant field and policies vs separate projects → [multi-tenancy.md](references/multi-tenancy.md)

## Related skills

`directus` (login, tokens, SSO, querying as a user, error codes) · `directus-environment-sync` (promote access with
`d6s`) · `directus-content-modeling` (owner and status fields your rules depend on) · `directus-visual-editing` (reading
drafts in a frontend) · `directus-sdk` (frontend tokens)

## Go deeper

1. Directus docs MCP server: `https://directus.com/docs/mcp` (no auth; tools `search-docs`, `get-doc`, `list-docs`,
   `search-directus-code`, `get-directus-file`). Permission code lives in `api/src/permissions`.
2. Raw markdown for any docs page: `https://directus.com/docs/raw/<path>.md`, for example
   `https://directus.com/docs/raw/guides/auth/access-control.md`. Index: `https://directus.com/docs/llms.txt`.
3. The instance itself: its error messages, `GET /permissions/me` as the user, `GET /server/info`,
   `GET /server/specs/oas`, and the schema.
