# Scaffold, build, and run locally

## Contents

- [Scaffold](#scaffold)
- [The manifest](#the-manifest)
- [Build and watch](#build-and-watch)
- [Load into Directus](#load-into-directus)
- [Bundles](#bundles)
- [Environment variables](#environment-variables)

## Scaffold

```bash
# <type> <name> skips the prompts (agents should use this form)
npx create-directus-extension@latest endpoint my-endpoint --language typescript
npx create-directus-extension@latest bundle my-bundle # no language for bundles
npx create-directus-extension@latest hook my-hook --no-install
```

- `create-directus-extension` has no subcommands: `validate`, `link`, or `add` is read as an extension type and fails. Use the generated npm scripts: `build` (`directus-extension build`), `dev` (`build -w --no-minify`), `link`, `validate` (checks built code, manifest incl. `path` files and a valid `host` range, license, readme), and `add` (bundles only, interactive).
- `--language` is `javascript` (default) or `typescript`.
- The folder name is the part of `name` after the last `/`: `@acme/directus-extension-foo` scaffolds into `directus-extension-foo/`.
- Dev deps installed: `@directus/extensions-sdk` always; `vue` for app/hybrid types; `typescript` (+ `@types/node` for API/hybrid) for TypeScript.

## The manifest

`package.json` → `directus:extension`, validated by a zod schema. An invalid manifest in a local extensions folder **throws** during extension discovery.

```jsonc
{
	"name": "directus-extension-my-endpoint",
	"type": "module",
	"keywords": ["directus", "directus-extension", "directus-extension-endpoint"],
	"files": ["dist"],
	"directus:extension": {
		"type": "endpoint",
		"path": "dist/index.js", // built output Directus loads; must exist after build
		"source": "src/index.ts", // entry the CLI builds from
		"host": "^12.0.0",
		"sandbox": { "enabled": false }, // API/hybrid only, optional
	},
}
// operation (hybrid): split entrypoints
// "path":   { "app": "dist/app.js", "api": "dist/api.js" },
// "source": { "app": "src/app.ts",  "api": "src/api.ts" }
```

- `host` is only read by the Marketplace. The scaffold writes `^10.10.0` (the SDK's `LAST_BREAKING_RELEASE`), or `^12.6.0` for `richtext`; a bundle takes the highest of its entries. **House rule:** set `host` to the range you actually tested, for example `"^12.0.0"` on a v12 project.
- Optional `hidden` (boolean). `sandbox`: see [sandbox-and-security.md](sandbox-and-security.md).
- `"type": "module"` makes the API build output ESM; without it the API output is CJS. App output is always ESM.

## Build and watch

`npm run build` (minified) or `npm run dev` (watch, unminified); add `--sourcemap` to `npx directus-extension build` for maps. The CLI is Rollup with esbuild for TS and `@vitejs/plugin-vue` for app code. Everything you import is **bundled** into `dist`, except:

| Side | Left external (provided by Directus at runtime)                      |
| ---- | -------------------------------------------------------------------- |
| App  | `@directus/extensions-sdk`, `vue`, `vue-router`, `vue-i18n`, `pinia` |
| API  | `directus`, `directus:api`                                           |

So API-side packages like `@directus/errors` and `@directus/types` get bundled from your own `node_modules`. Install what you import. Use `import type` for types-only imports. Custom Rollup plugins go in `extension.config.js` (`export default { plugins: [], watch: { clearScreen: false } }`).

## Load into Directus

Directus discovers extensions from:

1. **Local folder**: every subfolder of `EXTENSIONS_PATH` (default `./extensions`) whose `package.json` has `directus:extension`. Each needs at least `package.json` and the built `dist/`.
2. **Marketplace installs**: `EXTENSIONS_PATH/.registry`.
3. **npm dependencies** of the project root `package.json` (`PACKAGE_FILE_LOCATION`, default `.`) whose `package.json` has `directus:extension`.

Docker: bind mount `./extensions:/directus/extensions` and set `EXTENSIONS_AUTO_RELOAD: 'true'`. Develop with the extension folder **inside** `./extensions` (for example `./extensions/my-endpoint/`) and run `npm run dev` there.

Beyond the reload rules in SKILL.md: a changed `docker-compose.yml` env needs a container restart, and a Windows host also needs `CHOKIDAR_USEPOLLING=true` for auto reload.

`npm run link -- <path-to-directus-extensions-folder>` symlinks the extension into that folder under its package name (scoped `/` flattened to `-`). A symlink pointing outside a Docker bind mount won't resolve inside the container, so for Docker put the source in the mounted folder.

Production with npm packages: Directus images don't include npm. Install in a build stage and copy the package into `/directus/extensions/<name>` ([Including Extensions](https://directus.com/docs/self-hosting/including-extensions)). Set `EXTENSIONS_MUST_LOAD=true` in CI or production.

## Bundles

```jsonc
"directus:extension": {
	"type": "bundle",
	"path": { "app": "dist/app.js", "api": "dist/api.js" },
	"entries": [
		{ "type": "interface", "name": "acme-rating", "source": "src/acme-rating/index.ts" },
		{ "type": "endpoint", "name": "acme-proxy", "source": "src/acme-proxy/index.ts" },
		{ "type": "operation", "name": "acme-notify",
			"source": { "app": "src/acme-notify/app.ts", "api": "src/acme-notify/api.ts" } }
	],
	"host": "^12.0.0",
	"partial": true
}
```

- **Add an entry without a TTY** (`npm run add` always prompts): scaffold it standalone with `npx create-directus-extension@latest <type> <name> --language typescript --no-install` in a scratch folder, move its `src/` to `src/<name>/` in the bundle (and its `tsconfig.json` to the bundle root if there is none), delete the scratch folder, and append an entry (`index.ts`, or `app.ts` + `api.ts` for operations). Add the dev deps `add` would install (see [Scaffold](#scaffold)). Entry `name` must be unique in the bundle.
- **Remove an entry:** delete its folder and its `entries` item.
- Running `npx directus-extension add` in a non-bundle extension (which has no `add` script) offers to **convert** it
  into a bundle.
- `partial` (default enabled) lets users disable individual entries in Settings → Extensions. Only the whole bundle can be uninstalled.
- Bundle entries have no `sandbox` option.

## Environment variables

The ones that matter while building; full list in [configuration/extensions](https://directus.com/docs/configuration/extensions). Sandbox and Marketplace trust variables: [sandbox-and-security.md](sandbox-and-security.md).

| Variable                 | Default                        | Notes                                                                   |
| ------------------------ | ------------------------------ | ----------------------------------------------------------------------- |
| `EXTENSIONS_PATH`        | `./extensions`                 | Local folder. Subpath inside storage when `EXTENSIONS_LOCATION` is set. |
| `EXTENSIONS_AUTO_RELOAD` | `false`                        | Watch and reload. Not with `EXTENSIONS_LOCATION`.                       |
| `EXTENSIONS_MUST_LOAD`   | `false`                        | Exit if an API extension fails to load.                                 |
| `EXTENSIONS_LOCATION`    | unset                          | Storage location key to load extensions from.                           |
| `MARKETPLACE_REGISTRY`   | `https://registry.directus.io` | Source default (`DEFAULT_REGISTRY`); the config docs list `.com`.       |

## Sources

- https://directus.com/docs/guides/extensions/quickstart
- https://directus.com/docs/guides/extensions/cli
- https://directus.com/docs/guides/extensions/bundles
- https://directus.com/docs/configuration/extensions
- https://directus.com/docs/self-hosting/including-extensions
- https://github.com/directus/directus/blob/v12.6.0/packages/create-directus-extension/lib/index.js
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions-sdk/src/cli/run.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions-sdk/src/cli/commands/create.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions-sdk/src/cli/commands/build.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions-sdk/src/cli/commands/add.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions-sdk/src/cli/commands/helpers/get-extension-dev-deps.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions-sdk/src/cli/commands/link.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions-sdk/src/constants/last-breaking.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions/src/shared/schemas/options.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions/src/shared/constants/shared-deps.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions/src/node/utils/get-extensions.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/extensions/manager.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/env/src/constants/defaults.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions-registry/src/constants.ts
