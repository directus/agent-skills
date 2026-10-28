// A ticketing backend shared by several orgs. Users belong to orgs through `memberships`, each with a level (admin or
// viewer), so one user can administer one org and only view another. Users exist with passwords and no role.
import { api } from '../checks/lib.mjs';

async function post(path, body) {
	const r = await api(path, { method: 'POST', body });
	if (r.status !== 200 && r.status !== 204) throw new Error(`${path}: ${JSON.stringify(r.errors)}`);
	return r.data;
}

const id = {
	field: 'id',
	type: 'integer',
	meta: { hidden: true },
	schema: { is_primary_key: true, has_auto_increment: true },
};
const m2o = (field) => ({
	field,
	type: 'integer',
	meta: { interface: 'select-dropdown-m2o', special: ['m2o'] },
	schema: {},
});

await post('/collections', {
	collection: 'orgs',
	meta: { icon: 'corporate_fare', display_template: '{{name}}' },
	schema: {},
	fields: [id, { field: 'name', type: 'string', meta: { interface: 'input' }, schema: {} }],
});
await post('/collections', {
	collection: 'tickets',
	meta: { icon: 'confirmation_number' },
	schema: {},
	fields: [
		id,
		{ field: 'title', type: 'string', meta: { interface: 'input' }, schema: {} },
		{ field: 'status', type: 'string', meta: { interface: 'input' }, schema: { default_value: 'open' } },
		m2o('org'),
	],
});
await post('/collections', {
	collection: 'memberships',
	meta: { icon: 'badge' },
	schema: {},
	fields: [
		id,
		{ field: 'user', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'] }, schema: {} },
		m2o('org'),
		{
			field: 'level',
			type: 'string',
			meta: {
				interface: 'select-dropdown',
				options: {
					choices: [
						{ text: 'Admin', value: 'admin' },
						{ text: 'Viewer', value: 'viewer' },
					],
				},
			},
			schema: {},
		},
	],
});
await post('/fields/orgs', { field: 'memberships', type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m' } });
await post('/relations', {
	collection: 'tickets',
	field: 'org',
	related_collection: 'orgs',
	schema: { on_delete: 'CASCADE' },
});
await post('/relations', {
	collection: 'memberships',
	field: 'org',
	related_collection: 'orgs',
	meta: { one_field: 'memberships' },
	schema: { on_delete: 'CASCADE' },
});
await post('/relations', {
	collection: 'memberships',
	field: 'user',
	related_collection: 'directus_users',
	schema: { on_delete: 'CASCADE' },
});

const [acme, globex, initech] = await post('/items/orgs', [{ name: 'Acme' }, { name: 'Globex' }, { name: 'Initech' }]);
await post('/items/tickets', [
	{ title: 'Acme: login broken', org: acme.id },
	{ title: 'Acme: invoice question', org: acme.id },
	{ title: 'Globex: export fails', org: globex.id },
	{ title: 'Initech: TPS reports', org: initech.id },
]);

const user = (name) =>
	post('/users', { email: `${name}@example.com`, password: `${name}-password-123`, first_name: name });
const [alice, bob, carol] = [await user('alice'), await user('bob'), await user('carol')];
await post('/items/memberships', [
	{ user: alice.id, org: acme.id, level: 'admin' },
	{ user: alice.id, org: globex.id, level: 'viewer' },
	{ user: bob.id, org: acme.id, level: 'viewer' },
	{ user: carol.id, org: globex.id, level: 'admin' },
]);
console.log('seeded tenants');
