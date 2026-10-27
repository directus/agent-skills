# Applying and testing access

Create roles, policies, permissions, and attachments over REST, promote them between instances, and prove they do what
you meant.

## Contents

- [Create with REST](#create-with-rest)
- [Change and remove](#change-and-remove)
- [Promote between instances](#promote-between-instances)
- [Test as the user](#test-as-the-user)
- [Reading failures](#reading-failures)

## Create with REST

Use an admin token. MCP can't do this; use REST, `@directus/sdk` (`createPolicy`, `createPermissions`, `createRole`),
the Studio (**Settings → Access Policies**, **Settings → User Roles**), or Environment Sync.

Order: policy, then its permissions, then attach it to roles or users. Look up existing ids first
(`GET /policies?fields=id,name`, `GET /roles?fields=id,name,parent`) so you don't create duplicates.

```bash
# 1. Policy
curl -X POST "$DIRECTUS_URL/policies" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Content - Self","icon":"self_improvement","description":"Edit own posts","app_access":false,"admin_access":false}'

# 2. Permissions (array = batch). Always send "fields".
curl -X POST "$DIRECTUS_URL/permissions" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '[
    {"policy":"<policy-id>","collection":"posts","action":"read","fields":["*"],
     "permissions":{"author":{"_eq":"$CURRENT_USER"}}},
    {"policy":"<policy-id>","collection":"posts","action":"create",
     "fields":["title","slug","description","content","image","seo","status","published_at"],
     "presets":{"author":"$CURRENT_USER"},"validation":{"status":{"_neq":"published"}}},
    {"policy":"<policy-id>","collection":"posts","action":"update",
     "fields":["title","slug","description","content","image","seo","status","published_at"],
     "permissions":{"_and":[{"author":{"_eq":"$CURRENT_USER"}},{"status":{"_neq":"published"}}]},
     "validation":{"status":{"_neq":"published"}}}
  ]'

# 3. Role, then attach the policy to it (or to a user with "user" instead of "role")
curl -X POST "$DIRECTUS_URL/roles" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Writer","icon":"docs_add_on","parent":null}'
curl -X POST "$DIRECTUS_URL/access" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"role":"<role-id>","policy":"<policy-id>"}'
```

- **Licensed.** Item rules, field lists, presets, and validation are all custom rules. On core every one of these rows
  is refused with `RESOURCE_RESTRICTED`.
- `author` (and `user_created`, `user_updated`) stay out of `fields`. A preset is only a default: if the field is
  writable, the caller can send another user's id. With it excluded, sending `author` returns 403 and the preset sets it.
- The update rule also excludes already-published posts, so a writer can't edit live content. Publishing is an
  editor's job. Field names are the CMS starter's `posts`; use your own.
- **On core there is no way to enforce "own posts" or "can't publish".** Replacing this with `fields: ["*"]` and no
  rules gives every writer read and write on every post, including others' and published ones. Instead: license the
  instance; or give writers no direct `posts` access and route their writes through a server endpoint or flow that sets
  `author` and `status` itself; or accept that every writer can edit every post and only use this for a trusted team.
- To make a policy public, attach it with `{"role": null, "user": null, "policy": "<id>"}`. Assign a user a role with
  `PATCH /users/<id>` and `{"role": "<role-id>"}`.
- Roles and users also accept nested `policies` (an alias over `directus_access`), and policies accept nested
  `permissions`, `roles`, and `users`. A plain array on an existing record replaces the set, so prefer explicit
  `/access` rows when editing.
- Changes clear the permission caches. They apply on the next request.

## Change and remove

- Read the current state first: `GET /permissions?filter[policy][_eq]=<id>&limit=-1`. On an unlicensed instance this
  list hides rows with custom rules.
- `PATCH /permissions/<id>`: on an unlicensed instance include `"fields": ["*"]` in **every** update payload, even if
  you only change something else, or it fails with `RESOURCE_RESTRICTED`.
- Deleting a policy cascades to its permissions and access rows.
- Removing admin access from the last admin, or deleting them, is refused by the user-integrity check.

## Promote between instances

Build access on dev, then move it with Environment Sync (`d6s`; flags, matching, and refusals are in the
`directus-environment-sync` skill). Select `--roles`, which brings policies, access rows, and permissions with it.

- **House rule:** never rename a role or policy in only one environment; they match by name.
- Attachments to users only travel when users are in scope.
- Pulling from an unlicensed source hides custom-rule rows; `mirror` refuses that pull. License the source, or push
  with `merge`.
- **House rule:** run it as a dedicated admin user per instance, with its own static token (the CLI refuses non-admin
  tokens). Keep the sync user out of synced users, or include it on purpose (a `mirror` push can delete the account it
  runs as).

## Test as the user

Never test with an admin token: admins bypass everything. Log in as a real user in the role, or give a throwaway test
user the same role and a static token.

```bash
curl "$DIRECTUS_URL/users/me?fields=id,email,role.name,policies.policy.name" -H "Authorization: Bearer $USER_TOKEN"
curl "$DIRECTUS_URL/policies/me/globals" -H "Authorization: Bearer $USER_TOKEN"   # admin_access, app_access, enforce_tfa
# Effective permissions per collection and action: access full | partial (some permission has an item rule) | none,
# union of fields, merged presets
curl "$DIRECTUS_URL/permissions/me" -H "Authorization: Bearer $USER_TOKEN"
# Can this user update / delete / share this item? (also returns update fields and presets for singletons)
curl "$DIRECTUS_URL/permissions/me/posts/<id>" -H "Authorization: Bearer $USER_TOKEN"
# Public: no token at all
curl "$DIRECTUS_URL/items/posts?fields=id,status"; curl "$DIRECTUS_URL/files"
```

`/permissions/me` and `/roles/me` need an authenticated user; they return 403 for anonymous requests.

Checklist per role:

1. Every collection the role should read returns rows, and only the right rows (count them against an admin read).
   Each forbidden collection returns 403. `fields=*` responses don't contain fields the role shouldn't see.
2. Each allowed write succeeds, and each disallowed write (wrong owner, forbidden field, invalid value) fails with the
   expected error.
3. The public checks above return only public data.

## Reading failures

| Symptom                                                 | Likely cause                                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 403 "...for collection X or it does not exist"          | No policy grants that action, the collection name is wrong, or (unlicensed) the row has a custom rule       |
| 403 naming a field                                      | Field not in any allowed list (explicitly requested, written, filtered, or sorted)                          |
| 403 on a nested `fields` path                           | No read permission on the related collection; fails the whole request                                       |
| 200 with fewer rows than expected                       | Item rule filtering (a single item by key outside the rule is a 403). Check the rule and its variables      |
| 200, fields missing from a `fields=*` response          | Partial field list; forbidden fields are dropped silently                                                   |
| Field is `null` on some rows                            | Another policy grants the field only for rows matching its own rule                                         |
| 204 on create or update                                 | Write allowed, read not. Grant read (even just `id`)                                                        |
| 400 `FAILED_VALIDATION`                                 | A permission validation rule (from any policy) or field validation failed                                   |
| 403 `RESOURCE_RESTRICTED` on saving a permission        | Unlicensed instance and the row has a custom rule, or `fields: ["*"]` missing from the payload              |
| Works from one network, not another                     | `ip_access` on a policy, which drops the whole policy for other IPs. Behind a proxy, check `IP_TRUST_PROXY` |
| Editor can't create or save a draft, or publish         | No read/create/update on `directus_versions`, or no update on the versioned collection                      |
| 403 `RESOURCE_RESTRICTED` on `/items`, `/files`, login  | Instance locked down over core limits, not a permission. See [licensing.md](licensing.md)                   |
| `/permissions/me` looks right but a request still fails | Update/delete by query needs read on the filtered fields; filters and sorts check read permissions          |

## Sources

- https://directus.com/docs/guides/auth/access-control
- https://directus.com/docs/guides/security/best-practices
- https://directus.com/docs/guides/environment-sync/reference
- https://directus.com/docs/guides/environment-sync/secrets-and-limitations
- https://directus.com/docs/guides/ai/mcp/troubleshooting
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/permissions.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/policies.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/roles.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/access.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/permissions.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/policies.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/access.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/roles.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/items/index.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/system-data/src/relations/relations.yaml
- https://github.com/directus/directus/blob/v12.6.0/sdk/src/rest/commands/create/policies.ts
