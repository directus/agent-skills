import { api, check, done } from './lib.mjs';

const panels = (await api('/panels?fields=*&limit=-1')).data ?? [];
const rel = panels.find((p) => p.type === 'relational-variable' && p.options?.collection === 'authors');
check(!!rel?.options?.field, 'a relational variable picks an author', JSON.stringify(panels.map((p) => p.type)));
const dateVars = panels.filter((p) => p.type === 'variable' && /date|time/i.test(`${p.options?.type} ${p.options?.inter}`));
check(dateVars.length >= 1, 'date variable(s) for the range', JSON.stringify(panels.filter((p) => p.type === 'variable').map((p) => p.options)));

const uses = (p, key) => !!key && JSON.stringify(p?.options?.filter ?? {}).replace(/\s/g, '').includes(`{{${key}}}`);
const usesDate = (p) => dateVars.some((v) => uses(p, v.options?.field));
const metric = panels.find((p) => p.type === 'metric' && p.options?.collection === 'posts');
check(!!metric, 'metric panel on posts');
check(['count', 'countDistinct'].includes(metric?.options?.function), 'metric counts', metric?.options?.function);
check(JSON.stringify(metric?.options?.filter ?? {}).includes('published'), 'metric filters to published');
check(uses(metric, rel?.options?.field), 'metric filters by the author variable', JSON.stringify(metric?.options?.filter));
check(usesDate(metric), 'metric filters by the date variable(s)');

const ts = panels.find((p) => p.type === 'time-series' && p.options?.collection === 'posts');
check(!!ts, 'time-series panel on posts');
check(ts?.options?.precision === 'week', 'grouped by week', ts?.options?.precision);
check(uses(ts, rel?.options?.field), 'time-series filters by the author variable', JSON.stringify(ts?.options?.filter));
check(usesDate(ts), 'time-series filters by the date variable(s)');
check(ts?.options?.range === 'auto', 'time-series range is auto, so its built-in range does not fight the variables', ts?.options?.range);

done();
