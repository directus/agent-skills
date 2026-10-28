// Seeds an `orders` collection for an internal order desk: totals on both sides of $500, spread over 30 days.
import { api } from '../checks/lib.mjs';

const r = await api('/collections', {
	method: 'POST',
	body: {
		collection: 'orders',
		meta: { icon: 'receipt_long' },
		schema: {},
		fields: [
			{ field: 'id', type: 'integer', meta: { hidden: true }, schema: { is_primary_key: true, has_auto_increment: true } },
			{ field: 'customer', type: 'string', meta: { interface: 'input' }, schema: {} },
			{ field: 'total', type: 'decimal', meta: { interface: 'input' }, schema: { numeric_precision: 10, numeric_scale: 2 } },
			{
				field: 'status',
				type: 'string',
				meta: {
					interface: 'select-dropdown',
					options: { choices: ['new', 'approved', 'fulfilled', 'cancelled'].map((v) => ({ text: v, value: v })) },
				},
				schema: { default_value: 'new' },
			},
			{ field: 'ordered_at', type: 'timestamp', meta: { interface: 'datetime' }, schema: {} },
		],
	},
});
if (r.status !== 200) throw new Error(JSON.stringify(r.errors));

const day = 86_400_000;
const totals = [120, 640, 75, 980, 300, 45, 1500, 260, 510, 89, 720, 33];
const statuses = ['fulfilled', 'new', 'fulfilled', 'approved', 'new', 'fulfilled', 'new', 'fulfilled', 'fulfilled', 'new', 'cancelled', 'new'];
const items = totals.map((total, i) => ({
	customer: `Customer ${i + 1}`,
	total,
	status: statuses[i],
	ordered_at: new Date(Date.now() - (i * 2 + 1) * day).toISOString(),
}));
const created = await api('/items/orders', { method: 'POST', body: items });
if (created.status !== 200) throw new Error(JSON.stringify(created.errors));
console.log('seeded orders');
