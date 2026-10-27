import { URL, api, check, done } from './lib.mjs';

const roles = (await api('/roles?fields=id,name,policies.policy.admin_access,policies.policy.app_access&limit=-1')).data ?? [];
const role = roles.find((r) => /editor/i.test(r.name));
check(!!role, 'an Editor role exists', roles.map((r) => r.name).join(','));
const policies = (role?.policies ?? []).map((p) => p.policy);
check(policies.length > 0 && policies.every((p) => !p.admin_access), 'no admin access on the role');
check(policies.some((p) => p.app_access), 'Studio (app) access on the role');

const login = await fetch(`${URL}/auth/login`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ email: 'editor@example.com', password: 'editor-password' }),
}).then((r) => r.json());
const token = login.data?.access_token;
check(!!token, 'editor@example.com can log in', JSON.stringify(login.errors ?? ''));

if (token) {
	const as = (path, opts = {}) => api(path, { ...opts, token });
	const list = await as('/items/posts?limit=-1');
	check(list.status === 200 && (list.data ?? []).length >= 4, 'editor reads posts', `status ${list.status}, ${(list.data ?? []).length} rows`);
	const created = await as('/items/posts', { method: 'POST', body: { title: 'By editor', status: 'draft', content: '<p>x</p>' } });
	check(created.status === 200 || created.status === 204, 'editor creates a post', JSON.stringify(created.errors ?? ''));
	const target = (list.data ?? [])[0];
	const upd = await as(`/items/posts/${target?.id}`, { method: 'PATCH', body: { title: `${target?.title} (edited)` } });
	check(upd.status === 200 || upd.status === 204, 'editor updates a post', JSON.stringify(upd.errors ?? ''));
	const del = await as(`/items/posts/${target?.id}`, { method: 'DELETE' });
	check(del.status === 403, 'editor cannot delete a post', `status ${del.status}`);
	check((await api(`/items/posts/${target?.id}`)).status === 200, 'the post still exists');
	const s = await as('/settings', { method: 'PATCH', body: { project_name: 'Hacked' } });
	check(s.status === 403, 'editor cannot change settings', `status ${s.status}`);
	const u = await as('/users', { method: 'POST', body: { email: 'sneaky@example.com', password: 'x' } });
	check(u.status === 403, 'editor cannot create users', `status ${u.status}`);
	const admin = ((await api('/users?filter[email][_eq]=admin@example.com')).data ?? [])[0];
	const ua = await as(`/users/${admin?.id}`, { method: 'PATCH', body: { first_name: 'Hacked' } });
	check(ua.status === 403, 'editor cannot edit other users', `status ${ua.status}`);
}

done();
