---
name: directus-insights
description: 'Use when building or changing Directus Insights dashboards and panels: metrics, lists, time series, bar, line, and pie charts, meters, labels, global and relational variables, panel options and layout, dashboard permissions, or creating dashboards through the API. Not for querying items or aggregates from code (directus), automating summary data with Flows (directus-flows), writing custom panel extensions (directus-extensions), or who can see which data (directus-access-control).'
metadata:
  author: directus
  directus-version: '12.5.1'
---

# Directus Insights

Build dashboards (`directus_dashboards`) made of panels (`directus_panels`). Each panel is a `type` plus an `options`
object. The Studio turns every panel's options into one GraphQL request and runs it **as the person viewing the
dashboard**. Nothing is precomputed or cached server-side.

## First checks

1. **Read the data first.** `GET /fields/<collection>` for the collections you'll chart: you need the exact date field,
   the numeric fields, and the status values to filter on.
2. **Pick the path.** At 12.5.1 the Directus MCP server has no Insights tool, and its `items` tool refuses `directus_*`
   collections. Use REST (`/dashboards`, `/panels`) or the SDK (`createDashboard`, `createPanel`).
   <!-- When the MCP Insights tool ships: add references/mcp.md and route to it here. -->
3. **Check who will view it.** Viewers need read on the charted collections and on `directus_dashboards` /
   `directus_panels`, which app access doesn't include by default.
4. **Copy before inventing.** If the instance already has a dashboard, read its panels
   (`GET /panels?filter[dashboard][_eq]=<id>`) and reuse their `options` shapes, especially for chart types.

## Critical traps

- **Set the layout yourself.** The grid starts at `position_x: 1`, `position_y: 1`. Always send `position_x`,
  `position_y`, `width`, and `height`. The API checks neither overlaps nor minimum sizes; the Studio does.
- **Panels run as the viewer.** A panel over a collection the viewer can't read shows an error or nothing, and
  aggregates only count rows the viewer can see.
- **`time-series` filters to `range` on `dateField`** (`$NOW(-<range>)` to `$NOW`, default `1 week`). Use `auto` for
  all data. It needs a datetime field.
- **Singletons can't be charted** by `metric` or `time-series`.
- **Variables are typed.** A variable used in a datetime filter must be a datetime. Values live in the browser
  session, not per user.
- **Every panel queries on load and on each auto-refresh.** Filter large collections, or chart a summary collection
  a scheduled flow keeps up to date.

## Routing

| Load when                                                                           | Reference                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| Creating a dashboard and panels over REST, layout and sizes, permissions, promoting | [references/building.md](references/building.md) |
| Choosing a panel type, exact `options` keys, aggregate functions, variables         | [references/panels.md](references/panels.md)     |

## Related skills

`directus` (REST, filters, aggregates) · `directus-access-control` (policies for viewers and builders) ·
`directus-flows` (scheduled flows that fill summary collections) · `directus-extensions` (custom panel types) ·
`directus-environment-sync` (move dashboards between instances)

## Go deeper

1. Directus docs MCP server: `https://directus.com/docs/mcp` (`search-docs`, `get-doc`, `search-directus-code`).
2. Raw docs: https://directus.com/docs/raw/guides/insights/panels.md. Index: https://directus.com/docs/llms.txt
3. The instance: panels built in the Studio show the exact `options` each type expects.
