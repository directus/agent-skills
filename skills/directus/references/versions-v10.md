# Directus 10.x

Confirm the version: `GET /server/info` with a token returns `data.version` on 10.8.3+. On 10.2.0 to 10.8.2,
`GET /server/health` with an admin token returns `releaseId`. On 10.0 to 10.1, `GET /server/info` as admin returns
`data.directus.version`.

The skills are written for 12.6. Upgrading: `directus-upgrade` `references/10.x-minors.md`, then `references/11.0.md`.

## Missing on every 10.x

- **No policies.** Each user has one role, which holds `admin_access`, `app_access`, `ip_access`, `enforce_tfa`, and
  the permission rows (`directus_permissions.role`; `role = null` is public). No `/policies`, `/access`,
  `GET /permissions/me`, nested roles, `$CURRENT_ROLES`, or `$CURRENT_POLICIES`. Create permissions with
  `"role": "<role id>"`; copy shared access into each role. Admin reads `GET /permissions?filter[role][_eq]=<id>`.
- **No MCP server, AI Assistant, licensing, Environment Sync, or Visual Editor.** Use REST or GraphQL. Skip license
  checks. The published version key is `main`; `draft` is an ordinary key.
- **Reads differ.** A typo in `fields` is silently dropped, not a 403. A missing version key returns the
  published item.

## API gates

| The skills assume | Since | Before that |
| --- | --- | --- |
| WebSockets (`/websocket`), GraphQL subscriptions | 10.3.0 | Poll REST |
| Content versions (`/versions`, `?version=<key>`) | 10.7.0 | No drafts. Use a `status` field |
| GraphQL `<collection>_by_version` | 10.8.3 | `version` argument on `<collection>_by_id` |
| `/users/register`, `public_registration*` settings | 10.11.0 | Create users as admin, or invite them |

## Modeling, visual editing, Insights

- **Live Preview from 10.2.0** (`meta.preview_url`), `meta.versioning` and `{{$version}}` from 10.7.0. No
  `@directus/visual-editing`: `data-directus` attributes do nothing.
- **No `schema.is_indexed`** (11.1): only `is_unique`, index in a migration. No `header` interface (use
  `presentation-divider`), no `json()` in `fields`, no `_json` filter. The WYSIWYG is TinyMCE.
- **Insights:** `bar-chart`, `line-chart`, `pie-chart`, `meter` from 10.1.0, `metric-list` from 10.7.0. Before 10.7.0
  several panels use other `options` keys: build one panel in the Studio and copy its `options`. Grant
  `directus_dashboards` and `directus_panels` on each viewer's role.

## Schema

No `d6s`. Use `directus schema snapshot` / `schema apply --dry-run`, or `GET /schema/snapshot`, `POST /schema/diff`,
`POST /schema/apply`. Every diff is a mirror: look for `"kind": "D"` first. No `--ignoreRules` and no apply `force`.
Roles, permissions, flows, and dashboards aren't in a snapshot: script them over REST.

## Flows

- No `throw-error` (end with a failed `condition`), `error_on_reject` (a reject returns 200), or `requireSelection`.
- **Manual triggers don't check auth or read access.** Anyone naming an allowed collection runs the flow. Check
  `$accountability` in the flow.
- **`item-update` / `item-delete` with no key and no query touch every item.** Always set one. Batch `item-update`
  (array `payload`) needs 10.9.3.

## SDK

The composable SDK (`createDirectus().with(rest())`, SDK 11) starts at 10.5.0. Before that it's the legacy
`new Directus(url)` client and the `directus-sdk` skill doesn't apply. On 10.5+, match the SDK major to the server
(map: `directus-upgrade` `references/sdk-and-extensions.md`):

| The skills assume | Since | Before that |
| --- | --- | --- |
| `withOptions`, `withSearch` | 10.6.2 (SDK 12) | `asSearch` |
| Content version commands, `version` | 10.7.0 (SDK 13) | No drafts |
| `authentication('session')` | 10.10.0 (SDK 15) | `cookie` mode |
| `customEndpoint` | 10.10.5 (SDK 15.1) | Plain `fetch` |
| `isDirectusError`, `login({ email, password })` | 11.x | `error?.errors?.[0]?.extensions?.code`; `login(email, password)` |

## Extensions

| The skills assume | Since | Before that |
| --- | --- | --- |
| Any folder in `extensions/` loads; Marketplace | 10.10.0 | Name it `directus-extension-<name>`, or use `extensions/<type>s/<name>/index.js` |
| App extensions authenticate with the session cookie | 10.10.0 | No cookie. Calls outside `useApi()` need the token added by hand |
| `@directus/errors` (`createError`) | 10.4.0 | `exceptions` from the extension context |
| Sandbox, `--theme--*` CSS variables | 10.7.0 | API extensions run with full access. Old `--primary`-style variables |
| `useSdk()` | 10.9.0 | `useApi()` (axios) |
| `accountability.roles`, policies | 11.0.0 | One `accountability.role` |

## Self-hosting

| The skills assume | Since | Before that |
| --- | --- | --- |
| `SYNCHRONIZATION_STORE` | 10.2.0 | Every replica runs every schedule. Run schedules on one replica |
| One `REDIS` / `REDIS_*` set | 10.4.0 | Separate `CACHE_REDIS*`, `RATE_LIMITER_REDIS*`, `MESSENGER_REDIS*`, and so on |
| `PM2_INSTANCES` | 10.7.1 | One process per container. Scale with containers |
| `KEY` not required | 10.11.0 | Set both `KEY` and `SECRET` or the process exits |
| `ADMIN_TOKEN` on first boot | 10.13.1 | Create a static token after the first login |
| `IP_TRUST_PROXY` defaults to `false` | 12.0.0 | `true` on 10.x. Set the proxy hop count so `ip_access` can't be spoofed |
| Node 26 | 12.6.0 | Node 18 on all of 10.x. `npx directus` works in the image |

For everything else, read the release notes and breaking changes: Directus docs MCP (`https://directus.com/docs/mcp`,
`search-docs`) or `https://directus.com/docs/raw/releases/breaking-changes/version-10.md`.

## Sources

- https://directus.com/docs/releases/breaking-changes/version-10 and version-11; `directus-upgrade` hop files above
- https://github.com/directus/directus/blob/v10.13.4/api/src/utils/get-permissions.ts (role-based permissions)
- Tags v10.8.2 `api/src/services/server.ts` (`releaseId`), v10.9.0 `packages/extensions/src/node/utils/get-extensions.ts`
  (layout), v10.5.0 `sdk/package.json` (SDK 11), v10.9.3 `api/src/operations/item-update/index.ts` (batch), v10.11.0
  `api/src/app.ts` (no `KEY` check, PR #22320), v10.13.1 `api/src/cli/commands/bootstrap/index.ts` (`ADMIN_TOKEN`)
