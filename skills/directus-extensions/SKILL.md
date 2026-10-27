---
name: directus-extensions
description: "Use when building, debugging, or publishing custom Directus extensions (interfaces, displays, layouts, modules, panels, hooks, endpoints, operations, bundles), or deciding whether a Flow is enough. Covers create-directus-extension, the extensions SDK, services and accountability, local dev with Docker, the sandbox, and the Marketplace. Not for calling the API (directus), Flows (directus-flows), or frontend SDK code (directus-sdk)."
metadata:
  author: directus
  directus-version: '12.6.0'
---

# Directus extensions

Build code that extends Directus: Vue 3 app extensions in the Studio, API extensions in the Directus Node process,
operations that do both, and bundles that ship several together.

_Verified against Directus v12.6.0 source, `@directus/extensions-sdk` 18.1.0, `create-directus-extension` 12.1.7, and
the current docs. If the instance or its logs disagree, trust the instance._

## First checks

1. **Is an extension needed?** Flows, validation rules, display templates, and theme settings cover a lot. See
   [choosing-a-type.md](references/choosing-a-type.md).
2. **Directus version and how it runs:** `GET /server/info` (`data.version`), Docker tag, or `directus` in
   `package.json`. Docker needs `./extensions` mounted to `/directus/extensions`.
3. **Existing extensions:** look in `EXTENSIONS_PATH` (default `./extensions`) and root `package.json` deps. Extend an
   existing bundle before creating a new package.
4. **Where secrets live:** server env or operation options. Never in app extension code.

## Critical traps

- **Wrong CLI for the job.** `npx create-directus-extension@latest <type> <name>` only scaffolds. `validate`, `link`,
  and `add` are `directus-extension` commands (`npm run validate`, `npm run link -- <extensions-dir>`, and in bundles
  `npm run add`; elsewhere `npx directus-extension add`).
  `add` always prompts; without a TTY, edit bundle `entries` by hand.
- **Services without accountability are admin.** `new ItemsService('articles', { schema })` bypasses permissions. Pass
  `req.accountability` (endpoints) or `context.accountability` (hooks, operations). That context value is `null` for
  schedules and system events, which also means admin. Decide on purpose.
- **Hook event names.** `items.create` fires for every user collection, never for `directus_*`. Scope it
  (`articles.items.create`) or check `meta.collection`. System collections drop the prefix (`users.create`). Filters
  return the modified payload (returning nothing keeps it), can throw to abort, and run inside the transaction (use
  `context.database`); actions run after commit and their errors are only logged. Writing to the same collection from
  its own hook loops unless you pass `{ emitEvents: false }`.
- **Endpoints: Express 4, public, after core.** Async errors aren't caught: wrap in `try/catch` and `next(error)`, or
  the request hangs. Every caller reaches the route, so check `req.accountability` yourself. An `id` matching a core
  route (`items`, `files`, `users`) is shadowed. Function-form endpoints mount at the package name (bundle: entry name);
  use `{ id, handler }` to choose the path.
- **Nothing reloads by magic.** Rebuild (`npm run dev` watches). With `EXTENSIONS_AUTO_RELOAD=true`, API code reloads
  and app code is re-bundled, then hard-refresh the browser. Without it, restart Directus. Auto reload does nothing with
  `EXTENSIONS_LOCATION`. A new module also has to be enabled in the project's module bar setting before it shows.
- **App runtime is shared.** `vue`, `vue-router`, `vue-i18n`, `pinia`, `@directus/extensions-sdk` (and Tiptap, 12.6+) come from the
  Studio (Vue 3.5 at v12.5.1). Use the matching `defineX` (docs examples wrongly reuse `defineInterface`). Studio
  components (`VButton`, `VInput`, `PrivateView`) are global, no imports. Style with `--theme--*` variables (v12
  removals: `directus-upgrade`). External images, media, and iframes need CSP env changes.
- **`host` is not a load check.** Directus loads any version. The Marketplace only compares `host` to show
  "Compatibility not guaranteed". The scaffold writes `^10.10.0`, which doesn't match 12.x. Set it to what you tested
  (`^12.0.0`).
- **Sandbox limits.** Sandboxed code imports only `directus:api` (`log`, `sleep`, `request` with scoped URLs and
  methods). No services, env, DB, or accountability. Sandboxed endpoints are function-form only and return
  `{ status, body }`. Bundles can't be sandboxed, so a bundle with API entries needs `MARKETPLACE_TRUST=all` to install
  from the Marketplace.

## Quick start

```bash
cd extensions # the folder mounted at /directus/extensions
npx create-directus-extension@latest endpoint acme-api --language typescript # <type> <name> = no prompts
cd acme-api && npm run dev # watch build into dist/
```

With `EXTENSIONS_AUTO_RELOAD=true`, check Settings → Extensions and the API logs for `Couldn't register ...` warnings.
`EXTENSIONS_MUST_LOAD=true` makes a failed API extension stop the process.

## References

| Load when                                                                                                                               | Reference                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Picking a type, app vs API vs bundle, or whether a Flow/built-in feature is enough                                                      | [choosing-a-type.md](references/choosing-a-type.md)           |
| Scaffolding, the manifest, build/dev/link/add/validate, loading into Docker or npm installs, bundles, env vars                          | [scaffold-build-dev.md](references/scaffold-build-dev.md)     |
| Interfaces, displays, layouts, modules, panels, themes; options; `useApi`/`useStores`/`useSdk`; UI components, CSS variables, i18n, CSP | [app-extensions.md](references/app-extensions.md)             |
| Hooks, endpoints, operations; hook event traps; services and accountability; `@directus/errors`; env casting; tests                     | [api-extensions.md](references/api-extensions.md)             |
| Sandbox scopes and shapes, `MARKETPLACE_TRUST`, security review                                                                         | [sandbox-and-security.md](references/sandbox-and-security.md) |
| Publishing to npm, Marketplace listing, README and screenshots                                                                          | [publishing.md](references/publishing.md)                     |
| A real example per type, app-plus-endpoint bundles, repo layout                                                                         | [patterns.md](references/patterns.md)                         |

**Related skills:** `directus` (REST, MCP), `directus-access-control` (permissions), `directus-flows` (when a Flow is
enough), `directus-sdk` (`@directus/sdk` in frontends), `directus-content-modeling` (collections, fields, relations),
`directus-upgrade` (extension changes across versions, v12 theme and `host` updates).

## Go deeper

1. Directus docs MCP server: `https://directus.com/docs/mcp` (no auth; tools `search-docs`, `get-doc`, `list-docs`,
   `search-directus-code`, `get-directus-file`). Use `get-directus-file` on `packages/extensions-sdk/src` or
   `api/src/extensions/manager.ts` for exact behavior.
2. Raw markdown for any docs page: `https://directus.com/docs/raw/<path>.md`, for example
   `https://directus.com/docs/raw/guides/extensions/api-extensions/hooks.md`. Index:
   `https://directus.com/docs/llms.txt`.
3. The instance itself: API logs (extension load and registration errors), `GET /server/info`, `GET /server/specs/oas`
   (your endpoints don't appear there), `GET /extensions` (installed extensions and enabled state), and the schema.
4. Real extensions: https://github.com/directus-labs/extensions (about 55 packages across every type).
