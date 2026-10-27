# Recipes

Common access patterns, each a small policy you attach to a role or user ([cms-starter-blueprint.md](cms-starter-blueprint.md)).
Rows marked **licensed** need a license on v12; on the core tier, see
[licensing.md](licensing.md#designing-for-the-core-tier).

## Contents

- [Public read of published content](#public-read-of-published-content)
- [Authors edit their own items](#authors-edit-their-own-items)
- [Editors](#editors)
- [Live preview and drafts](#live-preview-and-drafts)
- [Write-only form submissions](#write-only-form-submissions)
- [API and integration service users](#api-and-integration-service-users)
- [AI agent and MCP users](#ai-agent-and-mcp-users)
- [Letting a role invite users](#letting-a-role-invite-users)

## Public read of published content

**House rule: keep the content API private.** For a content site, the frontend's server talks to Directus with a
server token (the backend-for-frontend pattern: Next.js route handlers, Nuxt server routes, Astro endpoints, SvelteKit
`+server` files), and the browser never calls Directus for data. Then the public policy needs no content collections
at all, only assets. Use the rows below only when browsers must call Directus directly, and even then expose the
fewest collections and fields that page needs.

**Assets are the exception:** serve them straight from Directus `/assets` so image bytes don't flow through (and get
billed on) the frontend server. That needs public read on `directus_files`, scoped to the `public` folder below.

Attach to the public policy. **Licensed** for the filters.

Every row applies the full publication predicate (`status` is `published` and `published_at <= $NOW`) to the page
the row hangs off. A block rule that checks only `status` leaks blocks of pages scheduled for the future.

| Collection                   | Action | Item rule                                                                                                                                                                 | Fields                           |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `pages`, `posts`             | read   | `{"_and":[{"status":{"_eq":"published"}},{"published_at":{"_lte":"$NOW"}}]}`                                                                                              | `*`                              |
| `page_blocks`                | read   | `{"page":{"_and":[{"status":{"_eq":"published"}},{"published_at":{"_lte":"$NOW"}}]}}`                                                                                     | `*`                              |
| each block in the M2A        | read   | `{"$FOLLOW(page_blocks,item,collection)":{"page":{"_and":[{"status":{"_eq":"published"}},{"published_at":{"_lte":"$NOW"}}]}}}`                                            | `*`                              |
| child of a block (M2O to it) | read   | e.g. on `block_pricing_cards`: `{"pricing":{"$FOLLOW(page_blocks,item,collection)":{"page":{"_and":[{"status":{"_eq":"published"}},{"published_at":{"_lte":"$NOW"}}]}}}}` | `*`                              |
| `directus_files`             | read   | `{"_or":[{"folder":{"_eq":"<public-folder-id>"}},{"folder":{"parent":{"_eq":"<public-folder-id>"}}}]}`                                                         | `id,title,description,type,filesize,width,height` |
| `directus_users`             | read   | `{"posts":{"_nnull":true}}` (authors only)                                                                                                                                | `id,first_name,last_name,avatar` |

- **Block collections leak without their own rule.** Filtering `page_blocks` hides the link, not the block:
  `GET /items/block_hero/<id>` still answers. An unfiltered public read on a block collection (the CMS starter ships
  this, licensed variant included) exposes every block of every draft page to anyone who has or guesses the id.
  `$FOLLOW(<junction>,<item field>,<collection field>)` filters a block by the many-to-any rows that point at it. It is
  the same form Directus builds for Shares, so it's supported in item rules, but test it on your schema.
- **Test with no token**, including both leaks. `GET /items/block_hero/<id>` must return 403 for a block on a draft
  page and for a block on a published page whose `published_at` is in the future. `GET /items/pages?filter[id][_eq]=<id>`
  for the scheduled page must return no rows.
- **On core** (no item rules) every block row the public can read is public. Keep unreleased page content in a content
  version instead of a draft page: version edits live in `directus_versions` and don't create block rows until
  promote.
- Every collection the frontend reaches through a relation needs its own read row, or the request 403s.
- **Public files live in one folder.** **House rule:** a top-level folder named `public`, with subfolders at most two
  levels deep (`public/blog`, `public/pages`). The rule above covers `public` and its direct children; add a
  `{"folder":{"parent":{"parent":{"_eq":...}}}}` branch only if you really need a second level. Match the folder by
  id, not name. Point every public-facing file field at it (content-modeling `relationships.md#files`), or editors
  upload to the root and the image 403s on the live site.
- **Limit file fields.** `*` exposes `uploaded_by`, `filename_disk`, and `metadata` (photo EXIF, which can include GPS).
  `/assets` serves the file with the short field list above.
- Never grant public read on `directus_files` without the folder rule: it opens `/assets` for every file, including
  exports saved to the File Library. Never grant public create, update, or delete on a `directus_*` collection.
- **On core** neither the folder rule nor the field list is allowed, so public file read means **every** file. Do it
  only if nothing private ever goes in the File Library (no form uploads, exports, or internal docs). Otherwise
  proxy assets through the frontend server, or license the instance.

## Authors edit their own items

Needs an owner field (`author` M2O to users, or `user_created`). **Licensed.**

| Collection       | Action         | Item rule                                 | Validation                        | Presets                      |
| ---------------- | -------------- | ----------------------------------------- | --------------------------------- | ---------------------------- |
| `posts`          | create         | -                                         | `{"status":{"_neq":"published"}}` | `{"author":"$CURRENT_USER"}` |
| `posts`          | read           | `{"author":{"_eq":"$CURRENT_USER"}}`      | -                                 | -                            |
| `posts`          | update         | `{"author":{"_eq":"$CURRENT_USER"}}`      | `{"status":{"_neq":"published"}}` | -                            |
| `directus_files` | update, delete | `{"uploaded_by":{"_eq":"$CURRENT_USER"}}` | -                                 | -                            |

- To stop authors reassigning `author`, leave it out of the create and update `fields` list; the preset still sets it.
- Add the public policy to the same role if authors should also see published posts by others. The read rules OR
  together.

## Editors

One "manage" policy with full CRUD on content collections, blocks, junctions, files, and folders. No item rules, so it
works on core. Pair with a separate app-access policy so seats stay explicit. For versioned collections add:

| Collection           | Actions                      | Notes                                                      |
| -------------------- | ---------------------------- | ---------------------------------------------------------- |
| `directus_versions`  | read, create, update, delete | All fields, no item rules (a rule on update blocks saving) |
| `directus_revisions` | read                         | Licensed: scope with `{"collection":{"_in":[...]}}`        |

## Live preview and drafts

- A dedicated API-only user (no app access, no seat) with a static token, used only server-side by the frontend.
- Policy: read on the previewed collections and their blocks, plus read on `directus_versions` to load drafts.
- `directus_versions` and `directus_revisions` hold full item snapshots and bypass the source collection's read rules.
  Never give them to the public policy.
- Frontend wiring is the `directus-visual-editing` skill.

## Write-only form submissions

The starter's `Forms - Submission` pattern, attached directly to an API-only "Frontend Bot" user whose token stays on
the server.

| Collection                                   | Action | Fields | Licensed extras                                                                      |
| -------------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------------ |
| `form_submissions`, `form_submission_values` | create | `*`    | -                                                                                    |
| `form_submissions`, `form_submission_values` | read   | `id`   | Field list is licensed. On core, read is all fields, or leave it off                 |
| `directus_files`                             | create | `*`    | Preset `{"folder":"<uploads-folder>"}`, validation `{"filesize":{"_lte":"5000000"}}` |

- Without read, a create returns 204 with no body. Granting read on `id` lets the caller get the new key back.
- **House rule:** don't give the public policy create on submissions or files. Proxy through a server route with the
  bot token.

## API and integration service users

- One user per integration, named for it. No `app_access` (API-only users don't use a seat).
- Static token: `PATCH /users/<id>` with `{"token": "<random>"}` (`GET /utils/random/string` makes one). Static tokens
  don't expire; rotate them by setting a new value.
- Attach the integration's policy straight to the user, or give it a dedicated role. A user with **no role also gets
  the public policy**. That's usually fine. If not, give it a role.
- Use `ip_access` on the policy when the integration has fixed egress IPs.

## AI agent and MCP users

- A dedicated user per agent or MCP client, never a personal admin. Tool calls run as that user. MCP OAuth tokens act
  as the approving user, with that user's policies.
- Content work: create, read, update on the collections it needs, files if needed, no delete, no system collections.
  Analysis: read only.
- Schema and flow work (the admin-only MCP tools) needs an admin user. Decide that per task and keep it separate from
  the everyday content agent.

## Letting a role invite users

- Create on `directus_users` with a preset that locks `role` to a specific non-admin role, and `role` and `policies` left
  out of the allowed fields. **Licensed.**
- Unrestricted create or update on `directus_users`, `directus_roles`, `directus_policies`, `directus_access`, or
  `directus_permissions` is a privilege escalation path: the holder can make themselves admin.

## Sources

- https://directus.com/docs/guides/auth/access-control
- https://directus.com/docs/guides/security/best-practices
- https://directus.com/docs/guides/content/content-versioning
- https://directus.com/docs/guides/content/live-preview
- https://directus.com/docs/guides/ai/mcp/security
- https://directus.com/docs/guides/ai/mcp/troubleshooting
- https://directus.com/docs/guides/environment-sync/secrets-and-limitations
- https://directus.com/docs/licensing/overview
- https://github.com/directus/directus/blob/v12.5.1/api/src/ai/mcp/server.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/ai/tools/items/index.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/ai/tools/collections/index.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/lib/fetch-policies.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/utils/get-permissions-for-share.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/utils/shared/get-relation-info.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/versions.ts
- https://directus.com/docs/guides/connect/filter-rules
- https://github.com/directus-labs/starters/tree/main/_shared/rbac/licensed/modules
- https://github.com/directus-labs/starters/tree/main/cms/directus/template/src
