<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/directus-logotype-dark.svg">
    <img alt="Directus" src=".github/assets/directus-logotype.svg" width="320">
  </picture>
</p>

<h1 align="center">Agent Skills</h1>

<p align="center">
  Teach your AI coding agent to work with Directus: the API and MCP server, Flows, Insights, access control, content modeling,
  Environment Sync, the SDK and visual editing, extensions, self-hosting, and upgrades.
</p>

<p align="center">
  <a href="https://directus.com">Website</a> • <a href="https://directus.com/docs">Documentation</a> •
  <a href="https://agentskills.io">Agent Skills standard</a>
</p>

---

The official [Agent Skills](https://agentskills.io) bundle for [Directus](https://directus.com). Each skill is a short
router that loads only the reference an agent needs for the task, plus the traps it would otherwise get wrong. Verified
against **Directus 12.6.0**.

## Skills

| Skill                                                           | Use it for                                                                                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`directus`](skills/directus)                                   | Working with a running instance: REST and GraphQL queries, filters, auth, files, realtime, content versions, and the Directus MCP server                                                  |
| [`directus-flows`](skills/directus-flows) | Automating with Flows: triggers, the data chain, operations, reusable utility flows, loops, email, building and debugging flows over the API or MCP |
| [`directus-insights`](skills/directus-insights) | Building Insights dashboards: panel types and options, variables, layout, and who can see them |
| [`directus-access-control`](skills/directus-access-control)     | Designing who can do what: roles, policies, permissions, the public policy, stacking rules, core-tier licensing limits, the CMS starter layout, and testing access                               |
| [`directus-content-modeling`](skills/directus-content-modeling) | Designing schemas: collections, fields, relationships, page builders (M2A), translations, indexes, and starting a project from a starter. Includes Directus's house conventions.                      |
| [`directus-environment-sync`](skills/directus-environment-sync) | Moving schema and configuration between instances through git with the Directus CLI (`d6s`): setup, promote dev to prod, CI, rollback                                                            |
| [`directus-sdk`](skills/directus-sdk)                           | Building frontends and apps with `@directus/sdk`: setup, auth, typing, Next.js / Nuxt / Astro / SvelteKit data fetching                                                                          |
| [`directus-visual-editing`](skills/directus-visual-editing)     | Wiring a site to Live Preview, the Visual Editor, and content versions with `@directus/visual-editing`: Directus config, CSP, draft reads, editable page builder blocks, and safe preview tokens |
| [`directus-extensions`](skills/directus-extensions)             | Building extensions: picking a type, scaffolding, app and API extension APIs, sandboxing, and publishing to the marketplace                                                                      |
| [`directus-self-hosting`](skills/directus-self-hosting) | Deploying and running Directus: Docker Compose, configuration, file storage and email, scaling past one instance, backups, and what differs on Directus Cloud |
| [`directus-upgrade`](skills/directus-upgrade)                   | Upgrading a project across versions (v9 to 12.x), with the breaking changes and how to find affected code                                                                                        |

## Install

### Any agent (skills CLI)

```bash
npx skills@latest add directus/agent-skills
```

Installs into Claude Code, Cursor, Codex, Gemini CLI, GitHub Copilot, and other agents that support the standard.
Add `--skill directus-sdk` to install one skill.

### Claude Code (plugin)

```bash
claude plugin marketplace add directus/agent-skills
claude plugin install directus@directus-agent-skills
```

### Codex (plugin)

```bash
codex plugin marketplace add directus/agent-skills
codex plugin add directus@directus-agent-skills
```

Codex reads the same `.claude-plugin/` manifests. Each skill also has `agents/openai.yaml` with its name, blurb, and
example prompt for the Codex skill picker.

### Manually

Copy any folder under `skills/` into your agent's skills directory: `.claude/skills/` for Claude Code, `.agents/skills/`
for most other agents.

## Connect the MCP servers

The skills work without MCP, but they're better with it. Two servers:

- **Directus docs** is bundled with the Claude Code plugin and connects automatically on install.
- **Your instance** can't be bundled (every URL and token is different). Add it yourself with the snippet below.

| Server        | URL                             | Auth                      |
| ------------- | ------------------------------- | ------------------------- |
| Directus docs | `https://directus.com/docs/mcp` | none                      |
| Your instance | `https://YOUR_DIRECTUS_URL/mcp` | static token or MCP OAuth |

