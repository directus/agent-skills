import { TARGET_URL, api, check, done } from './lib.mjs';

const target = (path) => api(path, { base: TARGET_URL });
const count = async (collection, base) => Number((await api(`/items/${collection}?aggregate[count]=*`, { base })).data?.[0]?.count);

const collections = ((await target('/collections?limit=-1')).data ?? []).map((c) => c.collection);
check(collections.includes('authors'), 'authors exists on the target');
const authorFields = ((await target('/fields/authors')).data ?? []).map((f) => f.field);
check(authorFields.includes('id') && authorFields.includes('name'), 'authors has its fields', JSON.stringify(authorFields));
const rel = ((await target('/relations/posts')).data ?? []).find((r) => r.field === 'author');
check(rel?.related_collection === 'authors', 'posts.author relates to authors on the target', JSON.stringify(rel ?? null));

check(!collections.includes('events'), 'the half-built events collection did not ship');
check(collections.includes('newsletter_signups') && (await count('newsletter_signups', TARGET_URL)) === 2, "production's newsletter_signups and its rows are intact");
check((await count('posts', TARGET_URL)) === 4, "production's posts are intact");
check((await count('authors', TARGET_URL)) === 0 || !collections.includes('authors'), 'no author items were copied');

const sourceCollections = ((await api('/collections?limit=-1')).data ?? []).map((c) => c.collection);
check(sourceCollections.includes('events') && !sourceCollections.includes('newsletter_signups'), 'the source is unchanged');

done();
