// Adds an `authors` collection and assigns the seeded posts to two authors. Run after posts.
import { api } from '../checks/lib.mjs';

const r = await api('/collections', {
	method: 'POST',
	body: {
		collection: 'authors',
		meta: { display_template: '{{name}}' },
		schema: {},
		fields: [
			{ field: 'id', type: 'uuid', meta: { special: ['uuid'], hidden: true }, schema: { is_primary_key: true } },
			{ field: 'name', type: 'string', meta: { interface: 'input' }, schema: {} },
		],
	},
});
if (r.status !== 200) throw new Error(JSON.stringify(r.errors));
await api('/fields/posts', { method: 'POST', body: { field: 'author', type: 'uuid', meta: { special: ['m2o'], interface: 'select-dropdown-m2o' }, schema: {} } });
await api('/relations', { method: 'POST', body: { collection: 'posts', field: 'author', related_collection: 'authors', schema: { on_delete: 'SET NULL' } } });
const authors = (await api('/items/authors', { method: 'POST', body: [{ name: 'Ada' }, { name: 'Grace' }] })).data;
const posts = (await api('/items/posts?sort=title&limit=-1')).data;
for (const [i, p] of posts.entries()) await api(`/items/posts/${p.id}`, { method: 'PATCH', body: { author: authors[i % 2].id } });
console.log('seeded authors');
