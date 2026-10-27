# Authoring guide

Rules for every skill in this repo. Read before editing.

## Shape

- `skills/<name>/SKILL.md` is a **router**. It loads every time the skill triggers, so keep it under ~100 lines.
  It holds: frontmatter, a 2-3 sentence scope, a short "first checks" list, at most ~8 critical traps that an agent
  would get wrong without being told, a routing table (`Load when` → `reference`), and a "Go deeper" section.
- `skills/<name>/references/*.md` hold the depth. One level deep (SKILL.md links to references, references don't chain
  to other references except a "See also" line). Any reference over 100 lines starts with a short table of contents.
- One topic per reference. Name files by topic (`filters.md`, not `misc.md`).

## Skills vs docs

Skills are not a copy of the docs. An agent can already search the docs (docs MCP, `llms.txt`, raw markdown). Spend
skill lines on what it gets wrong without being told:

- **Keep in skills:** traps, decisions ("use X when, Y when"), house rules, copyable recipes that are safe as written,
  corrections where the source disagrees with the docs, and the order to do things in.
- **Link to docs:** exhaustive reference material (every flag, option, env var, endpoint parameter). Summarize the 3-5
  an agent actually needs and link the rest.
- If a reference is mostly restating a docs page, cut it to the traps and decisions and link the page.

Copyable examples must be safe as written. If a recipe needs a security or licensing caveat, the caveat goes in the
recipe, not in another file.

## One owner per topic

Each topic has one home skill. Others get one line and a pointer. Current owners:

| Topic                                                                                     | Owner                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| REST/GraphQL query syntax, filters, error codes, versions API                             | `directus`                                                   |
| Insights dashboards and panels (add `references/mcp.md` when the MCP Insights tool ships) | `directus-insights`                                          |
| Flows: triggers, operations, utility flows, loops, flow vs hook                           | `directus-flows`                                             |
| Roles, policies, permissions, license keys and core-tier limits                           | `directus-access-control`                                    |
| CORS and cookie env vars (server side)                                                    | `directus-self-hosting`; `directus-sdk` owns the client side |
| Schema design, naming, relationships, seeding                                             | `directus-content-modeling`                                  |
| Schema snapshot/apply and Environment Sync (`d6s`)                                        | `directus-environment-sync`                                  |
| `@directus/sdk` usage                                                                     | `directus-sdk`                                               |
| Live Preview, Visual Editor, reading drafts in a frontend                                 | `directus-visual-editing`                                    |
| Extensions                                                                                | `directus-extensions`                                        |
| Deploying, configuring, scaling, and backing up an instance                               | `directus-self-hosting`                                      |
| Version-to-version changes                                                                | `directus-upgrade`                                           |

## Frontmatter

```yaml
---
name: directus-sdk # must match the folder name, lowercase + hyphens
description: 'Use when ... Not for ...' # third person, trigger words, <= 450 chars
metadata:
  author: directus
  directus-version: '12.6.0'
---
```

The description is the only thing an agent sees before deciding to load the skill. Lead with the tasks and the words
a user would type (package names, feature names). Add a "Not for" clause when a sibling skill owns the neighbor topic.
Keep it under 450 characters: name tasks, not every option or env var (the router and references carry those).

## Codex metadata

Every skill has `agents/openai.yaml` for the Codex skill picker: `display_name`, a `short_description` of 25-64 chars,
`brand_color: "#6644FF"`, and a `default_prompt` that names the skill as `$<skill-name>`. The validator checks all
three.

## Grounding

- Verified against **Directus v12.6.0**. Every claim must come from the source at that tag, the current docs, or a
  starter/template. Not from memory. If you can't verify something, leave `<!-- TODO(verify): ... -->` instead of
  guessing.
