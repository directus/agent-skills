// After `tenants`: a Member role whose users read the tickets of every org they belong to. Licensed (item rule).
import { api } from '../checks/lib.mjs';

const policy = (await api('/policies', { method: 'POST', body: { name: 'Member', app_access: false, admin_access: false } })).data;
const perm = await api('/permissions', {
	method: 'POST',
	body: {
		policy: policy.id,
		collection: 'tickets',
		action: 'read',
		fields: ['*'],
		permissions: { org: { memberships: { user: { _eq: '$CURRENT_USER' } } } },
	},
});
if (perm.status !== 200) throw new Error(JSON.stringify(perm.errors));
const role = (await api('/roles', { method: 'POST', body: { name: 'Member' } })).data;
await api('/access', { method: 'POST', body: { role: role.id, policy: policy.id } });
for (const u of (await api('/users?filter[email][_in]=alice@example.com,bob@example.com,carol@example.com&fields=id')).data)
	await api(`/users/${u.id}`, { method: 'PATCH', body: { role: role.id } });
console.log('seeded tenant access');
