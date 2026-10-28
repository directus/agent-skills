# Audit and restore

Who changed what (activity), what it looked like before (revisions), and getting old content back. Drafts and content
versions are a different feature: [content-versioning.md](content-versioning.md).

## Contents

- [What gets tracked](#what-gets-tracked)
- [Finding who changed what](#finding-who-changed-what)
- [Restoring a previous state](#restoring-a-previous-state)
- [Recovering a deleted item](#recovering-a-deleted-item)
- [Retention and licensing caps](#retention-and-licensing-caps)

## What gets tracked

Each collection's **Accountability** setting (`meta.accountability`) decides:

| Value | Activity row (`directus_activity`) | Revision row (`directus_revisions`) |
| --- | --- | --- |
| `all` (default) | Yes | On create and update |
| `activity` | Yes | No |
| `null` | No | No |

- **Delete writes activity only, never a revision.** The deleted row's values are not stored anywhere at delete time.
- A revision holds `delta` (the fields sent in that write) and `data` (a snapshot of the item after the write).
- **`data` leaves out relational fields, many-to-one foreign keys included.** Checked on 12.5.1: after
  `PATCH {"title":"C","author":11}`, `data` had `id`, `title`, `slug` but no `author`; `delta` had both. The docs call it
  a complete snapshot; it isn't. Relational changes show up in the `delta` of that revision and in child revisions
  (`parent` field) for nested writes.
- Writes without accountability (internal scripts with no user context) and anything with tracking skipped leave no
  trail. Imports and batch writes create one activity and revision per row.
- Activity `action` values: `create`, `update`, `delete`, `revert`, `version_save`, `comment`, `upload`, `login`,
  `logout`, `run` (flow runs), `install`.

## Finding who changed what

```
GET /activity?filter[collection][_eq]=posts&filter[item][_eq]=5&sort=-timestamp
    &fields=id,action,timestamp,user.email,ip,origin,revisions.id
GET /revisions?filter[collection][_eq]=posts&filter[item][_eq]=5&sort=-id
    &fields=id,delta,data,activity.action,activity.user.email,activity.timestamp
```

- To find when a field changed, walk revisions newest first and look for the field in `delta`.
- Who deleted something: `filter[action][_eq]=delete` on `/activity`.
- Both endpoints follow permissions. Non-admins usually see only what their policies grant on `directus_activity` and
  `directus_revisions`.

## Restoring a previous state

| Where | How |
| --- | --- |
| Studio | Item page → **Revisions** sidebar → pick one → revert. This loads the old values as unsaved edits; the user still clicks Save |
| API | `POST /utils/revert/<revision-id>`: applies that revision's `data` to the item as a normal update (204) |
| API, partial | `PATCH /items/<collection>/<id>` with just the fields you want back, copied from the revision's `data` |

- Revert restores scalar fields only, because `data` has no relational fields. Checked on 12.5.1: reverting to the
  revision before `author` changed put the title back and left `author` at the new value. Restore relations by hand from
  older `delta`s.
- Reverting to a create revision works the same way (its `data` is what was sent on create).
- The revert is itself an update, so it gets its own activity and revision. Undoing a revert is another revert.
- **Confirm first.** Show the user the fields that will change (current item vs revision `data`).

## Recovering a deleted item

`POST /utils/revert/<id>` on a deleted item returns **204 and does nothing** (the update finds no row). Instead:

1. Find the delete: `GET /activity?filter[collection][_eq]=posts&filter[item][_eq]=5&filter[action][_eq]=delete`.
2. Take the newest revision for that item: its `data` is the last tracked state (scalar fields, including the key).
3. Rebuild relations from older revisions' `delta`s (many-to-one ids), and ask the user about anything missing.
4. `POST /items/<collection>` with the merged object, keeping the original primary key so links and URLs still work.
   Checked on 12.5.1: re-creating with the old integer `id` worked.

Children removed by the delete (cascade or `one_deselect_action: delete`) need the same treatment. With accountability
`activity` or `null`, or past the retention window, there is nothing to recover from; restore a database backup.

## Retention and licensing caps

- **Pruning is off by default.** With `RETENTION_ENABLED=true`, a job (`RETENTION_SCHEDULE`, daily at midnight)
  deletes activity older than `ACTIVITY_RETENTION` (90d), flow logs older than `FLOW_LOGS_RETENTION` (90d), and
  revisions older than `REVISIONS_RETENTION` (90d). Revisions are deleted with their activity row (foreign key
  cascade), so they never outlive it.
- **Core tier reads only recent history** (`entitlements.activity_historical_timeframe`, 30 days at 12.5.1). `/activity` and `/revisions` filter out older rows for every caller,
  admins included. Older rows stay in the database and come back with a license. Details: `directus-access-control`
  (`references/licensing.md`).
- So on core, "restore last quarter's version" fails through the API even when the row exists. Say so instead of
  reporting that no history exists.

## Sources

- https://directus.com/docs/guides/data-model/collections
- https://directus.com/docs/guides/content/editor
- https://directus.com/docs/configuration/logging
- https://directus.com/docs/licensing/overview
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/items.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/revisions.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/activity.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/utils.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/schedules/retention.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/get-history-filter-query.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/database/migrations/20210519A-add-system-fk-triggers.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/constants/src/activity.ts
- https://github.com/directus/directus/blob/v12.6.0/app/src/modules/content/routes/item.vue
