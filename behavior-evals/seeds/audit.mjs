// Adds an empty `audit_log` collection. Only admins can write it.
import { api } from '../checks/lib.mjs';

const r = await api('/collections', {
	method: 'POST',
	body: {
		collection: 'audit_log',
		meta: { icon: 'history' },
		schema: {},
		fields: [
			{ field: 'id', type: 'integer', meta: { hidden: true }, schema: { is_primary_key: true, has_auto_increment: true } },
			{ field: 'post', type: 'uuid', meta: { interface: 'input' }, schema: {} },
			{ field: 'action', type: 'string', meta: { interface: 'input' }, schema: {} },
			{ field: 'user', type: 'uuid', meta: { interface: 'input' }, schema: {} },
			{ field: 'date', type: 'timestamp', meta: { interface: 'datetime' }, schema: {} },
		],
	},
});
if (r.status !== 200) throw new Error(JSON.stringify(r.errors));
console.log('seeded audit_log');
