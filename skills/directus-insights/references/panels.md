# Panels

## Contents

- [How options are used](#how-options-are-used)
- [Required keys and defaults](#required-keys-and-defaults)
- [Minimal options per type](#minimal-options-per-type)
- [Functions](#functions)
- [Variables](#variables)

## How options are used

The API stores `type` and `options` as given. It accepts unknown types and keys and checks nothing inside `options`.
The Studio builds each panel's query from its `options`. If a required key is missing, the panel renders empty or
shows a query error. Keys are case-sensitive and differ between types: `meter` uses `fn`, `line-chart` uses
`aggregation`, the rest use `function`.

## Required keys and defaults

"Default" is what the panel uses when the key is omitted.

| `type`                | Required `options`                                                  | Notable optional keys and defaults                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metric`              | `collection`, `field`, `function`                                   | `sortField` (for `first`/`last`), `filter`, `prefix`, `suffix`, `numberStyle` `decimal`, `notation` `standard`, `minimumFractionDigits`/`maximumFractionDigits` `0`                   |
| `metric-list`         | `collection`, `groupByField`, `aggregateField`, `aggregateFunction` | `limit` `5`, `sortDirection` `desc`, `filter`, same number formatting as `metric`                                                                                                     |
| `list`                | `collection`                                                        | `displayTemplate` (e.g. `"{{title}}"`), `sortField` (primary key), `sortDirection` `desc`, `limit` `5`, `linkToItem` `false`, `filter`                                                |
| `time-series`         | `collection`, `function`, `valueField`, `dateField`                 | `precision` `hour` (`second` to `year`), `range` `1 week` (`auto` means no window), `filter`, `curveType` `smooth`, `fillType` `gradient`, `decimals` `0`, `min`, `max`               |
| `bar-chart`           | `collection`, `xAxis`, `yAxis`                                      | `function` **`max`**, `horizontal` `false`, `decimals` `2`, `showAxisLabels` `both` (`yOnly`, `xOnly`, `none`), `showDataLabel` `true`, `xAxisDisplayField` (m2o x axis), `filter`    |
| `line-chart`          | `collection`, `xAxis`, `yAxis`, `aggregation`                       | `grouping` (field that splits series), `decimals` `2`, `showAxisLabels` `both` (`yAxis`, `xAxis`, `none`), `curveType` `smooth`, `fillType` `gradient`, `showMarker` `true`, `filter` |
| `pie-chart`           | `collection`, `column`                                              | `function` `count`, `donut` `false`, `showLabels` `false`, `legend` `none` (`right`, `bottom`), `decimals` `0`, `filter`                                                              |
| `meter`               | `collection`, `field`, `fn`                                         | `max` `100`, `size` `full` (`half`), `strokeWidth` `20`, `showPercentage` `true`, `filter`                                                                                            |
| `label`               | `text`                                                              | `textAlign` `center`, `fontWeight` `800`, `fontSize` `auto`, `whiteSpace` `normal`, `color`, `font` `sans-serif`                                                                      |
| `variable`            | `field`, `type`, `inter`                                            | `defaultValue` (typed to `type`), `options` (the interface's options)                                                                                                                 |
| `relational-variable` | `field`, `collection`                                               | `multiple` `false`, `limit` (caps picks when `multiple`; `5` if omitted), `displayTemplate`, `filter`                                                    |

Notes:

- For a row count, set `field` (or `aggregateField`) to the primary key. Without it the query asks for `count { * }`,
  which GraphQL rejects, and the panel shows an error.
- `metric`, `metric-list`, `list`, and `time-series` render empty for a singleton collection.
- `bar-chart` defaults to `max`, not `count`. Always send `function`.
- `line-chart` groups by the raw `xAxis` value. For values over time, use `time-series`.
- `pie-chart` groups by `column` and aggregates `column` itself. `avg`, `sum`, `min`, `max` need a numeric column.
- `meter` shows `fn(field) / max` as a percentage.
- `label` and `variable` run no query. `relational-variable` only reads its picked items, over REST.

## Minimal options per type

Each entry saved over `POST /panels` on 12.5.1 (add `dashboard` and the layout fields). Collection `orders` has
`status` (string), `category` (string), `total` (decimal), `date_created` (timestamp), and `author` (m2o to `authors`).

```json
[
	{
		"type": "metric",
		"options": {
			"collection": "orders",
			"field": "total",
			"function": "sum",
			"filter": { "status": { "_eq": "paid" } }
		}
	},
	{
		"type": "metric-list",
		"options": {
			"collection": "orders",
			"groupByField": "category",
			"aggregateField": "total",
			"aggregateFunction": "sum"
		}
	},
	{
		"type": "list",
		"options": { "collection": "orders", "displayTemplate": "{{category}} {{total}}", "sortField": "date_created" }
	},
	{
		"type": "time-series",
		"options": {
			"collection": "orders",
			"function": "sum",
			"valueField": "total",
			"dateField": "date_created",
			"precision": "day",
			"range": "3 months"
		}
	},
	{
		"type": "bar-chart",
		"options": { "collection": "orders", "xAxis": "category", "yAxis": "total", "function": "sum" }
	},
	{
		"type": "line-chart",
		"options": { "collection": "orders", "xAxis": "category", "yAxis": "total", "aggregation": "sum" }
	},
	{ "type": "pie-chart", "options": { "collection": "orders", "column": "category", "function": "count" } },
	{ "type": "meter", "options": { "collection": "orders", "field": "total", "fn": "sum", "max": 1000 } },
	{ "type": "label", "options": { "text": "Sales" } },
	{
		"type": "variable",
		"options": { "field": "dateFrom", "type": "timestamp", "inter": "datetime", "defaultValue": "2024-01-01T00:00:00Z" }
	},
	{
		"type": "relational-variable",
		"options": { "field": "authors", "collection": "authors", "multiple": true, "displayTemplate": "{{name}}" }
	}
]
```

## Functions

`metric`: `count`, `countDistinct`, `avg`, `avgDistinct`, `sum`, `sumDistinct`, `min`, `max`, `first`, `last`.
`first`/`last` return the raw `field` value from the first or last item by `sortField`. `metric-list`, `time-series`,
`bar-chart`, `line-chart`, and `meter` take the aggregate ones (no `first`/`last`). `pie-chart` takes `count`, `avg`,
`sum`, `min`, `max`. All but the counts need a numeric field. `filter` uses normal filter syntax, including
`$NOW(-30 days)`.

## Variables

A variable panel's `field` becomes a key any panel on the dashboard can use as `{{ key }}` in its `options`. A value
that is exactly `"{{ key }}"` keeps its type, so an array of ids stays an array. A date range needs two variables:

```json
[
	{
		"type": "variable",
		"position_x": 1,
		"position_y": 1,
		"width": 12,
		"height": 6,
		"options": { "field": "dateFrom", "type": "timestamp", "inter": "datetime", "defaultValue": "2024-01-01T00:00:00Z" }
	},
	{
		"type": "variable",
		"position_x": 13,
		"position_y": 1,
		"width": 12,
		"height": 6,
		"options": { "field": "dateTo", "type": "timestamp", "inter": "datetime", "defaultValue": "2030-12-31T23:59:59Z" }
	},
	{
		"type": "relational-variable",
		"position_x": 25,
		"position_y": 1,
		"width": 12,
		"height": 6,
		"options": { "field": "authors", "collection": "authors", "multiple": true, "displayTemplate": "{{name}}" }
	},
	{
		"type": "time-series",
		"position_x": 1,
		"position_y": 7,
		"width": 36,
		"height": 12,
		"options": {
			"collection": "orders",
			"function": "sum",
			"valueField": "total",
			"dateField": "date_created",
			"precision": "day",
			"range": "auto",
			"filter": {
				"_and": [
					{ "date_created": { "_between": ["{{dateFrom}}", "{{dateTo}}"] } },
					{ "author": { "id": { "_in": "{{authors}}" } } }
				]
			}
		}
	}
]
```

- When a variable drives a `time-series` date filter, set `range: "auto"` so the built-in window doesn't fight it.
- `relational-variable` holds one id, or an array when `multiple`. Panels query over GraphQL, which rejects `_in`
  directly on an m2o field. Filter on the related key: `{"author": {"id": {"_in": "{{authors}}"}}}`.
- A panel that uses a `relational-variable` with nothing picked renders empty.
- Values live in the open Studio tab, not per user. A reload resets them to `defaultValue`.

## Sources

- https://directus.com/docs/guides/insights/panels
- https://github.com/directus/directus/tree/v12.5.1/app/src/panels
- https://github.com/directus/directus/blob/v12.5.1/app/src/stores/insights.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/utils/query-to-gql-string.ts
- https://github.com/directus/directus/blob/v12.5.1/packages/utils/shared/apply-options-data.ts
- https://github.com/directus-labs/starters/blob/main/cms/directus/template/src/panels.json