- End each reference with a `## Sources` list. Use:
  - Docs pages: `https://directus.com/docs/<path>` (strip numeric prefixes from the docs repo path, e.g.
    `content/guides/12.ai/2.mcp/3.tools.md` → `https://directus.com/docs/guides/ai/mcp/tools`).
  - Source files pinned to the tag: `https://github.com/directus/directus/blob/v12.6.0/<path>`.
  - Starters: `https://github.com/directus-labs/starters/tree/main/<path>`.
- Facts vs opinions: house conventions (choices Directus would recommend but the product doesn't enforce) are marked
  `**House rule:**` so an agent can tell them from hard product behavior.

## What to pin

Skills go stale in three different ways. Treat each differently:

| Kind of fact                                  | Example                                                      | How to write it                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product behavior                              | `withOptions` drops auth, filter flows cancel on reject      | State it. It's covered by `directus-version` in the frontmatter and re-checked each release.                                                       |
| Version gate                                  | MCP needs 11.12+, `draft`/`published` keys need v12          | Name the first version that has it. Gates never go stale. Don't write "latest" or "same as npm latest".                                            |
| Values that change outside a Directus release | core-tier limits, starter file layouts, npm package versions | Don't repeat them. Give one owner the value "as of" a version, and tell agents how to read it live (`GET /license`, `npm view`, the starter repo). |

Pin the Directus version once per skill (`directus-version`), not per claim. Write "Verified against" in prose only in
the router. Upgrade hop files are the exception: they're about specific versions by design.

## Version-specific advice

Skills are written for the version in `directus-version`. For instances on an older major, the base `directus` skill
has one reference per major: `references/versions-v9.md`, `versions-v10.md`, `versions-v11.md`, `versions-v12.md`.
Each lists only what the skills would get wrong on that major and what to do instead, with minor-version gates inside
it. Everything else is the changelog's job: agents read release notes and breaking changes through the docs MCP, and
`directus-upgrade` covers moving between versions.

Every router's first checks include one line: not on the current version, read the `directus` skill's version notes
for your major first.

## Releases of Directus

The weekly `directus-release-check` workflow opens an issue when Directus ships a newer release. To close it:

1. Read the release notes and breaking changes. Add the hop to `directus-upgrade` and update its version map. Add
   what the skills would now get wrong on the previous minor to `directus` `references/versions-v<major>.md`.
2. Diff the source between the two tags for the areas the skills cover and fix any claim that changed.
3. Run the behavior evals on the new image: `node behavior-evals/run.mjs --clean --image directus/directus:<tag>`.
4. Bump `directus-version` in every `SKILL.md` and the source links' tag, add a changeset, release.

## Pointing agents at more help

Every SKILL.md ends with the same escape hatches, in this order:

1. Directus docs MCP server: `https://directus.com/docs/mcp` (no auth; tools `search-docs`, `get-doc`, `list-docs`,
   `search-directus-code`, `get-directus-file`).
2. Raw markdown for any docs page: `https://directus.com/docs/raw/<path>.md`. Index: `https://directus.com/docs/llms.txt`.
3. The instance itself: its error messages, `GET /server/info`, `GET /server/specs/oas`, and the schema.

## MCP vs skills

The Directus MCP server already ships tool descriptions to the agent. Don't re-document tool parameters. Do say
_when_ to use which tool, what order, and the traps the tool descriptions don't cover. Refer to tools by name (`schema`,
`items`, `collections`, `fields`, `relations`, `flows`, `operations`, `trigger-flow`, `files`, `folders`, `assets`,
`system-prompt`).

## Changesets

Add one per PR that changes what an agent sees: `npm run changeset`. Patch for fixes, minor for new skills or
references, major for renamed or removed skills. Details in [.changeset/README.md](.changeset/README.md).

## Voice

Plain, short, direct. Imperative ("Send `fields` on every read"). Tables for lookups, code blocks for anything an
agent will copy. No em dashes. No marketing. No time-sensitive phrasing ("new in", "recently"); put what differs on
older versions in the `directus` version notes (`references/versions-v<major>.md`).
