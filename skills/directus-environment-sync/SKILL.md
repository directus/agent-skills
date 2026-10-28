---
name: directus-environment-sync
description: "Load first, before exploring code, when moving Directus schema and config between instances (dev, staging, production): Environment Sync and the d6s CLI (pull, diff, push), directus.config.json, id_map.json, push modes, CI pipelines, drift, rollback, and schema snapshot/apply. Not for designing schema (directus-content-modeling), version upgrades (directus-upgrade), or moving content items."
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

1. **Check the version before anything else.** `GET /server/info` with a token returns `data.version`. Older than
   12.6: read the version notes for its major in the `directus` skill (`references/versions-v<major>.md`), or without
   that skill `https://directus.com/docs/raw/releases/breaking-changes/version-<major>.md`. Newer: read the release
   notes since 12.6.0 first.
2. **Versions and vendor.** `GET /server/info` on source and target: same exact version (patch included), same DB
   vendor, both 12.2.0+.
3. **Sync files present?** If the repo has `directus.config.json` and `directus/<project>/`, pull from the agreed
   source, not whatever instance is handy.

## Critical traps

- **Exact version + same DB vendor or the schema diff is refused.** `--allow-drift` sends the server's `force` bypass.
  It converts nothing between versions or vendors. Re-pull after upgrading the source.
- **Admin token only.** Non-admin reads are silently permission-filtered and would write sync files that look complete
  but aren't, so the CLI refuses them. If it can't check (network error), it only warns ("Could not verify ...
  admin access; continuing"): treat that warning as a stop. **Strongly recommended:** a dedicated sync admin user per instance with its own
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

| Need | Use |
| --- | --- |
| Promote schema + roles, policies, permissions, flows, settings between live instances, via git review | Environment Sync (`d6s`), Directus 12.2+ |
| Schema only, from inside the server container, or Directus before 12.2 | `directus schema snapshot` / `directus schema apply`, or `/schema/*` REST |
| Start a new project from a Directus starter, including content and files | `directus-template-cli` (`init` / `apply`) |
| Seed content (items, files) | A seed script; see `directus-content-modeling` (applying-schema.md) |

## Commands

```bash
npm i -g @directus/cli@12                   # Node 22+; 9.x is the old client CLI; pin the exact version in CI
d6s profile add dev --url <url> --token <admin-token>   # also: production; saves the token to the OS credential store
d6s profile test-connection production      # prints who the token is
d6s sync pull --from dev                    # writes directus/<project>/; commit it
d6s sync diff --to production               # applies nothing; read every change
d6s sync push --to production               # merge mode; --yes in CI
```

- Keep each environment's own settings: `"excludeResources": ["settings"]` on the project in `directus.config.json`
  (or pull with `--no-settings`), and delete any settings file an earlier pull wrote.
- Ship only part of dev: `d6s sync pull --from dev --collections posts`.
- In CI the token comes from `DIRECTUS_<PROFILE>_TOKEN` (profile name uppercased); `sync` commands have no token flag.
- Records match across instances by `id_map.json`, then by name (roles, policies), `name` + `folder` (flows), and
  `flow` + `key` (operations). Panels match by ID map only.

## Schema snapshot and apply

The schema-only tools don't share Environment Sync's guards:

| Path | Version + vendor check | Hash check | Deletes |
| --- | --- | --- | --- |
| CLI `directus schema apply <file>` | **None** | None | Everything the snapshot lacks, minus `--ignoreRules` |
| `POST /schema/diff` | Yes; `force=true` bypasses | n/a | `mode` defaults to `mirror`; pass `mode=merge` to plan no deletes |
| `POST /schema/apply` (body: the diff) | No | Yes; `force=true` bypasses | Whatever the diff contains |

- Compare the snapshot's `directus` and `vendor` keys with the target yourself before a CLI apply, and `--dry-run` it.
- A valueless `?force` counts as `true` on 12.2+. `/schema/*` is admin-only. SDK: `schemaDiff(snapshot, { force, mode })`.
- Docker 12.1+ images have no `npx`: `docker compose exec directus node /directus/cli.js schema apply ...`.

## Go deeper

1. Directus docs MCP server: `https://directus.com/docs/mcp` (no auth; tools `search-docs`, `get-doc`, `list-docs`,
   `search-directus-code`, `get-directus-file`). The CLI lives at `packages/cli` in the main repo.
2. Raw markdown for any docs page: `https://directus.com/docs/raw/<path>.md`, for example
   `https://directus.com/docs/raw/guides/environment-sync/reference.md`. Index: `https://directus.com/docs/llms.txt`.
3. The instance and the CLI themselves: `d6s <command> --help`, the CLI's named errors and hints, `GET /server/info`,
   `GET /server/specs/oas`, and the schema.
