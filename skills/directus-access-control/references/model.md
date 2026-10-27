# The access model

Users, roles, policies, permissions, the `directus_access` junction, and how Directus combines several policies into one
answer for a request. Full docs: https://directus.com/docs/guides/auth/access-control.

## Contents

- [The pieces](#the-pieces)
- [Which policies apply to a request](#which-policies-apply-to-a-request)
- [Policy flags](#policy-flags)
- [The public policy](#the-public-policy)
- [How stacked policies combine](#how-stacked-policies-combine)
- [Automatic Studio permissions](#automatic-studio-permissions)

## The pieces

| Collection             | What it holds                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `directus_users`       | `role` (optional, one), `policies` (alias over `directus_access`), `status` (only `active` can authenticate), `token` (static token)                                          |
| `directus_roles`       | `name`, `parent` (optional), `children`, `policies` (alias over `directus_access`), `users`. Roles group people; they carry no rules themselves                               |
| `directus_policies`    | `name`, `admin_access`, `app_access`, `ip_access`, `enforce_tfa`, plus aliases `permissions`, `roles`, `users`                                                                |
| `directus_access`      | One row per attachment: `policy` + `role`, or `policy` + `user`, or `policy` with both null (the public policy). `sort` orders policies on the role or user                   |
| `directus_permissions` | One row per `policy` + `collection` + `action`. Actions: `create`, `read`, `update`, `delete`, `share`. Optional `permissions` (item rule), `fields`, `validation`, `presets` |

**Role nesting.** A role or user can have any number of policies, and one policy can attach to many. A user gets the policies of their role and of every ancestor up to the root. A role can't be its own
parent or the parent of an ancestor (`InvalidPayloadError`). Deleting a role sets its children's `parent` to null.

## Which policies apply to a request

Directus collects `directus_access` rows (source: `fetch-policies.ts`):

1. Rows for the user's role and all its ancestor roles.
2. Rows attached directly to the user.
3. **A user with no role gets the public policy rows** in place of role rows, plus their own direct rows.
4. Rows whose policy has an `ip_access` list are dropped when the request IP isn't in the list, or is unknown.

Order: parent role policies, child role policies, then user policies. Order matters only for presets (later wins).
`$CURRENT_ROLE` is the user's own role, `$CURRENT_ROLES` the role plus all ancestors, `$CURRENT_POLICIES` the
IP-filtered policy list.

## Policy flags

| Flag           | Effect                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin_access` | Bypasses every permission check. If any applied policy has it, the user is an admin. A Studio seat                                                                        |
| `app_access`   | Lets the user into the Studio and adds the [automatic Studio permissions](#automatic-studio-permissions). If any applied policy has it, the user has it. A Studio seat    |
| `ip_access`    | Allowlist of IPs, full-address ranges (`10.0.0.1-10.0.0.50`), or CIDR blocks. No wildcards, netmasks, or short ranges. Empty or null means any IP. Subtractive: see above |
| `enforce_tfa`  | If any applied policy has it, the login token carries `enforce_tfa` and the Studio sends users without 2FA to set it up. IP-filtered policies don't count                 |

- `enforce_tfa` is set at login only. No API middleware checks it (only the Studio router does), and static tokens
  never go through login. It doesn't protect API access.
- `ip_access` matches the IP Directus sees. Behind a proxy or load balancer that's the proxy's IP unless
  `IP_TRUST_PROXY` is set (default `false` on v12). Set it to your proxy setup (`true` or a specific trust value) or
  policies with `ip_access` drop for real clients (and match anyone, if you allowlisted the proxy).
- Changing `admin_access` or `app_access` runs user-integrity checks (seat limits, at least one remaining admin).

## The public policy

- Requests with no valid token run as every policy attached through an access row with `role = null` and
  `user = null`. New projects have one, **Public**, id `abf8a154-5b1c-4a46-ac9c-7300570f4f17`, all permissions off.
- The Studio shows it under **Settings → User Roles → Public**. You can attach more policies there; each is just as
  public.
- Every public permission is world-readable (or world-writable for create, update, delete). Unfiltered read on a
  collection exposes every row, drafts included.

List what is public, as an admin:

```http
GET /access?filter[role][_null]=true&filter[user][_null]=true&fields=policy
GET /permissions?filter[policy][_in]=<policy-id-1>,<policy-id-2>
```

## How stacked policies combine

A user starts with nothing. Policies only add, with two exceptions: IP allowlists remove whole policies, and validation
rules on writes all have to pass.

| Aspect                  | How it combines                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collections and actions | Union. Any policy granting `read` on `posts` grants it                                                                                                                                                                          |
| Item rules (reads)      | Each permission row is a separate case: its item rule paired with its field list. A row is returned if any case matches. Effectively an OR. An empty rule (`{}` or null) matches every row                                      |
| Fields (reads)          | Per row: a field is returned only if a case that grants that field matches that row. Otherwise the field comes back as `null`. Treat `null` as "maybe hidden"                                                                   |
| Fields (writes)         | Union of `fields` across every permission for that collection + action, regardless of item rules. Sending a field outside the union is a 403                                                                                    |
| Item rules (writes)     | Update, delete, and share check the targeted keys against the action's item rules (OR across policies). Any key that fails means 403 for the whole request                                                                      |
| Validation (writes)     | **Every** non-empty validation rule from every applied permission for that action must pass, combined with `_and`, together with schema-level field validation. One policy's validation can block a write another policy allows |
| Presets (writes)        | Shallow-merged in policy order (parent role, child role, user), later overrides earlier. The request payload overrides presets for fields the caller is allowed to write                                                        |
| Admin / app flags       | OR                                                                                                                                                                                                                              |

- Don't reason about writes from `api/src/permissions/utils/merge-permissions.ts` (it merges rules with `_or`, `{}`
  wins, and deep-merges presets). At runtime it is only used for shares and the v11 migration; writes use
  `process-payload.ts`, where validation is `_and`.
- Update or delete **by query** first reads the matching keys as the caller, so the caller also needs read access to the
  primary key and to every field used in the filter. Fields used in a filter, sort, or `deep` on any action are checked
  against **read** permissions.

**House rule:** because validation is AND-ed across policies, put validation only in policies that also own the
permission it guards (for example, "can't publish" lives in the Writer's own policy), never in a shared baseline policy.

## Automatic Studio permissions

Users with `app_access` get a fixed set of system permissions added at request time (not rows you manage), for example:
read and edit their own user profile fields, presets, notifications, and comments; read of roles in `$CURRENT_ROLES`;
read of a safe subset of `directus_settings` fields; and read of `directus_translations`. API-only users get none of these.

The Studio's **recommended** permissions (comments, files, dashboards, panels, folders, users, roles, shares, manual
flows) are a separate list you can add with one click. Rows that exactly match them are allowed on the core tier. See
[licensing.md](licensing.md#what-counts-as-a-custom-rule).

## Sources

- https://directus.com/docs/guides/auth/access-control
- https://directus.com/docs/guides/auth/2fa
- https://directus.com/docs/guides/security/best-practices
- https://directus.com/docs/licensing/overview
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/lib/fetch-policies.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/utils/filter-policies-by-ip.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/utils/merge-permissions.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/utils/merge-fields.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/modules/process-ast/process-ast.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/modules/process-ast/lib/get-cases.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/modules/process-payload/process-payload.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/modules/validate-access/lib/validate-item-access.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/modules/fetch-accountability-collection-access/fetch-accountability-collection-access.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/modules/fetch-accountability-policy-globals/fetch-accountability-policy-globals.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/policies.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/roles.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/authentication.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/database/migrations/20240806A-permissions-policies.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/utils/node/fetch-roles-tree.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/utils/node/fetch-global-access/fetch-global-access.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/utils/shared/parse-filter.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/system-data/src/app-access-permissions/index.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/system-data/src/app-access-permissions/app-access-permissions.yaml
- https://github.com/directus/directus/blob/v12.5.1/packages/system-data/src/relations/relations.yaml
- https://github.com/directus/directus/blob/v12.5.1/api/src/utils/get-ip-from-req.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/router.ts
- https://directus.com/docs/releases/breaking-changes/version-12
