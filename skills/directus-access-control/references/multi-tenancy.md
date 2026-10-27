# Multi-tenancy

One Directus serving several sites, brands, or clients. Two shapes: one project with a tenant field on content, or one
project per tenant. Rows marked **licensed** need a license on v12 ([licensing.md](licensing.md)).

## Contents

- [Pick a shape](#pick-a-shape)
- [One project: data model](#one-project-data-model)
- [One project: tenant policies](#one-project-tenant-policies)
- [Separate projects](#separate-projects)

## Pick a shape

| Situation                                                                              | Shape                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| One editorial team publishes to several sites; every editor may see every site         | One project, `site` field, no per-site access. Core OK |
| Each client's editors must see and edit only their own content                         | One project + tenant-scoped policies. **Licensed**     |
| Same need, but on the core tier                                                        | Separate projects                                      |
| Separate databases, backups, admins, extensions, or upgrade timing; a client may leave | Separate projects                                      |
| Tenants need different schemas                                                         | Separate projects                                      |

**On core, one project can't isolate tenants.** Without item rules every grant covers whole collections, so any user
who can edit `pages` can edit every site's pages, and public read on `pages` returns every site's rows. Core limits are
also shared by all tenants: 3 seats and 25 collections per instance. Per-tenant collections (`site_a_pages`) burn the
collection limit (junctions and translations count too) and multiply every policy; don't.

## One project: data model

- A `sites` collection (UUID key, name, domain or handle). **House rule:** one tenant word (`sites`, `brands`,
  `clients`) used everywhere.
- An M2O `site` on each top-level content collection (`pages`, `posts`, `navigation`, `forms`). Make it non-nullable
  (`schema.is_nullable: false`): a create without it then fails validation.
- Children (`page_blocks`, block collections, form fields) reach the tenant through their parent. Rules can traverse
  (`page.site`); they don't need their own `site` field.
- Shared collections (`languages`, shared taxonomies) get no `site` field and a plain read grant.
- Singletons hold one item per project. Per-site settings (`globals`, header, footer) become a normal collection with a
  unique `site` M2O.
- **Unique is global, not per tenant.** A field's unique setting is a single-column index, so a unique `slug` or
  `permalink` collides across sites. Leave it off and enforce `site` + `slug` uniqueness with a blocking filter Flow
  (`directus-flows`). Frontends must filter by `site` and `slug`, or one site serves another's page.
- Files: one folder per site (add a `folder` M2O to `directus_folders` on `sites`), rules on `directus_files.folder`.
  Rules match the direct folder only; subfolders need `folder.parent` too.

## One project: tenant policies

Map users to tenants with a field on `directus_users`. Dynamic variables traverse it, including to-many paths, which
resolve to an array for `_in`:

| Mapping                  | Field on `directus_users`                         | Rule                                            |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------- |
| One tenant per user      | M2O `site`                                        | `{"site":{"_eq":"$CURRENT_USER.site"}}`         |
| Several tenants per user | M2M `sites` (junction `user_sites`, FK `site`)    | `{"site":{"_in":["$CURRENT_USER.sites.site"]}}` |
| Fixed, few tenants       | none: one policy per tenant with the id hardcoded | `{"site":{"_eq":"<site-id>"}}`                  |

A tenant editor policy (**licensed**), several-tenants form. Swap in the one-tenant rule as needed:

| Collection            | Action               | Item rule                                                                                         | Validation                                      |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `pages`, `posts`      | read, update, delete | `{"site":{"_in":["$CURRENT_USER.sites.site"]}}`                                                   | update: same filter as the item rule            |
| `pages`, `posts`      | create               | -                                                                                                 | `{"site":{"_in":["$CURRENT_USER.sites.site"]}}` |
| `page_blocks`         | read, update, delete | `{"page":{"site":{"_in":["$CURRENT_USER.sites.site"]}}}`                                          | -                                               |
| each block collection | read, update, delete | `{"$FOLLOW(page_blocks,item,collection)":{"page":{"site":{"_in":["$CURRENT_USER.sites.site"]}}}}` | -                                               |
| `directus_files`      | read, update, delete | `{"folder":{"_in":["$CURRENT_USER.sites.site.folder"]}}`                                          | create: `{"folder":{"_in":[...same...]}}`       |

- **Item rules don't cover create.** Validation is what stops a writer creating a row for another tenant. It only sees
  the payload, so it can't check a parent's tenant: a `page_blocks` create (or an update of `page`) can point at another
  tenant's page. Block that with a filter Flow on the child collections that reads the parent's `site`.
- **Force the tenant for one-tenant users.** Preset `{"site":"$CURRENT_USER.site"}` on create and keep `site` out of
  the create and update `fields`. The payload wins over a preset for fields the caller can write.
- **Users must not write their own tenant field.** The Studio's recommended own-profile row lists fixed fields, so a
  custom `site` field isn't in it. Any `directus_users` update with `*` lets a user move into another tenant.
- **Tenant changes can lag.** With `CACHE_ENABLED=true`, the user fields behind `$CURRENT_USER.<field>` are cached per
  user for `CACHE_TTL` (default `5m`). Writes clear them only when `CACHE_AUTO_PURGE=true` (the starters set both).
- **Public visitors have no tenant.** The public policy can't know which site is asking. Either accept that every
  site's published content is publicly readable and filter by `site` in each frontend, or give each site's frontend
  its own API-only user (no seat) with a policy hardcoding its `site` id (**licensed**).
- Every tenant editor with app access is a seat on the shared instance.

## Separate projects

- **Isolation:** own database, backups, admins, extensions, `PUBLIC_URL`, and upgrade timing. A broken migration or
  lockdown hits one client.
- **Licensing is per instance.** Each instance has its own tier and limits. A license key binds to an instance's
  `PUBLIC_URL` on activation; how many activations one key allows depends on the license.
- **Ops cost:** N upgrades, N backups, N sets of secrets. Environment Sync needs the exact same Directus version and
  database vendor on source and target, so upgrade all tenants together before pushing schema.
- **Keep schemas identical with Environment Sync** (`directus-environment-sync`): model on one source instance, pull
  once, then diff and push to one profile per tenant. `id_map.json` is keyed by source and target URL, so one file
  serves every target. Exclude `settings` from the project: it pushes as one record and would overwrite each tenant's
  project name, branding, and preview URL. Use the default `merge` mode so a tenant-only addition isn't deleted.
- Content doesn't sync. Seed each tenant with a script.

## Sources

- https://directus.com/docs/guides/auth/access-control
- https://directus.com/docs/guides/connect/filter-rules
- https://directus.com/docs/licensing/overview
- https://directus.com/docs/cloud/getting-started/introduction
- https://directus.com/docs/guides/environment-sync
- https://github.com/directus/directus/blob/v12.5.1/packages/utils/shared/parse-filter.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/utils/shared/parse-filter.test.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/utils/shared/get-with-arrays.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/lib/fetch-permissions.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/utils/fetch-dynamic-variable-data.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/permissions/modules/process-payload/process-payload.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/fields.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/utils/should-clear-cache.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/license/entitlements/lib/collections.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/env/src/constants/defaults.ts
