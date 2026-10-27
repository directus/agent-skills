import { api, check, collectionNames, done, fields, requiredStub } from './lib.mjs';

const names = await collectionNames();
for (const c of ['posts', 'tags', 'authors']) check(names.includes(c), `collection ${c} exists`, names.join(','));

for (const c of ['posts', 'tags', 'authors']) {
	const pk = (await fields(c)).find((f) => f.schema?.is_primary_key);
	check(pk?.type === 'uuid', `${c} primary key is uuid`, pk?.type);
}

const rels = (await api('/relations')).data ?? [];
const author = rels.find((r) => r.collection === 'posts' && r.related_collection === 'authors');
check(author?.field === 'author', 'posts → authors FK is named `author`', author?.field);
check(author?.schema?.on_delete === 'SET NULL', 'author FK on_delete SET NULL', author?.schema?.on_delete);

const toTags = rels.find((r) => r.related_collection === 'tags' && r.meta?.junction_field);
const junction = toTags?.collection;
check(junction === 'post_tags', 'M2M junction is named `post_tags`', junction);
const toPosts = rels.find((r) => r.collection === junction && r.related_collection === 'posts');
check(toPosts?.field === 'post' && toTags?.field === 'tag', 'junction FKs are `post` and `tag`', `${toPosts?.field}, ${toTags?.field}`);
check(
	toPosts?.schema?.on_delete === 'CASCADE' && toTags?.schema?.on_delete === 'CASCADE',
	'junction FKs on_delete CASCADE',
	`${toPosts?.schema?.on_delete}, ${toTags?.schema?.on_delete}`,
);

// It has to work, not just look right: write nested data through the M2M and read it back.
const alias = toPosts?.meta?.one_field;
const a = await api('/items/authors', { method: 'POST', body: await requiredStub('authors') });
const t = await api('/items/tags', { method: 'POST', body: await requiredStub('tags') });
const titleField = (await fields('posts')).some((f) => f.field === 'title') ? 'title' : null;
const body = { ...(await requiredStub('posts')), ...(titleField ? { title: 'Check post' } : {}), author: a.data?.id };
if (alias && toTags?.field) body[alias] = [{ [toTags.field]: t.data?.id }];
const p = await api('/items/posts', { method: 'POST', body });
check(p.status === 200, 'create post with author and tag', JSON.stringify(p.errors ?? ''));
if (p.data?.id && alias) {
	const r = await api(`/items/posts/${p.data.id}?fields=${alias}.${toTags.field}.id`);
	check(r.data?.[alias]?.[0]?.[toTags.field]?.id === t.data?.id, 'tag reads back through the M2M', JSON.stringify(r.data ?? r.errors));
}

done();
