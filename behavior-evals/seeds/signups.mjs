// Seeds a `newsletter_signups` collection with live data, for the sync target.
import { api } from '../checks/lib.mjs';

const r = await api('/collections', {
	method: 'POST',
	body: {
		collection: 'newsletter_signups',
		meta: { icon: 'mail' },
		schema: {},
		fields: [
			{ field: 'id', type: 'integer', meta: { hidden: true }, schema: { is_primary_key: true, has_auto_increment: true } },
			{ field: 'email', type: 'string', meta: { interface: 'input' }, schema: {} },
		],
	},
});
if (r.status !== 200) throw new Error(JSON.stringify(r.errors));
const created = await api('/items/newsletter_signups', { method: 'POST', body: [{ email: 'a@example.com' }, { email: 'b@example.com' }] });
if (created.status !== 200) throw new Error(JSON.stringify(created.errors));
console.log('seeded newsletter_signups');
