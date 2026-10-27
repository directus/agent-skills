# Page builder (M2A blocks)

Use this when editors compose pages from reusable sections (hero, rich text, gallery, pricing, form). The Directus CMS
starter is the reference build. Naming follows [relationships.md](relationships.md#naming): junction
`<singular parent>_<alias field>` (`page_blocks`), FK named after the parent, singular.

## Build order

1. Create a `blocks` folder (`schema: null`, `meta.hidden: true`). It keeps block collections out of the sidebar.
2. Create each `block_*` collection: UUID `id`, system fields, `meta.hidden: true`, `meta.group: "blocks"`, an `icon`,
   and a `display_template` (e.g. `{{headline}}`).
3. Create the junction `page_blocks` (hidden, grouped under `pages`): `id` (uuid), `page` (uuid), `item` (string PK of
   the block row), `collection` (string), `sort` (integer, hidden). Plus placement settings (`hide_block`,
   `background`).
4. Create the alias on `pages`: `blocks`, `type: "alias"`, `special: ["m2a"]`, `interface: "list-m2a"`,
   `display: "related-values"`, `display_options.template: "{{collection}}"`.
5. Create the two relations. List every block collection in `one_allowed_collections`:

```json
[
	{
		"collection": "page_blocks",
		"field": "item",
		"related_collection": null,
		"meta": {
			"one_allowed_collections": ["block_hero", "block_richtext", "block_gallery"],
			"one_collection_field": "collection",
			"junction_field": "page"
		},
		"schema": null
	},
	{
		"collection": "page_blocks",
		"field": "page",
		"related_collection": "pages",
		"meta": { "one_field": "blocks", "junction_field": "item", "sort_field": "sort" },
		"schema": { "on_delete": "CASCADE" }
	}
]
```

6. Read back `GET /relations/page_blocks` and create a test page with one block of each type.

## Designing blocks

**House rules:**

- **Content on the block, placement on the junction.** Headline, image, and buttons go on `block_hero`. "Hide this
  block" and "background color" go on `page_blocks`, because the same block could be placed differently elsewhere.
- **Consistent heading fields across blocks:** `tagline` (small label above), `headline`, `description` on every block
  that has them, so frontends and editors see the same names.
- **Layout variants are a field, not a new block.** `block_hero.layout` with `image_left` / `image_center` /
  `image_right` beats three hero collections. Use `select-radio` or a card-select interface with images.
- **Every block gets an `id`-only fallback in the frontend.** Unknown `collection` values render nothing, not crash.
  New block types ship to Directus before the frontend.
- Keep blocks flat. If a block needs a list, give it an O2M child collection (below), not a JSON blob, unless the list
  is trivial and plan limits are tight.

## Nested content inside blocks

| Need                              | Pattern                                                                                                                                                                                               | Starter example                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| A list owned by the block         | O2M child collection `block_<name>_<children>`, `sort_field: sort`, `on_delete: SET NULL`. Set `one_deselect_action: delete` so rows removed in the form don't linger (the starter leaves `nullify`). | `block_pricing_cards` → `block_pricing`          |
| Many files                        | M2M to `directus_files`                                                                                                                                                                               | `block_gallery_items`                            |
| A reusable group shared by blocks | M2O to a shared collection                                                                                                                                                                            | `block_hero.button_group` → `block_button_group` |
| Link to a page or post            | M2O `page`, M2O `post`, plus a `type` select and a `url` string, with conditions that show only the one in use                                                                                        | `block_button`, `navigation_items`               |

## Querying it

Request block fields per collection with the `item:<collection>` syntax. Ask only for the fields each block renders.

```
GET /items/pages?filter[permalink][_eq]=/about
  &fields=id,title,blocks.id,blocks.collection,blocks.sort,blocks.hide_block,
          blocks.item:block_hero.*,blocks.item:block_richtext.*,
          blocks.item:block_pricing.*,blocks.item:block_pricing.pricing_cards.*
  &deep[blocks][_sort]=sort&deep[blocks][_filter][hide_block][_neq]=true
```

In the SDK, use object syntax: `{ blocks: ['id', 'collection', { item: { block_hero: [...], block_richtext: [...] } }] }`.
The frontend switches on `block.collection` to pick a component. See the starter's `BaseBlock`.

## Adding a block type later

1. Create the new `block_*` collection (same PK type as the others).
2. Append it to `meta.one_allowed_collections` on the `page_blocks.item` relation.
3. Add it to the frontend's block map and its query.
4. Give the public policy read access to it, with the same publication rule as the other blocks (see
   `directus-access-control`). Without it, a request that names its fields fails with `403 FORBIDDEN`.

## Sources

- https://directus.com/docs/guides/data-model/relationships#many-to-any-m2a
- https://github.com/directus/directus/blob/v12.5.1/api/src/ai/tools/relations/prompt.md
- https://github.com/directus-labs/starters/tree/main/cms/directus/template/src (collections.json, fields.json, relations.json)
- https://github.com/directus-labs/starters/blob/main/cms/nextjs/src/lib/directus/fetchers.ts
- https://github.com/directus-labs/starters/blob/main/cms/nextjs/src/components/blocks/BaseBlock.tsx
