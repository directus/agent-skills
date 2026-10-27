// Seeds newsletters, 150 active + 20 inactive subscribers, and an empty deliveries collection.
import { api } from '../checks/lib.mjs';

const pk = { field: 'id', type: 'uuid', meta: { special: ['uuid'], hidden: true }, schema: { is_primary_key: true } };
async function create(collection, fields) {
	const r = await api('/collections', { method: 'POST', body: { collection, meta: {}, schema: {}, fields: [pk, ...fields] } });
	if (r.status !== 200) throw new Error(JSON.stringify(r.errors));
}
async function m2o(collection, field, related) {
	const f = await api(`/fields/${collection}`, { method: 'POST', body: { field, type: 'uuid', meta: { special: ['m2o'], interface: 'select-dropdown-m2o' }, schema: {} } });
	if (f.status !== 200) throw new Error(JSON.stringify(f.errors));
	const r = await api('/relations', { method: 'POST', body: { collection, field, related_collection: related, schema: { on_delete: 'CASCADE' } } });
	if (r.status !== 200) throw new Error(JSON.stringify(r.errors));
}

await create('newsletters', [{ field: 'title', type: 'string', meta: { interface: 'input' }, schema: {} }]);
await create('subscribers', [
	{ field: 'email', type: 'string', meta: { interface: 'input' }, schema: {} },
	{ field: 'active', type: 'boolean', meta: { interface: 'boolean' }, schema: { default_value: true } },
]);
await create('deliveries', [{ field: 'status', type: 'string', meta: { interface: 'input' }, schema: {} }]);
await m2o('deliveries', 'newsletter', 'newsletters');
await m2o('deliveries', 'subscriber', 'subscribers');

await api('/items/newsletters', { method: 'POST', body: [{ title: 'October issue' }, { title: 'November issue' }] });
const subs = Array.from({ length: 170 }, (_, i) => ({ email: `reader${i}@example.com`, active: i < 150 }));
const r = await api('/items/subscribers', { method: 'POST', body: subs });
if (r.status !== 200) throw new Error(JSON.stringify(r.errors));
console.log('seeded subscribers');
