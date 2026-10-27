# Workflows

- [Promote dev to production](#promote-dev-to-production)
- [Promote only what's ready](#promote-only-whats-ready)
- [Adopt on an existing project](#adopt-on-an-existing-project)
- [Roll back a bad push](#roll-back-a-bad-push)
- [Rebase an environment after drift](#rebase-an-environment-after-drift)
- [Stand up a new environment](#stand-up-a-new-environment)
- [After a Directus upgrade](#after-a-directus-upgrade)

Profile names (`dev`, `staging`, `production`) are examples. Read `directus.config.json` for the real ones.

## Promote dev to production

```bash
d6s sync pull --from dev
git diff                                   # only your change should show
git add directus/ && git commit -m "Add author bio fields"
d6s sync diff --to production              # in the PR, or in CI with --json
d6s sync push --to production              # on merge; --yes in CI
git add directus/*/id_map.json && git commit -m "Update sync ID map"   # if it changed
```

**Removals (a dropped field, a deleted flow) don't propagate under `merge`.** Full pull first, then
`diff --mode mirror`, then `push --mode mirror` with deletion consent.

## Promote only what's ready

Shared dev instance, `posts` is done, `authors` is half-built: `d6s sync pull --from staging --collections posts`.

- Only `posts` schema files are overwritten; `authors` keeps its last pulled state (what production runs).
- Configuration defaults are still overwritten (a collection scope narrows Schema only). If an unrelated flow changed,
  add `--no-flows`. Config-only change: `d6s sync pull --from staging --flows --no-schema`.
- Scope is by collection and resource type, never by record. Two changes in one collection, or two flows, travel
  together: ship together or wait. Permissions come with policies, operations with flows.
- The push applies the whole project on disk; unchanged files are no-ops.
- **Don't `mirror` while files hold a partial picture.** It would apply the stale remainder, deletes included.

## Adopt on an existing project

1. Pull the instance closest to the desired state (usually production) as the baseline:
   `d6s profile add production --url https://cms.example.com`, `d6s sync pull --from production`, commit.
2. Measure drift on each other instance with `d6s sync diff --to staging`. Read a long first diff as an inventory, not
   a to-do list.
3. Align gradually with `merge`; staging-only experiments survive. Switch to `mirror` only once nothing outside the
   files is worth keeping.
4. Expect identity questions on the first push (two "Editor" roles, look-alike flows). Answer interactively, commit
   `id_map.json`.

Unsure? Rehearse against throwaway instances (the docs Quickstart has a two-instance Docker Compose file).

## Roll back a bad push

Git holds every reviewed state. Revert, then push. A bad change that **modified** something: revert + `merge` restores
old values. One that **added** something: `merge` can't remove it, removal needs `mirror`.

```bash
git revert <bad-commit>
d6s sync diff --to production --mode mirror      # a merge preview can't show removals
d6s sync push --to production --mode mirror      # type "production" to consent
```

- The mirror diff's deletes must be exactly what the bad change added. Anything else means stale files: stop,
  full-pull production on a scratch branch, fold in what's worth keeping, then mirror.
- **Back up the target database first** if an added field has collected content. Mirroring it away drops the column.
- Tangled with good changes? Fix forward: correct on dev, pull, promote.

## Rebase an environment after drift

Someone hotfixed production by hand. Bring the fix into git, then realign lower environments:

```bash
d6s sync pull --from production
git diff                                          # this is the record of the hotfix
git add directus/ && git commit -m "Adopt production hotfix"
d6s sync diff --to staging --mode mirror          # read every delete
d6s sync push --to staging --mode mirror
```

Mirror removes staging-only work in scope. Pull that work into a branch first, or use `merge` and clean up by hand.

**House rule:** catch drift early: on a CI cron, `d6s sync pull --from production --json`, then commit or open a PR if
`git status --porcelain directus/` is non-empty. A clean tree means no drift. Pulls are read-only on the source.

## Stand up a new environment

1. Fresh instance at the **same Directus version and DB vendor**, with an admin and a static token.
2. Deploy the same extensions first. Fields on custom interfaces and flows using custom operations push without a
   warning and arrive broken otherwise.
3. Push the full project, not a scoped slice (relations to collections outside the scope can fail on an empty target):
   `d6s profile add staging --url ... --token <token>`, `d6s sync diff --to staging`, `d6s sync push --to staging`.
4. Commit the updated `id_map.json`.
5. Set stripped secrets by hand (settings API keys, concealed/encrypted field values), and fix per-environment settings
   the push copied (Preview Base URL, project URL).
6. Core-tier target? See [how-it-works.md](how-it-works.md#pushing-into-a-core-tier-target).

Content (items, files) doesn't come along. Seed it with an idempotent seed script (`directus-content-modeling`,
applying-schema.md) or a database restore.

## After a Directus upgrade

Upgrade every instance in the chain to the same version (`directus-upgrade` skill), then `d6s sync pull` again from the
source so the sync files record the new version. **House rule:** don't reach for `--allow-drift` to paper over a
planned upgrade.

## Sources

- https://directus.com/docs/guides/environment-sync/common-workflows
- https://directus.com/docs/guides/environment-sync/quickstart
- https://directus.com/docs/guides/environment-sync/how-it-works
- https://directus.com/docs/guides/environment-sync/ci-and-automation
- https://directus.com/docs/guides/environment-sync/secrets-and-limitations
- https://github.com/directus/directus/blob/v12.5.1/packages/cli/src/commands/sync/pull.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/cli/src/commands/sync/push.ts
