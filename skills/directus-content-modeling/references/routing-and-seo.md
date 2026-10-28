# Routing and SEO

## URLs: permalink, slug, or nested pages

| Pattern | Model | Use when |
| --- | --- | --- |
| **Permalink** | `pages.permalink`: the full path, leading `/` (`/`, `/about`, `/services/web-design`). Unique. | Pages whose URL editors control. **Recommended** for pages. |
| **Slug** | `posts.slug`: one segment. The frontend adds the prefix (`/blog/{slug}`). Unique. | Items that live under a fixed route (posts, products, events). |
| **Nested pages** | M2O `pages.parent` → `pages`, O2M alias `children`, `sort`. The path comes from walking parents. | You need a real page tree (breadcrumbs, navigation built from the hierarchy, moving a section moves its URLs). |

**Why permalink by default:** the URL is one indexed field the frontend looks up directly
(`filter[permalink][_eq]=/services/web-design`). No recursive relation to walk, no path to rebuild when a parent moves.
Most sites don't need more.

Permalink field (based on the CMS starter, which leaves it nullable; make it required):

```json
{
	"field": "permalink",
	"type": "string",
	"meta": {
		"interface": "input",
		"options": { "font": "monospace", "trim": true, "placeholder": "/about-us" },
		"validation": {
			"_and": [{ "permalink": { "_regex": "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$" } }]
		},
		"note": "Unique URL for this page. Start with `/`."
	},
	"schema": { "is_unique": true, "is_nullable": false }
}
```

Slug field: `input` with `options.slug: true` and `font: "monospace"`, plus `schema.is_unique: true`. The starter's
`posts.slug` isn't unique, so its frontend has to guard against duplicates. Prefer the constraint.

**Nested pages, when you need them:**

1. M2O `parent` (`uuid`) → `pages`, `on_delete: SET NULL`, relation `meta.one_field: "children"`,
   `meta.sort_field: "sort"`.
2. O2M alias `children` with the `list-o2m-tree-view` interface, so editors drag pages into place on the parent form.
3. For a nested table on the collection page, the Marketplace **Tree View Table** layout
   (`@directus-labs/tree-view-table-layout`) does drag-to-nest. It needs a `sort` field and the `parent` M2O.
4. Store the computed path too (a `path` or `permalink` field kept in sync by a hook or flow on `parent` / `slug`
   changes), so the frontend still looks pages up by one field. The tree view layout doesn't fire sort events, so
   listen for updates on `sort` / `parent`.

With translations, put `permalink` / `slug` on `*_translations` when URLs are localized.

## SEO fields

Every routable collection (pages, posts, products) needs SEO metadata. Options, in order of preference:

| Option | Shape | Trade-off |
| --- | --- | --- |
| **`seo` JSON field** | `seo` (`json`, `cast-json`) with the `seo-interface` from `@directus-labs/seo-plugin` | One field, a good editor UI (previews, keyphrase analysis, templates). Needs the extension. The CMS starter does this. |
| **Shared `seo` collection** | Collection `seo` with `title`, `meta_description`, `og_image` (file), `canonical_url`, `no_index`, `no_follow`. Each routable collection gets an M2O `seo` → `seo`. | No extension needed. Typed, filterable fields, one shape for every routable collection. One extra collection against plan limits. |
| **Plain fields on each collection** | `meta_title`, `meta_description`, `og_image` on every routable collection | Fine for one or two collections. Drifts once there are several. |

The SEO plugin stores `title`, `meta_description`, `og_image` (a `directus_files` id), `focus_keyphrase`,
`additional_fields.canonical_url`, `sitemap` (`{ "change_frequency": "monthly", "priority": "0.5" }`), and `no_index` /
`no_follow` (booleans). Match these keys in the frontend and in any shared collection.

**Shared `seo` collection:** UUID `id`, `meta.hidden: true` (edited from the parent's M2O drawer),
`display_template: "{{title}}"`. Put the M2O in an "SEO" tab on the parent form (`group-tabs` + `group-raw`). The M2O
is `SET NULL`, so deleting a page leaves its `seo` row behind; clean up with a hook or flow on delete, or accept the
orphans. With translations, put `title` and `meta_description` on `seo_translations`.

## Redirects

The CMS starter has a `redirects` collection: `url_from`, `url_to`, `response_code` (string, `301` / `302`), `note`.
The frontend (or edge middleware) loads it and redirects before routing. Add a redirect whenever a published permalink
or slug changes.

## Sources

- https://github.com/directus-labs/starters/blob/main/cms/directus/template/src/fields.json (pages.permalink, posts.slug, seo, redirects)
- https://github.com/directus-labs/extensions/tree/main/packages/seo-plugin
- https://github.com/directus-labs/extensions/tree/main/packages/tree-view-table-layout
- https://github.com/directus/directus/tree/v12.6.0/app/src/interfaces/list-o2m-tree-view
- https://directus.com/docs/guides/data-model/relationships
