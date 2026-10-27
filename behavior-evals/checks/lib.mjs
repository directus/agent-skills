// Shared helpers for behavior checks. Each check prints PASS/FAIL lines and exits 1 on any failure.
export const URL = process.env.DIRECTUS_URL ?? 'http://127.0.0.1:18255';
const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN ?? 'skills-evals-admin-token';

const failures = [];

export async function api(path, { method = 'GET', body, token = TOKEN } = {}) {
	const res = await fetch(URL + path, {
		method,
		headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await res.text();
	let json = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {}
	return { status: res.status, data: json?.data, errors: json?.errors };
}

export function check(ok, label, detail = '') {
	console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail && !ok ? `: ${detail}` : ''}`);
	if (!ok) failures.push(label);
	return ok;
}

export async function fields(collection) {
	return (await api(`/fields/${collection}`)).data ?? [];
}

export async function relations(collection) {
	return (await api(`/relations/${collection}`)).data ?? [];
}

export async function collectionNames() {
	return ((await api('/collections?limit=-1')).data ?? []).map((c) => c.collection).filter((c) => !c.startsWith('directus_'));
}

// Values for fields the agent made required, so functional writes don't fail on our side.
export async function requiredStub(collection) {
	const stub = {};
	for (const f of await fields(collection)) {
		if (f.schema?.is_primary_key || f.type === 'alias' || !f.schema) continue;
		const required = f.meta?.required || (f.schema.is_nullable === false && f.schema.default_value == null);
		if (!required) continue;
		if (['string', 'text', 'hash'].includes(f.type)) stub[f.field] = f.schema.is_unique ? `check-${Math.random().toString(36).slice(2, 8)}` : 'Check';
		else if (['integer', 'bigInteger', 'float', 'decimal'].includes(f.type)) stub[f.field] = 1;
		else if (f.type === 'boolean') stub[f.field] = false;
	}
	return stub;
}

export function done() {
	console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
	process.exit(failures.length ? 1 : 0);
}
