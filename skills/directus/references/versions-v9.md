# Directus 9.x

Confirm the version: `GET /server/info` with an admin token returns `data.directus.version` (`GET /server/health`
with an admin token also returns `releaseId`).

The skills are written for 12.6, three majors ahead. Most of what they say doesn't hold on 9.x. Treat work on 9.x as
"upgrade first" unless the user says otherwise: `directus-upgrade` `references/v9-to-10.0.md` (go to 9.26.0 and boot
it once, then 10.x), then onward through its hop files.

## What's fundamentally different

- **No policies.** Each user has one role. The role holds `admin_access`, `app_access`, and the permission rows
  (`directus_permissions.role`; `role = null` is public). Nothing in `directus-access-control` about policies,
  `/access`, nested roles, or licensing applies.
- **No content versions, Live Preview, or Visual Editor.** Drafts are a `status` field. `directus-visual-editing`
  doesn't apply.
- **No WebSockets, MCP server, AI features, licensing, or Environment Sync.** Use REST or GraphQL.
- **SDK:** only the legacy client (`new Directus(url)`, `directus.items('posts').readByQuery()`). `directus-sdk`
  doesn't apply. Porting to `createDirectus` is a rewrite: `directus-upgrade` `references/sdk-and-extensions.md`.
- **Extensions:** built files in `extensions/<type>s/<name>/index.js`, no sandbox, no Marketplace. The API is
  CommonJS before 9.25.0 and ESM from 9.25.0.
- **Node:** `>=12.20` before 9.25.0, `>=18` from 9.25.0.

## What exists, with gates

| Feature | Since | Notes |
| --- | --- | --- |
| `directus schema snapshot` / `schema apply` | 9.0.0 | Match version and database vendor on both sides |
| `GET /schema/snapshot`, `POST /schema/diff`, `/schema/apply` | 9.23.0 | Every diff is a mirror: check for `"kind": "D"` first |
| Insights `metric`, `list`, `time-series`, `label` | 9.0.0 | No `bar-chart`, `line-chart`, `pie-chart`, `meter` |
| Insights `variable` / `relational-variable` panels | 9.13.0, 9.18.0 |  |
| Flows | 9.12.0 | None of the 11.x and 12.x operations or trigger options |

On top of that, everything listed as missing in `versions-v10.md` is missing on 9.x too.

For anything else, read the release notes and breaking changes: Directus docs MCP (`https://directus.com/docs/mcp`,
`search-docs`) or `https://directus.com/docs/raw/releases/breaking-changes/version-10.md` (covers 9.x to 10.0).

## Sources

- `directus-upgrade`: `references/v9-to-10.0.md`, `references/sdk-and-extensions.md`
- https://directus.com/docs/releases/breaking-changes/version-10
- https://github.com/directus/directus/blob/v9.26.0/api/src/services/server.ts (`directus.version`, `releaseId`)
- https://github.com/directus/directus/blob/v9.26.0/api/package.json (Node `>=18`; v9.24.0 `>=12.20.0`)
- https://github.com/directus/directus/blob/v9.0.0/api/src/cli/commands/schema/snapshot.ts
- https://github.com/directus/directus/blob/v9.23.0/api/src/controllers/schema.ts
- https://github.com/directus/directus/tree/v9.26.0/app/src/panels
- https://github.com/directus/directus/blob/v9.12.0/api/src/database/migrations/20220429A-add-flows.ts
- https://github.com/directus/directus/blob/v11.0.0/api/src/database/migrations/20240806A-permissions-policies.ts
