# @directus/visual-editing

Install `@directus/visual-editing` (2.1.0 is `packages/visual-editing` at 12.6.0; check `npm view @directus/visual-editing version`). It is client-only: call `apply()` in an effect, `onMounted`, or `afterNavigate`, never during SSR. `setAttr` is a pure string builder and is safe on the server. Full API: https://directus.com/docs/guides/content/visual-editor/frontend-library

## Exports

| Export | Signature | Notes |
| --- | --- | --- |
| `apply` | `apply({ directusUrl, elements?, customClass?, onSaved? }): Promise<{ remove, enable, disable } \| undefined>` | Registers `[data-directus]` elements. Resolves `undefined` when no Studio answers. |
| `setAttr` | `setAttr({ collection, item, fields?, mode? }): string` | `fields` is a string or string array. `mode`: `'drawer'` (default), `'modal'`, `'popover'`. |
| `remove` | `remove(): void` | Unregisters every element and removes overlays. |
| `disable` | `disable(): { enable(): void }` | Turns all active elements off until `enable()`. |

Types: `import type { EditConfig, SavedData, ... } from '@directus/visual-editing/types'`. `customClass` is a `string` (the docs table says `string[]`; the source type is `string`).

## The data-directus attribute

```tsx
<h1 data-directus={setAttr({ collection: 'posts', item: post.id, fields: ['title', 'slug'], mode: 'popover' })}>
	{post.title}
</h1>
// renders data-directus="collection:posts;item:12;fields:title,slug;mode:popover"
```

Parsing rules (`EditableElement.editAttrToObject`):

- Pairs split on `;`, key and value on `:`, and **only the text between the first and second colon is kept**. `fields:blocks.item:block_hero.headline` becomes `fields: ['blocks.item']`. A string primary key containing `:` or `;` breaks the same way.
- `fields` splits on `,`. Unknown keys are ignored.
- The Studio filters the edit form to fields whose **top-level name** is in `fields`, plus fields inside a selected group. Dot paths match nothing, and when nothing matches the form shows **every** field. Omit `fields` to show all.
- An element with an empty `item` never activates; `item: '+'` is rejected with an "item not found" dialog.

**House rule:** render `data-directus` only inside the editor ([preview-security.md](preview-security.md#hide-attributes-from-the-public-site)). It exposes collection names and primary keys.

## apply() lifecycle

1. `apply` posts `connect` to `window.parent` with `directusUrl` as the target origin.
2. It polls for the Studio's `confirm` reply 10 times, 100 ms apart. No reply within about 1 s resolves `undefined` (normal on the public site).
3. It registers every matching element not already registered and sends `checkFieldAccess` for the new ones.
4. The Studio answers `activateElements` with the keys the user may edit. Only those get overlays and hover handlers. Admins get everything; with a version selected, elements on non-versioned collections stay inert.

- Run `apply()` **after** the attributes are in the DOM, and again when new attributed elements render (new blocks, client-side navigation, refetch). Already registered elements are skipped, so repeat calls are cheap.
- The library reports the frame's URL and title changes to the Studio (polling every 200 ms), keeping the Visual Editor's address bar in sync during client-side navigation.

## onSaved and refreshing

After a save the Studio posts `saved` with `{ key, collection, item, payload }`. If the element that opened the editor has an `onSaved`, it gets `{ collection, item, payload }` (the saved field values); otherwise the page runs `window.location.reload()`. AI Assistant edits made from the Visual Editor send `saved` with an empty key, so they always trigger a full reload. Refetch instead of reloading so scroll position and client state survive (per framework: [frameworks.md](frameworks.md)), then re-run `apply()` once the refetch renders, since blocks may have been added or replaced.

## Scoping, remove, disable

```ts
const header = await apply({
	directusUrl, elements: document.querySelector('header'), customClass: 'header-overlays', onSaved: () => refreshNav(),
});
header?.disable(); // only the header's elements; also header?.enable(), header?.remove()
```

- `elements` takes one element or an array. Elements without the attribute contribute their attributed descendants.
- Once an element is applied **with** `elements`, its `customClass` and `onSaved` are locked. Applying without `elements` keeps them writable.
- Call the global `remove()` on client-side route changes so detached elements don't pile up in the store. None of the starters do this; they rely on full re-renders.

## Styling

Overlays live in `#directus-visual-editing`. Override CSS variables on `:root` or your `customClass`, for example `--directus-visual-editing--overlay--z-index` (default `999999999`) and `--directus-visual-editing--rect--border-color`. Inside the Studio, color, radius, button size, and focus ring default to the Studio theme; your overrides still win. The starters lower the overlay z-index to `40` to stay under their fixed header. Full list: https://directus.com/docs/guides/content/visual-editor/customization

## Without a bundler

The docs suggest `<script src="https://unpkg.com/@directus/visual-editing">` and a global `DirectusVisualEditing`. unpkg serves the IIFE build `dist/visual-editing.js`, which in 2.1.0 is called with a global `observeRect` that nothing defines (the bundle ends `})({},observeRect);`), so it throws `ReferenceError: observeRect is not defined` on load. Use an ES module CDN; esm.sh rewrites the `@reach/observe-rect` import:

```html
<script type="module">
	import { apply } from 'https://esm.sh/@directus/visual-editing@2.1.0';
	apply({ directusUrl: 'https://directus.example.com' });
</script>
```

## Sources

- https://directus.com/docs/guides/content/visual-editor/frontend-library
- https://directus.com/docs/guides/content/visual-editor/customization
- https://directus.com/docs/guides/content/visual-editor/studio-module
- https://github.com/directus/directus/blob/v12.6.0/packages/visual-editing/src/index.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/visual-editing/tsdown.config.js
- https://github.com/directus/directus/blob/v12.6.0/packages/visual-editing/src/lib/directus-frame.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/visual-editing/src/lib/editable-element.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/visual-editing/src/lib/editable-store.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/visual-editing/src/lib/page-manager.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/visual-editing/src/lib/types/directus.ts
- https://github.com/directus/directus/blob/v12.6.0/app/src/modules/visual/components/editing-layer.vue
- https://github.com/directus/directus/blob/v12.6.0/app/src/views/private/components/overlay-item.vue
