# Conventions

- [Naming](#naming)
- [Primary keys](#primary-keys)
- [System fields](#system-fields)
- [Status, sort, archive](#status-sort-archive)
- [Collection settings](#collection-settings)
- [Organizing the Studio](#organizing-the-studio)
- [Plan limits](#plan-limits)

## Naming

Collection and field names become table and column names and API paths. You can't rename them cheaply.

| Thing | **House rule** | Example |
| --- | --- | --- |
| Collections | `snake_case`, plural | `posts`, `team_members` |
| Singletons | `snake_case`, singular | `globals`, `site_settings` |
| Fields | `snake_case`, singular for scalars and M2O | `title`, `author`, `published_at` |
| To-many alias fields (O2M, M2M, M2A, files) | plural | `tags`, `blocks`, `items` |
| Booleans | Read as yes/no; `is_` / `has_` is a good default, not a rule | `is_active`, `hide_block` |
| Dates the user sets | `_at` suffix | `published_at` |
| Block collections | `block_` prefix, singular | `block_hero`, `block_richtext` |
| Child collections of a block | `block_<parent>_<children>` | `block_gallery_items`, `block_pricing_cards` |
| Presentation-only alias fields | `meta_` prefix | `meta_tabs`, `meta_notice_seo`, `meta_divider_content` |

- Relational fields, junctions, and translations: see [relationships.md](relationships.md#naming).
- Never use the `directus_` prefix. It's reserved for system collections.
- Never name a field after a query parameter or a reserved word that collides with your frontend (`fields`, `filter`,
  `sort` as a non-sort field, `meta`, `data`).
- For a nicer Studio label, set `meta.translations` instead of renaming. Labels are auto-title-cased from the key
  (`published_at` → "Published At").

## Primary keys

Options: auto-increment integer, auto-increment big integer (Postgres/MySQL only), generated UUID, manually entered
string. The type can't be changed after creation.

**House rule:** UUID for every collection. UUIDs are safe to generate on the client and in seed data, so templates and
imports never collide. Environment Sync and template tooling match records across instances by key, where integer keys
collide. They don't leak row counts or creation order in public URLs.

Exceptions where a natural string key is better: `languages` (`code`: `en-US`), and small lookup collections the
frontend references by a stable handle (the starter's `navigation.id` = `main`, `footer`).

```json
{
	"field": "id",
	"type": "uuid",
	"meta": { "hidden": true, "readonly": true, "interface": "input", "special": ["uuid"] },
	"schema": { "is_primary_key": true, "has_auto_increment": false }
}
```

## System fields

**House rule:** every content collection gets the four tracking fields, hidden and read-only, at the bottom of the
form:

| Field | type | special | interface |
| --- | --- | --- | --- |
| `user_created` | `uuid` | `user-created` | `select-dropdown-m2o` (display `user`) |
| `date_created` | `timestamp` | `date-created` | `datetime` (display `datetime`, relative) |
| `user_updated` | `uuid` | `user-updated` | `select-dropdown-m2o` (display `user`) |
| `date_updated` | `timestamp` | `date-updated` | `datetime` (display `datetime`, relative) |

`user_created` and `user_updated` need M2O relations to `directus_users` with `on_delete: SET NULL`, or deleting a user
fails. The full JSON template is in the Directus MCP `collections` tool description (`<system_fields>`). The starter
adds them to junctions too; skip them there only if the user asks for a minimal schema.

## Status, sort, archive

**Status** (**House rule:** on anything with a publish lifecycle):

```json
{
	"field": "status",
	"type": "string",
	"meta": {
		"interface": "select-dropdown",
		"display": "labels",
		"options": {
			"choices": [
				{ "text": "$t:draft", "value": "draft", "icon": "draft_orders", "color": "#A2B5CD" },
				{ "text": "In Review", "value": "in_review", "icon": "rate_review", "color": "#FFA439" },
				{ "text": "$t:published", "value": "published", "icon": "check", "color": "#2ECDA7" }
			]
		}
	},
	"schema": { "default_value": "draft", "is_nullable": false }
}
```

- Default to `draft`. Public read permissions filter on `status = published`.
- Pair with `published_at` (`timestamp`, `datetime` interface) for scheduling. The frontend or a permission filter
  checks `published_at <= $NOW`.
- Status is not content versioning. Versioning (`meta.versioning: true`) stores unpublished edits to an
  already-published item. Use both on pages and posts.

**Sort:** an `integer` field named `sort`, hidden, set as the collection's `meta.sort_field`. For manual order inside a
relation, set the relation's `meta.sort_field` too (on the junction or the "many" side).

**Archive:** set `archive_field`, `archive_value`, `unarchive_value`, `archive_app_filter`. Use `status` with an
`archived` value when the collection has a status, `is_active` (boolean) otherwise. The API still returns archived
items unless the caller filters.

## Collection settings

| Setting | **House rule** |
| --- | --- |
| `icon` | Always set. Material Symbols name. |
| `note` | One sentence saying what the collection is for. Shows in the data model and helps agents. |
| `display_template` | Always set on relation targets: `{{title}}`, `{{first_name}} {{last_name}}`. Without it, editors see UUIDs. |
| `accountability` | `all` (default). Only lower it for high-volume log tables. |
| `versioning` | `true` on pages, posts, and anything with an editorial review step. |
| `preview_url` | Routable collections: `{{$preview_base_url}}{{permalink}}?version={{$version}}`, never a hardcoded host (collection meta travels between environments). `{{$version}}` resolves to `published` or the open version's key. Preview gating and tokens: `directus-visual-editing`. |
| `singleton` | `true` for one-off settings (`globals`). Still give it a UUID `id`. |
| `hidden` | `true` for junctions, blocks, and child collections only edited through a parent. |

**Field notes:** write a `meta.note` on every editor-facing field that isn't obvious. Say what it does on the site, not
its type ("Short phrase shown under the logo." not "A string field.").

## Organizing the Studio

- **Folders** (collections with `schema: null`) group the sidebar and don't count toward plan limits. **House rule:**
  one folder per domain (`website`, `blocks`, `forms`), with child collections nested via `meta.group`.
- Nest dependent collections under their parent: `navigation_items` under `navigation`, `block_gallery_items` under
  `block_gallery`, `page_blocks` under `pages`.
- Field widths, tabs, and groups: see [fields-and-interfaces.md](fields-and-interfaces.md#form-layout).

## Plan limits

Directus 12 counts user collections toward the plan's collection limit. Counted: every user collection, every
`*_translations` collection, every M2M/M2A junction. Not counted: `directus_*` system collections, folders, and
database tables not registered in Directus.

When a plan is tight:

- A simple ordered list nothing else references (social links, FAQ rows on one page) can be a `json` field with the
  `list` interface instead of an O2M collection. See [fields-and-interfaces.md](fields-and-interfaces.md#json-or-a-related-collection).
- A many-to-many to files uses a junction. A single image doesn't.
- Translations add one collection per translated collection. The `cms-i18n` starter exceeds the free tier for this
  reason.

At the limit, creating another collection fails with `LIMIT_EXCEEDED` (category `collections`). Separately, an
instance already over its limit (for example after a downgrade) gets collections marked **inactive** through the
licensing resolution flow: data stays, but API reads and writes return `COLLECTION_INACTIVE` (403). Numeric tier
limits: see `directus-access-control` (licensing.md).

## Sources

- https://directus.com/docs/guides/data-model/collections
- https://directus.com/docs/guides/data-model/fields
- https://directus.com/docs/licensing/overview
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/collections/prompt.md
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/fields/prompt.md
- https://github.com/directus-labs/starters/tree/main/cms/directus/template/src (collections.json, fields.json)
- https://github.com/directus-labs/starters/blob/main/README.md (tier table)
