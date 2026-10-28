// An editorial project to edit, not design: post translations (German exists), tags (M2M), and an About page built
// from blocks (M2A). Run after posts.
import { api } from '../checks/lib.mjs';

const ok = async (label, res) => {
	const r = await res;
	if (r.status !== 200 && r.status !== 204) throw new Error(`${label}: ${r.status} ${JSON.stringify(r.errors)}`);
	return r.data;
};
const uuidPk = { field: 'id', type: 'uuid', meta: { special: ['uuid'], hidden: true }, schema: { is_primary_key: true } };
const string = (field) => ({ field, type: 'string', meta: { interface: 'input' }, schema: {} });
const collection = (name, fields, meta = {}) => ok(name, api('/collections', { method: 'POST', body: { collection: name, meta, schema: {}, fields } }));
const relation = (body) => ok(`relation ${body.collection}.${body.field}`, api('/relations', { method: 'POST', body }));
const alias = (collection, field, special, iface) =>
	ok(`alias ${field}`, api(`/fields/${collection}`, { method: 'POST', body: { field, type: 'alias', meta: { special: [special], interface: iface } } }));

// Translations
await collection('languages', [{ field: 'code', type: 'string', meta: { interface: 'input' }, schema: { is_primary_key: true } }, string('name')]);
await api('/items/languages', { method: 'POST', body: [{ code: 'en-US', name: 'English' }, { code: 'de-DE', name: 'German' }, { code: 'fr-FR', name: 'French' }] });
await collection('posts_translations', [uuidPk, { field: 'posts', type: 'uuid', schema: {} }, { field: 'languages_code', type: 'string', schema: {} }, string('title'), { field: 'content', type: 'text', meta: { interface: 'input-rich-text-html' }, schema: {} }], { hidden: true });
await alias('posts', 'translations', 'translations', 'translations');
await relation({ collection: 'posts_translations', field: 'posts', related_collection: 'posts', meta: { one_field: 'translations', junction_field: 'languages_code' }, schema: { on_delete: 'CASCADE' } });
await relation({ collection: 'posts_translations', field: 'languages_code', related_collection: 'languages', meta: { one_field: null, junction_field: 'posts' }, schema: { on_delete: 'CASCADE' } });

// Tags
await collection('tags', [uuidPk, string('name')]);
await collection('post_tags', [{ field: 'id', type: 'integer', schema: { is_primary_key: true, has_auto_increment: true } }, { field: 'post', type: 'uuid', schema: {} }, { field: 'tag', type: 'uuid', schema: {} }], { hidden: true });
await alias('posts', 'tags', 'm2m', 'list-m2m');
await relation({ collection: 'post_tags', field: 'post', related_collection: 'posts', meta: { one_field: 'tags', junction_field: 'tag' }, schema: { on_delete: 'CASCADE' } });
await relation({ collection: 'post_tags', field: 'tag', related_collection: 'tags', meta: { one_field: null, junction_field: 'post' }, schema: { on_delete: 'CASCADE' } });
const tags = await ok('tags', api('/items/tags', { method: 'POST', body: [{ name: 'Guides' }, { name: 'News' }, { name: 'Release' }] }));
const tagId = (name) => tags.find((t) => t.name === name).id;

const posts = (await api('/items/posts?limit=-1&fields=id,title,content')).data;
const post = (title) => posts.find((p) => p.title === title);
await ok('hello translations', api(`/items/posts/${post('Hello World').id}`, { method: 'PATCH', body: { translations: { create: [
	{ languages_code: 'en-US', title: 'Hello World', content: '<p>First</p>' },
	{ languages_code: 'de-DE', title: 'Hallo Wellt', content: '<p>Erster</p>' },
] } } }));
await ok('second tags', api(`/items/posts/${post('Second Post').id}`, { method: 'PATCH', body: { tags: { create: [{ tag: tagId('Guides') }, { tag: tagId('Release') }] } } }));

// Page builder
await collection('block_hero', [uuidPk, string('headline'), string('tagline')]);
await collection('block_richtext', [uuidPk, { field: 'body', type: 'text', meta: { interface: 'input-rich-text-html' }, schema: {} }]);
await collection('pages', [uuidPk, string('title'), string('permalink')]);
await collection('page_blocks', [uuidPk, { field: 'page', type: 'uuid', schema: {} }, string('item'), string('collection'), { field: 'sort', type: 'integer', schema: {} }], { hidden: true });
await alias('pages', 'blocks', 'm2a', 'list-m2a');
await relation({ collection: 'page_blocks', field: 'item', related_collection: null, meta: { one_allowed_collections: ['block_hero', 'block_richtext'], one_collection_field: 'collection', junction_field: 'page' } });
await relation({ collection: 'page_blocks', field: 'page', related_collection: 'pages', meta: { one_field: 'blocks', junction_field: 'item' }, schema: { on_delete: 'CASCADE' } });
await ok('about', api('/items/pages', { method: 'POST', body: { title: 'About', permalink: '/about', blocks: [
	{ collection: 'block_hero', item: { headline: 'About us', tagline: 'Who we are' }, sort: 1 },
	{ collection: 'block_richtext', item: { body: '<p>We build things.</p>' }, sort: 2 },
] } }));
console.log('seeded editorial');
