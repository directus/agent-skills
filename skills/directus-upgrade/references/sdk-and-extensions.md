# SDK and extensions across versions

Which `@directus/sdk` and `@directus/extensions-sdk` majors ship with which Directus release, how to bump them, and
what changed for extensions. Writing new code: `directus-sdk` and `directus-extensions` skills.

In grep patterns inside tables, `\|` is an escaped pipe: type a plain `|` in your shell.

## Contents

- [Version map](#version-map)
- [Upgrading `@directus/sdk`](#upgrading-directussdk)
- [Upgrading extensions](#upgrading-extensions)
- [The `host` field](#the-host-field)
- [Extension API changes](#extension-api-changes)

## Version map

Versions in the monorepo at each release tag. **House rule:** pin the SDK major that shipped with your server version,
and bump both together.

| Directus         | `@directus/sdk`                               | `@directus/extensions-sdk` | Node (`directus` engines) |
| ---------------- | --------------------------------------------- | -------------------------- | ------------------------- |
| 9.25 to 9.26     | legacy `new Directus()` (not in the monorepo) | 9.25.0, 9.26.0             | `>=18`                    |
| 10.0 to 10.1     | legacy `new Directus()` (not in the monorepo) | 10.0.0, 10.1.0             | `>=18`                    |
| 10.2 to 10.4     | 10.3.3 (legacy `new Directus()`)              | 10.1.x                     | `>=18`                    |
| 10.5 to 10.6     | 11.x (composable `createDirectus`)            | 10.1.x                     | `>=18`                    |
| 10.7 to 10.8.2   | 13.x (14.x from 10.8.3)                       | 10.1 to 10.2               | `>=18`                    |
| 10.9 to 10.10    | 15.x                                          | 10.3 / 11.0                | `>=18`                    |
| 10.11 to 10.13   | 16.x                                          | 11.0.x                     | `>=18`                    |
| 11.0 to 11.1.1   | 17.x                                          | 12.0.x                     | `>=18`                    |
| 11.1.2 to 11.3   | 18.x                                          | 12.1.x                     | `>=18`                    |
| 11.4 to 11.8     | 19.x                                          | 13.x                       | `>=22`                    |
| 11.9 to 11.14.0  | 20.x                                          | 14.x to 17.x               | `>=22`                    |
| 11.14.1 to 11.17 | 21.x                                          | 17.x                       | `>=22`                    |
| 12.0             | 22.x                                          | 18.0.0                     | `>=22`                    |
| 12.1             | 23.x                                          | 18.0.1                     | `>=22`                    |
| 12.2             | 24.x                                          | 18.0.2                     | `>=22`                    |
| 12.3             | 25.x                                          | 18.0.3                     | `>=22`                    |
| 12.4             | 26.x                                          | 18.0.5                     | `>=22`                    |
| 12.5             | 27.x                                          | 18.0.6                     | `>=22`                    |

At 12.5.1, `@directus/sdk` declares `engines.node: ">=22"` and `@directus/extensions-sdk` declares `>=20.19.0`.

## Upgrading `@directus/sdk`

1. Current version: `rg -n '"@directus/sdk"' -g 'package.json' -g '!node_modules'`.
2. **10.x or lower** (`new Directus()`, `directus.items('x').readByQuery(...)`) is a rewrite, not a bump. Detect
   `rg -n "new Directus\(|\.items\(['\"]" -g '!node_modules'`. Port to `createDirectus(url).with(rest())` and
   `client.request(readItems('x', query))` (`directus-sdk` skill).
3. Walk the breaking changes you cross:

| SDK                       | Change                                                                                              | Detect                                  | Fix                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------ |
| 12 (10.6.2)               | `refresh(mode, token)` order; `asSearch` → `withSearch`                                             | `rg -n "asSearch"`                      | rename; see 20 below for current `refresh` |
| 14 (10.8.3), 15 (10.9)    | `ExtensionItem` → `DirectusExtension`; no scoped imports                                            | `rg -n "ExtensionItem\|@directus/sdk/"` | import from `@directus/sdk` root           |
| 17 (11.0)                 | policy functions; roles lose access flags                                                           | `rg -n "admin_access\|app_access"`      | see `11.0.md`                              |
| 18 (11.1.2)               | comment functions use `/comments`, UUID ids                                                         | `rg -n "createComment\|updateComment"`  | upgrade with the server                    |
| 20 (11.9)                 | `login({ email, password })`, `refresh({ mode, refresh_token })`, `logout({ mode, refresh_token })` | see `11.x-minors.md`                    | object args                                |
| 21 (11.14.1)              | webhook commands removed                                                                            | `rg -n "Webhook"`                       | use flows                                  |
| 22 (12.0)                 | failed requests throw `RequestError` (an `Error`), `updateExtension(id, data)`                      | see `12.0.md`                           | use `isDirectusError`                      |
| 23 (12.1)                 | `generateHash`, `verifyHash` removed                                                                | `rg -n "generateHash\|verifyHash"`      | custom endpoint                            |
| 24 (12.2)                 | `schemaDiff(snapshot, { force, mode })`                                                             | `rg -n "schemaDiff\("`                  | options object                             |
| 25, 26, 27 (12.3 to 12.5) | system type corrections (nullable fields, `string[]` ip_access, `number` notification id)           | `tsc --noEmit`                          | handle nulls; see `12.x-minors.md`         |

4. Type check (`tsc --noEmit`, `vue-tsc --noEmit`, `nuxi typecheck`) and fix. Regenerate generated schema types.
5. Content versions: send `version: 'published'` (or `'draft'`), not `'main'`, in new code.

## Upgrading extensions

1. Bump `@directus/extensions-sdk` in each extension's `devDependencies` to the target's version, `npm install`,
   `npx directus-extension build`.
2. Fix TS errors from typed services (11.10.1) and changed `@directus/types` (12.4, 12.5).
3. Layout: one folder per extension in `extensions/`, each `package.json` with `directus:extension` (`type`, `path`,
   `source`, `host`). Typed folders (`extensions/hooks/...`) are ignored from 10.10.0.
4. Load it on the target server and watch the log for extension load errors.
5. 12.1+ Docker images: install extensions at build time (multi-stage `Dockerfile`), not with `npm` in the container.

## The `host` field

- `directus:extension.host` is a semver range of compatible Directus versions. The Marketplace checks it (`satisfies`)
  to show compatibility with the running server.
- At 12.5.1 the API does not check `host` when loading local extensions: a wrong range won't stop a local extension
  loading, but Marketplace listings show it as incompatible.
- `create-directus-extension` at 12.5.1 still writes `host: "^10.10.0"` (`LAST_BREAKING_RELEASE`), which doesn't match
  11.x or 12.x. When publishing, widen it to the majors you've tested, e.g. `">=10.10.0 <13.0.0"` or `"^12.0.0"`.
- Detect: `rg -n '"host"' -g 'package.json' -g '!node_modules' extensions/`.

## Extension API changes

Each hop file covers the extension-facing changes for its releases, with detect patterns. The big ones:
10.4.0 (`exceptions` → `@directus/errors`), 10.10.0 (folder layout, `AuthenticationService.login`), 11.0.0
(`usersStore` role flags, `preRegisterCheck`), 11.10.1 (typed services), 11.13.0 (`<scope>.delete` hook timing),
12.0.0 (theme tokens), 12.3.0 (storage `exists()` throws), 12.5.0 (license error classes).

## Sources

- https://directus.com/docs/releases/breaking-changes/version-10
- https://directus.com/docs/releases/breaking-changes/version-11
- https://directus.com/docs/releases/breaking-changes/version-12
- https://directus.com/docs/self-hosting/including-extensions
- https://directus.com/docs/self-hosting/hardened-images
- https://github.com/directus/directus/blob/v12.5.1/sdk/package.json
- https://github.com/directus/directus/blob/v12.5.1/sdk/src/utils/error.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/extensions-sdk/package.json
- https://github.com/directus/directus/blob/v12.5.1/packages/extensions-sdk/src/constants/last-breaking.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/modules/settings/routes/marketplace/routes/extension/components/extension-metadata-compatibility.vue
- https://github.com/directus/directus/releases/tag/v12.0.0
