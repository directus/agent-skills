// Shared helpers for behavior checks. Each check prints PASS/FAIL lines and exits 1 on any failure.
export const URL = process.env.DIRECTUS_URL ?? 'http://127.0.0.1:18255';
export const TARGET_URL = process.env.TARGET_URL;
export const WORK_DIR = process.env.WORK_DIR;
const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN ?? 'skills-evals-admin-token';

const failures = [];

export async function api(path, { method = 'GET', body, token = TOKEN, base = URL } = {}) {
	let res;
	try {
		res = await fetch(base + path, {
			signal: AbortSignal.timeout(15_000),
			method,
			headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	} catch (error) {
		// Status 0: no response (hung or refused).
		return { status: 0, errors: [{ message: error.message }] };
	}
	const text = await res.text();
	let json = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {}
	return { status: res.status, data: json?.data, errors: json?.errors };
}

// `recommended: true` marks a check of our Recommended conventions (naming, key types, on_delete), not of whether
// the build works. The harness scores those separately.
export function check(ok, label, detail = '', { recommended = false } = {}) {
	console.log(`${ok ? 'PASS' : 'FAIL'} ${recommended ? '(recommended) ' : ''}${label}${detail && !ok ? `: ${detail}` : ''}`);
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

// Whether a semver range (^, ~, >=, <, ||, *) includes a version. Enough for extension `host` fields.
export function rangeIncludes(range, version) {
	const parse = (v) => v.replace(/^v/, '').split('.').map((n) => Number(n) || 0);
	const cmp = (a, b) => {
		for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
		return 0;
	};
	const v = parse(version);
	const test = (c) => {
		const [, op, raw] = c.match(/^(\^|~|>=|<=|>|<|=)?\s*(.*)$/);
		if (raw === '*' || raw === 'x' || raw === '') return true;
		const r = parse(raw);
		if (op === '^') return cmp(v, r) >= 0 && v[0] === r[0];
		if (op === '~') return cmp(v, r) >= 0 && v[0] === r[0] && v[1] === r[1];
		if (op === '>=') return cmp(v, r) >= 0;
		if (op === '<=') return cmp(v, r) <= 0;
		if (op === '>') return cmp(v, r) > 0;
		if (op === '<') return cmp(v, r) < 0;
		return cmp(v, r) === 0;
	};
	return String(range)
		.split('||')
		.some((part) => part.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').split(/\s+/).every(test));
}

// A user in `roleId` with this static token. Core tier caps Studio seats, so when the agent already used them up,
// reuse one of its users in that role instead of creating ours.
export async function userWithToken(roleId, token) {
	const created = await api('/users', {
		method: 'POST',
		body: { email: `${token}@example.com`, password: 'Check-password-123!', role: roleId, token },
	});
	if (created.status === 200) return true;
	const existing = (await api(`/users?filter[role][_eq]=${roleId}&fields=id&limit=1`)).data?.[0];
	if (!existing) {
		console.log(`INFO no user for role ${roleId}: ${created.status} ${JSON.stringify(created.errors)}`);
		return false;
	}
	return (await api(`/users/${existing.id}`, { method: 'PATCH', body: { token, status: 'active' } })).status === 200;
}
