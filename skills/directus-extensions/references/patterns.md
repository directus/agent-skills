# Patterns from real extensions

Worked examples from [directus-labs/extensions](https://github.com/directus-labs/extensions) (about 55 published packages). Read the linked source before copying. Every labs package declares `host` ranges for 10.x/11.x only, so on a v12 instance the Marketplace shows "Compatibility not guaranteed", and CSS variables or theme keys removed in v12 may need updating.

## Examples by type

| Type | Example | Look at |
| --- | --- | --- |
| interface | [switch-interface](https://github.com/directus-labs/extensions/tree/main/packages/switch-interface) | Small. `$t:` option labels, `useI18n`, theme variables, `emit('input')` |
| interface | [address-completion-interface](https://github.com/directus-labs/extensions/tree/main/packages/address-completion-interface) | External script and images; README documents CSP env changes |
| display | [display-link-interface](https://github.com/directus-labs/extensions/tree/main/packages/display-link-interface) | Display type despite the name |
| interface + display | [seo-plugin](https://github.com/directus-labs/extensions/tree/main/packages/seo-plugin), [meter-component](https://github.com/directus-labs/extensions/tree/main/packages/meter-component) | Bundle of a matching interface and display |
| layout | [spreadsheet-layout](https://github.com/directus-labs/extensions/tree/main/packages/spreadsheet-layout) | `useSync` on `selection`, `layoutOptions`, `layoutQuery` in `setup`, returned so the main component and slots share one state; `useItems`, `useCollection` |
| layout | [gantt-chart-layout](https://github.com/directus-labs/extensions/tree/main/packages/gantt-chart-layout) | Layout options slot |
| module | [command-palette-module](https://github.com/directus-labs/extensions/tree/main/packages/command-palette-module) | Larger module, settings, stores |
| module + endpoint | [migration-bundle](https://github.com/directus-labs/extensions/tree/main/packages/migration-bundle) | Admin tool UI backed by an endpoint |
| panel | [table-view-panel](https://github.com/directus-labs/extensions/tree/main/packages/table-view-panel) | Simple panel |
| panel + endpoint | [api-metric-panel](https://github.com/directus-labs/extensions/tree/main/packages/api-metric-panel) | Panel calls its own endpoint (see the open-proxy warning below) |
| hook + endpoint + interface + module | [related-items-bundle](https://github.com/directus-labs/extensions/tree/main/packages/related-items-bundle) | Passing `accountability` to services in endpoint and hook |
| operation (sandboxed) | [resend-operation](https://github.com/directus-labs/extensions/tree/main/packages/resend-operation) | API key as an operation option; `request` scope `GET POST PATCH DELETE` on `https://api.resend.com/**`, plus `log` |
| operation (not sandboxed) | [algolia-operation](https://github.com/directus-labs/extensions/tree/main/packages/algolia-operation) | npm SDK inside an operation |
| theme | [synthwave](https://github.com/directus-labs/extensions/tree/main/themes/synthwave) | Labs keep themes in `/themes`, not `/packages`. Check rules against the v12 schema. |
| interface boilerplates | [boilerplates/](https://github.com/directus-labs/extensions/tree/main/boilerplates) | Forks of core `input-rich-text-html`, `input-block-editor`, `tabular` layout |

## App extension plus private endpoint

Keep secrets and outbound calls on the server. Bundle an endpoint with the app extension; the app side calls it via `useApi()` (session attached).

```ts
// src/acme-stats-endpoint/index.ts (bundle entry name: acme-stats-endpoint)
import { defineEndpoint } from '@directus/extensions-sdk';
import { ForbiddenError, ServiceUnavailableError } from '@directus/errors';

export default defineEndpoint((router, { env }) => {
	router.get('/', async (req: any, res, next) => {
		try {
			// Financial data: admins only. Any logged-in user (even with no Studio access) passes a `user` check.
			if (!req.accountability?.admin) return next(new ForbiddenError());
			const r = await fetch('https://api.stripe.com/v1/balance', {
				headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
			});
			if (!r.ok) return next(new ServiceUnavailableError({ service: 'stripe', reason: `HTTP ${r.status}` }));
			res.json(await r.json());
		} catch (err) {
			next(err);
		}
	});
});
```

```ts
// src/acme-stats-panel/panel.vue <script setup>
import { useApi } from '@directus/extensions-sdk';
const api = useApi();
const { data } = await api.get('/acme-stats-endpoint'); // function-form endpoint mounts at the entry name
```

- To open it to a non-admin group, check something only that group has, not just a login. For example `req.accountability.roles.includes(env.ACME_FINANCE_ROLE_ID)` (`roles` holds the user's role and its parents).
- `api-metric-panel` gates its endpoint with `req.accountability?.app` (any Studio user) and proxies a URL the panel sends. That's an open proxy for every Studio user. Allowlist hosts if you copy it.

## Lessons from related-items-bundle

- **Permission-aware endpoint:** build every service with `req.accountability` so results match what the user may see; public callers get the Public policy's access. If `req.accountability` is missing, return `ForbiddenError`. Never default it to `null`: null accountability is admin.
- **Hook that reacts to settings:** it listens to `settings.update` and adds or removes alias fields with `FieldsService`, using `accountability` and `schema` from the action context:

```ts
export default defineHook(({ action }, { services }) => {
	action('settings.update', async ({ payload }, { accountability, schema }) => {
		if (!('related_items_collections' in payload)) return;
		const fields = new services.FieldsService({ accountability, schema });
		// create/delete fields...
	});
});
```

The source uses `forEach(async ...)` without awaiting; prefer `for...of` with `await` so errors are caught.

## Repo layout for many extensions

- directus-labs: pnpm workspace, one package per extension under `packages/`, all scoped `@directus-labs/*`, `repository.directory` set per package, a shared `docker-compose.yml` that mounts the packages as extensions with auto reload.
- **House rule:** for a project's own extensions, start with one `bundle` and add entries as you go. One build, one install, shared dependencies, and app parts can call their endpoints. Split into separate packages only for things you publish independently.

## Sources

- https://github.com/directus-labs/extensions (readme, `.github/CONTRIBUTING.md`, `scripts/check-package-json.js`)
- https://github.com/directus-labs/extensions/tree/main/packages/related-items-bundle
- https://github.com/directus-labs/extensions/tree/main/packages/api-metric-panel
- https://github.com/directus-labs/extensions/tree/main/packages/resend-operation
- https://github.com/directus-labs/extensions/tree/main/packages/algolia-operation
- https://github.com/directus-labs/extensions/tree/main/packages/spreadsheet-layout
- https://github.com/directus-labs/extensions/tree/main/packages/switch-interface
- https://github.com/directus-labs/extensions/tree/main/themes
- https://directus.com/docs/tutorials/extensions
