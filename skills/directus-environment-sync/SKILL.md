---
name: directus-environment-sync
description: "Use when moving Directus schema and config between instances (dev, staging, production): Environment Sync and the d6s CLI (pull, diff, push), directus.config.json, id_map.json, push modes, CI pipelines, drift, rollback, and schema snapshot/apply. Not for designing schema (directus-content-modeling), version upgrades (directus-upgrade), or moving content items."
metadata:
  author: directus
  directus-version: '12.6.0'
---

# Directus Environment Sync

Environment Sync pulls an instance's Schema and Configuration into JSON sync files you commit, then diffs and pushes
those files to other instances. Pull overwrites the files in scope. Push applies only what is on disk, never the source
instance. Requires Directus 12.2.0 or later on every instance.

_Verified against Directus v12.6.0 (CLI source `packages/cli`, `@directus/cli` 12.4.0) and the Environment Sync docs._

## First checks

1. **Check the version before anything else.** `GET /server/info` with a token returns `data.version`. Not 12.6? Read
   the version notes for its major in the `directus` skill (`references/versions-v<major>.md`) first.
2. **Versions and vendor.** `GET /server/info` on source and target: same exact version (patch included), same DB
   vendor, both 12.2.0+.
3. **Admin tokens.** One per instance. `d6s profile test-connection <name>` prints who the token is.
4. **Installed CLI.** `npm i -g @directus/cli@12` (9.x is the deprecated old client CLI), then `d6s --version`. Node
   22+. Pin an exact version in CI.
5. **Sync files present?** If the repo has `directus.config.json` and `directus/<project>/`, pull from the agreed
   source, not whatever instance is handy.

## Critical traps

- **Exact version + same DB vendor or the schema diff is refused.** `--allow-drift` sends the server's `force` bypass.
  It converts nothing between versions or vendors. Re-pull after upgrading the source.
- **Admin token only.** Non-admin reads are silently permission-filtered and would write sync files that look complete
  but aren't, so the CLI refuses them. If it can't check (network error), it only warns ("Could not verify ...
  admin access; continuing"): treat that warning as a stop. **House rule (strong):** a dedicated sync admin user per instance with its own
  static token, never a person's account (separate in the logs, revocable alone).
- **Deletions only in `mirror`, behind their own consent, from freshly pulled files.** `merge` (default) and `add` never
  delete. `--yes` **never** authorizes a deletion (CI needs `--dangerously-allow-delete`). Stale or partially scoped
  files delete things that only look obsolete: `d6s sync diff --mode mirror` and read every delete.
- **Content is not synced.** Items in your own collections, files, presets, comments, revisions, and extensions stay
  behind. Deploy extensions to the target before pushing fields or flows that use them; nothing warns.
- **Secrets are stripped.** Built-in secrets and fields marked concealed, hashed, or encrypted never reach the files.
  Set them on each instance. Flow operation headers, URLs, and bodies are written verbatim: review them before commit.
- **Settings push as one record.** A push overwrites the target's project settings, including `preview_base_url` and
  `project_url`. Exclude `settings` from the project to keep per-environment values.
- **Core-tier targets reject what they aren't licensed for.** Custom permission rules and custom LLM settings fail
  `RESOURCE_RESTRICTED`; too many collections or flows fail `LIMIT_EXCEEDED`. Check the target's license before the
  first push. Never strip a rule's filter to make it fit (that widens access); drop the whole row instead.
- **Always `diff` before `push` to production.** `diff` applies nothing and exits `0` either way. Commit `id_map.json`
  after every push that changes it, or later pushes can duplicate records.

## Which tool

| Need                                                                                                  | Use                                                                       |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Promote schema + roles, policies, permissions, flows, settings between live instances, via git review | Environment Sync (`d6s`), Directus 12.2+                                  |
| Schema only, from inside the server container, or Directus before 12.2                                | `directus schema snapshot` / `directus schema apply`, or `/schema/*` REST |
| Start a new project from a Directus starter, including content and files                              | `directus-template-cli` (`init` / `apply`)                                |
| Seed content (items, files)                                                                           | A seed script; see `directus-content-modeling` (applying-schema.md)       |

Schema snapshot/apply checks (the CLI apply has **no** version or vendor check; REST does) and tradeoffs:
[references/how-it-works.md](references/how-it-works.md#schema-snapshot-and-apply).

## Routing

| Load when                                                                                                                               | Reference                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Installing, profiles, `directus.config.json`, credentials, `.env`, test-connection, projects                                            | [references/setup.md](references/setup.md)                     |
| What syncs, settings, record identity and ID map, push phases, modes, compatibility, core-tier targets, `directus schema` / `/schema/*` | [references/how-it-works.md](references/how-it-works.md)       |
| Promote dev to prod, ship only ready work, adopt on an existing project, roll back, rebase, new instance                                | [references/workflows.md](references/workflows.md)             |
| CI: non-interactive rules, `DIRECTUS_<PROFILE>_TOKEN`, `--json` reports, GitHub Actions pipeline                                        | [references/ci.md](references/ci.md)                           |
| Command cheat sheet, flag rules that refuse, error codes                                                                                | [references/reference.md](references/reference.md)             |
| Errors, refusals, incomplete pulls, secrets blind spot, duplicated panels, known limitations                                            | [references/troubleshooting.md](references/troubleshooting.md) |

## Related skills

`directus-content-modeling` (designing the collections, fields, and relations you sync) · `directus-upgrade` (moving
instances to a new version, then re-pulling) · `directus` (day-to-day instance work)

## Go deeper

1. Directus docs MCP server: `https://directus.com/docs/mcp` (no auth; tools `search-docs`, `get-doc`, `list-docs`,
   `search-directus-code`, `get-directus-file`). The CLI lives at `packages/cli` in the main repo.
2. Raw markdown for any docs page: `https://directus.com/docs/raw/<path>.md`, for example
   `https://directus.com/docs/raw/guides/environment-sync/reference.md`. Index: `https://directus.com/docs/llms.txt`.
3. The instance and the CLI themselves: `d6s <command> --help`, the CLI's named errors and hints, `GET /server/info`,
   `GET /server/specs/oas`, and the schema.
