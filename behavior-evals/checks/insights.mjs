import { api, check, done } from './lib.mjs';

const dashboards = (await api('/dashboards?fields=id,name&limit=-1')).data ?? [];
check(dashboards.length >= 1, 'a dashboard exists');
const panels = (await api('/panels?fields=*&limit=-1')).data ?? [];

const metric = panels.find((p) => p.type === 'metric' && p.options?.collection === 'posts');
check(!!metric, 'metric panel on posts');
check(['count', 'countDistinct'].includes(metric?.options?.function), 'metric counts', metric?.options?.function);
check(JSON.stringify(metric?.options?.filter ?? {}).includes('published'), 'metric filters to published', JSON.stringify(metric?.options?.filter));

const chart = panels.find((p) => ['time-series', 'bar-chart', 'line-chart'].includes(p.type) && p.options?.collection === 'posts');
check(!!chart, 'chart panel on posts');
if (chart?.type === 'time-series') {
	check(chart.options.precision === 'week', 'time-series grouped by week', chart.options.precision);
	check(chart.options.dateField === 'date_published', 'time-series uses date_published', chart.options.dateField);
	check(!!chart.options.valueField && !!chart.options.function, 'time-series has valueField and function', JSON.stringify(chart.options));
}

const placed = panels.filter((p) => [p.position_x, p.position_y, p.width, p.height].every((n) => Number.isInteger(n) && n >= 1));
check(panels.length > 0 && placed.length === panels.length, 'every panel has a position and size');
const overlap = placed.some((a, i) =>
	placed.some((b, j) => j > i && a.dashboard === b.dashboard &&
		a.position_x < b.position_x + b.width && b.position_x < a.position_x + a.width &&
		a.position_y < b.position_y + b.height && b.position_y < a.position_y + a.height));
check(panels.length > 0 && !overlap, 'panels do not overlap');

done();
