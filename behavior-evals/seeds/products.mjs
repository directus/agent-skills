// Seeds `products` with a JSON `specs` field: numbers above 9, nested objects, and one product without a rating.
import { api } from '../checks/lib.mjs';

const r = await api('/collections', {
	method: 'POST',
	body: {
		collection: 'products',
		meta: { icon: 'inventory_2' },
		schema: {},
		fields: [
			{ field: 'id', type: 'integer', meta: { hidden: true }, schema: { is_primary_key: true, has_auto_increment: true } },
			{ field: 'name', type: 'string', meta: { interface: 'input' }, schema: {} },
			{ field: 'price', type: 'float', meta: { interface: 'input' }, schema: {} },
			{ field: 'specs', type: 'json', meta: { interface: 'input-code', special: ['cast-json'], options: { language: 'JSON' } }, schema: {} },
		],
	},
});
if (r.status !== 200) throw new Error(JSON.stringify(r.errors));

const p = (name, price, color, rating, w, weight) => ({
	name,
	price,
	specs: { color, ...(rating === undefined ? {} : { rating }), dims: { w }, shipping: { weight_kg: weight } },
});
const created = await api('/items/products', {
	method: 'POST',
	body: [
		p('Lamp', 40, 'red', 9, 25, 2),
		p('Chair', 120, 'blue', 10, 50, 8),
		p('Mug', 12, 'red', 4, 8, 0.4),
		p('Desk', 300, 'black', 12, 140, 30),
		p('Rug', 80, 'blue', 7, 200, 4.5),
		p('Clock', 25, 'red', 8, 22, 1),
		p('Vase', 18, 'white', undefined, 15, 1.2),
		p('Shelf', 90, 'black', 3, 80, 12),
	],
});
if (created.status !== 200) throw new Error(JSON.stringify(created.errors));
console.log('seeded products');
