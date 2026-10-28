# Troubleshooting and limitations

## Refusals and errors

The CLI fails loudly with a named error and an indented hint. Read the hint first; it usually names the fix.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Environment Sync needs Directus 12.2.0 or later` (`STATE`) | Instance below 12.2.0 | Upgrade it (`directus-upgrade` skill) |
| `Environment Sync needs an admin token` (`AUTH`) | Token belongs to a non-admin | `d6s profile update <name> --token <admin-token>` |
| `Version mismatch: the snapshot was pulled from Directus X, but the target runs Y` (`STATE`) | Patch versions differ | Align versions, re-pull. `--allow-drift` only if you accept the risk |
| Incompatible snapshot, server reason mentions `vendor` (`STATE`) | Different DB vendors (e.g. SQLite dev, Postgres prod) | Same vendor everywhere. `--allow-drift` does not rewrite column types |
| `Refusing to apply changes without confirmation` (`USAGE`) | Non-interactive push without `--yes` | Add `--yes` |
| `Refusing mirror mode in a non-interactive context without --dangerously-allow-delete` | Mirror in CI without consent | Review a mirror diff, then add `--dangerously-allow-delete`, or use `--mode merge` |
| `This push includes N schema deletions` (`USAGE`) | Non-interactive push carries deletions | Same as above. `--yes` doesn't cover it |
| `Push refused: N target match needs a choice` | Ambiguous identity in CI | Run the push interactively once, commit `id_map.json` |
| `Refusing mirror: the configuration ... is incomplete for ...` | Source hid records at pull (unlicensed custom permissions) | License the source and re-pull, or push with `merge` |
| Target schema changed while pushing | Someone edited the target between plan and apply | Re-run `d6s sync push` for a fresh plan |
| `Schema was applied, but the configuration push did not complete` | Config import failed after schema applied | `d6s sync diff`, then push again; it applies only what's missing |
| A referenced record is missing on the target | Scoped pull left a dependency out, or pushing a slice to a fresh target | Widen `--collections` / resource flags and re-pull, or push the full project |
| `Instance limit exceeded for <url>` (`HTTP`), detail `LIMIT_EXCEEDED` | Core-tier target: more collections or flows than its license allows | License the target, or push fewer. See [how-it-works.md](how-it-works.md#pushing-into-a-core-tier-target) |
| `Request to <url> failed (HTTP 403)`, detail `RESOURCE_RESTRICTED` | Core-tier target rejects custom permission rules or custom LLM settings | License the target, or drop whole permission rows. **Never** strip a rule's filter or field list (widens access). See [how-it-works.md](how-it-works.md#pushing-into-a-core-tier-target) |
| Target's Preview Base URL or project URL now points at another environment | Settings were pushed; the record goes over whole | Reset it on the target; exclude `settings` from the project. See [how-it-works.md](how-it-works.md#what-syncs) |
| Duplicated panels after a first push into a look-alike target | Panels have no identifying field | Delete the duplicates on the target once; the ID map prevents repeats. Commit it |
| Fields or flows broken in the Studio after push | Custom extension missing on target | Deploy the extension to the target. Nothing warns about this |
| `--users` push fails import | A user without an email | Give it an email on the source, or remove it, then re-pull |

## Secrets

Stripped on every pull that includes Configuration:

- Built-in secrets: user `password`, `token`, `tfa_secret`, `auth_data`; license and AI keys in settings.
- Values of any field marked concealed, hashed, or encrypted. The CLI fetches `GET /fields` on each pull, even when
  Schema is scoped or skipped, and prints each dropped field. If that check can't run, the pull stops.

The field definition still syncs; only the value stays behind. Set real secrets on each instance. Stripping also
protects the target: the server returns masks (`**********`) or hashes, and pushing them back would overwrite working
secrets.

**Blind spot: flow operation options are written verbatim.** An `Authorization` header, a `?api_key=` query param, or
a token in a request body lands in the sync file as-is. The pull warns by operation name when it sees headers, a URL
with a query string or embedded credentials, or a body. It can't catch a secret in a plain URL path. Review `data/`
operation files before committing.

**Recommended:** keep secrets out of flow operation options. Add the variable to `FLOWS_ENV_ALLOW_LIST` on each
instance and reference it as `{{$env.MY_API_KEY}}`, so the sync file holds the reference, not the value.

## Known limitations

- **Unlicensed source hides custom permission rules** (filters, field limits, validation, presets). The pull marks
  itself incomplete: `merge` and `add` still push, `mirror` refuses.
- **Mirror of users doesn't protect your own account.** If users are in scope and the pushing admin isn't in the sync
  files, mirror orders its deletion. Include the sync accounts in the files.
- **No undo.** Revert in git and push again (removals need `mirror`). Only a DB backup restores content.

## Sources

- https://directus.com/docs/guides/environment-sync/secrets-and-limitations
- https://directus.com/docs/guides/environment-sync/how-it-works
- https://directus.com/docs/guides/environment-sync/reference
- https://directus.com/docs/guides/environment-sync/common-workflows
- https://directus.com/docs/configuration/flows
- https://directus.com/docs/guides/flows/data-chain
- https://github.com/directus/directus/blob/v12.6.0/api/src/flows.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/cli/src/commands/sync/push.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/cli/src/commands/sync/pull.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/cli/src/commands/sync/utils/preflight.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/cli/src/commands/sync/utils/resources.ts
