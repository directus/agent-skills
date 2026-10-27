# Setup

## Install

- `npm install -g @directus/cli@12`, then `d6s --version`. Node 22+. `directus-cli` is the same program as `d6s`.
- Pin `@12`. The same package name carried a deprecated 9.x client CLI (bins `directusctl`, `directus-ctl`). The CLI
  version doesn't need to match Directus; every instance needs 12.2.0+, checked before each pull, diff, and push.

## Profiles

A profile is a name plus an instance URL. Names use letters, numbers, and underscores (`staging_eu`, not `staging-eu`),
because the name becomes an environment variable.

```bash
d6s profile add dev --url http://localhost:8055 --token <admin-token>
d6s profile add production --url https://cms.example.com      # prompts for a token or email/password login
d6s profile test-connection production                         # prints "Authenticated to <url> as <user> (<role>)."
d6s profile update production --url https://new.example.com --yes
d6s profile update production --name prod                      # rename separately from URL/credential changes
```

- `profile add` refuses an existing name; use `profile update`.
- URLs with embedded credentials, a query string, or a fragment are refused (the URL is committed).
- Changing a URL clears the credential saved for the old URL; a `DIRECTUS_<PROFILE>_TOKEN` env var follows the profile.
  Renaming moves the saved credential and changes which env var is read.
- A new URL starts a fresh set of ID map entries (keyed by URL). See [how-it-works.md](how-it-works.md#record-identity).

## directus.config.json

`profile add` creates it in the current directory. Commands find it by walking up from the current directory (like git
finds `.git`), or take `--config <path>`. It never holds credentials. Commit it.

```json
{
	"profiles": {
		"staging": { "url": "https://staging.example.com", "auth": { "type": "token" } },
		"production": { "url": "https://cms.example.com", "auth": { "type": "token" } }
	},
	"directory": "directus",
	"format": "json",
	"projects": {
		"default": {
			"schema": true,
			"collections": ["pages", "posts"],
			"resources": ["flows", "settings"],
			"mode": "merge"
		}
	}
}
```

Key reference: https://directus.com/docs/guides/environment-sync/reference#directusconfigjson.

## Credentials

Resolution order:

1. `--token` on `profile add`, `profile update`, or `profile test-connection`. The `sync` commands have no token flag.
2. `DIRECTUS_<PROFILE>_TOKEN`, profile name uppercased. No unprefixed fallback. A `.env` next to
   `directus.config.json` is loaded automatically and never overrides a real env var. Keep it out of git if it holds
   tokens.
3. `~/.directus/credentials.json` (mode `0600`): a static token or a self-refreshing login session. **Never read when
   `CI` is non-empty.**

## Projects

A project is a named slice of the sync with its own folder, `<directory>/<project>/`. `default` exists undeclared;
select another with `--project <name>`. Command-line flags override project keys for that run.

Keys mirror the command-line scope: `schema` (`false` = configuration-only), `collections` / `excludeCollections`,
`resources` / `excludeResources`, `mode`, `deps`. Common uses: a configuration-only project for flows, or
`"excludeResources": ["settings"]` so each environment keeps its own settings
([how-it-works.md](how-it-works.md#what-syncs)). Refused as contradictions: `"schema": false` with a collections scope,
and an include plus an exclude list on the same axis.

**House rule:** don't set `"mode": "mirror"` as a project default. Pass `--mode mirror` explicitly.

## First pull

```bash
git init                                   # if needed; the CLI never reads git state
d6s sync pull --from dev
git add directus/ directus.config.json
git commit -m "Baseline from dev"
```

Pulling twice with no instance changes produces byte-identical files. Next: [workflows.md](workflows.md).

## Sources

- https://directus.com/docs/guides/environment-sync
- https://directus.com/docs/guides/environment-sync/quickstart
- https://directus.com/docs/guides/environment-sync/reference
- https://github.com/directus/directus/blob/v12.5.1/packages/cli/package.json
- https://github.com/directus/directus/blob/v12.5.1/packages/cli/src/kernel/run.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/cli/src/kernel/env.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/cli/src/kernel/config/credentials.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/cli/src/commands/sync/utils/preflight.ts
- `npm view @directus/cli@9.14.3 deprecated bin` (deprecated 9.x client CLI)
