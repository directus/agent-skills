# CI and automation

- [Non-interactive rules](#non-interactive-rules)
- [Credentials in CI](#credentials-in-ci)
- [JSON reports](#json-reports)
- [GitHub Actions pipeline](#github-actions-pipeline)
- [ID map durability](#id-map-durability)
- [Mirror in automation](#mirror-in-automation)

## Non-interactive rules

A run is non-interactive when `CI` is non-empty, `NO_INTERACTIVE` is set, `--no-interactive` or `--json` is passed, or
stdin/stdout is not a TTY. Every prompt becomes a refusal: a push needs `--yes`; any deletion (mirror or schema) needs
`--dangerously-allow-delete`, which `--yes` never covers; an ambiguous record match refuses (resolve once
interactively, commit `id_map.json`); the `d6s sync` wizard refuses; `d6s profile remove` needs `--yes`; a missing
credential fails and names the env var or flag to set.

Exit codes: `0` success, `1` any refusal or failure, nothing finer. `d6s sync diff` exits `0` whether or not there are
differences; gate on the report's `changes` field.

## Credentials in CI

- `DIRECTUS_<PROFILE>_TOKEN`, profile name uppercased: `staging_eu` → `DIRECTUS_STAGING_EU_TOKEN`.
  `~/.directus/credentials.json` is never read when `CI` is non-empty. A non-admin token fails every sync command
  with `AUTH`.
- **Verify the profile URL before any step gets the token.** A pull request could repoint `production` at another host
  and receive the secret. The pipeline below compares `.profiles.production.url` against a repository variable.
- Skip fork PRs for token-bearing jobs (GitHub withholds secrets from them anyway).

## JSON reports

`--json` puts exactly one single-line report on stdout; warnings (stripped secrets, `--allow-drift` bypass, flow headers
written verbatim) stay on stderr. On failure, stdout holds `{"error": {"code", "message", "hint"}}` **instead of** the
success report. Pipe through `tee` so failures still show in logs. Full field list:
https://directus.com/docs/guides/environment-sync/reference. What automation gets wrong:

- **Check `error.code` first.** A failure report has no `changes` field, so `report.changes` reads as falsy.
- `changes` is the only "something to push" signal. It is `true` for unresolved ambiguous matches too, which a
  non-interactive push will refuse (`data.reconciliation.ambiguous`).
- `data.resultsByCollection[c].existing` counts every matched record. Real updates = `existing` minus `data.unchanged`.
- `data.incomplete` (pull, diff) lists resources the source cut short; a mirror push will refuse.
- Use optional chaining (`report.data?.…`). `data` is `null` with no configuration files; on push,
  `data.reconciliation` and `data.unchanged` are `null`.

## GitHub Actions pipeline

Adapted from the docs (which also post the diff report as a PR comment): diff on PRs, push on merge to `main`.
Secret `DIRECTUS_PRODUCTION_TOKEN`, variable `DIRECTUS_PRODUCTION_URL`. The CLI is pinned to `12.4.0` (the release that ships with Directus 12.6.0); bump it
deliberately after reading the CLI's release notes, since flags and report fields can change between minors.

```yaml
name: environment-sync

on:
  pull_request:
  push:
    branches: [main]

jobs:
  diff:
    if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g @directus/cli@12.4.0
      - name: Verify the production profile URL
        env:
          EXPECTED_URL: ${{ vars.DIRECTUS_PRODUCTION_URL }}
        run: |
          actual=$(jq -r '.profiles.production.url // "<missing>"' directus.config.json)
          if [ -z "$EXPECTED_URL" ] || [ "$actual" != "$EXPECTED_URL" ]; then
            echo "Unexpected production profile URL: $actual"
            exit 1
          fi
      - name: Diff against production
        shell: bash
        run: d6s sync diff --to production --json | tee diff-report.json
        env:
          DIRECTUS_PRODUCTION_TOKEN: ${{ secrets.DIRECTUS_PRODUCTION_TOKEN }}

  push:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    concurrency:
      group: environment-sync-production
      cancel-in-progress: false
    permissions:
      contents: write
      issues: write
    env:
      GH_TOKEN: ${{ github.token }}
    steps:
      # The branch name, not the event SHA: a queued run starts after the previous run committed its ID map.
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.ref_name }}
      - name: Block while an ID map recovery is open
        run: |
          open=$(gh issue list --label env-sync-recovery --state open --json number --jq length)
          if [ "$open" != "0" ]; then
            echo "::error::An env-sync-recovery issue is open. Commit the recovered id_map.json and close it first."
            exit 1
          fi
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g @directus/cli@12.4.0
      - name: Load the latest ID map (before the URL check, so it checks what gets pushed)
        run: git pull --ff-only origin "$GITHUB_REF_NAME"
      - name: Verify the production profile URL
        env:
          EXPECTED_URL: ${{ vars.DIRECTUS_PRODUCTION_URL }}
        run: |
          actual=$(jq -r '.profiles.production.url // "<missing>"' directus.config.json)
          if [ -z "$EXPECTED_URL" ] || [ "$actual" != "$EXPECTED_URL" ]; then
            echo "Unexpected production profile URL: $actual"
            exit 1
          fi
      - name: Push to production
        shell: bash
        run: d6s sync push --to production --yes --json | tee push-report.json
        env:
          DIRECTUS_PRODUCTION_TOKEN: ${{ secrets.DIRECTUS_PRODUCTION_TOKEN }}
      - name: Keep a copy of the ID map
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: id-map-${{ github.run_id }}
          path: directus/*/id_map.json
          if-no-files-found: ignore
          retention-days: 90
      - name: Commit the updated ID map
        if: ${{ !cancelled() }}
        shell: bash
        run: |
          if [ -z "$(git status --porcelain -- 'directus/*/id_map.json')" ]; then exit 0; fi
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add 'directus/*/id_map.json'
          git commit -m "Update sync ID map"
          for attempt in 1 2 3; do
            if git pull --rebase origin "$GITHUB_REF_NAME" && git push origin "HEAD:$GITHUB_REF_NAME"; then exit 0; fi
            git rebase --abort 2>/dev/null || true
            sleep 10
          done
          gh label create env-sync-recovery --color B60205 --force
          gh issue create --label env-sync-recovery \
            --title "Environment Sync: commit the ID map from run $GITHUB_RUN_ID" \
            --body "Production changed but the ID map was not committed. Download artifact id-map-$GITHUB_RUN_ID, commit its id_map.json to $GITHUB_REF_NAME, then close this issue. Pushes stay blocked until then."
          echo "::error::Production changed but the ID map was not committed. See the env-sync-recovery issue."
          exit 1
```

`shell: bash` matters: it runs with `pipefail`, so a failed `d6s` fails the step even through `tee`.

## ID map durability

**Do the first push into each target interactively, locally.** It raises the identity questions CI refuses. Commit
`id_map.json`, then turn on CI.

The ID map is the one thing CI can lose: a push that created records (even one that failed partway) wrote real
mappings to the runner's disk. The push job checks out the branch head (not the triggering SHA) after the
`concurrency` queue lets it run and pulls `--ff-only` again before the URL check and `d6s sync push`, so a queued run sees the map the
previous run committed and the check covers the config that gets pushed. It uploads the map as an artifact on every run (`always()`), and the commit-back rebases
and retries if `main` moved. If the commit still fails, it opens an `env-sync-recovery` issue and goes red; every later
push job refuses while that issue is open. Commit the artifact's `id_map.json`, close the issue, then re-run any push
job it blocked.

Gaps to cover by hand:

- **One queue per target.** Use the same `concurrency` group in any other workflow that pushes to production. A push
  from a laptop bypasses the queue: pull `main` first and commit the map right after.
- **Don't cancel a running push job.** `cancel-in-progress: false` queues the next run instead. GitHub keeps one
  pending run per group; a newer one replaces it, and it pushes the branch head anyway.
- **A cancelled run or a dead runner opens no issue.** If that happens mid-push, open an `env-sync-recovery` issue by
  hand, recover the map from the artifact if one uploaded, and run `d6s sync diff` before the next push.
- **The bot must be able to push to `main`.** Branch protection that requires PRs blocks `github-actions[bot]`; give
  it a bypass, or the commit-back fails on every run. `GITHUB_TOKEN` commits don't trigger workflows, so no loop.

## Mirror in automation

```bash
d6s sync push --to staging --mode mirror --yes --dangerously-allow-delete
```

**House rule (from the docs):** reserve this for pipelines that rebuild disposable environments. Keep production on
`merge` unless a human reviewed the deletions in a mirror diff.

## Sources

- https://directus.com/docs/guides/environment-sync/ci-and-automation
- https://directus.com/docs/guides/environment-sync/reference
- https://github.com/directus/directus/blob/v12.6.0/packages/cli/src/kernel/run.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/cli/src/kernel/env.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/cli/src/kernel/config/credentials.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/cli/src/commands/sync/push.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/cli/src/commands/sync/wizard.ts
- https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs
- https://github.com/actions/checkout#usage
