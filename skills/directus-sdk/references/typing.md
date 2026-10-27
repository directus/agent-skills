# Typing the client

## Contents

- [The Schema generic](#the-schema-generic)
- [Relations](#relations)
- [System collections and custom fields](#system-collections-and-custom-fields)
- [Literal field markers](#literal-field-markers)
- [Output types follow `fields`](#output-types-follow-fields)
- [Generating types](#generating-types)
- [Common type errors](#common-type-errors)

## The Schema generic

`createDirectus<Schema>(url)` takes one root type listing **every collection the app touches**, including junctions. A field counts as a relation only if its type includes an item type that appears somewhere in `Schema`.

```ts
interface Schema {
	posts: Post[]; // array = regular collection
	posts_tags: PostTag[]; // M2M junction
	page_blocks: PageBlock[]; // M2A junction
	globals: Globals; // not an array = singleton
	directus_files: DirectusFile[]; // needed if any field relates to files
	directus_users: CustomUserFields; // custom fields on a core collection
}
```

- Arrays are regular collections (`readItems`, `readItem`). Non-arrays are singletons (`readSingleton`, `updateSingleton`).
- Keep the root type plain: no `| null`, no optional keys (`posts?: Post[]`), no `any`, `{}`, `never`, or `void`.
- Without a Schema, queries accept any strings and results are `Record<string, any>`.

## Relations

Type each relational field as a union of the foreign key type and the related item type. The SDK narrows it based on `fields`.

```ts
interface Post {
	id: number;
	author: string | Author | null; // M2O
	comments: number[] | Comment[]; // O2M
	tags: number[] | PostTag[]; // M2M via junction
	image: string | DirectusFile | null; // M2O to directus_files
}
interface PostTag {
	id: number;
	posts_id: number | Post;
	tags_id: number | Tag;
}
interface PageBlock {
	id: string;
	page: string | Page | null;
	collection: 'block_hero' | 'block_richtext';
	item: string | BlockHero | BlockRichtext;
}
```

M2A detection is name based: a junction item type counts as many-to-any only when it has both a `collection` key and an `item` key. Nested M2A selection then takes a per-collection object, `{ blocks: ['collection', { item: { block_hero: ['headline'], block_richtext: ['content'] } }] }`. Requesting `collection` alongside `item` makes the output a discriminated union on `collection`.

## System collections and custom fields

The SDK exports types for core collections (`DirectusUser`, `DirectusFile`, `DirectusRole`, ...). To add custom fields to one, put a **singular** type with only the custom fields under its `directus_*` key (`directus_users: CustomUserFields`, with `CustomUserFields` holding for example `bio` and `company`). The SDK merges it with the built-in type. Built-in field types can't change (`directus_users.id` stays `string`).

**A relation to a core collection only works if that collection is in your Schema.** Add `directus_files: DirectusFile[]` (and `directus_users` for user relations) or nesting fields on `image` fails.

At runtime use the system commands (`readUsers`, `readUser`, `readMe`, `readFiles`, `readFile`, `readRoles`, ...). `readItems('directus_users')` throws `Cannot use readItems for core collections` before sending.

## Literal field markers

String literal types that enable query functions. They resolve to normal types in output.

| Marker | Enables | Output type |
| --- | --- | --- |
| `'datetime'`, `'date'`, `'time'` | `year(field)`, `month(field)`, `hour(field)`, ... in `fields`, `filter`, `groupBy` | `string` |
| `'json'` | `count(field)`, `json(field, path)` | `JsonValue` |
| `'csv'` | `count(field)` | `string[]` |

Example: `starts_at: 'datetime'; tags: 'csv' | null; settings: 'json' | null;`

## Output types follow `fields`

- Omitted `fields` or `'*'`: all top-level fields, relations typed as their **key type only** (`author: string | null`), matching the API default.
- `{ author: ['name'] }`: `author` becomes `{ name: string }` (or `null` if the field allows null).
- To-many relations come back as arrays, nullable when the field type includes `null`.
- `alias` is not reflected in output types.

```ts
const fields = ['id', 'title'] as const; // ok
const query = { fields: ['id', 'title'], limit: 10 } satisfies Query<Schema, Post>; // ok
const result = await directus.request(readItems('posts', query));
type PostCard = Awaited<typeof result>[number];
```

## Generating types

There is no official type generator in the Directus monorepo at v12.5.1. Options:

- **Hand-write** the Schema for the collections the app uses. Fine for small apps.
- **Generate from the instance:** read `GET /fields` and `GET /relations` with an admin token and write a `Schema`. Check the project for an existing generated file (`directus-schema.ts` or similar) and its script first.
- **OpenAPI:** `GET /server/specs/oas` (SDK `readOpenApiSpec()`) works with any OpenAPI type tool, but is not shaped like the SDK Schema.

**House rule:** regenerate types after every schema change and commit the output. Use the admin token only for generation, never at runtime.

## Common type errors

| Error | Cause | Fix |
| --- | --- | --- |
| `'x' does not exist in type '{ ... }'` on a nested field | Related collection missing from Schema (often `directus_files` or `directus_users`), or field typed as plain `string` | Add the collection to Schema; type the field as `Key \| Item` |
| `Type 'string[]' is not assignable to type 'readonly (...)[]'` | `fields` built as a mutable `string[]` | `as const`, inline it, or `satisfies Query<Schema, Item>` |
| Property is `string` when you expected an object | Relation not expanded in `fields` | Add `{ relation: [...] }` |
| `Argument of type '"globals"' is not assignable` on `readItems` | Collection is a singleton in Schema | `readSingleton('globals')` |
| Deep M2A `fields` arrays blow up type checking | Large nested selections | The starters cast `fields: pageFields as any` and cast results to the generated type. Acceptable for page builders |
| Excess property silently accepted | Generic options (for example `aggregate(..., { filter })`) skip excess property checks | Check the option shape in [queries.md](queries.md) |

## Sources

- https://directus.com/docs/tutorials/tips-and-tricks/advanced-types-with-the-directus-sdk
- https://directus.com/docs/guides/connect/sdk
- https://github.com/directus/directus/blob/v12.5.1/sdk/readme.md
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/types/schema.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/types/fields.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/types/output.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/types/functions.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/schema/core.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/schema/user.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/rest/utils/throw-core-collection.ts
- https://github.com/directus/directus/blob/v12.5.1/sdk/tests/schema.ts
- https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/lib/directus/generateDirectusTypes.ts
- https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/types/directus-schema.ts
- Type behavior above (missing `directus_files`, `string[]` fields, unexpanded relations, singleton `readItems`) was checked with `tsc --strict` against `@directus/sdk@27.0.0`.
