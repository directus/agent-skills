---
name: directus-content-modeling
description: "Use when designing or changing a Directus data model or starting a new project from a starter: collections, fields, relations (M2O, O2M, M2M, M2A, translations), field types and interfaces, page builders, multilingual content, slugs and SEO fields, indexes and slow queries, schema changes on live data, and seeding. Not for querying (directus), permissions (directus-access-control), or promoting schema (directus-environment-sync)."
metadata:
  author: directus
  directus-version: '12.6.0'
---

# Directus content modeling

Design schemas that hold up: predictable names, the right relationship type, and a Studio that editors like using. Facts
are product behavior. Lines marked **House rule** are Directus's recommended conventions; follow them unless the user or
the existing schema says otherwise.

## First checks

1. **Check the version before anything else.** `GET /server/info` with a token returns `data.version`. Not 12.6? Read
   the version notes for its major in the `directus` skill (`references/versions-v<major>.md`) first.
2. **Read the existing schema before proposing anything.** With MCP: `schema()` then `schema({ keys: [...] })`. Without
   it: `GET /collections`, `GET /fields/:collection`, `GET /relations`. Match the conventions already in use, even when
   they differ from the house rules. Consistency inside a project beats our defaults.
3. **Collections and collection folders share a namespace.** A `website` folder blocks a `website` collection.
4. **Check the license tier.** Junction and `*_translations` collections count toward the collection limit. Plan the
   total before you build. See [conventions.md](references/conventions.md#plan-limits).
5. **Show the plan, then build.** List the collections, fields, and relations you'll create. If the user asked for them,
   proceed. Get explicit approval before anything destructive: deleting fields or collections, changing a field's type,
   or bulk-editing data. Deleting drops the column and its data. There is no rename. Never send `field` in a field
   PATCH: it returns 200 and the old field, but with `meta` in the body it also writes a stray `directus_fields` row
   under the new name. Renames are add, copy, drop ([schema-changes.md](references/schema-changes.md)).

## Critical traps

- **Relations are two steps.** Creating a relational field doesn't create the relation. Create the field (right `type` +
  `special`), then the relation. For M2M/M2A/translations, create the junction first.
- **The primary key type is permanent.** **House rule:** UUID for every collection, except lookup tables keyed by a
  natural string (`languages.code`, `navigation.id` slugs).
- **FK column type must match the target PK type.** M2O to a UUID-keyed collection is `type: "uuid"`; to `languages`
  it's `type: "string"`.
- **O2M fields are aliases.** No column. The O2M field is the `meta.one_field` of the M2O relation on the other side.
- **Set `on_delete` on every relation; the Studio defaults leave orphans.** **House rule:** M2M, files, and translations
  `CASCADE` on both junction FKs. M2A `CASCADE` on the parent FK only: the `item` side is not a real FK
  (`schema: null`), so deleting a block leaves its junction row behind. M2O and O2M `SET NULL`. See
  [relationships.md](references/relationships.md#on_delete).
- **Name FKs after what they point to, singular, no `_id`:** `page_blocks.page`, `post_tags.tag`. Junctions are
  `<singular parent>_<alias field>`: `posts.tags` → `post_tags`, `pages.blocks` → `page_blocks` (not the Studio's
  `posts_tags` / `posts_id`). Translations are the exception: `posts_translations` with FKs `posts` (not `posts_id`)
  and `languages_code`.
- **Archived and `hidden: true` only affect the Studio.** The API still returns archived items unless the caller
  filters, and hidden fields unless permissions restrict them.
- **M2A junction `item` is a string column** so it can hold keys from any collection. Keep every block collection on the
  same PK type.

## Routing

| Load when                                                                                                              | Reference                                                                  |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Naming collections and fields, PKs, system fields, status/sort/archive, folders, display templates, notes, plan limits | [references/conventions.md](references/conventions.md)                     |
| Creating any relationship: M2O, O2M, M2M, M2A, files, `on_delete`, junction naming, exact payloads                     | [references/relationships.md](references/relationships.md)                 |
| Choosing a field type or interface, JSON vs a related collection, field groups, conditions, validation                 | [references/fields-and-interfaces.md](references/fields-and-interfaces.md) |
| Building pages from reusable blocks (M2A page builder), nested blocks, block naming                                    | [references/page-builder.md](references/page-builder.md)                   |
| Multilingual content: `languages`, `*_translations` junctions, the translations interface                              | [references/translations.md](references/translations.md)                   |
| URLs (permalink vs slug vs nested pages), SEO fields (JSON vs shared `seo` collection), redirects                      | [references/routing-and-seo.md](references/routing-and-seo.md)             |
| Applying schema: MCP vs REST vs snapshot/apply vs Environment Sync (`d6s`) vs templates, dev to prod, seeding          | [references/applying-schema.md](references/applying-schema.md)             |
| Indexes: which fields to index, FK columns, `is_indexed` / `is_unique`, composite indexes via migrations               | [references/indexes.md](references/indexes.md)                             |
| Changing a schema that holds data: rename, type change, text to relation, split/merge, required/unique, delete         | [references/schema-changes.md](references/schema-changes.md)               |
| Starting a new Directus + framework site from a starter: pick, run, apply, frontend env, first checks                  | [references/new-project.md](references/new-project.md)                     |

## Reference implementation

The Directus CMS starter shows these conventions at scale (22 collections plus 2 folders, UUID keys, an M2A page
builder, an i18n variant). Copy its shapes, not all of its settings. **Where the starter differs from the house rules,
the house rules win:**

- `page_blocks.page` (and the i18n variant's translation relations) use `SET NULL`; the rule is `CASCADE`.
- `pages.permalink` is nullable and `posts.slug` isn't unique; make both required and unique.
- Preview URLs hardcode `http://localhost:3000`; use `{{$preview_base_url}}`.
- Its core-tier permissions are unsafe as shipped (see `directus-access-control`).

Schema: https://github.com/directus-labs/starters/tree/main/cms/directus/template/src (i18n:
`cms-i18n/directus/template/src`).

## Related skills

`directus` (querying, MCP) · `directus-flows` (automation on the new collections) · `directus-access-control` (who can
read and edit them) · `directus-sdk` (typing the schema in a frontend) · `directus-environment-sync` (promote schema and
config dev to prod) · `directus-upgrade` (schema changes across versions)

## Go deeper

1. Directus docs MCP server: `https://directus.com/docs/mcp` (`search-docs`, `get-doc`, `search-directus-code`).
2. Raw docs: https://directus.com/docs/raw/guides/data-model/relationships.md (and `collections.md`, `fields.md`,
   `interfaces.md`). Index: https://directus.com/docs/llms.txt
3. The instance: `GET /fields/:collection` and `GET /relations/:collection` show exactly how existing fields are wired.
   Copy a working field's `meta` instead of inventing one.
