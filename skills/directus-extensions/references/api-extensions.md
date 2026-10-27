# API extensions: hooks, endpoints, operations

Code here runs inside the Directus Node process (unless sandboxed, see [sandbox-and-security.md](sandbox-and-security.md)).

## Contents

- [Shared context](#shared-context)
- [Hooks](#hooks)
- [Endpoints](#endpoints)
- [Operations](#operations)
- [Services and accountability](#services-and-accountability)
- [Errors](#errors)
- [Environment variables](#environment-variables)
- [Testing](#testing)

## Shared context

| Key         | What                                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services`  | All API services (`ItemsService`, `FilesService`, `UsersService`, `MailService`, ...).                                                                                                 |
| `database`  | Knex instance (not a transaction).                                                                                                                                                     |
| `getSchema` | `async (opts?) => SchemaOverview`. Needed by every service.                                                                                                                            |
| `env`       | Parsed env (all variables, not just Directus ones).                                                                                                                                    |
| `logger`    | Pino logger. Prefer over `console`.                                                                                                                                                    |
| `emitter`   | Hooks and endpoints only. **Extension-local**: events you emit are only heard by listeners on the same object (`emitter.onAction(...)`), never by `action()`/`filter()` hooks or core. |

Operations get `data` (the flow's data chain) and `accountability` instead of `emitter`.

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

export default defineHook(({ filter, action, init, schedule, embed }, { services, logger }) => {
	// Before write, inside the transaction. Return the (modified) payload.
	filter('articles.items.create', async (payload: any, meta, { database, schema, accountability }) => {
		if (!payload.slug && payload.title) payload.slug = slugify(payload.title);
		const exists = await database('articles').where({ slug: payload.slug }).first();
		if (exists) throw new SlugTaken();
		return payload;
	});

	// After commit. Errors are logged, not returned to the caller.
	action('articles.items.update', async ({ keys, payload, collection }, { schema, accountability }) => {
		logger.info(`updated ${collection} ${keys.join(',')}`);
	});

	init('routes.custom.before', ({ app }) => {}); // app is the Express app
	schedule('*/15 * * * *', async () => {}); // once across instances only with SYNCHRONIZATION_STORE=redis
	embed('head', '<script>/* injected into the Studio */</script>');
});
```

### Event names

`<scope>.<action>`: scope is `items` (all user collections), `<collection>.items` (one), or a system collection name **without** `directus_` (`users`, `files`, `roles`, `settings`, ...). Full list: [hooks docs](https://directus.com/docs/guides/extensions/api-extensions/hooks).

| Event           | Filter payload      | Filter `meta`                   | Action `meta`                              |
| --------------- | ------------------- | ------------------------------- | ------------------------------------------ |
| `items.query`   | the query           | `collection`                    | (no action)                                |
| `items.read`    | the read result     | `query`, `collection`           | `payload`, `query`, `collection`           |
| `items.create`  | new item            | `collection`                    | `payload`, `key`, `collection`             |
| `items.update`  | the changes (delta) | `keys`, `collection`            | `payload`, `keys`, `collection`            |
| `items.delete`  | array of keys       | `collection`                    | `keys`, `collection`                       |
| `items.promote` | promoted item       | `collection`, `item`, `version` | `payload`, `collection`, `item`, `version` |
| `items.sort`    | (no filter)         |                                 | `collection`, `item`, `to`                 |

System collections use the same shapes. Also filter/action: `auth.login`, `auth.jwt`, `authenticate`, `email.send`, `request.error`, `request.not_found`, `database.error`, `websocket.*` (shapes in the docs). Action only: `server.start`, `server.stop`, `response`, `files.upload`, `extensions.*`. Init events: `cli.*`, `app.*`, `routes.*`, `routes.custom.*`, `middlewares.*`, each with `.before` and `.after`.

Facts that bite (beyond the router traps):

- `collections` and `fields` don't emit `read`. `files` doesn't emit `create`/`update` on upload (use action `files.upload`). `relations` doesn't emit `delete`.
- Filters run in order, awaited. Throwing aborts the whole request.
- In a filter, query through `context.database` (the transaction). The top-level `database`, or a service without `knex: context.database`, won't see uncommitted rows, and writes through it can block on SQLite (one writer at a time).
- Filters on `read`/`query` run on every read, including the Studio's own system reads. Keep them cheap.
- A thrown action error is logged as `An error was thrown while executing action`; the client never sees it.
- `{ emitEvents: false }` goes in the mutation options: `service.updateOne(key, data, { emitEvents: false })`.
- `schedule` takes 5 or 6 field cron (optional seconds first). Invalid cron logs `Couldn't register cron hook`. Jobs run once across instances only with `SYNCHRONIZATION_STORE=redis`; the default (memory) runs them on every instance. CLI commands load extensions with schedules off.
- `embed(position, code)`: `position` is `head` or `body`; `code` is a string or a function returning one. Empty strings are rejected.

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

- `req.accountability` is set on every request (public requests have `user: null`, `role: null`). `.admin` and `.app` (has Studio access) are handy gates.
- Middleware has already run: `req.body` is parsed, `req.schema` is loaded, `req.sanitizedQuery` holds the parsed Directus query params.

## Operations

Two files, same `id`:

```ts
// src/app.ts
import { defineOperationApp } from '@directus/extensions-sdk';

export default defineOperationApp({
	id: 'acme-notify',
	name: 'Notify Slack',
	icon: 'campaign',
	description: 'Post a message to Slack.', // max 80 chars
	overview: ({ channel }) => [{ label: 'Channel', text: channel }],
	options: [
		{ field: 'channel', name: 'Channel', type: 'string', meta: { width: 'half', interface: 'input' } },
		{ field: 'text', name: 'Text', type: 'text', meta: { width: 'full', interface: 'input-multiline' } },
	],
});
```

```ts
// src/api.ts
import { defineOperationApi } from '@directus/extensions-sdk';

type Options = { channel: string; text: string };

export default defineOperationApi<Options>({
	id: 'acme-notify',
	handler: async ({ channel, text }, { env, data, accountability, logger }) => {
		const res = await fetch(env.SLACK_WEBHOOK_URL, { method: 'POST', body: JSON.stringify({ channel, text }) });
		if (!res.ok) throw new Error(`Slack returned ${res.status}`); // -> reject path
		return { ok: true }; // -> resolve path, added to data chain under the operation key
	},
});
```

- Options arrive with `{{ $trigger.payload.title }}`-style templates already resolved.
- Return value must be JSON-serializable; `undefined` becomes `null`. A thrown error (stack removed) becomes the data for the reject path.
- `accountability` is whatever the flow trigger had (`null`, so admin, for schedules and many system events). Built-in item operations solve this with a `permissions` option (`$trigger`, `$public`, `$full`, or a role id); copy that pattern for data access ([item-read source](https://github.com/directus/directus/blob/v12.5.1/api/src/operations/item-read/index.ts)).
- `id` is a global key in the flow manager. Reusing a built-in id (`log`, `mail`, `request`, `item-create`, `exec`, ...) replaces that operation. Prefix your ids.

## Services and accountability

- Caller's permissions: `new ItemsService('articles', { schema, accountability: req.accountability })`.
- Admin access: omit `accountability` or pass `null`. Do this deliberately.
- Inside a filter hook, reuse the transaction: `{ schema: ctx.schema!, knex: ctx.database, accountability: ctx.accountability }`.

`ItemsService` methods: `createOne`, `createMany`, `readOne`, `readMany`, `readByQuery`, `readSingleton`, `updateOne`, `updateMany`, `updateBatch`, `updateByQuery`, `upsertOne`, `upsertMany`, `upsertSingleton`, `deleteOne`, `deleteMany`, `deleteByQuery`. Mutation options worth knowing: `emitEvents: false`, `autoPurgeCache: false`, `skipTracking`. Other services take only options (`new CollectionsService({ schema, accountability })`); full list in [api/src/services](https://github.com/directus/directus/tree/v12.5.1/api/src/services).

**House rule:** default to the caller's `accountability`. Use admin access only for system work the caller can't do themselves, and check authorization yourself before you do.

## Errors

```ts
import { createError, InvalidPayloadError } from '@directus/errors';

const QuotaExceeded = createError('QUOTA_EXCEEDED', 'Monthly quota exceeded.', 429);
throw new QuotaExceeded();
throw new InvalidPayloadError({ reason: 'title is required' });
```

- `createError(code, message | (ext) => message, status = 500)`. Code is upper-cased.
- Directus recognizes errors by shape (`name === 'DirectusError'`), so a bundled copy of `@directus/errors` works. Other errors become a generic 500.
- The docs say `@directus/errors` is available without installing, but the build only leaves `directus` and `directus:api` external, and directus-labs extensions list it as a dependency. **House rule:** `npm install @directus/errors` and let it bundle.

## Environment variables

`env` values are auto-cast: `true`/`false` become booleans, numeric strings (not starting with `0`) become numbers, and **anything containing a comma becomes an array**. Force a type with a prefix: `MY_KEYS="string:a,b"`, `PORT="number:3000"`, `CFG="json:{...}"`. Never hardcode secrets in extension code.

## Testing

The scaffold ships no test setup. `defineHook`, `defineEndpoint`, and `defineOperationApi` return their argument unchanged, so the default export is a plain function (or `{ id, handler }`) you can call with fakes. Add Vitest (`npm install -D vitest`, script `"test": "vitest run"`) and test the hook above by capturing its handlers:

```ts
// src/index.test.ts
import { expect, test, vi } from 'vitest';
import hook from './index';

type Handler = (...args: any[]) => any;

test('fills slug from title', async () => {
	const filters = new Map<string, Handler>();
	const register = {
		filter: (event: string, handler: Handler) => filters.set(event, handler),
		action: vi.fn(),
		init: vi.fn(),
		schedule: vi.fn(),
		embed: vi.fn(),
	};
	hook(register as any, { services: {}, logger: { info: vi.fn() } } as any);

	const first = vi.fn().mockResolvedValue(undefined); // no existing row with this slug
	const database = vi.fn(() => ({ where: () => ({ first }) }));

	const payload = await filters.get('articles.items.create')!(
		{ title: 'Hello World' },
		{ collection: 'articles' },
		{ database, schema: {}, accountability: null },
	);

	expect(payload.slug).toBe('hello-world');
});
```

- Operations: import the API entry and call `handler(options, context)` directly.
- Endpoints: keep route logic in plain functions you can test, or mount the handler on a real `express.Router()` and call it with `supertest`.
- Fakes only prove your logic. Before shipping, run the built extension against a real instance (`npm run dev` plus `EXTENSIONS_AUTO_RELOAD=true`) and check the API logs.

## Sources

- https://directus.com/docs/guides/extensions/api-extensions/hooks
- https://directus.com/docs/guides/extensions/api-extensions/endpoints
- https://directus.com/docs/guides/extensions/api-extensions/operations
- https://directus.com/docs/guides/extensions/api-extensions/services
- https://github.com/directus/directus/blob/v12.5.1/api/src/extensions/manager.ts (`registerHook`, `registerEndpoint`, local emitter)
- https://github.com/directus/directus/blob/v12.5.1/api/src/emitter.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/items.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/app.ts (route order)
- https://github.com/directus/directus/blob/v12.5.1/api/src/flows.ts (operation handler call)
- https://github.com/directus/directus/blob/v12.5.1/api/src/operations/item-read/index.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/types/express.d.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/types/src/items.ts (`MutationOptions`)
- https://github.com/directus/directus/blob/v12.5.1/packages/types/src/events.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/types/src/extensions/api-extension-context.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/errors/src/create-error.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/errors/src/is-directus-error.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/env/src/utils/guess-type.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/env/src/lib/cast.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/extensions/src/shared/utils/define-extension.ts (`define*` return their argument)
- https://github.com/directus/directus/blob/v12.5.1/packages/extensions-sdk/src/cli/commands/create.ts (scaffold scripts)
- https://github.com/directus-labs/extensions/tree/main/archived/collaborative-editing (Vitest with mocked services)
