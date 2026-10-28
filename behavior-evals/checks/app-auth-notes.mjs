import { URL, api, check, done } from './lib.mjs';

const register = (email) => api('/users/register', { method: 'POST', token: null, body: { email, password: 'App-password-123!' } });
const login = async (email) => (await api('/auth/login', { method: 'POST', token: null, body: { email, password: 'App-password-123!' } })).data?.access_token;

const ra = await register('alice-check@example.com');
const rb = await register('bob-check@example.com');
check(ra.status < 300 && rb.status < 300, 'people can sign up through /users/register', `${ra.status} ${rb.status} ${JSON.stringify(ra.errors ?? '')}`);
const alice = await login('alice-check@example.com');
const bob = await login('bob-check@example.com');
if (!check(!!alice && !!bob, 'new users can log in right away (no verification step)')) done();
const as = (token) => (path, opts = {}) => api(path, { ...opts, token });
const A = as(alice);
const B = as(bob);
const aliceId = (await A('/users/me?fields=id')).data?.id;
const bobId = (await B('/users/me?fields=id')).data?.id;

const appAccess = (await api(`/users/${aliceId}?fields=role.policies.policy.app_access,policies.policy.app_access`)).data;
const flags = JSON.stringify(appAccess);
check(!/"app_access":true/.test(flags), 'app users have no Studio access', flags);

const created = await A('/items/notes', { method: 'POST', body: { title: 'Alice private', body: 'secret' } });
check(created.status === 200, 'a user creates a note', `status ${created.status} ${JSON.stringify(created.errors ?? '')}`);
const noteId = created.data?.id;
const full = (await api(`/items/notes/${noteId}`)).data ?? {};
const ownerField = Object.keys(full).find((k) => full[k] === aliceId);
check(!!ownerField, 'the note records its owner', JSON.stringify(full));
await B('/items/notes', { method: 'POST', body: { title: 'Bob note', body: 'mine' } });

const bobList = await B('/items/notes?limit=-1&fields=id,title');
check(bobList.status === 200 && (bobList.data ?? []).every((n) => n.title !== 'Alice private') && (bobList.data ?? []).some((n) => n.title === 'Bob note'), "a user lists only their own notes", JSON.stringify(bobList.data ?? bobList.errors));
const bobRead = await B(`/items/notes/${noteId}`);
check(bobRead.status === 403, "another user can't read the note", `status ${bobRead.status}`);
const bobEdit = await B(`/items/notes/${noteId}`, { method: 'PATCH', body: { title: 'Bob was here' } });
const bobDelete = await B(`/items/notes/${noteId}`, { method: 'DELETE' });
const still = (await api(`/items/notes/${noteId}`)).data ?? {};
check(bobEdit.status === 403 && bobDelete.status === 403 && still.title === 'Alice private', "another user can't edit or delete it", `${bobEdit.status} ${bobDelete.status}`);

if (ownerField) {
	await A(`/items/notes/${noteId}`, { method: 'PATCH', body: { [ownerField]: bobId } });
	const after = (await api(`/items/notes/${noteId}`)).data ?? {};
	check(after[ownerField] === aliceId, "the owner can't hand the note to someone else", JSON.stringify(after));
	const forged = await A('/items/notes', { method: 'POST', body: { title: 'Forged', [ownerField]: bobId } });
	const forgedRow = forged.data?.id ? (await api(`/items/notes/${forged.data.id}`)).data : null;
	check(forged.status >= 400 || forgedRow?.[ownerField] === aliceId, "a user can't create a note in someone else's name", JSON.stringify(forgedRow ?? forged.errors));
}
const own = await A(`/items/notes/${noteId}`, { method: 'PATCH', body: { body: 'edited' } });
check(own.status === 200, 'the owner edits their note', `status ${own.status} ${JSON.stringify(own.errors ?? '')}`);
const pub = await api('/items/notes', { token: null });
check(pub.status === 403 || (pub.data ?? []).length === 0, 'Public sees no notes', `status ${pub.status}`);

// Realtime: Alice subscribes; she should hear her own new note and not Bob's.
const events = [];
const ws = new WebSocket(URL.replace(/^http/, 'ws') + '/websocket');
const opened = await new Promise((resolve) => {
	const timer = setTimeout(() => resolve(false), 5000);
	ws.onmessage = (m) => {
		const msg = JSON.parse(m.data);
		if (msg.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
		if (msg.type === 'auth' && msg.status === 'ok') ws.send(JSON.stringify({ type: 'subscribe', collection: 'notes', query: { fields: ['id', 'title'] } }));
		if (msg.type === 'subscription' && msg.event === 'init') {
			clearTimeout(timer);
			resolve(true);
		}
		if (msg.type === 'subscription' && msg.event === 'create') events.push(...(msg.data ?? []).map((d) => d.title));
	};
	ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', access_token: alice }));
	ws.onerror = () => resolve(false);
});
if (check(opened, 'a user subscribes to notes over WebSockets')) {
	await B('/items/notes', { method: 'POST', body: { title: 'Bob live', body: 'x' } });
	await A('/items/notes', { method: 'POST', body: { title: 'Alice live', body: 'x' } });
	await new Promise((r) => setTimeout(r, 2000));
	check(events.includes('Alice live'), 'live updates arrive for their own notes', JSON.stringify(events));
	check(!events.includes('Bob live'), "live updates never include someone else's notes", JSON.stringify(events));
}
ws.close();

done();
