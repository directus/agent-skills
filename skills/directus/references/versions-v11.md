# Directus 11.x

Confirm the version: `GET /server/info` with a token returns `data.version`.

The skills are written for 12.6. On 11.x, policies, roles, and the permission model work as they describe. What's
missing on every 11.x: licensing (no `GET /license`, no core tier, no `RESOURCE_RESTRICTED`: skip license checks),
reserved `draft` and `published` version keys, MCP OAuth, and Environment Sync. Smaller 12.x gates are in
`versions-v12.md`. Upgrading: `directus-upgrade` `references/12.0.md`, then `references/12.x-minors.md`.

## API and MCP

| The skills assume                                        | Since          | On 11.x                                                                                               |
| -------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| MCP server (`/mcp`)                                      | 11.12.0        | Before 11.12, REST or GraphQL only                                                                    |
| MCP OAuth, `?tool_mode=registry`                         | 12.0.0, 12.3.0 | Static token, default tool mode                                                                       |
| Published key `published` (`?version=published`)         | 12.0.0         | Published is `main`. Omit `version` for published reads. Never send `published` (403 from 11.12)      |
| Reserved `draft`, item-less drafts, `?version=` on lists | 12.0.0         | `draft` is an ordinary key that exists only where saved. Create the item first. Read items one by one |
| `?version=<key>` with no saved version returns 403       | 11.12.0        | Before 11.12 it silently returns the published item                                                   |
| Versioned reads need relations expanded in `fields`      | 11.11.0        | Before 11.11, relational changes merge without asking and filters run on the published row            |
| `backlink` query param                                   | 11.9.0         | List the relations you need in `fields` instead of `*.*`                                              |
| Field setting `meta.searchable`                          | 11.13.0        | `search` hits every string field. Filter one field instead                                            |
| AI Assistant (11.14.0), OpenAI-compatible providers      | 11.15.0        | None before those                                                                                     |
| `POST /utils/import/<collection>?background=true`        | 11.17.0        | Synchronous. Split large files                                                                        |

## Access control

| The skills assume                                  | Since  | On 11.x                                                                                |
| -------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `IP_TRUST_PROXY` defaults to `false`               | 12.0.0 | `true`: a client-sent `X-Forwarded-For` can spoof `ip_access`. Set the proxy hop count |
| App Access policies read a limited set of settings | 12.2.0 | App Access reads every settings field, AI provider keys included. Scope it             |
| Update or delete by `query` needs read permission  | 12.4.0 | No read needed. Update or delete alone can change rows by query                        |
| `enforce_tfa` from every effective policy          | 12.5.0 | Only policies on the user's own role count                                             |

## Modeling

| The skills assume                          | Since          | On 11.x                                                                                 |
| ------------------------------------------ | -------------- | --------------------------------------------------------------------------------------- |
| `schema.is_indexed`                        | 11.1.0         | 11.0: only `is_unique`. Index in a migration                                            |
| `?concurrentIndexCreation`                 | 11.13.0        | Index builds block writes. Index large tables at a quiet time                           |
| `_json` filter operator                    | 12.0.0         | No filtering inside JSON. `json(field, path)` in `fields` and `sort` works from 11.16.0 |
| `header` interface                         | 11.14.0        | `presentation-divider`                                                                  |
| Studio **Enable Translations** wizard      | 11.17.0        | Translations field type, or the API steps                                               |
| New collections get an `archived` boolean  | 12.0.0         | The Studio's optional field is `status` (string)                                        |
| WYSIWYG on Tiptap; `{{$preview_base_url}}` | 12.2.0, 12.5.0 | TinyMCE (keeps `<div>` and inline styles). Hardcode the host in preview URLs            |

## Environment Sync and schema

- **No `d6s` on 11.x** (needs 12.2.0 on every instance). Use `directus schema snapshot` / `schema apply --dry-run`,
  or `GET /schema/snapshot`, `POST /schema/diff`, `POST /schema/apply`. Every diff is a mirror: look for `"kind": "D"`
  before applying. Policies, flows, dashboards, and settings aren't in a snapshot: script them over REST.
