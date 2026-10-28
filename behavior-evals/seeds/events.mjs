// Adds a half-built `events` collection on the dev (source) instance: work that isn't ready to ship.
import { api } from '../checks/lib.mjs';

const r = await api('/collections', {
	method: 'POST',
	body: {
		collection: 'events',
		meta: { icon: 'event', note: 'WIP: not ready for production' },
		schema: {},
		fields: [
			{ field: 'id', type: 'uuid', meta: { special: ['uuid'], hidden: true }, schema: { is_primary_key: true } },
			{ field: 'name', type: 'string', meta: { interface: 'input' }, schema: {} },
			{ field: 'starts_at', type: 'timestamp', meta: { interface: 'datetime' }, schema: {} },
		],
	},
});
if (r.status !== 200) throw new Error(JSON.stringify(r.errors));
await api('/fields/events', { method: 'POST', body: { field: 'venue', type: 'string', meta: { interface: 'input' }, schema: {} } });
console.log('seeded events');
