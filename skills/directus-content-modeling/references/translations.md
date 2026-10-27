# Translations

- [Pick a storage strategy](#pick-a-storage-strategy)
- [Build it](#build-it)
- [What goes where](#what-goes-where)
- [Querying](#querying)
- [AI translations](#ai-translations)
- [Not this](#not-this)

An M2M between your collection and `languages`, with the translated fields living on the junction.

## Pick a storage strategy

| Strategy                           | How                                                                                                                    | Use when                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Default language on the parent** | Parent keeps `title`, `slug`, etc. in the default locale. `*_translations` holds the other languages. Frontend merges. | Most sites. Works with one-language content today and adds languages later without a migration. The `cms-i18n` starter does this. |
| **All languages in translations**  | Parent keeps only language-neutral fields. Every locale, including the default, is a translation row.                  | Every language is equal, with no fallback language.                                                                               |

**House rule:** default language on the parent.

## Build it

**Fastest, when a human is at the keyboard:** the Studio's **Enable Translations** wizard (Settings → Data Model →
collection → Translations). It creates `languages` if missing (seeded with 8 languages), the
`<collection>_translations` junction, both relations, and the alias field, then lets you pick which fields to translate.

**Through MCP or the API:**

1. Make sure `languages` exists: `code` (string PK, e.g. `en-US`), `name` (string), `direction` (string, `ltr`/`rtl`,
   `select-dropdown`). Seed the languages the user wants.
2. Create `<collection>_translations`: UUID `id`, `meta.hidden: true`, `meta.group: "<collection>"`. Add
   `<collection>` (FK named exactly like the parent collection, `posts` not `posts_id`, same type as its PK) and `languages_code` (`string`).
3. Add the translated fields to the junction with the same names, types, and interfaces as on the parent.
4. Create the alias on the parent:

```json
{
	"field": "translations",
	"type": "alias",
	"schema": null,
	"meta": {
		"special": ["translations"],
		"interface": "translations",
		"options": { "languageField": "name", "defaultOpenSplitView": true },
		"display": "translations",
		"display_options": { "template": "{{title}}", "languageField": "name" }
	}
}
```

5. Create both relations. Both sides `CASCADE`, like every junction. Deleting a language deletes its translations, so
   confirm with the user before removing a language.

```json
[
	{
		"collection": "posts_translations",
		"field": "posts",
		"related_collection": "posts",
		"meta": { "one_field": "translations", "junction_field": "languages_code" },
		"schema": { "on_delete": "CASCADE" }
	},
	{
		"collection": "posts_translations",
		"field": "languages_code",
		"related_collection": "languages",
		"meta": { "one_field": null, "junction_field": "posts" },
		"schema": { "on_delete": "CASCADE" }
	}
]
```

**House rule:** give every `*_translations` collection a `status` field too, so a locale can stay in draft while
others are published. `cms-i18n` does this. Public read permissions then filter translations on `status`.

## What goes where

| On the parent (language-neutral)                 | On `*_translations`                           |
| ------------------------------------------------ | --------------------------------------------- |
| `id`, `status` (overall), `sort`, `published_at` | `title`, `headline`, `tagline`, `description` |
| Relations (author, image, blocks, category)      | `content` (rich text)                         |
| Booleans, numbers, colors, selects, dates        | `slug` / `permalink` when URLs are localized  |
| SEO JSON if it's per-site, not per-locale        | Per-locale `status`                           |

For an M2A page builder, translate each **block** collection (`block_hero_translations`), not the junction.

## Querying

Fetch only the locales you need with `deep`:

```
GET /items/posts?filter[slug][_eq]=hello
  &fields=*,translations.*
  &deep[translations][_filter][languages_code][_eq]=de-DE
```

With the default-on-parent strategy, request the target locale and fall back to the parent fields when there's no row.
`cms-i18n` uses `_or: [{ languages_code: { _eq: locale } }, { languages_code: { _eq: DEFAULT_LOCALE } }]` and merges
the translation onto the parent so components read `post.title` either way.

## AI translations

The translations interface has **Translate with AI**. It needs a license that includes AI translations (Directus 12),
`AI_ENABLED` (default `true`), a provider key and model in Settings → AI, and create/update permission on the
`*_translations` collection. Settings → AI also has a translation glossary (up to 200 terms) and a style guide. It
handles slugs, Markdown, and HTML; booleans, dates, files, and selects are skipped. So keep translatable text in
`string`/`text` fields with the right interface.

## Not this

- **Studio labels** (field and collection names): use `meta.translations` on fields and collections.
- **Frontend UI strings** (button labels, "Read more"): use a translated `globals` singleton or Directus custom
  translation strings (`directus_translations`, `$t:` keys), not a content collection per string.

## Sources

- https://directus.com/docs/guides/content/translations
- https://directus.com/docs/guides/ai/translations
- https://directus.com/docs/guides/data-model/relationships#translations
- https://github.com/directus/directus/blob/v12.6.0/app/src/interfaces/_system/system-collections-translations/system-collections-translations-dialog.vue
- https://github.com/directus/directus/blob/v12.6.0/app/src/modules/settings/routes/data-model/field-detail/store/alterations/translations.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/tools/fields/prompt.md
- https://github.com/directus-labs/starters/tree/main/cms-i18n/directus/template/src
- https://github.com/directus-labs/starters/blob/main/cms-i18n/nextjs/src/lib/directus/fetchers.ts
