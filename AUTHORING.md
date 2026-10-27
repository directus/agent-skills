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

| Topic | Owner |
| --- | --- |
| REST/GraphQL query syntax, filters, error codes, versions API | `directus` |
| Insights dashboards and panels | `directus-insights` |
| Flows: triggers, operations, utility flows, loops, flow vs hook | `directus-flows` |
| Roles, policies, permissions, licensing effects on access | `directus-access-control` |
| Schema design, naming, relationships, seeding | `directus-content-modeling` |
| Schema snapshot/apply and Environment Sync (`d6s`) | `directus-environment-sync` |
| `@directus/sdk` usage | `directus-sdk` |
| Live Preview, Visual Editor, reading drafts in a frontend | `directus-visual-editing` |
| Extensions | `directus-extensions` |
| Version-to-version changes | `directus-upgrade` |

## Frontmatter

```yaml
---
name: directus-sdk # must match the folder name, lowercase + hyphens
description: "Use when ... Not for ..." # third person, trigger words, <= 1024 chars
metadata:
  author: directus
  directus-version: "12.5.1"
---
```

The description is the only thing an agent sees before deciding to load the skill. Lead with the tasks and the words
a user would type (package names, feature names). Add a "Not for" clause when a sibling skill owns the neighbor topic.

## Grounding

- Verified against **Directus v12.5.1**. Every claim must come from the source at that tag, the current docs, or a
  starter/template. Not from memory. If you can't verify something, leave `<!-- TODO(verify): ... -->` instead of
  guessing.
- End each reference with a `## Sources` list. Use:
  - Docs pages: `https://directus.com/docs/<path>` (strip numeric prefixes from the docs repo path, e.g.
    `content/guides/12.ai/2.mcp/3.tools.md` → `https://directus.com/docs/guides/ai/mcp/tools`).
  - Source files pinned to the tag: `https://github.com/directus/directus/blob/v12.5.1/<path>`.
  - Starters: `https://github.com/directus-labs/starters/tree/main/<path>`.
- Facts vs opinions: house conventions (choices Directus would recommend but the product doesn't enforce) are marked
  `**House rule:**` so an agent can tell them from hard product behavior.

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

## Voice

Plain, short, direct. Imperative ("Send `fields` on every read"). Tables for lookups, code blocks for anything an
agent will copy. No em dashes. No marketing. No time-sensitive phrasing ("new in", "recently"); put version
differences in `directus-upgrade` or a clearly labeled "Older versions" note.
