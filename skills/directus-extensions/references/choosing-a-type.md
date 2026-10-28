# Choosing an extension type

Pick the smallest thing that solves the problem. Many requests don't need an extension at all.

## Do you need an extension?

Built-in features need no build, no deploy, and survive upgrades.

| Need | Try first | Reach for an extension when |
| --- | --- | --- |
| Run logic on create/update/delete, call a webhook, send mail | A Flow with an event or webhook trigger and built-in operations (`request`, `mail`, `exec` (Run Script), `item-*`, `condition`, `transform`) | You need npm packages, Node APIs, blocking work inside the DB transaction, or reuse across many flows (operation or hook) |
| Validate a field value | Field validation rules and conditions in the data model | Validation needs other records, external APIs, or cross-field logic the rule builder can't express (filter hook) |
| Expose a custom URL | A Flow with a webhook trigger | You need real routing, streaming, file uploads, or Express middleware (endpoint) |
| Recurring job | A Flow with a schedule (cron) trigger | You need code that Run Script can't run (schedule hook) |
| Change Studio colors and fonts | Settings: theme overrides (`theme_light_overrides`) or `custom_css` | You want a reusable, shareable theme (theme extension) |
| Dashboard chart | Built-in Insights panels | The visualization or interaction doesn't exist (panel) |
| Show a value differently in lists | Display templates and built-in displays | The rendering needs custom code (display) |

**Recommended:** prefer a hook or endpoint over a complex flow. Flows are great glue, but heavy branching, loops, libraries, and anything that needs tests belong in code.

**Check hosting first:** Directus Cloud allows custom extensions only on the Enterprise tier, enabled by support ticket ([Cloud custom extensions](https://directus.com/docs/cloud/configuration/custom-extensions)). On other Cloud plans, use flows and sandboxed Marketplace extensions.

Flows and Run Script belong to the `directus-flows` skill. Run Script can't import node modules ([Flows operations docs](https://directus.com/docs/guides/flows/operations)).

## Types

Types come from `@directus/constants` at v12.6.0 (`richtext` is new in 12.6.0).

| Type | Runs in | What it is | Define function |
| --- | --- | --- | --- |
| `interface` | Studio | Form input for a field on the item page | `defineInterface` |
| `display` | Studio | Renders one field value in lists, tables, templates | `defineDisplay` |
| `layout` | Studio | Alternative view of a collection's items | `defineLayout` |
| `module` | Studio | Top-level page in the module bar, with its own routes | `defineModule` |
| `panel` | Studio | Widget on an Insights dashboard | `definePanel` |
| `theme` | Studio | Named set of theme rules (no custom CSS) | `defineTheme` |
| `richtext` | Studio | Tiptap nodes, marks, and toolbar buttons for the WYSIWYG interface (12.6.0+) | `defineRichText` |
| `hook` | API | Listener: `filter`, `action`, `init`, `schedule`, `embed` | `defineHook` |
| `endpoint` | API | Express router mounted at `/<id>` | `defineEndpoint` |
| `operation` | Both | A Flows step: `app` half (options UI) + `api` half (handler), same `id` in both | `defineOperationApp` + `defineOperationApi` |
| `bundle` | Both | Several of the above sharing deps and one install | n/a (manifest `entries`) |

- **App** extensions run in the user's browser with that user's session and permissions. They can't hold secrets.
- **API** extensions run in the Directus Node process with full access to services, the database (Knex), and `env`. A bug here can take down the server or leak data.

**Recommended:** if the Studio part needs a secret or a keyed third-party API, put the call in an endpoint (or operation), have the app extension call it with `useApi()`, and ship both in one bundle.

## Common requests

| Request | Type |
| --- | --- |
| "Color picker / map / custom input for a field" | interface |
| "Show status as a colored badge in the table" | display |
| "Calendar / Gantt / tree view of items" | layout |
| "Admin tool page / migration UI / custom settings screen" | module (often bundled with an endpoint) |
| "KPI widget pulling from Stripe" | panel + endpoint in a bundle |
| "Slugify title before save" / "block deletes of published items" | hook (`filter`) |
| "Sync to Algolia after save" | hook (`action`) or operation used in a Flow |
| "Nightly cleanup" | hook (`schedule`) or Flow with cron trigger |
| "Inject analytics script into the Studio" | hook (`embed`) |
| "Reusable 'Send via Resend' step for non-developers" | operation |
| "Proxy a third-party API with server-side key" | endpoint |

## Sources

- https://directus.com/docs/guides/extensions/overview
- https://directus.com/docs/guides/extensions/bundles
- https://directus.com/docs/guides/flows/operations
- https://directus.com/docs/cloud/configuration/custom-extensions
- https://github.com/directus/directus/blob/v12.6.0/packages/constants/src/extensions.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/extensions-sdk/src/index.ts
- https://github.com/directus/directus/tree/v12.6.0/api/src/operations (built-in operation ids)
- https://github.com/directus/directus/blob/v12.6.0/packages/system-data/src/fields/settings.yaml (`theme_light_overrides`, `custom_css`)
