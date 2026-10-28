# Directus on an existing database

Directus reads every table in the database it connects to. Tables another app created show up as collections with a
`schema` and `meta: null`, and admins can already read them. Configure them; don't recreate them. When another app owns
the schema, change only Directus metadata (`directus_collections`, `directus_fields`, `directus_relations`), never the
tables.

## Configure, don't create

| Task | Call | Not |
| --- | --- | --- |
| Configure a table | `PATCH /collections/<table>` with `{ "meta": { ... } }` | `POST /collections` (400 `Collection "<table>" already exists`) |
| Configure a column | `PATCH /fields/<table>/<column>` with `{ "meta": { ... } }` | `POST /fields` (would add a column) |
| Use a foreign key in the Studio | `PATCH /fields/<table>/<fk>` with `meta.interface: "select-dropdown-m2o"`, `special: ["m2o"]`, and a `display_options.template` | Recreating the relation |

- Foreign keys are already relations (`GET /relations/<table>`, `meta: null`). Nested reads like
  `fields=customer_id.name` work without any meta row; the field meta only drives the Studio form and display.
- Database defaults (`serial`, `gen_random_uuid()`, `now()`) and triggers keep working: API creates and updates go
  through them. Leave those fields out of payloads.
- Mixed-case columns (`"displayName"`) work as-is in `fields`, filters, and templates (`{{displayName}}`).

## What Directus can't use

| Object | What happens | Do |
| --- | --- | --- |
| Table without a primary key | Not usable over the API (403 "does not exist") even with meta | Report it. Adding a key changes the app's schema |
| Composite primary key | Listed as a collection, but every items request 403s | Report it. Directus needs a single-column key |
| View | Not listed at all | Report it, or read it from a custom endpoint extension |

## Postgres enums

An enum column comes in as type `unknown`, with a free text input. Writing a value outside the enum is a 500 that leaks
the SQL error (`invalid input value for enum ...`). Fix both in field meta, without touching the type:

```json
{
	"meta": {
		"interface": "select-dropdown",
		"options": {
			"choices": [
				{ "text": "Draft", "value": "draft" },
				{ "text": "Sent", "value": "sent" }
			]
		},
		"validation": { "_and": [{ "status": { "_in": ["draft", "sent"] } }] },
		"validation_message": "Status must be draft or sent"
	}
}
```

- Read the labels from the database: `select enumlabel from pg_enum where enumtypid = '<type>'::regtype order by enumsortorder`.
- `meta.validation` makes a bad value a 400 `FAILED_VALIDATION` for every caller, admins included. It's field metadata,
  not a permission rule, so it works on the core tier (verified on 12.6.0).

## Sources

- https://github.com/directus/directus/blob/v12.6.0/api/src/services/collections.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/fields.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/get-local-type.ts
- Checked on a live 12.6.0 instance over Postgres 16 with pre-existing tables, an enum, a view, a trigger, and a
  composite key.
