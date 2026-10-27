# Directus 12.0 to 12.5

Confirm the version: `GET /server/info` with a token returns `data.version`.

The skills are written for 12.6. Licensing, policies, `draft` and `published` versions, and MCP work as they describe
from 12.0. Below is what they'd get wrong on 12.0 to 12.5. On 12.4.0 exactly, non-admins get a 500 on `GET /folders`
and the File Library: move to 12.4.1 or later.

## API and MCP

| The skills assume                                            | Since  | Before that                                                                    |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------ |
| MCP registry mode (`/mcp?tool_mode=registry`)                | 12.3.0 | Default tool mode only. Call the tools directly                                |
| `POST /utils/import` (several collections, `mode`, `dryRun`) | 12.2.0 | `POST /utils/import/<collection>`, one collection at a time, in relation order |
| Valueless flags mean true (`?background`, `?force`)          | 12.2.0 | Always pass a value (`?background=true`)                                       |
| `directus_folders.type`, flow folders in `GET /folders`      | 12.4.0 | No `type` field. Drop `filter[type][_eq]=files`, every folder is a file folder |
| `COLLECTION_INACTIVE` (403) on deactivated collections       | 12.4.0 | Doesn't happen. A collection over the license limit is still served            |
| `directus_settings.default_exports_folder`                   | 12.6.0 | Pass `file.folder` to `/utils/export` to pick the folder                       |

## Access control

| The skills assume                                                   | Since  | Before that                                                                                                   |
| ------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| Update or delete by `query` needs read on the key and filter fields | 12.4.0 | No read needed. A policy with update or delete but no read can still change rows by query                     |
| New App Access policies read a limited set of `directus_settings`   | 12.2.0 | App Access reads every settings field, AI provider keys included. Scope the settings permission               |
| Strict `ip_access` parsing                                          | 12.5.0 | Loosely parsed. Write values the 12.5 rules accept (single IP, `a-b` range, CIDR) so they survive the upgrade |
| `enforce_tfa` from every effective policy                           | 12.5.0 | Only policies on the user's own role count. Put Require 2FA on that role's policy                             |
| `GET /license` failure field `invalid_reason`                       | 12.5.0 | Read `downgrade_reason`                                                                                       |

## Modeling and visual editing

| The skills assume                                              | Since  | Before that                                                                                             |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| WYSIWYG (`input-rich-text-html`) on Tiptap                     | 12.2.0 | TinyMCE: keeps `<div>` wrappers and inline styles, honors `tinymceOverrides`                            |
| `richtext` extensions on the WYSIWYG                           | 12.6.0 | None                                                                                                    |
| `{{$preview_base_url}}`, Settings > Project > Preview Base URL | 12.5.0 | Hardcode the host in Preview and Visual Editor URLs, and fix it on each instance after promoting schema |
| `list` (Repeater) edit mode `inline`                           | 12.0.1 | Drawer mode only                                                                                        |

## Environment Sync and schema

- **Before 12.2.0 on any instance, `d6s` won't run.** It stops with `Environment Sync needs Directus 12.2.0 or later`.
  Use `node /directus/cli.js schema snapshot` / `schema apply --dry-run`, or `GET /schema/snapshot`,
  `POST /schema/diff`, `POST /schema/apply`. Configuration (policies, flows, dashboards, settings) isn't in a snapshot:
  script it over REST, or upgrade every instance to 12.2+ first.
- **Before 12.2.0 every diff is a mirror.** `/schema/diff` has no `mode=merge`. Check the diff for `"kind": "D"` before
  applying.
- **Before 12.2.0, `force` on `/schema/diff` is on if the key is present**, even `force=false`. SDK
  `schemaDiff(snapshot, true)` instead of `{ force: true }`. Schema uploads aren't capped by `IMPORT_MAX_FILE_SIZE`.

## Flows

| The skills assume                                                 | Since  | Before that                                                                 |
| ----------------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| `item-update` / `item-delete` with no key and no query do nothing | 12.3.0 | They touch **every item** in the collection. Always set a key or a `query`  |
| MCP `operations` works out `position_x` / `position_y`            | 12.4.0 | Send both on every operation, as over REST (`19`, `37`, `55` along one row) |
| Flow folders (`folders` with `type: "flows"`)                     | 12.4.0 | No folders for flows. Group by name prefix (`Utils: ...`)                   |

## SDK and extensions

- **Match the SDK major to the server.** Every 12.x minor up to 12.5 shipped a new `@directus/sdk` major (12.0 is 22,
  12.5 is 27.0). Map: `directus-upgrade` `references/sdk-and-extensions.md`.
- **`customEndpoint` with a `FormData` body** needs SDK 27.1 to set the multipart boundary. Older SDKs: pass
  `headers: { 'Content-Type': 'multipart/form-data' }`.
- **No `richtext` extension type before 12.6,** and Tiptap isn't a shared dependency: an extension that imports it
  bundles its own copy.
- **Node 22 before 12.6** (`directus` engines `>=22`). Build extensions and their native modules on Node 22, not 26.

## Self-hosting

| The skills assume                             | Since  | Before that                                                                                                                    |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Node 26 in the image (`NODE_VERSION=26.12.1`) | 12.6.0 | Node 22. Build stages use `node:22`, and `corepack enable` still works                                                         |
| No `npm` / `npx` in the image                 | 12.1.0 | 12.0 still has them, but write `node /directus/cli.js` anyway so it survives upgrades                                          |
| `CMD ["node", "docker-entrypoint.cjs"]`       | 12.3.0 | Shell `CMD`: `node cli.js bootstrap && pm2-runtime start ecosystem.config.cjs`. A custom `CMD` copies the one from its own tag |
| Telemetry to `telemetry.directus.com`         | 12.6.0 | `telemetry.directus.io`. Allow that host in restricted egress                                                                  |

For everything else, read the release notes and breaking changes: Directus docs MCP (`https://directus.com/docs/mcp`,
`search-docs`) or `https://directus.com/docs/raw/releases/breaking-changes/version-12.md`. To upgrade, use
`directus-upgrade` `references/12.x-minors.md`.

## Sources

- https://directus.com/docs/releases/breaking-changes/version-12 and release notes for v12.1.0 to v12.6.0
- `directus-upgrade`: `references/12.x-minors.md`, `references/sdk-and-extensions.md`
- https://github.com/directus/directus/blob/v12.2.0/api/src/controllers/schema.ts (`mode`, `force`; `utils.ts` for import)
- https://github.com/directus/directus/blob/v12.3.0/api/src/ai/mcp/server.ts (`tool_mode`)
- https://github.com/directus/directus/blob/v12.4.0/api/src/database/migrations/20260818A-add-flow-folders.ts
- https://github.com/directus/directus/blob/v12.4.0/api/src/ai/tools/operations/position.ts
- https://github.com/directus/directus/blob/v12.5.0/api/src/database/migrations/20260924A-add-preview-base-url.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/cli/src/commands/sync/utils/preflight.ts (`SYNC_MIN_DIRECTUS`)
- https://github.com/directus/directus/blob/v12.6.0/packages/constants/src/extensions.ts (`richtext`)
- https://github.com/directus/directus/blob/v12.6.0/Dockerfile (vs v12.1.0 and v12.3.0: npm, entrypoint, Node)
