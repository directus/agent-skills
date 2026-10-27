# Command reference

Every command, flag, resource, and JSON field: https://directus.com/docs/guides/environment-sync/reference. For the
installed version, `d6s <command> --help` is authoritative. This page keeps the commands agents run and the flag rules
they trip on.

## The commands

```bash
d6s profile add <name> --url <url> [--token <token>]   # then: d6s profile test-connection <name>
d6s sync pull --from <profile> [--collections a,b] [--<resource> | --no-<resource> | --all] [--no-schema]
d6s sync diff --to <profile> [--mode add|merge|mirror] [--json]
d6s sync push --to <profile> [--mode ...] [--yes] [--dangerously-allow-delete] [--json]
```

`directus-cli` is the same binary as `d6s`. Every sync command takes `--project <name>` (default `default`) and
`--allow-drift` (diff, push only; see [how-it-works.md](how-it-works.md#the-compatibility-gate)). `d6s sync` alone is an
interactive wizard; never use it in automation.

## Flag rules that refuse or surprise

- A bare pull takes every selectable resource except `users`. `--all` adds users.
- Positive resource flags (`--flows`) can't combine with `--all` or with `--no-` flags.
- An exclusion a retained resource needs is refused: `--no-policies` alone fails (roles need policies), so add
  `--no-roles`. `--no-folders` alone fails (flows need folders).
- **Select `--roles`, not `--policies` alone.** Policies without roles can fail to push to a fresh target when access
  rows reference roles.
- Dependents always travel with their parent: permissions and access with policies, operations with flows, panels with
  dashboards. `--no-deps` drops prerequisites only.
- `--collections` and `--exclude-collections` scope Schema only and can't be combined. Scoped pulls warn on names the
  server didn't return (usually typos) and on out-of-scope references; they never auto-widen.
- `--mode` on `diff` must match the push you plan. A `merge` diff never shows deletions; use `--mode mirror` to preview
  removals.

## Error codes

`--json` failures report `error.code`; the process exits `1` for all of them.

| Code              | Meaning                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `USAGE`           | Fix the command line: missing flag, missing `--yes`, missing delete consent                         |
| `UNKNOWN_COMMAND` | No such command                                                                                     |
| `CONFIG`          | `directus.config.json` missing, invalid, or contradicts the request                                 |
| `AUTH`            | Credential rejected, or not an admin                                                                |
| `HTTP`            | Instance unreachable or returned an error (including license errors from the target)                |
| `STATE`           | Files and instance disagree: version mismatch, target schema changed, incomplete pull, below 12.2.0 |
| `UNKNOWN`         | Anything else                                                                                       |

Symptoms and fixes: [troubleshooting.md](troubleshooting.md).

## Sources

- https://directus.com/docs/guides/environment-sync/reference
- https://github.com/directus/directus/blob/v12.5.1/packages/cli/src/kernel/run.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/cli/src/commands/sync/pull.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/cli/src/commands/sync/diff.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/cli/src/commands/sync/push.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/cli/src/commands/sync/utils/resources.ts
