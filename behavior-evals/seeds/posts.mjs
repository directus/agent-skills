// Seeds a `posts` collection with a few published and draft items.
import { api } from '../checks/lib.mjs';

const field = (field, type, meta = {}, schema = {}) => ({ field, type, meta, schema });

const res = await api('/collections', {
	method: 'POST',
	body: {
		collection: 'posts',
		meta: { icon: 'article' },
		schema: {},
		fields: [
			{ field: 'id', type: 'uuid', meta: { special: ['uuid'], hidden: true }, schema: { is_primary_key: true } },
			field('status', 'string', { interface: 'select-dropdown', options: { choices: [{ text: 'Draft', value: 'draft' }, { text: 'Published', value: 'published' }] } }, { default_value: 'draft' }),
			field('title', 'string', { interface: 'input' }),
			field('slug', 'string', { interface: 'input' }),
			field('content', 'text', { interface: 'input-rich-text-html' }),
			field('date_published', 'timestamp', { interface: 'datetime' }),
		],
	},
});
if (res.status !== 200) throw new Error(JSON.stringify(res.errors));

const now = Date.now();
const day = 86_400_000;
const items = [
	{ status: 'published', title: 'Hello World', slug: 'hello-world', content: '<p>First</p>', date_published: new Date(now - 20 * day).toISOString() },
	{ status: 'published', title: 'Second Post', slug: 'second-post', content: '<p>Second</p>', date_published: new Date(now - 9 * day).toISOString() },
	{ status: 'published', title: 'Third Post', slug: 'third-post', content: '<p>Third</p>', date_published: new Date(now - 2 * day).toISOString() },
	{ status: 'draft', title: 'Secret Draft', slug: 'secret-draft', content: '<p>Not yet</p>', date_published: null },
];
const created = await api('/items/posts', { method: 'POST', body: items });
if (created.status !== 200) throw new Error(JSON.stringify(created.errors));
console.log('seeded posts');
