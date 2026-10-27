# App extensions: interfaces, displays, layouts, modules, panels, themes

App extensions are Vue 3 code bundled into the Studio and run in the browser as the signed-in user. The docs cover each
type's config keys, props, and a starter component. This file holds what the docs miss or get wrong.

## Contents

- [Docs per type](#docs-per-type)
- [Runtime traps](#runtime-traps)
- [Per-type traps](#per-type-traps)
- [Talking to the API](#talking-to-the-api)
- [Styling](#styling)
- [i18n](#i18n)
- [CSP and external resources](#csp-and-external-resources)

## Docs per type

| Type      | Define function   | Docs (config keys, props, emits)                                      |
| --------- | ----------------- | --------------------------------------------------------------------- |
| interface | `defineInterface` | https://directus.com/docs/guides/extensions/app-extensions/interfaces |
| display   | `defineDisplay`   | https://directus.com/docs/guides/extensions/app-extensions/displays   |
| layout    | `defineLayout`    | https://directus.com/docs/guides/extensions/app-extensions/layouts    |
| module    | `defineModule`    | https://directus.com/docs/guides/extensions/app-extensions/modules    |
| panel     | `definePanel`     | https://directus.com/docs/guides/extensions/app-extensions/panels     |
| theme     | `defineTheme`     | https://directus.com/docs/guides/extensions/app-extensions/themes     |
| richtext  | `defineRichText`  | https://directus.com/docs/guides/extensions/app-extensions/richtext   |

Composables: https://directus.com/docs/guides/extensions/app-extensions/composables. UI components:
https://directus.com/docs/guides/extensions/app-extensions/ui-library.

## Runtime traps

- Shared with the Studio: `vue` 3.5.x, `vue-router` 4.x, `vue-i18n` 11.x, `pinia` 2.x, `@directus/extensions-sdk`, and from 12.6.0 `@tiptap/core`, `@tiptap/vue-3`, and 11 `@tiptap/pm/*` subpaths. Your installed `vue` only matters for types and the SFC compiler. Don't install a second Vue-based UI framework expecting its own Vue.
- Docs pages reuse `defineInterface` for other types. The wrong `defineX` works at runtime (they are identity functions) but the types are wrong.
- Composables (`useApi`, `useStores`, `useSdk`, ...) use Vue `inject`. Call them at the top of `setup`, not inside callbacks or after an `await`.
- `id` must be unique across all extensions of that type, including core ones. Prefix with your org (`acme-rating`).
- `options` can be an array of field definitions, a Vue component, a function, or `null`. For interfaces the function form gets an `ExtensionOptionsContext` (`collection`, `field`, `relations`, ...). Each option arrives as a prop named after its `field`.

## Per-type traps

- **Rich text (12.6.0+):** import Tiptap from the shared packages, never bundle your own ProseMirror (objects from a
  second copy fail the editor's class checks). Extra Tiptap packages must match Directus's Tiptap major (3.x on 12.x).
  A field uses the extension only after it's selected in the WYSIWYG interface's **Extensions** option.
- **Interface:** emit `input` with the new value; emit `setFieldValue` (`{ field, value }`) to change another field. Handle both `disabled` and `nonEditable`. `description` is max 80 chars.
- **Display:** renders once per cell, so keep it light. `component` can be a plain function (`({ value }) => String(value)`). With `fields: ['name', 'color']`, `value` becomes an object with those fields.
- **Layout:** respect the `filter` and `search` props or the Studio's search bar and filters stop working. Mark the component `inheritAttrs: false`. Do the data work in `setup` and return it; the layout component and its `options`/`sidebar`/`actions` slots all receive the result as props:

```ts
setup(props, { emit }) {
    const layoutOptions = useSync(props, 'layoutOptions', emit); // writable computed, emits update:layoutOptions
    const { collection, filter, search } = toRefs(props);
    const { primaryKeyField } = useCollection(collection);
    // every query key is a Ref; useItems refetches immediately and on change
    const { items, loading } = useItems(collection, {
        fields: ref(['*']), limit: ref(25), sort: ref(null), page: ref(1), filter, search,
    });
    return { items, loading, primaryKeyField, layoutOptions };
},
```

- **Module:** hidden from the module bar until enabled in the project's `module_bar` setting. `hidden: true` keeps it routable but out of the bar. Wrap pages in the global `<PrivateView title="...">`. Gate it with `preRegisterCheck: (user) => user.admin_access === true`.
- **Panel:** for a collection picker option use `meta: { interface: 'system-collection' }`. Use the `showHeader` prop to adjust padding.
- **Theme:** rules follow [themes.ts](https://github.com/directus/directus/blob/v12.6.0/packages/types/src/extensions/themes.ts). Unknown or removed keys are silently ignored. No custom CSS.

## Talking to the API

```ts
import { useApi, useSdk, useStores } from '@directus/extensions-sdk';

const api = useApi(); // axios, Studio session attached
await api.get('/acme/stats'); // your own endpoint

const sdk = useSdk(); // @directus/sdk rest client
// import { readItems } from '@directus/sdk' (install it; command builders get bundled)
// await sdk.request(readItems('articles', { fields: ['id'] }));

const { useNotificationsStore } = useStores();
useNotificationsStore().add({ title: 'Saved', type: 'success' });
```

- `useSdk` isn't in the docs, and its JSDoc shows `sdk.items(...)`, the old SDK API. Use `sdk.request(readItems(...))` (see `directus-sdk`).
- Stores: `useAppStore`, `useCollectionsStore`, `useFieldsStore`, `useFlowsStore`, `useInsightsStore`, `useNotificationsStore`, `usePermissionsStore`, `usePresetsStore`, `useRelationsStore`, `useRequestsStore`, `useServerStore`, `useSettingsStore`, `useTranslationsStore`, `useUserStore`.
- Requests run as the current user. App-side permission checks are UX only; the API enforces the real rules.

## Styling

- Studio components are global, no imports (`<VButton>` or `<v-button>`). Full list: [components/register.ts](https://github.com/directus/directus/blob/v12.6.0/app/src/components/register.ts); `PrivateView` is in [views/register.ts](https://github.com/directus/directus/blob/v12.6.0/app/src/views/register.ts).
- Use `--theme--*` variables so light, dark, and custom themes work. Rule path → variable: `navigation.modules.button.foregroundActive` → `--theme--navigation--modules--button--foreground-active`. Common ones: `--theme--foreground`, `--theme--background-subdued`, `--theme--border-color`, `--theme--border-width`, `--theme--border-radius`, `--theme--fonts--sans--font-family`, `--theme--form--field--input--focus-ring-color`.
- The ui-library docs page names variables that don't exist (`--theme--border-normal`, `--theme--foreground-normal`). Check names against the [default light theme](https://github.com/directus/directus/blob/v12.6.0/packages/themes/src/themes/light/default.ts). Components expose their own variables too (`--v-button-color-hover`).

## i18n

- `$t:key` in config strings (`name`, option `name`, placeholders) resolves against the Studio's core translations. In components, `const { t } = useI18n()` from `vue-i18n` uses the app's instance (`t('save')`).
- Extensions can't register their own translation keys. Hardcode English, or create keys under **Settings > Translations** (`directus_translations`): the Studio merges them, so `$t:my_key` and `t('my_key')` resolve. Those keys live in the database, not your package, so document them in the README.

## CSP and external resources

Studio CSP defaults (unchanged through 12.6.0): `connect-src 'self' https://* wss://*`, `img-src 'self' data: blob: https://raw.githubusercontent.com https://avatars.githubusercontent.com`, `media-src 'self'`, `script-src 'self' 'unsafe-eval'`, and no `frame-src` (falls back to `child-src 'self' blob:`). So `fetch` to an https API works, but external images, video, iframes, and scripts are blocked unless the operator sets `CONTENT_SECURITY_POLICY_DIRECTIVES__<NAME>`:

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
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions-sdk/src/index.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions/src/shared/constants/shared-deps.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/types/src/extensions/interfaces.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/types/src/extensions/modules.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/types/src/extensions/options.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/types/src/extensions/themes.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/composables/src/use-system.ts
- https://github.com/directus/directus/blob/v12.6.0/app/src/composables/use-system.ts
- https://github.com/directus/directus/blob/v12.6.0/app/src/components/register.ts
- https://github.com/directus/directus/blob/v12.6.0/app/src/views/register.ts
- https://github.com/directus/directus/blob/v12.6.0/app/src/views/private/components/module-bar.vue
- https://github.com/directus/directus/blob/v12.6.0/app/src/utils/translate-literal.ts
- https://github.com/directus/directus/blob/v12.6.0/app/src/sdk.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/app.ts (CSP defaults)
- https://github.com/directus/directus/blob/v12.6.0/packages/themes/src/themes/light/default.ts
- https://github.com/directus-labs/extensions/tree/main/packages/switch-interface (`$t:` options, `useI18n`)
