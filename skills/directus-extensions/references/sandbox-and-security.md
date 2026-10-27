# Sandbox and security

## Sandboxed API extensions

Hooks, endpoints, and operations can opt into a sandbox: an `isolated-vm` isolate with only JavaScript built-ins plus what you request from `directus:api`.

```jsonc
"sandbox": {
	"enabled": true,
	"requestedScopes": {
		"log": {},
		"sleep": {},
		"request": { "methods": ["GET", "POST"], "urls": ["https://api.example.com/v1/**"] }
	}
}
```

| Not available                                                                     | Instead                                                                            |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `services`, `database`, `getSchema`, `env`, `logger`, `emitter`, `accountability` | Nothing. Pass inputs through operation options or the hook payload.                |
| `console`, `setTimeout`, `fetch`, Node built-ins                                  | `log`, `sleep`, `request` from `directus:api`                                      |
| Any `import` other than `directus:api`                                            | Bundle pure-JS deps into the single output file. Anything needing Node APIs fails. |
| Secrets from env                                                                  | Users enter API keys as operation options (stored on the flow).                    |

- The API entry is compiled as an ES module, so keep `"type": "module"` in `package.json` (the scaffold sets it). Limits: `EXTENSIONS_SANDBOX_MEMORY` (MB, default 100) and `EXTENSIONS_SANDBOX_TIMEOUT` (ms, default 1000, applied to module evaluation).
- TypeScript: add `/// <reference types="@directus/extensions/api.d.ts" />` (or put it in `tsconfig` types) to type `directus:api`. It ships in `@directus/extensions`, a dependency of `@directus/extensions-sdk`; package managers that don't hoist transitive deps need `@directus/extensions` as a devDependency (as `ai-writer-operation` does).
- **Bundles:** entries have no `sandbox` field, and the registry marks a bundle as sandboxed only when every entry is an app type.

## Scopes

| Scope     | Function                                                                                     | Config                                                                                     | Fails with                                                                      |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `log`     | `log(message: string)` → API logger at info level                                            | `{}`                                                                                       | `No permission to access "log"`                                                 |
| `sleep`   | `await sleep(ms)`                                                                            | `{}`                                                                                       | `No permission to access "sleep"`                                               |
| `request` | `await request(url, { method?, headers?, body? })` → `{ status, statusText, headers, data }` | `methods` (array of `GET POST PUT PATCH DELETE`) and `urls` (glob patterns, `**` wildcard) | `No permission to request "<url>"`, `No permission to use request method "<m>"` |

Request the narrowest URLs and methods that work. `https://*` is for development only; the Marketplace shows requested scopes to installers. `request` goes through Directus's outgoing HTTP client, so the instance's IP deny list applies.

```ts
/// <reference types="@directus/extensions/api.d.ts" />
import { log, request } from 'directus:api';

export default {
	id: 'acme-lookup',
	handler: async ({ apiKey, query }: { apiKey: string; query: string }) => {
		const res = await request(`https://api.example.com/v1/search?q=${encodeURIComponent(query)}`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${apiKey}` },
		});
		if (res.status >= 400) throw new Error(`Lookup failed: ${res.status}`);
		log(`lookup ok for ${query}`);
		return res.data;
	},
};
```

## Sandboxed shapes per type

| Type      | Export                                                          | Handler receives                                | Return                                |
| --------- | --------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------- |
| hook      | `({ filter, action }) => void` (no `init`, `schedule`, `embed`) | `payload` only (no meta, no context)            | filter: new payload                   |
| endpoint  | `(router) => void`, mounted at `/<package name>`                | `{ url, headers, body }`                        | `{ status, body }` (no Express `res`) |
| operation | `{ id, handler }`                                               | `options` only (no `data`, no `accountability`) | value for the data chain              |

## Marketplace trust

- `MARKETPLACE_TRUST=sandbox` (default): the Marketplace lists and installs all app extensions and only sandboxed API/hybrid extensions.
- `MARKETPLACE_TRUST=all`: also non-sandboxed API extensions and bundles with API entries. Only for operators who vet each one.
- Local extensions in `EXTENSIONS_PATH` and npm dependencies load regardless of trust or sandbox.

## Security checklist

API extensions run with the server's full power. Before shipping:

1. Every service call passes the caller's `accountability`, unless admin access is deliberate and you've checked authorization yourself.
2. Endpoints check `req.accountability` (user, role, `admin`, `app`).
3. Endpoints that fetch user-supplied URLs are SSRF vectors. Allowlist hosts.
4. Secrets come from `env` (server) or operation options, never from app extension code or committed files.
5. Validate input (`InvalidPayloadError`) before writing.
6. Hooks that write to the collection they listen on use `emitEvents: false`.
7. Restrict who can toggle extensions: update on `directus_extensions` for admins only. Disabling an extension can disable a security hook.
8. Ship production extensions through deployment (image or mounted folder), not Studio installs, so changes get code review.

## Sources

- https://directus.com/docs/guides/extensions/api-extensions/sandbox
- https://directus.com/docs/guides/extensions/api-extensions/hooks (Sandboxed Hooks)
- https://directus.com/docs/guides/extensions/api-extensions/endpoints (Sandboxed Endpoints)
- https://directus.com/docs/configuration/extensions
- https://directus.com/docs/guides/security/best-practices
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions/src/shared/schemas/options.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions/api.d.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/extensions/manager.ts (`registerSandboxedApiExtension`)
- https://github.com/directus/directus/blob/v12.6.0/api/src/extensions/lib/sandbox/generate-api-extensions-sandbox-entrypoint.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/extensions/lib/sandbox/sdk/generators/request.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/extensions/lib/sandbox/register/route.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/extensions.ts (`MARKETPLACE_TRUST`)
- Marketplace registry scraper, `directus/registry` repo (private): `apps/scraper/src/lib/format-version.ts` (bundle sandbox rule)
- https://github.com/directus-labs/extensions/tree/main/packages/resend-operation (sandboxed operation)
