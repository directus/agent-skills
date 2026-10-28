import { api, check, collectionNames, done, fields, requiredStub } from './lib.mjs';

const names = await collectionNames();
check(names.includes('pages'), 'pages collection exists', names.join(','));
const rels = (await api('/relations')).data ?? [];
const poly = rels.find((r) => r.meta?.one_allowed_collections?.length);
const junction = poly?.collection;
check(junction === 'page_blocks', 'M2A junction is `page_blocks`', junction, { recommended: true });
const toPage = rels.find((r) => r.collection === junction && r.related_collection === 'pages');
check(toPage?.field === 'page', 'junction FK to pages is `page`', toPage?.field);
check(toPage?.schema?.on_delete === 'CASCADE', 'page FK on_delete CASCADE', toPage?.schema?.on_delete, { recommended: true });
check(!!toPage?.meta?.sort_field, 'blocks are sortable', toPage?.meta?.sort_field);
const item = (await fields(junction ?? 'x')).find((f) => f.field === poly?.field);
check(item?.type === 'string', 'junction `item` is a string column', item?.type);
const allowed = poly?.meta?.one_allowed_collections ?? [];
check(allowed.length >= 3, 'three block types allowed', allowed.join(','));
for (const c of allowed) {
	const pk = (await fields(c)).find((f) => f.schema?.is_primary_key);
	check(pk?.type === 'uuid', `${c} primary key is uuid`, pk?.type, { recommended: true });
}

const pf = await fields('pages');
const url = pf.find((f) => ['permalink', 'slug', 'path', 'url'].includes(f.field));
check(!!url, 'pages have a URL field', pf.map((f) => f.field).join(','));
check(url?.schema?.is_unique === true, 'page URL is unique', JSON.stringify(url?.schema));

// Functional: create a page with one block of each allowed type through the M2A alias.
const alias = toPage?.meta?.one_field;
if (alias && allowed.length) {
	const blocks = await Promise.all(allowed.map(async (c, i) => ({ [poly.meta.one_collection_field]: c, [poly.field]: await requiredStub(c), ...(toPage.meta.sort_field ? { [toPage.meta.sort_field]: i + 1 } : {}) })));
	const p = await api('/items/pages', { method: 'POST', body: { ...(await requiredStub('pages')), [url?.field ?? 'title']: url?.field === 'permalink' ? '/check-page' : 'check-page', [alias]: blocks } });
	check(p.status === 200, 'create page with blocks', JSON.stringify(p.errors ?? ''));
	if (p.data?.id) {
		const r = await api(`/items/pages/${p.data.id}?fields=${alias}.${poly.meta.one_collection_field}`);
		check((r.data?.[alias] ?? []).length === allowed.length, 'blocks read back', JSON.stringify(r.data ?? r.errors));
	}
}

done();
