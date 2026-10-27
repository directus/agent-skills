# Relationships

- [Pick the type](#pick-the-type)
- [Naming](#naming)
- [M2O and O2M](#m2o-and-o2m)
- [M2M](#m2m)
- [Files](#files)
- [on_delete](#on_delete)
- [Other patterns: M2A, trees, verify](#other-patterns)

## Pick the type

| The data says                                                                        | Use                                                         | Columns created                     |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------- |
| Each post has one author                                                             | M2O `posts.author` → `team_members`                         | `posts.author`                      |
| Show an author's posts from the author form                                          | O2M alias `team_members.posts` (the other side of that M2O) | none                                |
| Posts have many tags, tags have many posts                                           | M2M via junction `post_tags`                                | junction collection                 |
| A page is a list of blocks of different types                                        | M2A via junction `page_blocks`                              | junction with `item` + `collection` |
| One image                                                                            | M2O to `directus_files` (`special: file`)                   | one `uuid` column                   |
| A gallery                                                                            | M2M to `directus_files` (`special: files`)                  | junction collection                 |
| Child rows owned by one parent (menu items, pricing cards, form fields)              | O2M (child has the M2O)                                     | `child.parent`                      |
| A shared list editors manage once and pick from (categories, product types, regions) | A small **config collection** + M2O or M2M to it            |                                     |

**House rule:** if the child rows only make sense inside one parent, use O2M, not M2M. M2M is for things that exist
independently and get reused (tags, categories, people).

## Naming

**House rule:** name relational fields after the collection they point to, singular. No `_id` suffix. The API returns
the related object under that key when you expand it (`post.author.name`, `page_block.page.title`), so the key should
read like the thing.

| Relation                                 | Junction              | Junction fields                                              |
| ---------------------------------------- | --------------------- | ------------------------------------------------------------ |
| M2O `posts.author` → `team_members`      |                       | `author` (role name beats collection name when it's clearer) |
| M2M `posts.tags` → `tags`                | `post_tags`           | `post`, `tag`, `sort`                                        |
| M2M self-reference `posts.related_posts` | `post_related_posts`  | `post`, `related_post`                                       |
| M2A `pages.blocks`                       | `page_blocks`         | `page`, `item`, `collection`, `sort`                         |
| Files `block_gallery.items`              | `block_gallery_items` | `block_gallery`, `directus_file`, `sort`                     |
| Translations `posts.translations`        | `posts_translations`  | `posts`, `languages_code`                                    |

- FK to a system collection: singular of the full name (`directus_file`, `directus_user`), so it's obvious it points
  at a system collection.
- Translations are the exception to the singular rule, matching the `cms-i18n` starter.
- Junction collections: UUID `id`, `meta.hidden: true`, `meta.group` set to the parent collection.
- The Studio's relationship wizard auto-fills different names (`posts_tags.posts_id`, `tags_id`). Overwrite them when
  building in the Studio. Through MCP or the API you set the names yourself.

## M2O and O2M

1. Create the FK field on the "many" side. Its type must match the target's PK type.

```json
{
	"field": "author",
	"type": "uuid",
	"meta": {
		"interface": "select-dropdown-m2o",
		"special": ["m2o"],
		"display": "related-values",
		"display_options": { "template": "{{first_name}} {{last_name}}" },
		"options": { "template": "{{first_name}} {{last_name}}" }
	},
	"schema": {}
}
```

2. Create the relation. Add `meta.one_field` to also get the O2M alias on the other side. Set `sort_field` if the
   children should be manually ordered from the parent form.

```json
{
	"collection": "posts",
	"field": "author",
	"related_collection": "team_members",
	"meta": { "one_field": "posts", "sort_field": null, "one_deselect_action": "nullify" },
	"schema": { "on_delete": "SET NULL" }
}
```

3. If you added `one_field`, create that alias field on the "one" side: `type: "alias"`, `special: ["o2m"]`,
   `interface: "list-o2m"`, `schema: null`.

## M2M

1. Create the junction `post_tags` (UUID `id`, hidden) with `post` (`uuid`), `tag` (`uuid`), and `sort` (`integer`) if
   order matters.
2. Create the alias on the parent: `{ "field": "tags", "type": "alias", "meta": { "special": ["m2m"], "interface":
"list-m2m" }, "schema": null }`. Optionally the reverse alias on `tags`.
3. Create both relations:

```json
[
	{
		"collection": "post_tags",
		"field": "post",
		"related_collection": "posts",
		"meta": { "one_field": "tags", "junction_field": "tag", "sort_field": "sort" },
		"schema": { "on_delete": "CASCADE" }
	},
	{
		"collection": "post_tags",
		"field": "tag",
		"related_collection": "tags",
		"meta": { "one_field": null, "junction_field": "post" },
		"schema": { "on_delete": "CASCADE" }
	}
]
```

`junction_field` on each relation points at the _other_ FK in the junction. Getting these crossed is the most common M2M
bug.

**Duplicate pairs.** Nothing stops two `post_tags` rows with the same `post` + `tag`, or two `posts_translations` rows
for the same `posts` + `languages_code`. The fields API only creates single-column unique indexes. Scripts and imports
should check before inserting, or add a composite unique index in a database migration if duplicates would break the
frontend.

## Files

- Single: `{ "field": "image", "type": "uuid", "meta": { "special": ["file"], "interface": "file-image" } }`, then a
  relation to `directus_files` with `on_delete: SET NULL`. Use `file` instead of `file-image` for non-images.
- Many: junction `<singular parent>_<field>` (e.g. `block_gallery_items`) with `<singular parent>` + `directus_file`
  (+ `sort`), alias `special: ["files"]`, `interface: "files"`, both relations `CASCADE`. Deleting the parent removes
  the junction rows, not the files.

## on_delete

**House rule:**

| Relation                                                                                                              | `on_delete` (both sides of a junction) |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| M2M, M2A, files (many), translations                                                                                  | `CASCADE`                              |
| M2O / O2M, including single files and `user_created` / `user_updated` → `directus_users` (else deleting a user fails) | `SET NULL`                             |

- Junction rows mean nothing without either side, so they go with it. That includes the `languages` side of
  translations: deleting a language deletes its translations.
- M2O and O2M children survive losing their parent with a null FK. Clean up orphans deliberately, not by cascade.
- The Studio's defaults don't follow this (several junction relations default to `SET NULL` / `NO ACTION`, which leaves
  orphan junction rows). Set `on_delete` explicitly on every relation.

`one_deselect_action` is separate: what the Studio does when an editor removes a related item in the form (`nullify`
the FK or `delete` the row). Use `delete` for junction rows and for O2M children that can't stand alone (form fields,
pricing cards).

## Other patterns

- **M2A:** build steps and exact payloads are in [page-builder.md](page-builder.md#build-order). To allow a new block
  type later, update `one_allowed_collections` on the `item` relation. Don't create a second M2A field.
- **Self-referencing trees** (nested navigation, categories): M2O `parent` → same collection plus O2M alias `children`
  with `sort_field: "sort"` and the `list-o2m-tree-view` interface for drag-and-drop nesting. The starter's
  `navigation_items` does this.
- **Verify:** read back `GET /relations/<junction>` (or MCP `relations` read) and check every `junction_field` /
  `one_field` / `sort_field`. Then open the parent in the Studio or create a test item with nested data through the
  API.

## Sources

- https://directus.com/docs/guides/data-model/relationships
- https://github.com/directus/directus/blob/v12.5.1/api/src/ai/tools/relations/prompt.md
- https://github.com/directus/directus/blob/v12.5.1/api/src/ai/tools/fields/prompt.md
- https://github.com/directus/directus/blob/v12.5.1/app/src/modules/settings/routes/data-model/utils/get-junction-collection-name.ts
- https://github.com/directus/directus/tree/v12.5.1/app/src/modules/settings/routes/data-model/field-detail/store/alterations
- https://github.com/directus-labs/starters/blob/main/cms/directus/template/src/relations.json
