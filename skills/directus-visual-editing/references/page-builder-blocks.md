# Page builder (M2A) blocks

## The problem

A page builder is `pages.blocks` (M2A alias) → `page_blocks` junction → `block_hero`, `block_richtext`, ... Versioning is on `pages`; block collections usually aren't versioned. A page version stores block changes inside the page's delta, so a block edit belongs to the page's version. Two Studio rules collide with that (`app/src/modules/visual/components/editing-layer.vue`):

- With a version selected, elements on non-versioned collections stay inert. Attributes that target `block_hero` directly can't be edited in draft.
- With **Published** selected, editing a non-versioned collection saves with `PATCH /items/block_hero/<id>`. That changes the live page immediately and skips the page's draft and review.

## What the starters do

`setBlockAttr` in each starter's `visualEditing.ts` (Next.js, Nuxt, SvelteKit, Astro), simplified:

```ts
if (contentVersion && pageId) {
	return setAttr({ collection: 'pages', item: pageId, fields: `blocks.item:${blockCollection}.${field}`, mode: 'modal' });
}
return setAttr({ collection: blockCollection, item: blockItemId, fields, mode });
```

- Published view: target the block directly, usually in `popover` mode. With a version: target the versioned `pages` item in `modal` mode with a nested path; a `pageFields` option overrides the path for deeper fields (`blocks.item:block_pricing.pricing_cards.title`).
- An "Edit All Blocks" button: `{ collection: 'pages', item: pageId, fields: ['blocks', 'meta_m2a_button'], mode: 'modal' }`, applied separately with a `customClass` so CSS can make the whole button the click target. `meta_m2a_button` is an alias field from the `directus-labs-experimental-m2a-interface` extension; drop it if the project doesn't have it.

The nested paths don't survive: the parser cuts `fields:blocks.item:block_hero.headline` to `fields: ['blocks.item']` (`packages/visual-editing/src/lib/editable-element.ts`). Then:

- `blocks.item` matches no top-level field, and an empty match shows **every** field of the page (`app/src/views/private/components/overlay-item.vue`). Editors get the whole page form, not the headline.
- For non-admins whose `pages` update permission lists specific fields, the access check compares exact names, so `blocks.item` fails and the element stays inert.

Draft-mode edits still land in the right place (the page's version), just less targeted than the code suggests.

## Recommended pattern

**House rule:** when the parent page is versioned, route every block edit through the parent, in both published and draft views, with `fields: ['blocks']`:

```ts
export const setBlockAttr = (pageId: string) =>
	setAttr({ collection: 'pages', item: pageId, fields: ['blocks'], mode: 'modal' });
```

- Opens only the `blocks` builder field, where editors reorder, add, and edit blocks.
- In Published view the Studio sees a versioned collection and switches the frame to `draft` before editing (needs `{{$version}}` in the Visual Editor URL). Block edits always go through review.
- Passes field-level permission checks for editors who can update `pages.blocks`.
- Fields on the page itself (`title`, `seo`) can keep their own precise attributes on `pages`.

If you want popovers on individual block fields and accept that those edits go live immediately, keep block-direct attributes for the published view only, and make that trade-off explicit to the content team.

## Translated blocks

In `cms-i18n`, default-locale content sits on the block's own fields and other locales in `<block>_translations` (`languages_code`). The starter's attributes still name the base fields (`tagline`, `headline`), so on a non-default locale the editor opens the default-language value. **House rule:** when rendering a non-default locale, include `translations` in `fields` so the translations interface is in the form.

## Sources

- https://directus.com/docs/guides/content/visual-editor/studio-module
- https://directus.com/docs/guides/content/visual-editor/frontend-library
- https://github.com/directus/directus/blob/v12.6.0/packages/visual-editing/src/lib/editable-element.ts
- https://github.com/directus/directus/blob/v12.6.0/app/src/modules/visual/components/editing-layer.vue
- https://github.com/directus/directus/blob/v12.6.0/app/src/views/private/components/overlay-item.vue
- https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/lib/directus/visualEditing.ts
- https://github.com/directus-labs/starters/tree/main/cms/nextjs/src/app/%5B%5B...permalink%5D%5D/PageClient.tsx
- https://github.com/directus-labs/starters/tree/main/cms/nuxt/app/utils/visualEditing.ts
- https://github.com/directus-labs/starters/tree/main/cms/sveltekit/src/lib/directus/visualEditing.ts
- https://github.com/directus-labs/starters/tree/main/cms/directus/template/src
- https://github.com/directus-labs/starters/tree/main/cms-i18n/directus/template/src
