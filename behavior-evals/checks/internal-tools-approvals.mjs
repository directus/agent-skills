import { api, check, done } from './lib.mjs';

const wait = () => new Promise((r) => setTimeout(r, 800));
const roles = (await api('/roles?fields=id,name,policies.policy.admin_access,policies.policy.app_access&limit=-1')).data ?? [];
const role = (re) => roles.find((r) => re.test(r.name));
const ops = role(/^ops$/i) ?? role(/ops/i);
const manager = role(/^manager$/i) ?? role(/manager/i);
const studio = (r) => {
	const policies = (r?.policies ?? []).map((p) => p.policy).filter(Boolean);
	return policies.some((p) => p.app_access) && !policies.some((p) => p.admin_access);
};
check(studio(ops), 'an Ops role with Studio access and no admin access', JSON.stringify(ops ?? null));
check(studio(manager), 'a Manager role with Studio access and no admin access', JSON.stringify(manager ?? null));
if (!ops || !manager) done();

for (const [r, token] of [
	[ops, 'ops-check-token'],
	[manager, 'manager-check-token'],
])
	await api('/users', { method: 'POST', body: { email: `${token}@example.com`, password: 'check-password-123', role: r.id, token } });
const as = (token) => (path, opts = {}) => api(path, { ...opts, token });
const asOps = as('ops-check-token');
const asManager = as('manager-check-token');
const managerId = (await asManager('/users/me?fields=id')).data?.id;

const order = async (total, status = 'new') => (await api('/items/orders', { method: 'POST', body: { customer: 'Check', total, status, ordered_at: new Date().toISOString() } })).data?.id;
const statusOf = async (id) => (await api(`/items/orders/${id}?fields=status`)).data?.status;

const list = await asOps('/items/orders?limit=-1&fields=id');
check(list.status === 200 && (list.data?.length ?? 0) >= 12, 'Ops can see every order', `status ${list.status}, ${list.data?.length} rows`);

const big = await order(600);
const small = await order(300);
await wait();

const r1 = await asOps(`/items/orders/${big}`, { method: 'PATCH', body: { status: 'fulfilled' } });
check(r1.status >= 400 && r1.status < 500 && (await statusOf(big)) === 'new', 'Ops cannot fulfill an unapproved order over $500', `status ${r1.status}`);
const r2 = await asOps(`/items/orders/${big}`, { method: 'PATCH', body: { status: 'approved' } });
check(r2.status >= 400 && r2.status < 500 && (await statusOf(big)) === 'new', 'Ops cannot approve', `status ${r2.status}`);
const r3 = await asOps(`/items/orders/${small}`, { method: 'PATCH', body: { status: 'fulfilled' } });
check(r3.status === 200, 'Ops can fulfill an order of $500 or less', `status ${r3.status} ${JSON.stringify(r3.errors ?? '')}`);

const big2 = await order(800);
const small2 = await order(100);
await wait();
const batch = await asOps('/items/orders', { method: 'PATCH', body: { keys: [big2, small2], data: { status: 'fulfilled' } } });
check((await statusOf(big2)) !== 'fulfilled', 'a batch update cannot slip a big unapproved order through', `status ${batch.status}`);

const created = await asOps('/items/orders', { method: 'POST', body: { customer: 'Sneaky', total: 700, status: 'fulfilled' } });
check(created.status >= 400 && created.status < 500, 'Ops cannot create an order over $500 as fulfilled', `status ${created.status}`);
const createdApproved = await asOps('/items/orders', { method: 'POST', body: { customer: 'Sneaky', total: 700, status: 'approved' } });
check(createdApproved.status >= 400 && createdApproved.status < 500, 'Ops cannot create an order as approved', `status ${createdApproved.status}`);

const approve = await asManager(`/items/orders/${big}`, { method: 'PATCH', body: { status: 'approved' } });
check(approve.status === 200, 'a Manager can approve', `status ${approve.status} ${JSON.stringify(approve.errors ?? '')}`);
await wait();
const approved = (await api(`/items/orders/${big}?fields=status,approved_by,approved_at`)).data ?? {};
check(approved.approved_by === managerId, 'approved_by records the manager', JSON.stringify(approved));
check(!!approved.approved_at && Math.abs(Date.now() - new Date(approved.approved_at).getTime()) < 5 * 60_000, 'approved_at records when', JSON.stringify(approved));

const fulfil = await asOps(`/items/orders/${big}`, { method: 'PATCH', body: { status: 'fulfilled' } });
check(fulfil.status === 200, 'Ops can fulfill it once approved', `status ${fulfil.status} ${JSON.stringify(fulfil.errors ?? '')}`);

const dashboards = (await asOps('/dashboards?fields=id,name,panels.type,panels.options&limit=-1')).data ?? [];
const panels = dashboards.flatMap((d) => d.panels ?? []);
check(dashboards.length > 0, 'Ops can open a dashboard', `${dashboards.length} visible`);
check(
	panels.some((p) => p.options?.collection === 'orders' && /approved|new/.test(JSON.stringify(p.options?.filter ?? '')) && /total/.test(JSON.stringify(p.options?.filter ?? ''))),
	'a panel counts orders waiting for approval (status and total filter)',
	JSON.stringify(panels.map((p) => p.type)),
);
check(
	panels.some((p) => p.type === 'time-series' && p.options?.collection === 'orders' && p.options?.valueField === 'total'),
	'a time-series panel shows revenue (sum of total) over time',
	JSON.stringify(panels.filter((p) => p.type === 'time-series').map((p) => p.options)),
);

done();
