import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORK_DIR, api, check, done } from './lib.mjs';

const file = join(WORK_DIR, 'queries.json');
if (!check(existsSync(file), 'queries.json exists')) done();
let queries;
try {
	queries = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
	check(false, 'queries.json is valid JSON', error.message);
	done();
}

const names = async (key) => {
	const path = String(queries[key] ?? '');
	if (!path.startsWith('/items/products')) return { error: `no path (${path || 'missing'})` };
	const res = await api(path);
	if (res.status !== 200) return { error: `status ${res.status} ${JSON.stringify(res.errors ?? '')}`.slice(0, 300) };
	return { rows: res.data ?? [], names: (res.data ?? []).map((r) => r.name) };
};
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

for (const [key, expected, label] of [
	['red', ['Lamp', 'Mug', 'Clock'], 'red: a string match inside JSON'],
	['highly_rated', ['Lamp', 'Chair', 'Desk', 'Clock'], 'highly_rated: compares ratings as numbers (10 and 12 included)'],
	['wide_and_light', ['Lamp', 'Rug', 'Clock'], 'wide_and_light: nested paths compared as numbers'],
	['blue_or_cheap', ['Chair', 'Rug', 'Mug', 'Vase'], 'blue_or_cheap: _or across a JSON value and a column'],
	['unrated', ['Vase'], 'unrated: a missing JSON key'],
]) {
	const r = await names(key);
	check(!r.error && same(r.names, expected), label, r.error ?? JSON.stringify(r.names));
}

const w = await names('widths');
const widths = Object.fromEntries((w.rows ?? []).map((r) => [r.name, r.width]));
check(
	!w.error && JSON.stringify(w.names) === JSON.stringify(['Chair', 'Clock', 'Desk', 'Lamp', 'Mug', 'Rug', 'Shelf', 'Vase']),
	'widths: every product, sorted by name',
	w.error ?? JSON.stringify(w.names),
);
check(
	Number(widths.Desk) === 140 && Number(widths.Mug) === 8,
	'widths: the width comes back as `width`',
	w.error ?? JSON.stringify(w.rows?.[0]),
);

done();
