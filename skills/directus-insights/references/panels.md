# Panels

## Types and options

| `type`                                 | Shows                                 | Key `options`                                                                                                                                       |
| -------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metric`                               | One number                            | `collection`, `field`, `function`, `filter`, `sortField` (for `first`/`last`), `prefix`, `suffix`, `notation`, `numberStyle`                        |
| `metric-list`                          | A grouped aggregate, top N            | `collection`, `groupByField`, `aggregateField`, `aggregateFunction`, `limit`, `sortDirection`, `filter`                                             |
| `list`                                 | Items                                 | `collection`, `displayTemplate`, `sortField`, `sortDirection` (default `desc`), `limit` (default 5), `filter`, `linkToItem`                         |
| `time-series`                          | A value over time                     | `collection`, `function`, `valueField`, `dateField`, `precision` (`second`…`year`, default `hour`), `range` (default `1 week`, or `auto`), `filter` |
| `bar-chart`, `line-chart`, `pie-chart` | Grouped values                        | `collection`, axis or column field, `function`, `filter`. Copy options from a Studio-built panel.                                                   |
| `meter`                                | Progress toward a max                 | `collection`, `field`, `fn`, `max`, `filter`                                                                                                        |
| `label`                                | Text heading                          | `text`, `color`, `fontSize`                                                                                                                         |
| `variable`                             | An input whose value other panels use | `field` (the variable key), `type`, `inter` (interface), `defaultValue`, `options`                                                                  |
| `relational-variable`                  | A picker of item ids                  | `field`, `collection`, `multiple`, `limit`, `displayTemplate`, `filter`                                                                             |

Functions for `metric`: `count`, `countDistinct`, `avg`, `avgDistinct`, `sum`, `sumDistinct`, `min`, `max`, `first`,
`last`. `time-series` takes the aggregate ones. `avg` and `sum` need a numeric field. `filter` uses normal filter
syntax, including `$NOW(-30 days)`.

## Variables

A `variable` panel's `field` becomes a key every other panel on the dashboard can use as `{{ key }}`. The CMS starter's
form dashboard uses two datetime variables as a date range:

```json
[
	{
		"type": "variable",
		"options": { "field": "dateFrom", "type": "timestamp", "inter": "datetime", "defaultValue": "2024-01-01T00:00:00Z" }
	},
	{
		"type": "time-series",
		"options": { "range": "auto", "filter": { "timestamp": { "_between": ["{{dateFrom}}", "{{dateTo}}"] } } }
	}
]
```

`relational-variable` returns the selected ids, so filter with `_in`: `{"author": {"_in": "{{ authors }}"}}`. When a
variable drives a `time-series` filter, set `range: "auto"` so the built-in range doesn't fight it.

## Sources

- https://directus.com/docs/guides/insights/panels
- https://github.com/directus/directus/tree/v12.5.1/app/src/panels
- https://github.com/directus/directus/blob/v12.5.1/app/src/stores/insights.ts
- https://github.com/directus-labs/starters/blob/main/cms/directus/template/src/panels.json
