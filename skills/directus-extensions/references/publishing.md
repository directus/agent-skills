# Publishing to npm and the Marketplace

The Marketplace reads from the Directus Extensions Registry, which mirrors npm. There's no submission form: publish to npm with the right metadata and the registry picks it up on its next scrape (every few hours). Only the latest version is offered.

## Required `package.json`

```jsonc
{
	"name": "@acme/directus-extension-rating", // scoped or unscoped
	"version": "1.0.0",
	"description": "Pick a star rating in a numeric field.",
	"icon": "star", // Material Symbols name
	"license": "MIT",
	"keywords": ["directus", "directus-extension", "directus-extension-interface"],
	"type": "module",
	"files": ["dist"],
	"repository": { "type": "git", "url": "https://github.com/acme/directus-extension-rating" },
	"directus:extension": {
		"type": "interface",
		"path": "dist/index.js",
		"source": "src/index.ts",
		"host": "^12.0.0",
	},
}
```

| Field | Why |
| --- | --- |
| `keywords` contains `directus-extension` | The registry searches npm for `keywords:directus-extension`. Without it, the package never appears. |
| `directus:extension` | Must parse against the manifest schema or the version is rejected. `type` drives the Marketplace category. |
| `host` | If the instance version doesn't satisfy it, the listing says **Compatibility not guaranteed** (install still works). `^` stops at the major. |
| `dist/` in the tarball | Run `npm run build` before `npm publish`; `files: ["dist"]` keeps source out. |
| `sandbox` (API/hybrid) | Default instances (`MARKETPLACE_TRUST=sandbox`) only offer sandboxed API extensions. Requested scopes are shown to installers. |

Description style, icon, detail page title, and author profile: [publishing docs](https://directus.com/docs/guides/extensions/marketplace/publishing).

## README

- Images load only from `raw.githubusercontent.com`. Host screenshots in a public GitHub repo and use the raw URL.
- List any required env vars and CSP changes ([app-extensions.md](app-extensions.md#csp-and-external-resources)).
- No secrets, tokens, or private data in code, README, or screenshots.

## Publish

```bash
npm run build
npx directus-extension validate # built-code, directus-config, license, readme
npm publish --access public # scoped packages need --access public on first publish
```

Bump `host` when you test against a new Directus major.

**Recommended:** match directus-labs conventions for public packages: README with screenshots, `license` file, explicit `host` range, and `sandbox` enabled for API extensions whenever the scopes allow it.

## Sources

- https://directus.com/docs/guides/extensions/marketplace
- https://directus.com/docs/guides/extensions/marketplace/publishing
- https://directus.com/docs/guides/extensions/cli (validate)
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions-sdk/src/cli/commands/validate.ts
- https://github.com/directus/directus/blob/v12.6.0/app/src/modules/settings/routes/marketplace/routes/extension/components/extension-metadata-compatibility.vue
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions-registry/src/constants.ts
- Marketplace registry scraper, `directus/registry` repo (private): `apps/scraper/src/utils/search-packages.ts` (keyword search), `apps/scraper/src/lib/format-version.ts` (manifest parse, `host_version`, sandbox flag)
