---
name: directus-content
description: 'Load first, before exploring code, when editing content in a Directus project the way an editor would, through MCP or the API: finding and updating pages, posts, and page-builder blocks, translating an item, saving drafts and publishing, uploading images and attaching files. Not for setting up collections or multilingual support (directus-content-modeling), app code (directus-sdk), or permissions (directus-access-control).'
metadata:
  author: directus
  directus-version: '12.6.0'
---

# Directus content editing

Change content in an existing Directus project: the jobs an editor does in the Studio, done through the MCP `items` and
`files` tools or REST. The project's schema already exists; this skill is about writing into it without breaking
relations, translations, or what's live.

_Verified against Directus v12.6.0 (`api/src/ai/tools`, `api/src/services`) and live instances._

## First checks

1. **Version.** `GET /server/info` returns `data.version`. Older than 12.6: read the version notes for its major in the
   `directus` skill (`references/versions-v<major>.md`).
2. **Read the schema for what you'll touch.** MCP: `schema({ keys: ["pages"] })`. Note required fields, the status
   field's choices, which fields are relations, and each text field's interface.
3. **Find the item by what the user named** (title, slug, permalink) with a filter. Never guess an id. Read it with the
   fields you're about to change, including the ids of related rows.
4. **Versioned collection** (`meta.versioning: true`)? Ask whether the change should go live now. See the first trap.
5. **The tools run as the connected user.** A 403 means that user can't do it. Say so; don't look for another way in.

## Critical traps

- **Writes go live.** Item writes over MCP and REST change the published item; neither can target a content version,
  and MCP has no versions tool. To stage a change for review, use the Studio, or REST: `POST /versions`
  (`{ "key": "draft", "name": "Draft", "collection": "posts", "item": "<id>" }`), then `POST /versions/<id>/save` with
  only the changed fields, and later `POST /versions/<id>/promote`. A block edit goes in the page's delta with each
  junction row's `collection`, or reading that version breaks. Details: `directus` (`references/content-versioning.md`).
- **Change relations with `create` / `update` / `delete` and row ids,** not by re-sending whole arrays (that recreates
  rows and orphans the old ones). Edit a page-builder block in its own collection, not through the page. Payloads:
  `directus` (`references/rest-api.md`, relational writes).
- **Publishing is a field value.** Set the status field to the project's published choice (read it; it may be
  `published`, `active`, or something else). A Flow or validation can reject the save with a 400: show the user its
  message instead of retrying around it.
- **Match the text field's format.** `input-rich-text-html` stores HTML, `input-rich-text-md` stores Markdown,
  `input-block-editor` stores Editor.js JSON. Writing the wrong one saves fine and renders badly.
- **Files are two steps.** Import first (MCP `files` with `action: "import"` and a `url`, or REST `POST /files/import`),
  with a `title`, `description`, and `folder`. Then set the image field to the new file's `id`.
- **Deleting needs explicit confirmation,** item by item. Prefer the collection's archive value if it has one.
- **Report what changed:** the item URL MCP returns, and each field you wrote.

## Go deeper

- Queries, filters, and `fields` syntax: `directus` (`references/filters.md`, `references/rest-api.md`).
- How the project's translations and page builder are modeled: `directus-content-modeling`
  (`references/translations.md`, `references/page-builder.md`).
- Directus docs MCP server: `https://directus.com/docs/mcp`. Raw docs: `https://directus.com/docs/raw/<path>.md`.
