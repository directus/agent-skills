# App extensions: interfaces, displays, layouts, modules, panels, themes

App extensions are Vue 3 code bundled into the Studio and run in the browser as the signed-in user.

## Contents

- [Runtime facts](#runtime-facts)
- [Options schema](#options-schema)
- [Interface](#interface)
- [Display](#display)
- [Layout](#layout)
- [Module](#module)
- [Panel](#panel)
- [Theme](#theme)
- [Talking to the API](#talking-to-the-api)
- [UI components and styling](#ui-components-and-styling)
- [i18n](#i18n)
- [CSP and external resources](#csp-and-external-resources)

## Runtime facts

- Shared with the Studio at v12.5.1: `vue` 3.5.x, `vue-router` 4.x, `vue-i18n` 11.x, `pinia` 2.x, `@directus/extensions-sdk`. Your installed `vue` only matters for types and the SFC compiler. Don't install a second Vue-based UI framework expecting its own Vue.
- Wrong `defineX` (docs pages reuse `defineInterface`) works at runtime (they are identity functions) but the types are wrong.
- Composition API, `<script setup>`, and Options API all work. TypeScript SFCs need a `shims.d.ts` for `*.vue` (the scaffold adds it).
- Composables (`useApi`, `useStores`, `useSdk`, ...) use Vue `inject`. Call them at the top of `setup`, not inside callbacks or after an `await`.
- `id` must be unique across all extensions of that type, including core ones. Prefix with your org (`acme-rating`).

## Options schema

Interfaces, displays, panels, and operations take `options`: an array of field definitions (same shape as a Directus field), a Vue component, a function (interfaces get an `ExtensionOptionsContext` with `collection`, `field`, `relations`, ...), or `null`. Each option's value arrives as a prop named after its `field`. Interfaces can also split into `{ standard: [...], advanced: [...] }`.

```ts
options: [
	{
		field: 'placeholder',
		name: '$t:placeholder', // "$t:" resolves a core Studio translation key
		type: 'string',
		meta: { width: 'half', interface: 'input', options: { placeholder: 'Type here' } },
		schema: { default_value: null },
	},
],
```

## Interface

`defineInterface({ id: 'acme-rating', name, icon, description, component, types: ['integer'], group: 'selection', options })`. `description` is max 80 chars, `types` are the field types it can be used on, `group` is `standard | selection | relational | presentation | group | other`.

```vue
<script setup lang="ts">
const props = withDefaults(
	defineProps<{ value: number | null; max?: number; disabled?: boolean; nonEditable?: boolean }>(),
	{ max: 5 },
);
const emit = defineEmits<{ input: [value: number | null] }>();
</script>

<template>
	<div class="rating">
		<VIcon
			v-for="n in props.max"
			:key="n"
			name="star"
			:filled="(props.value ?? 0) >= n"
			:clickable="!props.disabled && !props.nonEditable"
			@click="!props.disabled && !props.nonEditable && emit('input', n)"
		/>
	</div>
</template>
```

- Emit `input` with the new value. Emit `setFieldValue` (`{ field, value }`) to change another field on the form.
- Props: all options, plus `value`, `width`, `type`, `collection`, `field`, `primaryKey`, `disabled`, `nonEditable`. Handle `disabled` and `nonEditable`.
- Other config keys: `localTypes` (`standard`, `file`, `files`, `m2o`, `o2m`, `m2m`, `m2a`, `presentation`, `translations`, `group`), `relational`, `recommendedDisplays`, `hideLabel`, `hideLoader`, `preview` (inline SVG), `indicatorStyle`.

## Display

`defineDisplay({ id, name, icon, component, options, types })`. `component` can be a function instead of a Vue component (`({ value }) => String(value).toUpperCase()`). For relational displays, set `fields: ['name', 'color']` and `value` becomes an object with those fields.

Props: options plus `value`, `interface`, `interfaceOptions`, `type`, `collection`, `field`. Keep displays light, they render once per cell.

## Layout

```ts
import { defineLayout, useItems, useCollection, useSync } from '@directus/extensions-sdk';
import { ref, toRefs } from 'vue';
import LayoutComponent from './layout.vue';

export default defineLayout({
	id: 'acme-cards',
	name: 'Cards',
	icon: 'grid_view',
	component: LayoutComponent,
	slots: { options: () => null, sidebar: () => null, actions: () => null },
	setup(props, { emit }) {
		const layoutOptions = useSync(props, 'layoutOptions', emit);
		const { collection, filter, search } = toRefs(props);
		const { primaryKeyField } = useCollection(collection);
		const { items, loading } = useItems(collection, {
			// every key is a Ref; useItems refetches (immediately and on change)
			fields: ref(['*']),
			limit: ref(25),
			sort: ref(null),
			page: ref(1),
			filter,
			search,
		});
		return { items, loading, primaryKeyField, layoutOptions };
	},
});
```

- `setup` returns shared state; the layout component and its `options`/`sidebar`/`actions` slot components all receive it as props. Mark the component `inheritAttrs: false`.
- Props in: `collection`, `selection`, `layoutOptions`, `layoutQuery`, `filter`, `filterUser`, `filterSystem`, `search`, `selectMode`, `readonly`, `resetPreset`. Emits `update:selection`, `update:layoutOptions`, `update:layoutQuery`; `useSync` gives writable computed refs.
- Respect `filter` and `search` so the Studio's search bar and filters keep working.

## Module

```ts
export default defineModule({
	id: 'acme-tools', // base path: /admin/acme-tools
	name: 'Acme Tools',
	icon: 'construction',
	routes: [
		{ path: '', component: Home }, // Vue Router syntax, nested under the module id
		{ path: ':id', component: Detail, props: true },
	],
	preRegisterCheck: (user) => user.admin_access === true,
});
```

- Hidden from the module bar until enabled in the `module_bar` setting. `hidden: true` keeps it routable but out of the bar.
- Wrap pages in the global `<PrivateView title="...">` for the Studio shell. Slots include `navigation`, `title`, `actions`, `actions:primary`, `sidebar`, `splitView`.

## Panel

`definePanel({ id, name, icon, description, component, options, minWidth: 12, minHeight: 8 })`. A collection picker option uses `meta: { interface: 'system-collection' }`.

Props: options plus `id` (panel instance uuid), `dashboard`, `showHeader`, `width`, `height`, `now`. Use `showHeader` to adjust padding.

## Theme

```ts
export default defineTheme({
	id: 'acme-dark',
	name: 'Acme Dark',
	appearance: 'dark', // light | dark
	rules: {
		primary: '#7c3aed',
		borderRadius: '8px',
		fonts: { sans: { fontFamily: '"Inter", system-ui' } },
		shell: { background: '#0b0b10' },
	},
});
```

- Rules follow the theme schema in `packages/types/src/extensions/themes.ts`. Unset rules fall back to the default theme for that appearance. No custom CSS.
- A quoted font name (`'"Yesteryear", sans-serif'`) is fetched from Google Fonts.
- v12 moved header and navigation background/border rules to `shell.*` and replaced focus border/shadow rules with `focusRingColor`. Old keys are silently ignored. Version history belongs to `directus-upgrade`.
- Fast path: design in Settings → Appearance theming options, then "Copy Raw Value" into `rules`.

## Talking to the API

```ts
import { useApi, useSdk, useStores } from '@directus/extensions-sdk';

const api = useApi(); // axios, Studio session attached, request queue
const { data } = await api.get('/items/articles', { params: { fields: ['id', 'title'], limit: 10 } });
await api.get('/acme/stats'); // your own endpoint

const sdk = useSdk(); // @directus/sdk client (rest)
// import { readItems } from '@directus/sdk' (install it; command builders get bundled)
// const rows = await sdk.request(readItems('articles', { fields: ['id'] }));

const { useNotificationsStore, usePermissionsStore } = useStores();
useNotificationsStore().add({ title: 'Saved', type: 'success' });
usePermissionsStore().hasPermission('articles', 'update');
```

- Stores: `useAppStore`, `useCollectionsStore`, `useFieldsStore`, `useFlowsStore`, `useInsightsStore`, `useNotificationsStore`, `usePermissionsStore`, `usePresetsStore`, `useRelationsStore`, `useRequestsStore`, `useServerStore`, `useSettingsStore`, `useTranslationsStore`, `useUserStore`.
- Other SDK exports: `useCollection`, `useItems`, `useLayout`, `useFilterFields`, `useSync`, `useExtensions`, `getFieldsFromTemplate`, `getRelationType`.
- `useSdk`'s JSDoc shows `sdk.items(...)`. That's the old SDK API. Use `sdk.request(readItems(...))` (see the `directus-sdk` skill).
- Requests run as the current user. App-side permission checks are UX only; the API enforces the real rules.

## UI components and styling

Studio components are global (kebab-case `<v-button>` works too): `VButton`, `VInput`, `VSelect`, `VIcon`, `VNotice`, `VDialog`, `VDrawer`, `VList`, `VTable`, `VForm`, `RenderDisplay`, `RenderTemplate`, ... Full list: [components/register.ts](https://github.com/directus/directus/blob/v12.5.1/app/src/components/register.ts); `PrivateView` is in [views/register.ts](https://github.com/directus/directus/blob/v12.5.1/app/src/views/register.ts). Playground: https://components.directus.io.

Style with theme CSS variables so light, dark, and custom themes work. Rule path → variable: `navigation.modules.button.foregroundActive` → `--theme--navigation--modules--button--foreground-active`.

```css
.card {
	color: var(--theme--foreground);
	background: var(--theme--background-subdued);
	border: var(--theme--border-width) solid var(--theme--border-color);
	border-radius: var(--theme--border-radius);
	font-family: var(--theme--fonts--sans--font-family);
}
.card:focus-visible {
	outline-color: var(--theme--form--field--input--focus-ring-color);
}
```

Also gone: the pre-theming `--background-page` and the v11 keys `--theme--header--background` and `--theme--header--headline--*`. `--theme--header--title--*` still exists. Check names against the [default light theme](https://github.com/directus/directus/blob/v12.5.1/packages/themes/src/themes/light/default.ts). Components expose their own variables too (`--v-button-color-hover`).

## i18n

- `$t:key` in config strings (`name`, option `name`, placeholders) resolves against the Studio's core translations. In components, `const { t } = useI18n()` from `vue-i18n` uses the app's i18n instance (`t('save')`).
- Extensions can't register their own translation keys. Hardcode English, or create keys under **Settings > Translations** (`directus_translations`): the Studio merges them into its global messages, so `$t:my_key` and `t('my_key')` resolve. Those keys live in the database, not your package, so document them in the README.

## CSP and external resources

Studio CSP defaults at v12.5.1: `connect-src 'self' https://* wss://*`, `img-src 'self' data: blob: https://raw.githubusercontent.com https://avatars.githubusercontent.com`, `media-src 'self'`, `script-src 'self' 'unsafe-eval'`, and no `frame-src` (falls back to `child-src 'self' blob:`). So `fetch` to an https API works, but external images, video, iframes, and scripts are blocked unless the operator sets `CONTENT_SECURITY_POLICY_DIRECTIVES__<NAME>`:

```env
CONTENT_SECURITY_POLICY_DIRECTIVES__IMG_SRC="array:'self', data:, blob:, https://images.example.com"
CONTENT_SECURITY_POLICY_DIRECTIVES__FRAME_SRC="array:'self', https://www.youtube.com"
```

Document any required CSP change in your README. Even where `fetch` is allowed, never put API keys in app code; call through an endpoint.

## Sources

- https://directus.com/docs/guides/extensions/app-extensions/interfaces
- https://directus.com/docs/guides/extensions/app-extensions/displays
- https://directus.com/docs/guides/extensions/app-extensions/layouts
- https://directus.com/docs/guides/extensions/app-extensions/modules
- https://directus.com/docs/guides/extensions/app-extensions/panels
- https://directus.com/docs/guides/extensions/app-extensions/themes
- https://directus.com/docs/guides/extensions/app-extensions/ui-library
- https://directus.com/docs/guides/extensions/app-extensions/composables
- https://directus.com/docs/configuration/security-limits
- https://github.com/directus/directus/blob/v12.5.1/packages/extensions-sdk/src/index.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/extensions/src/shared/constants/shared-deps.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/types/src/extensions/interfaces.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/types/src/extensions/modules.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/types/src/extensions/options.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/types/src/extensions/themes.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/composables/src/use-system.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/composables/use-system.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/components/register.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/views/register.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/views/private/components/module-bar.vue
- https://github.com/directus/directus/blob/v12.5.1/app/src/utils/translate-literal.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/sdk.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/app.ts (CSP defaults)
- https://github.com/directus/directus/blob/v12.5.1/packages/themes/src/themes/light/default.ts
- https://github.com/directus-labs/extensions/tree/main/packages/switch-interface (`$t:` options, `useI18n`)