- `directus schema apply --ignoreRules` from 11.1.1. `POST /schema/apply?force=true` from 11.17.4. Any `force` key on
  `/schema/diff` (even `false`) skips the version and vendor check.
- Snapshots from 11.10.0 leave out database-only tables. Applying one to an older instance drops those tables.

## Flows

| The skills assume                                                 | Since   | On 11.x                                                                                                                 |
| ----------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `throw-error` operation                                           | 11.10.1 | Run Script returns a flag (`{ ok: false }`), then a `condition` on it fails with 400. Never throw from Run Script (500) |
| `error_on_reject` on webhook and manual triggers                  | 11.7.0  | A final reject still returns 200 with the error as `$last`. Check the body                                              |
| Manual triggers check auth and read access; `requireSelection`    | 11.9.0  | No auth or key check: anyone naming an allowed collection runs it. Check `$accountability` in the flow                  |
| Failed `condition` rejects with `FailedValidationError`s          | 11.5.0  | Raw Joi errors                                                                                                          |
| `item-update` / `item-delete` with no key and no query do nothing | 12.3.0  | They touch every item. Always set a key or a `query`                                                                    |
| MCP works out operation positions; flow folders                   | 12.4.0  | Send `position_x` / `position_y` on every operation. Group flows by name prefix                                         |

## SDK, visual editing, Insights

- **Match the SDK major to the server** (17 on 11.0, 21 on 11.14.1 to 11.17). Map: `directus-upgrade`
  `references/sdk-and-extensions.md`. `isDirectusError` needs 11.6 (SDK 19.1). `login({ email, password })` needs 11.9
  (SDK 20); before, `login(email, password)`. Before SDK 22, failed requests reject with a plain object, not an `Error`.
- **Visual Editor from 11.6.0** (Live Preview only before). Use `@directus/visual-editing` 1.x on 11.6 to 11.15; 2.x
  needs 11.16.0 or nothing activates. Versions in the Visual Editor need 11.16.0. `{{$version}}` defaults to `main`.
- **Insights** works as described. `bar-chart` `xAxisDisplayField` needs 11.15.0.

## Extensions and self-hosting

| The skills assume                               | Since   | On 11.x                                                                     |
| ----------------------------------------------- | ------- | --------------------------------------------------------------------------- |
| Node 26 (`directus` engines, image)             | 12.6.0  | Node 18 on 11.0 to 11.3, Node 22 from 11.4.0. Build extensions on that Node |
| `npm run validate` (extensions-sdk 13)          | 11.4.0  | Build, load, and read the API logs                                          |
| Typed extension context services                | 11.10.1 | `any`                                                                       |
| `richtext` extension type                       | 12.6.0  | None                                                                        |
| `node /directus/cli.js` (no `npx` in the image) | 12.1.0  | `npx directus` also works on 11.x images                                    |
| MySQL 5.7 unsupported                           | 11.7.0  | Supported before 11.7. `EMAIL_TRANSPORT=sendgrid` works before 11.1.1       |

For everything else, read the release notes and breaking changes: Directus docs MCP (`https://directus.com/docs/mcp`,
`search-docs`) or `https://directus.com/docs/raw/releases/breaking-changes/version-11.md` (and `version-12.md`).

## Sources

- https://directus.com/docs/releases/breaking-changes/version-11 and version-12
- `directus-upgrade`: `references/11.x-minors.md`, `references/12.0.md`, `references/sdk-and-extensions.md`
- https://github.com/directus/directus/tree/v11.12.0/api/src/mcp (first MCP server)
- https://github.com/directus/directus/blob/v11.10.1/api/src/operations/throw-error/index.ts (absent in v11.10.0)
- https://github.com/directus/directus/blob/v11.8.0/api/src/flows.ts (manual trigger, no auth check; vs v11.9.0)
- https://github.com/directus/directus/blob/v11.17.4/api/src/controllers/schema.ts (apply `force`)
- Tags v11.1.0 `api/src/services/fields.ts` (`is_indexed`), v11.1.1 `api/src/cli/index.ts` (`--ignoreRules`), v11.4.0
  `Dockerfile` (Node 22), v12.0.0 `packages/env/src/constants/defaults.ts` (`IP_TRUST_PROXY`)
