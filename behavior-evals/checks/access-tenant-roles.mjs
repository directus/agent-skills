import { URL, api, check, done } from './lib.mjs';

const login = async (name) =>
	(
		await fetch(`${URL}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: `${name}@example.com`, password: `${name}-password-123` }),
		}).then((r) => r.json())
	).data?.access_token;

const orgs = Object.fromEntries(((await api('/items/orgs?fields=id,name')).data ?? []).map((o) => [o.name, o.id]));
const tickets = (await api('/items/tickets?fields=id,title,org&limit=-1&sort=id')).data ?? [];
const ticketIn = (org) => tickets.find((t) => t.org === orgs[org] && /^\w+: /.test(t.title));
const titles = (rows) => new Set(rows.map((t) => t.title.split(':')[0]));
const read = async (id) => (await api(`/items/tickets/${id}?fields=title,org`)).data;
const tokens = { alice: await login('alice'), bob: await login('bob'), carol: await login('carol') };
for (const [name, token] of Object.entries(tokens)) check(!!token, `${name} can log in`);

// Denied means the API refused (4xx or 5xx) and nothing changed. A filter Flow that throws answers 500.
const denied = (r) => r.status >= 400;
const clean = (r) => r.status >= 400 && r.status < 500;
const sees = async (name, expected) => {
	const r = await api('/items/tickets?fields=title&limit=-1', { token: tokens[name] });
	const got = titles(r.data ?? []);
	check(r.status === 200 && [...expected].every((o) => got.has(o)) && got.size === expected.length, `${name} sees exactly ${expected.join(' + ')} tickets`, `status ${r.status}: ${[...got].join(', ')}`);
};
await sees('alice', ['Acme', 'Globex']);
await sees('bob', ['Acme']);
await sees('carol', ['Globex']);

const acme = ticketIn('Acme');
const globex = ticketIn('Globex');
const initech = ticketIn('Initech');
const edit = (name, t, body) => api(`/items/tickets/${t.id}`, { method: 'PATCH', body, token: tokens[name] });

let r = await edit('alice', acme, { title: 'Acme: login broken (triaged)' });
check(r.status < 300 && (await read(acme.id))?.title === 'Acme: login broken (triaged)', 'alice (Acme admin) edits an Acme ticket', `status ${r.status}`);
r = await edit('carol', globex, { status: 'pending' });
check(r.status < 300, 'carol (Globex admin) edits a Globex ticket', `status ${r.status}`);
r = await edit('alice', globex, { title: 'Globex: hijacked' });
check(denied(r) && (await read(globex.id))?.title !== 'Globex: hijacked', 'alice (Globex viewer) cannot edit a Globex ticket', `status ${r.status}`);
r = await edit('bob', acme, { title: 'Acme: by bob' });
check(denied(r) && (await read(acme.id))?.title !== 'Acme: by bob', 'bob (Acme viewer) cannot edit an Acme ticket', `status ${r.status}`);
r = await edit('alice', acme, { org: orgs.Initech });
check(denied(r) && (await read(acme.id))?.org === orgs.Acme, 'alice cannot move an Acme ticket into Initech', `status ${r.status}`);
// Put it back so one failed move doesn't fail the checks after it.
await api(`/items/tickets/${acme.id}`, { method: 'PATCH', body: { org: orgs.Acme } });
r = await edit('alice', acme, { org: orgs.Globex });
check(denied(r) && (await read(acme.id))?.org === orgs.Acme, 'alice cannot move an Acme ticket into Globex (viewer there)', `status ${r.status}`);
await api(`/items/tickets/${acme.id}`, { method: 'PATCH', body: { org: orgs.Acme } });
check(clean(r), 'moving a ticket out of an admin org is refused with a 4xx', `status ${r.status}`, { recommended: true });

const count = async (org) => (await api(`/items/tickets?filter[org][_eq]=${orgs[org]}&aggregate[count]=*`)).data?.[0]?.count;
const create = (name, org, title) => api('/items/tickets', { method: 'POST', body: { title, org: orgs[org] }, token: tokens[name] });
r = await create('alice', 'Acme', 'Acme: new by alice');
check(r.status < 300, 'alice creates a ticket in Acme', `status ${r.status} ${JSON.stringify(r.errors ?? '')}`);
for (const [name, org] of [['alice', 'Globex'], ['alice', 'Initech'], ['bob', 'Acme']]) {
	const before = Number(await count(org));
	r = await create(name, org, `${org}: sneaky by ${name}`);
	check(denied(r) && Number(await count(org)) === before, `${name} cannot create a ticket in ${org}`, `status ${r.status}`);
}

r = await api(`/items/tickets/${acme.id}`, { method: 'DELETE', token: tokens.alice });
check(denied(r) && !!(await read(acme.id)), 'alice cannot delete an Acme ticket', `status ${r.status}`);

const aliceId = ((await api('/users?filter[email][_eq]=alice@example.com&fields=id,role')).data ?? [])[0];
const before = (await api('/items/memberships?aggregate[count]=*')).data?.[0]?.count;
r = await api('/items/memberships', { method: 'POST', body: { user: aliceId?.id, org: orgs.Globex, level: 'admin' }, token: tokens.alice });
check(denied(r) && (await api('/items/memberships?aggregate[count]=*')).data?.[0]?.count === before, 'alice cannot add herself as a Globex admin', `status ${r.status}`);
const own = ((await api(`/items/memberships?filter[user][_eq]=${aliceId?.id}&filter[org][_eq]=${orgs.Globex}`)).data ?? [])[0];
r = await api(`/items/memberships/${own?.id}`, { method: 'PATCH', body: { level: 'admin' }, token: tokens.alice });
check(denied(r) && (await api(`/items/memberships/${own?.id}`)).data?.level === 'viewer', 'alice cannot promote her own Globex membership', `status ${r.status}`);

// A user added later the way the brief describes: same role and direct policies as alice, plus a membership.
const direct = (await api(`/access?filter[user][_eq]=${aliceId?.id}&fields=policy`)).data ?? [];
const dave = await api('/users', { method: 'POST', body: { email: 'dave@example.com', password: 'dave-password-123', role: aliceId?.role ?? null } });
for (const a of direct) await api('/access', { method: 'POST', body: { user: dave.data?.id, policy: a.policy } });
await api('/items/memberships', { method: 'POST', body: { user: dave.data?.id, org: orgs.Initech, level: 'admin' } });
tokens.dave = await login('dave');
await sees('dave', ['Initech']);
r = await create('dave', 'Initech', 'Initech: by dave');
check(r.status < 300, 'a later user (dave, Initech admin) creates an Initech ticket', `status ${r.status} ${JSON.stringify(r.errors ?? '')}`);
r = await edit('dave', initech, { status: 'closed' });
check(r.status < 300, 'dave edits an Initech ticket', `status ${r.status}`);

done();
