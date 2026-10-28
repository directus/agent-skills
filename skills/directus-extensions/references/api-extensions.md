# API extensions: hooks, endpoints, operations

Code here runs inside the Directus Node process (unless sandboxed, see [sandbox-and-security.md](sandbox-and-security.md)).
The docs cover register functions, context keys, the full event list, and operation config. This file holds what the
docs miss or get wrong.

## Contents

- [Docs per type](#docs-per-type)
- [Hooks](#hooks)
- [Endpoints](#endpoints)
- [Operations](#operations)
- [Services and accountability](#services-and-accountability)
- [Errors](#errors)
- [Environment variables](#environment-variables)
- [Testing](#testing)

## Docs per type

| Type | Define function | Docs |
| --- | --- | --- |
| hook | `defineHook` | https://directus.com/docs/guides/extensions/api-extensions/hooks |
| endpoint | `defineEndpoint` | https://directus.com/docs/guides/extensions/api-extensions/endpoints |
| operation | `defineOperationApp` + `defineOperationApi` | https://directus.com/docs/guides/extensions/api-extensions/operations |
| services | n/a | https://directus.com/docs/guides/extensions/api-extensions/services |

Context (second argument): `services`, `database` (Knex, **not** a transaction), `getSchema`, `env` (all variables),
`logger` (Pino), and `emitter` (hooks and endpoints). Operations get `data` and `accountability` instead of `emitter`.
The `emitter` is **extension-local**: events you emit are only heard by listeners on the same object
(`emitter.onAction(...)`), never by `action()`/`filter()` hooks or core.

## Hooks

```ts
import { defineHook } from '@directus/extensions-sdk';
import { createError } from '@directus/errors';

const SlugTaken = createError('SLUG_TAKEN', 'Slug is already used.', 400);

const slugify = (text: string) =>
	text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

export default defineHook(({ filter, action }, { logger }) => {
	// Before write, inside the transaction. Return the (modified) payload.
	filter('articles.items.create', async (payload: any, meta, { database }) => {
		if (!payload.slug && payload.title) payload.slug = slugify(payload.title);
		if (!payload.slug) return payload;
		// A friendly error only; two creates at once can both pass. Keep slug `is_unique` for the real guarantee.
		const exists = await database('articles').where({ slug: payload.slug }).first();
		if (exists) throw new SlugTaken();
		return payload;
	});

	// After commit. Errors are logged, not returned to the caller.
	action('articles.items.update', async ({ keys, collection }) => {
		logger.info(`updated ${collection} ${keys.join(',')}`);
	});
});
```

Event names and payload shapes: [hooks docs](https://directus.com/docs/guides/extensions/api-extensions/hooks). Facts
that bite (beyond the router traps):

- Scope is `items` (all user collections), `<collection>.items` (one), or a system collection name **without**
  `directus_` (`users.create`, `files.delete`). `items.*` never fires for system collections.
- The `items.update` filter payload is only the changed fields (the delta), not the whole item.
- `collections` and `fields` don't emit `read`. `files` doesn't emit `create`/`update` on upload (use action
  `files.upload`). `relations` doesn't emit `delete`.
- Filters run in order, awaited. Return the modified payload (returning nothing keeps it). Throwing aborts the whole
  request.
- In a filter, query through `context.database` (the transaction). The top-level `database`, or a service without
  `knex: context.database`, won't see uncommitted rows, and writes through it can block on SQLite (one writer at a time).
- Filters on `read`/`query` run on every read, including the Studio's own system reads. Keep them cheap.
- A thrown action error is logged as `An error was thrown while executing action`; the client never sees it.
- `{ emitEvents: false }` goes in the mutation options: `service.updateOne(key, data, { emitEvents: false })`.
- `schedule` takes 5 or 6 field cron (optional seconds first). Invalid cron logs `Couldn't register cron hook`. Jobs run
  once across instances only with `SYNCHRONIZATION_STORE=redis`; the default (memory) runs them on every instance. CLI
  commands load extensions with schedules off.
- `embed(position, code)`: `position` is `head` or `body`; `code` is a string or a function returning one. Empty strings
  are rejected.

## Endpoints

```ts
import { defineEndpoint } from '@directus/extensions-sdk';
import { ForbiddenError } from '@directus/errors';

export default defineEndpoint({
	id: 'acme', // routes live at /acme/...
	handler: (router, { services }) => {
		const { ItemsService } = services;

		router.get('/articles/:id', async (req: any, res, next) => {
			try {
				if (!req.accountability?.user) return next(new ForbiddenError());
				const articles = new ItemsService('articles', {
					schema: req.schema, // or await getSchema()
					accountability: req.accountability, // enforce the caller's permissions
				});
				res.json({ data: await articles.readOne(req.params.id, { fields: ['id', 'title'] }) });
			} catch (error) {
				next(error);
			}
		});
	},
});
```

- `req.accountability` is set on every request (public requests have `user: null`, `role: null`). `.admin` and `.app`
  (has Studio access) are handy gates.
- Middleware has already run: `req.body` is parsed, `req.schema` is loaded, `req.sanitizedQuery` holds the parsed
  Directus query params.

## Operations

The app half (`defineOperationApp`) and API half (`defineOperationApi`) must share the same `id`. Shapes are in the
[operations docs](https://directus.com/docs/guides/extensions/api-extensions/operations).

- Options arrive with `{{ $trigger.payload.title }}`-style templates already resolved.
- Return value must be JSON-serializable; `undefined` becomes `null`. A thrown error (stack removed) becomes the data
  for the reject path.
- `accountability` is whatever the flow trigger had (`null`, so admin, for schedules and many system events). Built-in
  item operations solve this with a `permissions` option (`$trigger`, `$public`, `$full`, or a role id); copy that
  pattern for data access ([item-read source](https://github.com/directus/directus/blob/v12.6.0/api/src/operations/item-read/index.ts)).
- `id` is a global key in the flow manager. Reusing a built-in id (`log`, `mail`, `request`, `item-create`, `exec`, ...)
  replaces that operation. Prefix your ids.

## Services and accountability

- Caller's permissions: `new ItemsService('articles', { schema, accountability: req.accountability })`.
- Admin access: omit `accountability` or pass `null`. Do this deliberately.
- Inside a filter hook, reuse the transaction: `{ schema: ctx.schema!, knex: ctx.database, accountability: ctx.accountability }`.
- `ItemsService` methods: `createOne`, `createMany`, `readOne`, `readMany`, `readByQuery`, `readSingleton`, `updateOne`,
  `updateMany`, `updateBatch`, `updateByQuery`, `upsertOne`, `upsertMany`, `upsertSingleton`, `deleteOne`,
  `deleteMany`, `deleteByQuery`. Mutation options worth knowing: `emitEvents: false`, `autoPurgeCache: false`,
  `skipTracking`. Other services take only options (`new CollectionsService({ schema, accountability })`); full list
  in [api/src/services](https://github.com/directus/directus/tree/v12.6.0/api/src/services).

**Recommended:** default to the caller's `accountability`. Use admin access only for system work the caller can't do
themselves, and check authorization yourself before you do.

## Errors

```ts
import { createError, InvalidPayloadError } from '@directus/errors';

const QuotaExceeded = createError('QUOTA_EXCEEDED', 'Monthly quota exceeded.', 429);
throw new QuotaExceeded();
throw new InvalidPayloadError({ reason: 'title is required' });
```

- `createError(code, message | (ext) => message, status = 500)`. Code is upper-cased.
- Directus recognizes errors by shape (`name === 'DirectusError'`), so a bundled copy of `@directus/errors` works.
  Other errors become a generic 500.
- The docs say `@directus/errors` is available without installing, but the build only leaves `directus` and
  `directus:api` external, and directus-labs extensions list it as a dependency. **Recommended:**
  `npm install @directus/errors` and let it bundle.

## Environment variables

`env` values are auto-cast: `true`/`false` become booleans, numeric strings (not starting with `0`) become numbers, and
**anything containing a comma becomes an array**. Force a type with a prefix: `MY_KEYS="string:a,b"`,
`PORT="number:3000"`, `CFG="json:{...}"`. Never hardcode secrets in extension code.

## Testing

The scaffold ships no test setup. `defineHook`, `defineEndpoint`, and `defineOperationApi` return their argument
unchanged, so the default export is a plain function (or `{ id, handler }`) you can call with fakes. Add Vitest
(`npm install -D vitest`, script `"test": "vitest run"`) and test the hook above by capturing its handlers:

```ts
// src/index.test.ts
import { expect, test, vi } from 'vitest';
import hook from './index';

test('fills slug from title', async () => {
	const filters = new Map<string, (...args: any[]) => any>();
	const register = { filter: (event: string, fn: any) => filters.set(event, fn), action: vi.fn() };
	hook(register as any, { logger: { info: vi.fn() } } as any);

	const first = vi.fn().mockResolvedValue(undefined); // no existing row with this slug
	const database = vi.fn(() => ({ where: () => ({ first }) }));
	const payload = await filters.get('articles.items.create')!(
		{ title: 'Hello World' },
		{ collection: 'articles' },
		{ database },
	);

	expect(payload.slug).toBe('hello-world');
});
```

- Operations: import the API entry and call `handler(options, context)` directly.
- Endpoints: keep route logic in plain functions you can test, or mount the handler on a real `express.Router()` and
  call it with `supertest`.
- Fakes only prove your logic. Before shipping, run the built extension against a real instance (`npm run dev` plus
  `EXTENSIONS_AUTO_RELOAD=true`) and check the API logs.

## Sources

- https://directus.com/docs/guides/extensions/api-extensions/hooks
- https://directus.com/docs/guides/extensions/api-extensions/endpoints
- https://directus.com/docs/guides/extensions/api-extensions/operations
- https://directus.com/docs/guides/extensions/api-extensions/services
- https://github.com/directus/directus/blob/v12.6.0/api/src/extensions/manager.ts (`registerHook`, `registerEndpoint`, local emitter)
- https://github.com/directus/directus/blob/v12.6.0/api/src/emitter.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/items.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/app.ts (route order)
- https://github.com/directus/directus/blob/v12.6.0/api/src/flows.ts (operation handler call)
- https://github.com/directus/directus/blob/v12.6.0/api/src/operations/item-read/index.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/types/express.d.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/types/src/items.ts (`MutationOptions`)
- https://github.com/directus/directus/blob/v12.6.0/packages/types/src/events.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/types/src/extensions/api-extension-context.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/errors/src/create-error.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/errors/src/is-directus-error.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/env/src/utils/guess-type.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/env/src/lib/cast.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions/src/shared/utils/define-extension.ts (`define*` return their argument)
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions-sdk/src/cli/commands/create.ts (scaffold scripts)
- https://github.com/directus-labs/extensions/tree/main/archived/collaborative-editing (Vitest with mocked services)
