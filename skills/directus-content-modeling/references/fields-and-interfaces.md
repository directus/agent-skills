# Fields and interfaces

- [Type picker](#type-picker)
- [Interface picker](#interface-picker)
- [JSON or a related collection](#json-or-a-related-collection)
- [Rich text](#rich-text)
- [Form layout](#form-layout)
- [Conditions and validation](#conditions-and-validation)
- [Marketplace interfaces](#marketplace-interfaces)

Every field is `type` (the database column), `meta.interface` (the editor), `meta.display` (how it renders in lists),
and `meta.special` (behavior flags). Get the type right first. It's the only part that touches the database.

## Type picker

Non-obvious picks only. Full list: https://directus.com/docs/guides/data-model/fields

| Data                                                  | `type`              | Notes                                                        |
| ----------------------------------------------------- | ------------------- | ------------------------------------------------------------ |
| Short text (titles, names, slugs)                     | `string`            | Default length 255; set `schema.max_length` higher if needed |
| Money, exact decimals                                 | `decimal`           | Set precision and scale. Never `float` for money.            |
| Counts, ratings, sort                                 | `integer`           | `bigInteger` only past 2.1 billion                           |
| Yes/no                                                | `boolean`           | Set `default_value` and `is_nullable: false`                 |
| A moment in time (`published_at`, event start)        | `timestamp`         | Stored in UTC. The usual pick.                               |
| Calendar date with no time (birthday)                 | `date`              |                                                              |
| Wall-clock time with no zone                          | `dateTime` / `time` | Rare. Prefer `timestamp`.                                    |
| Structured blob, repeater rows, SEO object            | `json`              | Add `special: ["cast-json"]`                                 |
| Relational alias (O2M, M2M, M2A, files, translations) | `alias`             | `schema: null`, no column                                    |
| Presentation (divider, notice, header, group)         | `alias`             | `special: ["alias", "no-data"]` (+ `"group"` for groups)     |

## Interface picker

Non-obvious picks only. Full list: https://directus.com/docs/guides/data-model/interfaces

| Need                                            | Interface                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One line of text                                | `input` (`options.trim: true` on slugs, `font: "monospace"` for codes and URLs); `options.slug: true` for slugs                                         |
| Structured editorial content (Editor.js blocks) | `input-block-editor` (`json`)                                                                                                                           |
| Fixed values                                    | `select-dropdown`, or `select-radio` for 2-4 that should be visible. Several: `select-multiple-dropdown` / `select-multiple-checkbox` (`json` or `csv`) |
| Free-form tags                                  | `tags` (`json` / `csv`). Use an M2M to `tags` instead if tags need pages, filtering, or reuse.                                                          |
| Ordered list of small objects                   | `list` (Repeater, `json`)                                                                                                                               |
| Link to one item in any collection, no relation | `collection-item-dropdown` (`json`)                                                                                                                     |

## JSON or a related collection

JSON is queryable: `json(field, path)` selects, sorts, and aliases values inside a JSON field, and the `_json` filter
operator filters on them (`{ "metadata": { "_json": { "color": { "_eq": "blue" } } } }`). So "I might need to filter on
it" alone doesn't force a collection.

Use a related collection when rows need their own permissions, relations to other items, reuse across items, editing
by people who shouldn't touch the parent, or an independent lifecycle (status, versioning, revisions).

Use `json` + `list` (Repeater) when the rows are small, owned by one item, and read as a whole (social links on
`globals`, feature bullets on a pricing card). Set the `list` edit mode to `inline` for short rows. It also saves a
collection against plan limits.

**House rule: config collections.** When several items share a set of values editors should manage (product
categories, regions, event types), make a small config collection and relate to it (M2O or M2M). Don't hard-code
`choices` on a dropdown, and don't copy the values into JSON on every item.

## Rich text

- **House rule:** `input-rich-text-html` (WYSIWYG) for editor-facing long-form content (posts, rich text blocks).
  Editors expect WYSIWYG, and the frontend renders HTML directly.
- `input-rich-text-md` when the content is developer-facing (docs, changelogs) or the frontend already renders
  Markdown.
- The WYSIWYG editor doesn't load your frontend CSS. Custom formats (`options.customFormats`) only add classes. Style
  them on the frontend.
- Keep markup semantic. No inline styles, classes, or IDs in content unless the user asks.

## Form layout

- `meta.width`: `half` for short scalars that pair well (status + `published_at`), `full` for text, relations, rich
  text, and everything else, `fill` for headers. `meta.sort` is form order; system fields last.
- Groups (`type: alias`, `special: ["alias", "no-data", "group"]`): `group-tabs` (top-level tabs: Content / SEO /
  Settings), `group-detail` (collapsible section, e.g. "Credentials"), `group-accordion` (one open at a time),
  `group-raw` (no chrome, used as the content of a tab). Put fields in a group with `meta.group: "<group field>"`.
- Presentation (`special: ["alias", "no-data"]`): `presentation-divider`, `presentation-notice` (tell editors what a
  section does), `header` (section header with action links), `presentation-links` (buttons to the live page or docs).

**House rule:** a collection with more than ~8 editor-facing fields gets tabs (the CMS starter splits pages and posts
into "Content" and "SEO"). Name presentation and group fields with a `meta_` prefix so they're easy to spot in the API
and the field list.

## Conditions and validation

- `meta.conditions`: show, hide, require, or make read-only based on other fields (`name`, filter `rule`, then
  `hidden` / `readonly` / `required` / `options`). Classic use: a link `type` select shows only `page`, `post`, or `url`.
- `meta.validation` is a filter rule the value must pass. Add `meta.validation_message`. Example:
  [routing-and-seo.md](routing-and-seo.md#urls-permalink-slug-or-nested-pages) (`pages.permalink`).
- The API enforces `meta.validation` on every write by a user or token (admins included), and the database enforces
  `schema.is_nullable: false` (on create the field must be submitted unless it has a default). Writes with no
  accountability skip `meta.validation`: a schedule Flow's item operations with `$trigger` permissions, and extension
  code that builds a service without `accountability`. (`$full` runs as admin, so it is validated.) `meta.required` is enforced only by the Studio form, so for a
  field that must always have a value, set `is_nullable: false` too. `schema.is_unique: true` adds a unique index
  (slugs, permalinks).

## Marketplace interfaces

**House rule:** core interfaces first. Several interfaces the CMS starter originally pulled from `@directus-labs` are
core at 12.5.1: `super-header` (`@directus-labs/super-header-interface`) is now `header`, and
`inline-repeater-interface` is `list` with edit mode `inline`.

Still marketplace-only: the SEO plugin (`seo-interface`), card select (`radio-cards-interface`), simple list, and the
experimental M2A button. Before setting `meta.interface` to anything not in core, check it's installed with
`GET /extensions`. If it isn't, use a core interface (`select-radio` instead of card select, `list` instead of simple
list) or ask the user to install it. A field with a missing interface still saves data but renders badly in the Studio.

## Sources

- https://directus.com/docs/guides/data-model/fields
- https://directus.com/docs/guides/data-model/interfaces
- https://directus.com/docs/guides/data-model/rich-text
- https://github.com/directus/directus/tree/v12.5.1/app/src/interfaces
- https://github.com/directus/directus/blob/v12.5.1/api/src/ai/tools/fields/prompt.md
- https://github.com/directus-labs/starters/blob/main/cms/directus/template/src/fields.json
- https://github.com/directus-labs/starters/blob/main/cms/directus/template/src/extensions.json
