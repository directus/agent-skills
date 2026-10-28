# Licensing and the core tier

On Directus 12, self-hosted instances without a license run on the **core tier**. This page is the home for licensing
effects: core limits, lockdown, what counts as a custom permission rule, and how to design access that works on core.
Docs: https://directus.com/docs/licensing/overview.

## Contents

- [Core tier limits and lockdown](#core-tier-limits-and-lockdown)
- [What counts as a custom rule](#what-counts-as-a-custom-rule)
- [What happens without a license](#what-happens-without-a-license)
- [Designing for the core tier](#designing-for-the-core-tier)
- [Moving from core to licensed](#moving-from-core-to-licensed)

## Core tier limits and lockdown

These limits ship in the `@directus/license` package and can change without a Directus release. Read the live values
before relying on them: `GET /license` (admin) returns `entitlements` (limits) and `usage` (current counts). Other
skills point here instead of repeating the numbers. As of `@directus/license` 0.6.1 (pinned by 12.5.1 and 12.6.0):

| Entitlement | Core tier | Over the limit or using it |
| --- | --- | --- |
| Seats | 3 | Adding one more throws `LIMIT_EXCEEDED` (403, `extensions.category: "seats"`) |
| Collections | 25 | Same, category `collections`. Junction and translation collections count |
| Flows | 5 | Same, category `flows`. Only active flows count, see below |
| SSO | off | `/auth/login/<provider>` returns 404 `ROUTE_NOT_FOUND`. Any active user with a non-default `provider` is a violation |
| Custom permission rules | off | See [What happens without a license](#what-happens-without-a-license) |
| Custom or self-hosted LLMs | off | Saving one in settings returns 403 `RESOURCE_RESTRICTED` |
| Activity and revision history | 30 days | Reads of `/activity` and `/revisions` only return the last 30 days. Older rows are filtered out, not deleted |

- Flows: a create with no `status` counts as active (the default). A PATCH that sends `status: "active"` is counted
  as adding a flow even if it's already active, so re-sending a full flow object at 5/5 fails. Leave `status` out of
  updates that don't change it.
- Seats count **active** users with at least one policy granting App or Admin Access, whether or not they log in.
  API-only, suspended, and invited users are free.
- **Lockdown.** The instance locks only when its license status is `locked`:
  - **Core tier:** over a countable limit, or with active SSO users, and past the grace period. Grace is 30 days from
    the v12 upgrade migration. Fresh v12 installs (v12 migration within a day of the first migration) get no grace and
    lock as soon as they go over.
  - **Licensed:** over the license's own entitlements locks immediately, with no grace. (A license's grace period only
    covers expiry.)

  When locked, `/items`, `/files`, `/assets`, `/graphql`, `/mcp`, and `/flows/trigger/<id>` return 403
  `RESOURCE_RESTRICTED` with `extensions.category` naming the area (`items`, `files`, `assets`, `graphql`, `mcp`,
  `flows`). Non-admin login and refresh fail the same way with category `login`. WebSocket upgrades get a plain 403.
  Data is never deleted. SSO routes stay reachable while locked (and during the core grace period) so admins can sign
  in and resolve. Custom LLM settings and custom permission rules never lock; custom rules are simply ignored (below).

- The resolution flow (admin, in the Studio) deactivates resources instead of deleting them. Deactivated collections
  return 403 `COLLECTION_INACTIVE`; deactivated users get status `inactive-license`.
- `GET /license` (admin) shows plan, status, and usage.

## What counts as a custom rule

A permission row has a custom rule (source: `custom-permission-rules-enabled.ts`, `hasCustomRule`) when it is not a
built-in system row and any of these is true:

| Condition | Example |
| --- | --- |
| `fields` does not include `"*"`. **This includes `null` and omitted** | `["title", "slug"]`, `null`, key missing |
| `permissions` (item rule) has any key | `{ "status": { "_eq": "published" } }` |
| `validation` has any key | `{ "title": { "_nnull": true } }` |
| `presets` has any key | `{ "author": "$CURRENT_USER" }` |

**Exception:** rows that exactly match one of the Studio's recommended app permissions (same collection, action, item
rule, and fields, with `validation` and `presets` null) are allowed. Even `validation: {}` or `presets: {}` disqualifies
the match. Examples: `directus_files` update with
`uploaded_by = $CURRENT_USER` and the default field list, `directus_users` update on `id = $CURRENT_USER`, manual-flow
read on `directus_flows`. Change anything about them and they become custom.

## What happens without a license

Verified in `api/src/services/permissions.ts` (unchanged through 12.6.0):

| Operation | Result |
| --- | --- |
| Create a permission with a custom rule (REST, batch, nested) | 403 `RESOURCE_RESTRICTED`, category `custom_permission_rules_enabled`. Nothing saved |
| Update a permission, payload without `fields: ["*"]` | 403 `RESOURCE_RESTRICTED`, even if you only changed `action` or `collection`. The check runs on the partial payload, and missing `fields` counts as custom |
| Read `/permissions` | Rows with custom rules are **hidden** |
| Evaluate a request | Rows with custom rules are **dropped**. The whole collection + action grant disappears for that policy. It is denied, not granted without the rule |
| Environment Sync pull from the instance | Hidden rows make the pull incomplete; `mirror` push refuses it |

So a public `read` on `posts` with `status = published` becomes **no public read on posts at all** (403) when the license
lapses. Nothing leaks, but the site breaks. A Writer's "own posts only" rule likewise loses the Writer access to posts
rather than granting all of them.

**Corrections to the v12 breaking-changes docs:**

- They say custom rules "will be ignored". Read that as "the whole row is ignored".
- They say upgraded instances get 30 days before custom rules are ignored. The source disagrees: the permission service
  checks only the entitlement (`custom_permission_rules_enabled`, default `false` on core) and has no grace bypass.
  Grace only delays lockdown, and only SSO has a grace bypass. Plan for custom rules being ignored the moment an
  unlicensed v12 starts.

## Designing for the core tier

Every permission you write on core is "whole collection, all fields, no validation, no presets", sent with
`fields: ["*"]`. Design around that:

- **Split by collection, not by row or field.** If some rows are public and some aren't, they belong in different
  collections, or the private ones live somewhere the public can't reach (for example unpublished drafts in content
  versions, which live in `directus_versions`). Sensitive fields go in a related collection with its own permissions
  (for example `customers` and `customer_private`).
- **Filter in the frontend, knowing it isn't security.** The CMS starter's core template gives the public read on all
  `pages` and `posts` and lets the frontend filter `status = published`. Anyone who calls the API directly sees drafts.
  Accept that only when drafts aren't sensitive.
- **License the instance** when you need "own items only", "can't publish", field-level limits, or forced values.
  The core tier has no permission-level way to express them.
- **Or enforce the rule in a blocking filter Flow** (`items.create` and `items.update`), which runs for every caller,
  Studio and API alike. Reject with a `throw-error` operation (`status: "400"`): a throw in Run Script reaches the caller
  as a 500. Details in `directus-flows`.
- **Omit rather than flatten.** **Recommended:** when a licensed rule exists to narrow a system collection, drop the
  permission on core instead of flattening it to full access. Flattening widens. The CMS starter's core template does
  flatten; the fixes are at the top of [cms-starter-blueprint.md](cms-starter-blueprint.md).

## Moving from core to licensed

- Add the license (`LICENSE_KEY` or **Settings → License**). It needs an absolute `PUBLIC_URL`.
- Rows saved earlier with custom rules are no longer hidden and apply again once the instance is entitled.
- Then tighten: add item rules, field lists, validation, and presets to the flattened rows. The CMS starter ships a
  script for exactly this (`pnpm rbac:sync-licensed`), which PATCHes the licensed rules onto a live instance instead of
  re-applying the template.
- After the license changes, compare `GET /permissions?filter[policy][_eq]=<id>` (as admin) with what you expect.

## Sources

- https://directus.com/docs/licensing/overview
- https://directus.com/docs/releases/breaking-changes/version-12
- https://directus.com/docs/guides/environment-sync/secrets-and-limitations
- https://directus.com/docs/guides/security/best-practices
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/permissions.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/license/entitlements/lib/custom-permission-rules-enabled.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/license/entitlements/lib/custom-permission-rules-enabled.test.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/license/entitlements/manager.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/license/entitlements/lib/sso-enabled.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/license/utils/is-sso-bypass-allowed.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/middleware/is-locked.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/license/utils/compute-license-status.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/license/utils/get-core-grace-expires-at.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/license/entitlements/lib/seats.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/get-history-filter-query.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/auth/utils/check-sso-enabled.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/authentication.ts
- https://www.npmjs.com/package/@directus/license/v/0.6.1
- https://github.com/directus/directus/blob/v12.6.0/api/src/permissions/utils/fetch-raw-permissions.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/users.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/system-data/src/app-access-permissions/index.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/errors/src/errors/resource-restricted.ts
- https://github.com/directus-labs/starters/tree/main/cms/directus/README.md
- https://github.com/directus-labs/starters/tree/main/cms/directus/template/src
- https://github.com/directus-labs/starters/tree/main/_shared/rbac
