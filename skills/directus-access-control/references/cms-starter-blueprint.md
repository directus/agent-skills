# CMS starter blueprint

The Directus CMS starter builds access from small, focused policies combined on roles and users. It is one way to lay
out access, and the recommended starting point: copy its shape, rename collections to match your project, and add or
drop policies as the project needs.

## Fix the core template first

`template/` (core) and `template-licensed/` share the same roles, policies, and access rows; only `permissions.json`
differs. Core flattens every rule to "all rows, all fields", which leaves these unsafe grants. Replace them before
applying it to anything real:

| Policy | Core template ships | Risk | Use instead |
| --- | --- | --- | --- |
| `Team - App Access` | `directus_users` update, all rows and fields | Any staff user can set anyone's `role` to Administrator | The Studio's recommended own-profile row, which core allows: item rule `{"id":{"_eq":"$CURRENT_USER"}}`, fields exactly `first_name, last_name, email, password, location, title, description, avatar, language, appearance, theme_light, theme_dark, theme_light_overrides, theme_dark_overrides, tfa_secret` (same order) |
| `Content - Self` | `directus_files` update and delete, all rows | Writers can rename, move, or delete anyone's files | The recommended rows, which core allows: item rule `{"uploaded_by":{"_eq":"$CURRENT_USER"}}`; update fields exactly `title, description, tags, location, folder, focal_point_x, focal_point_y, filename_download`; delete fields `*` |
| `Content - Public` | `directus_users` read, all rows, `*` | Every user's email, role, and profile is public | Drop it; read author names server-side instead. Licensed: `{"posts":{"_nnull":true}}`, fields `id, first_name, last_name, avatar, title` |
| `Content - Public` | `directus_files` read, no rule | Every file is downloadable through `/assets`, exports too | Keep only if every file in the library is meant to be public. Licensed: `{"_or":[{"folder":{"name":{"_contains":"Public"}}},{"folder":{"parent":{"name":{"_contains":"Public"}}}}]}` |

The own-profile and own-files rows work on core because they exactly match built-in recommended permissions. Change
anything in them and they are refused. Applying the core template to an unlicensed instance logs a
`custom_permission_rules_enabled` 403 while the CLI probes licensed features. That is expected.

## Policies

**House rule:** one policy per job, then build each role from several policies. That gives reuse (`Content - Public`
serves anonymous visitors and the Writer role), clean seats (only `Team - App Access` has `app_access`), one-offs
without a new role (the Frontend Bot), and smaller Environment Sync diffs. Avoid one big policy per role; it duplicates
rules across roles and drifts.

Seven policies plus the built-in Administrator. "Licensed adds" lists what the licensed template layers on top of the
flat core rules.

| Policy | Flags | Purpose and core rules | Licensed adds |
| --- | --- | --- | --- |
| `Administrator` | admin, app | Full control. One per project, for real admins only | - |
| `Content - Public` | none | The public policy (id `abf8a154-...`, renamed). Read on website collections: `pages`, `posts`, `page_blocks`, every `block_*`, `globals`, `navigation`, `navigation_items`, `forms`, `form_fields`, `redirects`, settings singletons, `directus_files`, `directus_users` | `pages`/`posts`: `status = published` and `published_at <= $NOW`. `page_blocks`: parent page published. `forms`/`navigation`: `is_active`. `form_fields`, `navigation_items`: parent active. Files: folder (or parent folder) name contains "Public". Users: only authors (`posts` not null), fields `id, first_name, last_name, avatar, title`. `globals` and `forms`: explicit field lists |
| `Content - Self` | none | Writers edit their own work. Create, read, update `posts`; create, read, update, delete `directus_files` | `posts` read/update only where `author = $CURRENT_USER`; create presets `author = $CURRENT_USER`; create and update validate `status != published`. Files update/delete only where `uploaded_by = $CURRENT_USER` |
| `Content - Manage` | none | Editors manage everything. Full CRUD on pages, posts, blocks, navigation, forms, globals, settings singletons, files, folders. Create and read on form submissions | `globals`: explicit field list |
| `Content - Live Preview` | none | Read on `pages`, `posts`, `page_blocks` for whatever token renders previews | Same rules (no filters, so preview sees drafts) |
| `Forms - Submission` | none | Write-only form intake. Create `form_submissions`, `form_submission_values`, `directus_files`; read on those | Reads limited to the `id` field. File create presets `folder = <form uploads folder>` and validates `filesize <= 5000000`. File read only in that folder |
| `Team - App Access` | app | Studio access for staff. Dashboards and panels CRUD, `ai_prompts` CRUD, shares, read roles, users, files, folders, flows, update users | Users update only own profile fields; shares read by role, update/delete own; flows read only `trigger = manual` with limited fields; `ai_prompts` read own or published, update/delete own |

The cms-i18n variant adds public read on `languages` and every `*_translations` collection, and `translations` to the
public `globals` field list. It has 37 collections, over the core tier's collection limit, so it needs a license
(`directus-content-modeling` new-project reference).

## Roles and attachments

| Role / user | Policies | Notes |
| --- | --- | --- |
| Public (no token) | `Content - Public` | Access row with `role = null`, `user = null` |
| `Writer` role | `Content - Self`, `Content - Public`, `Team - App Access` | Licensed: `posts` reads stack to "own OR published", a good example of additive policies |
| `Editor` role | `Content - Manage`, `Team - App Access` |  |
| `Content Admin` role | `Content - Manage`, `Team - App Access` | Same policies as Editor in the starter. Meant for sites without an approval workflow |
| `Administrator` role | `Administrator`, `Content - Live Preview` | The onboarding admin |
| `Frontend Bot` user (no role) | `Forms - Submission` (attached directly) | API-only, static token, used server-side by the frontend. No role means it also gets the public policy |

Roles have no parents in the starter. Nesting is available ("Editor = Writer + more"), but flat roles with shared
policies are easier to read.

## Adapting it

1. Keep the policy names and split. Rename only collection lists.
2. For each new content collection, decide which policies get which actions. Most need: read in `Content - Public`
   (with a published filter when licensed), CRUD in `Content - Manage`, nothing in `Content - Self` unless writers own
   rows.
3. Junction and block collections need their own rows in every policy that reads or writes the parent.
4. Versioned collections: give editor policies read, create, update, delete on `directus_versions` and scoped read on
   `directus_revisions`. The starter enables versioning on `pages` and `posts`, but none of its policies grant anything
   on `directus_versions`, and it isn't in the automatic Studio permissions. The versions service runs as the caller,
   so non-admin Editors can't create or save drafts until you add it.
5. **House rule:** give the Live Preview policy to a dedicated preview user, not the Administrator role, if your
   frontend uses a non-admin token for drafts.

Apply the starter to a fresh instance with `npx directus-template-cli@latest apply`.

## Sources

- https://github.com/directus-labs/starters/tree/main/_shared/rbac
- https://github.com/directus-labs/starters/tree/main/_shared/rbac/core-skeleton
- https://github.com/directus-labs/starters/tree/main/_shared/rbac/licensed/modules
- https://github.com/directus-labs/starters/tree/main/_shared/rbac/cms-i18n-permissions.delta.json
- https://github.com/directus-labs/starters/tree/main/cms/directus/README.md
- https://github.com/directus-labs/starters/tree/main/cms/directus/template/src
- https://github.com/directus-labs/starters/tree/main/cms/directus/template-licensed/src
- https://directus.com/docs/guides/content/content-versioning
- https://github.com/directus/directus/blob/v12.6.0/packages/constants/src/permissions.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/system-data/src/app-access-permissions/index.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/versions.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/users.ts
