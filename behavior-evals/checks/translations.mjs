import { api, check, collectionNames, done, fields } from './lib.mjs';

const names = await collectionNames();
check(names.includes('languages'), 'languages collection exists', names.join(','));
const pk = (await fields('languages')).find((f) => f.schema?.is_primary_key);
check(pk?.field === 'code' && pk?.type === 'string', 'languages keyed by string `code`', `${pk?.field} ${pk?.type}`, { recommended: true });
const codes = ((await api('/items/languages?limit=-1')).data ?? []).map((l) => l.code);
check(codes.some((c) => /^en/.test(c)) && codes.some((c) => /^de/.test(c)), 'English and German exist', codes.join(','));

const rels = (await api('/relations')).data ?? [];
const toLang = rels.find((r) => r.related_collection === 'languages' && r.meta?.junction_field);
const junction = toLang?.collection;
check(junction === 'posts_translations', 'junction is `posts_translations`', junction, { recommended: true });
const toPosts = rels.find((r) => r.collection === junction && r.related_collection === 'posts');
check(toPosts?.field === 'posts' && toLang?.field === 'languages_code', 'FKs are `posts` and `languages_code`', `${toPosts?.field}, ${toLang?.field}`, { recommended: true });
check(toPosts?.schema?.on_delete === 'CASCADE' && toLang?.schema?.on_delete === 'CASCADE', 'both FKs CASCADE',
	`${toPosts?.schema?.on_delete}, ${toLang?.schema?.on_delete}`, { recommended: true });
const jf = (await fields(junction ?? 'x')).map((f) => f.field);
check(jf.includes('title') && jf.includes('content'), 'title and content live on the translations collection', jf.join(','));

const alias = toPosts?.meta?.one_field;
const existing = alias
	? ((await api(`/items/posts?limit=-1&fields=id,${alias}.title,${alias}.${toLang?.field}`)).data ?? [])
	: [];
const migrated = existing.filter((p) =>
	(p[alias] ?? []).some((t) => /^en/.test(t?.[toLang.field] ?? '') && t?.title),
);
// Either pattern from the skill keeps existing content: English moved into translation rows, or English stays on the
// parent (the default-language-on-parent pattern) with its original values.
const parents = (await api('/items/posts?limit=-1&fields=title,content')).data ?? [];
const onParent = parents.length === 4 && parents.every((p) => p.title && p.content);
check(
	(existing.length > 0 && migrated.length === existing.length) || onParent,
	'existing posts keep their content (as English translations, or as the default language on the parent)',
	`${migrated.length}/${existing.length} migrated, parent content kept: ${onParent}`,
);

const post = existing[0];
const de = codes.find((c) => /^de/.test(c));
if (post && alias && de) {
	const w = await api(`/items/posts/${post.id}`, { method: 'PATCH', body: { [alias]: { create: [{ [toLang.field]: de, title: 'Hallo Welt' }] } } });
	check(w.status === 200, 'nested translation write works', JSON.stringify(w.errors ?? ''));
	const r = await api(`/items/posts/${post.id}?fields=${alias}.title,${alias}.${toLang.field}`);
	check(JSON.stringify(r.data).includes('Hallo Welt'), 'translation reads back', JSON.stringify(r.data ?? r.errors));
}

done();
