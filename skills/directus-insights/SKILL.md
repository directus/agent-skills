---
name: directus-insights
description: "Use when building Directus Insights dashboards and panels: metrics, lists, time series, bar, line, and pie charts, meters, labels, variables, layout, and dashboard access, including creating them over the API. Not for aggregate queries from code (directus) or custom panel extensions (directus-extensions)."
metadata:
  author: directus
  directus-version: '12.6.0'
---

# Directus Insights

Build dashboards (`directus_dashboards`) made of panels (`directus_panels`). Each panel is a `type` plus an `options`
object. The Studio turns the options of every data panel (not labels or variables) into batched GraphQL requests
(`/graphql`, plus `/graphql/system` for `directus_*` collections) and runs them **as the person viewing the dashboard**. Nothing is precomputed.

## First checks

1. **Check the version before anything else.** `GET /server/info` with a token returns `data.version`. Not 12.6? Read
   the version notes for its major in the `directus` skill (`references/versions-v<major>.md`) first.
2. **Read the data first.** `GET /fields/<collection>` for the collections you'll chart: you need the exact date field,
   the numeric fields, and the status values to filter on.
3. **Pick the path.** The Directus MCP server has no Insights tool (12.6), and its `items` tool refuses `directus_*`
   collections. Use REST (`/dashboards`, `/panels`) or the SDK (`createDashboard`, `createPanel`).
4. **Check who will view it.** Viewers need read on the charted collections and on `directus_dashboards` /
   `directus_panels`, which app access doesn't include by default.
5. **Use the known payloads.** [references/panels.md](references/panels.md) has the required `options` keys for every
   type. The API saves any `options` unchecked, so a wrong key only shows up as an empty or failing panel.

## Critical traps

- **Set the layout yourself.** The grid starts at `position_x: 1`, `position_y: 1`. The API requires `position_x`,
  `position_y`, `width`, and `height`, but not minimum sizes (the Studio enforces those).
  Nothing checks overlaps.
- **Panels run as the viewer.** A panel over a collection the viewer can't read shows an error or nothing, and
  aggregates only count rows the viewer can see.
- **Each type has its own keys; unknown ones save silently and render nothing.** `time-series` takes `function`,
  `valueField`, `dateField` (not `xAxis`/`yAxis`, which are `bar-chart`/`line-chart`). Copy from
  [panels.md](references/panels.md#minimal-options-per-type).
- **`time-series` filters to `range` on `dateField`** (`$NOW(-<range>)` to `$NOW`, default `1 week`). Use `auto` for all
  data. It needs a datetime field.
- **Singletons can't be charted** by `metric`, `metric-list`, `list`, or `time-series`. They render empty.
- **Picking an item (an author, a product) is a `relational-variable`,** not a `variable` with a text input. It holds
  the id (or ids with `multiple`); filter the related key: `{"author": {"id": {"_eq": "{{author}}"}}}`.
- **Variables are typed.** A variable used in a datetime filter must be a datetime. Values live in the open Studio tab,
  not per user.
- **Data panels query on load and on each auto-refresh.** Filter large collections, or chart a summary collection a
  scheduled flow keeps up to date. With `CACHE_ENABLED`, `/graphql` responses use the normal cache, but Studio requests
  skip it unless `CACHE_AUTO_PURGE` is on.

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
