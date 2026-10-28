# How it works

- [Sync files](#sync-files)
- [What syncs](#what-syncs)
- [Record identity](#record-identity)
- [How a push applies](#how-a-push-applies)
- [Push modes and deletions](#push-modes-and-deletions)
- [The compatibility gate](#the-compatibility-gate)
- [Pushing into a core-tier target](#pushing-into-a-core-tier-target)
- [Schema snapshot and apply](#schema-snapshot-and-apply)

Full mechanics: https://directus.com/docs/guides/environment-sync/how-it-works. This page keeps what agents get wrong.

## Sync files

```
directus.config.json      # profiles + project options, no credentials (commit)
directus/default/         # <directory>/<project>/
  schema/                 # one JSON file per collection, plus metadata.json
  data/                   # one JSON file per configuration resource, plus metadata.json
  id_map.json             # written by pushes: source record -> target record, keyed by URLs (commit)
```

- A pull overwrites only the files in its requested scope. A push applies only what is on disk, never the source.
- The CLI never checks git: a push applies uncommitted edits too. Keep the tree clean so disk matches the reviewed
  commit.
- Output is deterministic; `git diff` after a pull shows only real instance changes.
- Hand-edited or corrupt files stop the command with a named error. **Recommended:** model in the Data Studio and pull.
  Don't author sync files by hand.

## What syncs

| Axis | Contents | Scope with |
| --- | --- | --- |
| Schema | Collections, fields, relations, including custom fields on system collections and collection folders | `--collections`, `--exclude-collections`, `--no-schema` |
| Configuration | Roles, policies, access, permissions, flows, operations, dashboards, panels, settings, folders, translations; users opt-in | `--roles`, `--flows`, `--no-settings`, `--all`, ... |

The axes scope independently: resource flags never narrow Schema; `--collections` never narrows Configuration.

Not synced: items in your own collections, `directus_files` records and binaries, presets/bookmarks, extensions and
their enabled state, comments, activity, revisions, versions, notifications, shares, sessions, migrations. The CLI never
runs migrations or changes the Directus version.

**Settings is one record and pushes whole,** overwriting the target's `preview_base_url`, `project_url`, and other
per-environment values. Only secrets, branding images, `project_id`, and the default storage folder are stripped
([troubleshooting.md](troubleshooting.md#secrets)). To keep per-environment settings, pull with `--no-settings` or set
`"excludeResources": ["settings"]` on the project, and delete any settings file an earlier pull wrote (a scoped pull
leaves it in place).

## Record identity

The same role or flow has a different primary key on each instance. A push matches records by:

1. **ID map** (`id_map.json`), keyed by source and target URL, so one file serves many targets.
2. **Identifying fields** for unmapped records: `name` (roles, policies, dashboards), `name` + `folder` (flows),
   `name` + `parent` + `type` (folders), `email` (users), `role` + `user` + `policy` (access),
   `policy` + `collection` + `action` (permissions), `flow` + `key` (operations), `language` + `key` (translations).
   **Panels have none; ID map only.**

- **Ambiguous match** (two target candidates): interactive runs ask; non-interactive runs refuse. Answers go into the
  ID map.
- **Commit `id_map.json` after every push that changes it.** Losing it changes neither instance, but matching starts
  over: named records re-match, panels duplicate. Repointing a profile URL also starts fresh mappings.

## How a push applies

1. Reconcile identity (prompts if interactive, refuses if not).
2. Interactive runs dry-run Configuration on the target (server transaction, rolled back) and print the plan.
3. Confirm. Non-interactive runs need `--yes`; planned deletions need their own consent on top.
4. **Schema phase,** applied with the server-issued hash from the plan. If the target's schema changed since the plan,
   the apply is refused.
5. **Configuration phase:** all records import in one server transaction.

The phases are **not** one transaction. If Configuration fails after Schema applied, run `d6s sync diff`, then push
again; a re-run applies only what is missing. Only the Schema apply is sealed against target drift; the Configuration
preview is advisory. On PostgreSQL, `diff`'s rolled-back dry run can advance integer sequences. Harmless.

## Push modes and deletions

| Mode | Schema | Configuration | Deletes |
| --- | --- | --- | --- |
| `add` | Adds and modifies | Creates only, never updates existing records | No |
| `merge` (default) | Adds and modifies | Creates and updates | No |
| `mirror` | May delete in scope | Creates, updates, deletes records absent from files | Yes, gated |

Resolution: `--mode` flag, then the project's `mode`, then `merge`.

- Deletion consent is separate from apply confirmation: type the profile name (interactive) or pass
  `--dangerously-allow-delete` (otherwise a mirror push refuses before changing anything).
- Mirror deletes only within what the sync files cover: a collection-scoped project can delete fields inside its
  collections, never a collection it doesn't contain.
- Mirror from files a source left **incomplete** (hidden permissions) is refused outright.
- Removing a field drops its column and its content. Only a database backup brings that back.

## The compatibility gate

The CLI diffs schema through `POST /schema/diff`, which refuses a snapshot whose `directus` version differs from the
target's (patch included) or whose `vendor` differs from the target's database client. The CLI names a version mismatch
up front; a vendor mismatch comes back as the server's refusal (`STATE` error).

- Fix by aligning versions, then re-pulling from the upgraded source.
- `--allow-drift` (diff, push) sends `force=true` and prints `Compatibility check bypassed`. It translates nothing.
- Projects with `"schema": false` skip this check. The 12.2.0 minimum still applies.

## Pushing into a core-tier target

An unlicensed target enforces core limits on what a push writes (tiers and limits: `directus-access-control`).

| Files contain | Result on a core-tier target |
| --- | --- |
| Permissions with custom rules (item filter, field list other than `*`, validation, presets) | Configuration import fails `403 RESOURCE_RESTRICTED`, `category: custom_permission_rules_enabled`; no configuration lands. The diff's dry run hits the same error |
| More active collections than the limit | Schema apply fails `403 LIMIT_EXCEEDED`, `category: collections`; the schema transaction rolls back |
| More flows than the limit | Configuration import fails `403 LIMIT_EXCEEDED`, `category: flows` |
| Custom LLM settings (`ai_openai_compatible_base_url`, `_name`, or `_models` set; the CLI strips only key and headers) | Configuration import fails `403 RESOURCE_RESTRICTED`, `category: custom_llms_enabled` |

Fix by licensing the target, or by leaving out what it isn't entitled to: whole permission rows (the target then denies
that action), extra collections or flows, or the custom LLM settings (exclude `settings`, or clear those fields on the
source). Never strip a rule's filter, field list, validation, or preset to make a row fit: the grant stays and gets
wider. An unlicensed **source** hiding its custom rules: [troubleshooting.md](troubleshooting.md#known-limitations).

## Schema snapshot and apply

The schema-only tools (`directus schema snapshot` / `apply` inside the server, and `/schema/*` REST) don't share
Environment Sync's guards. Each path checks something different:

| Path | Version + vendor check | Hash check (target changed since diff) | Deletes |
| --- | --- | --- | --- |
| CLI `directus schema apply <file>` | **None.** Applies any version or vendor | None; diffs against the live DB | Everything the snapshot lacks, minus `--ignoreRules` |
| `POST /schema/diff` | Yes. `force=true` bypasses it | n/a | `mode` defaults to `mirror`; pass `mode=merge` to plan no deletes |
| `POST /schema/apply` (body: the diff) | No (it never sees the snapshot) | Yes. `force=true` bypasses it | Whatever the diff contains |

- **The CLI apply is the dangerous one.** Compare the snapshot's `directus` and `vendor` keys with the target yourself,
  and run `--dry-run` first.
- The CLI apply also loads the license, so it can fail with `LIMIT_EXCEEDED` like a push.
- On 12.2+, a valueless `?force` counts as `true` on both endpoints. Send `force=false` or omit it.
- `/schema/*` is admin-only. SDK: `schemaDiff(snapshot, { force, mode })`.
- Docker 12.1+ images have no `npx`: `docker compose exec directus node /directus/cli.js schema apply ...`.
- Best for schema-only CI, pre-12.2 instances, and pre-upgrade backups. Environment Sync is for ongoing promotion
  reviewed in git. `directus-template-cli` (starting a project from a template) also moves permissions, content, files,
  and users; its deletes aren't documented and cross-vendor isn't recommended.

## Sources

- https://directus.com/docs/guides/environment-sync/how-it-works
- https://directus.com/docs/guides/environment-sync/secrets-and-limitations
- https://directus.com/docs/guides/content/live-preview
- https://directus.com/docs/api/schema
- https://github.com/directus/directus/blob/v12.6.0/packages/cli/src/commands/sync/push.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/cli/src/commands/sync/utils/resources.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/cli/commands/schema/apply.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/schema.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/schema.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/schema/validate-snapshot.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/schema/validate-diff.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/permissions.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/collections.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/flows.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/import/import.ts
- https://github.com/directus-labs/directus-template-cli/blob/main/README.md