Enable your instance's server in **Settings → AI → Model Context Protocol** (Directus 11.12+). Use a token for a user
with the permissions you want the agent to have. Tool calls run as that user.

```jsonc
// .mcp.json in your project (see examples/mcp-instance.json)
{
	"mcpServers": {
		"directus": {
			"type": "http",
			"url": "https://YOUR_DIRECTUS_URL/mcp",
			"headers": { "Authorization": "Bearer ${DIRECTUS_TOKEN}" }
		}
	}
}
```

Not using the plugin? Add the docs server the same way: `{ "type": "http", "url": "https://directus.com/docs/mcp" }`.

Codex: see [`.codex/config.toml`](.codex/config.toml). Setup and troubleshooting:
[`skills/directus/references/mcp.md`](skills/directus/references/mcp.md).

## Layout

```
skills/<name>/
  SKILL.md        # router: scope, first checks, critical traps, which reference to load
  references/     # depth, loaded on demand
.claude-plugin/   # Claude Code marketplace manifest
.mcp.json         # docs MCP server, bundled with the plugin
examples/         # instance MCP config to copy into your project
.codex/           # Codex MCP config template
AUTHORING.md      # rules for writing and updating skills
evals/            # trigger tests for claude plugin eval
behavior-evals/   # live-instance tests: does the agent build it right?
```

## Trigger evals

`evals/` holds trigger tests for `claude plugin eval`: each case is a prompt plus graders that check the right skill
loads and the wrong neighbor doesn't. Run locally (Claude Code 2.1.269+):

```bash
claude plugin eval . --ablation none --runs 3 --no-publish
claude plugin eval . --case 'access-*' --runs 1 --ablation none --no-publish   # one area
```

`--no-publish` keeps the HTML report local. Each case costs one agent run per `--runs`. Results land in
`evals/results/` (git-ignored). Add a case whenever you change a skill description.

## Behavior evals

`behavior-evals/` checks what an agent actually builds. Each case starts a fresh Directus container in Docker (12.6.0
by default), seeds it, gives a headless `claude -p` the task with and without this plugin, then checks the instance over the API
(naming, `on_delete`, keys, and that nested writes, flows, and permissions really work). Code cases also check the files
the agent wrote: they run the SDK script, call the endpoint extension it built (mounted into the instance), and parse
its compose file with `docker compose config`. The sync case adds a second instance as the target.

```bash
node behavior-evals/run.mjs                       # every case, both arms, Sonnet, 1 run
node behavior-evals/run.mjs --case model-blog --runs 3 --model opus
node behavior-evals/run.mjs --case flows-publish-guard --image directus/directus:11.9.3   # an older version
```

Run a few cases on an older image too. That checks that agents read the version notes and adapt (on 11.9.3 there is
no `throw-error` operation, so the publish guard has to use a different pattern).

Add `--clean` to run each agent with an empty Claude config (no personal skills, `CLAUDE.md`, or plugins). It
authenticates with a `claude setup-token` token from `CLAUDE_CODE_OAUTH_TOKEN` or
`~/.config/directus-skills-evals/oauth-token`.

Results land in `behavior-evals/results/` (git-ignored). Add a case as `cases/<name>.md` (the task) plus
`checks/<name>.mjs` (exit 1 on any failed check). Seeds, extra shell commands, starting files (`fixtures/`), a second
instance, or no instance at all go in the `CASES` table in `run.mjs`.

## Contributing

Read [AUTHORING.md](AUTHORING.md). Keep `SKILL.md` short, put depth in `references/`, and ground every claim in the
Directus source or docs, not memory. Run `npm run validate` before opening a PR (CI runs the same), and add a changeset (`npm run changeset`) for any
change an agent would notice. See [.changeset/README.md](.changeset/README.md) for which bump to pick.

## Releases

Versions and `CHANGELOG.md` come from [Changesets](https://github.com/changesets/changesets). Merging to `main` opens a
"Version skills" PR; merging it bumps the version in `package.json` and both plugin manifests, writes the changelog,
and tags `vX.Y.Z` with a GitHub release. `npx skills` and the Claude Code plugin install from the repo, so there's no
npm publish.

## License

[MIT](LICENSE)
