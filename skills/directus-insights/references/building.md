# Building dashboards

## Create a dashboard and panels over REST

```bash
DASH=$(curl -s -X POST "$URL/dashboards" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Content","icon":"insights","color":"#6644FF","note":"Editorial output"}' | jq -r .data.id)

curl -s -X POST "$URL/panels" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '[
  {"dashboard":"'$DASH'","type":"metric","name":"Published posts","show_header":true,
   "position_x":1,"position_y":1,"width":12,"height":6,
   "options":{"collection":"posts","field":"id","function":"count","filter":{"status":{"_eq":"published"}}}},
  {"dashboard":"'$DASH'","type":"time-series","name":"Posts per week","show_header":true,
   "position_x":13,"position_y":1,"width":24,"height":12,
   "options":{"collection":"posts","function":"count","valueField":"id","dateField":"date_published","precision":"week","range":"3 months"}}
]'
```

Panel fields: `dashboard`, `type`, `options`, `position_x`, `position_y`, `width`, `height`, and the optional header
(`show_header`, `name`, `icon`, `color`, `note`). Dashboard fields: `name`, `icon`, `color`, `note`.

## Layout

- The grid is 1-based. Lay panels out left to right, top to bottom, and keep a running `position_y`.
- Minimum sizes the Studio enforces (width × height): `metric` and `label` 6×2; `meter` and `line-chart` 6×6;
  `list`, `metric-list`, `time-series`, `variable`, `relational-variable` 12×6; `pie-chart` 10×10; `bar-chart`
  12×10. Panels below these render badly.
- Put variables and labels at the top, the panels that use them below.

## Permissions

- **Viewers:** read on `directus_dashboards` and `directus_panels`, plus read on every charted collection and field.
- **Builders:** also create, update, and delete on both.
- App access doesn't grant these. Add them to a policy. The CMS starter's "Team - App Access" policy has dashboards and
  panels CRUD. Details: `directus-access-control`.

## Moving dashboards between instances

Environment Sync carries dashboards, with panels traveling with their dashboard (matched by name). The collections
and fields the panels use must already exist on the target. See `directus-environment-sync`.

## Sources

- https://directus.com/docs/guides/insights/overview
- https://github.com/directus/directus/blob/v12.5.1/packages/system-data/src/fields/panels.yaml
- https://github.com/directus/directus/blob/v12.5.1/packages/system-data/src/fields/dashboards.yaml
- https://github.com/directus/directus/blob/v12.5.1/app/src/modules/insights/routes/panel-configuration.vue
- https://github.com/directus/directus/tree/v12.5.1/app/src/panels
- https://github.com/directus/directus/blob/v12.5.1/packages/system-data/src/app-access-permissions/app-access-permissions.yaml
- https://github.com/directus-labs/starters/blob/main/cms/directus/template/src/permissions.json
