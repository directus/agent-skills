// The dev side of a dev-to-prod promotion, after `posts`: a `categories` lookup with its rows, `posts.category`, an
// Editor role, a "Notify on publish" Flow, and dev's own project name.
import { api } from '../checks/lib.mjs';

async function post(path, body) {
	const r = await api(path, { method: 'POST', body });
	if (r.status !== 200 && r.status !== 204) throw new Error(`${path}: ${JSON.stringify(r.errors)}`);
	return r.data;
}

await post('/collections', {
	collection: 'categories',
	meta: { icon: 'category', display_template: '{{name}}' },
	schema: {},
	fields: [
		{ field: 'id', type: 'integer', meta: { hidden: true }, schema: { is_primary_key: true, has_auto_increment: true } },
		{ field: 'name', type: 'string', meta: { interface: 'input', required: true }, schema: { is_nullable: false } },
		{ field: 'slug', type: 'string', meta: { interface: 'input' }, schema: { is_unique: true } },
	],
});
await post('/fields/posts', {
	field: 'category',
	type: 'integer',
	meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{name}}' } },
	schema: {},
});
await post('/relations', { collection: 'posts', field: 'category', related_collection: 'categories', schema: { on_delete: 'SET NULL' } });
await post('/items/categories', [
	{ name: 'News', slug: 'news' },
	{ name: 'Guides', slug: 'guides' },
	{ name: 'Releases', slug: 'releases' },
]);

const policy = await post('/policies', { name: 'Editor', icon: 'edit', app_access: true, admin_access: false });
await post('/permissions', [
	...['create', 'read', 'update'].map((action) => ({ policy: policy.id, collection: 'posts', action, fields: ['*'] })),
	{ policy: policy.id, collection: 'categories', action: 'read', fields: ['*'] },
]);
const role = await post('/roles', { name: 'Editor', icon: 'edit' });
await post('/access', { role: role.id, policy: policy.id });

const flow = await post('/flows', {
	name: 'Notify on publish',
	icon: 'campaign',
	status: 'active',
	trigger: 'event',
	accountability: 'all',
	options: { type: 'action', scope: ['items.update'], collections: ['posts'] },
});
const log = await post('/operations', {
	flow: flow.id,
	key: 'log_publish',
	type: 'log',
	position_x: 37,
	position_y: 1,
	options: { message: 'Post {{$trigger.keys}} was published' },
});
const cond = await post('/operations', {
	flow: flow.id,
	key: 'is_published',
	type: 'condition',
	position_x: 19,
	position_y: 1,
	resolve: log.id,
	options: { filter: { $trigger: { payload: { status: { _eq: 'published' } } } } },
});
await api(`/flows/${flow.id}`, { method: 'PATCH', body: { operation: cond.id } });
await api('/settings', { method: 'PATCH', body: { project_name: 'Blog DEV', project_color: '#E35169' } });
console.log('seeded promote-dev');
