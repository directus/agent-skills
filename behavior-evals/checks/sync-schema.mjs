import { TARGET_URL, api, check, done } from './lib.mjs';

const target = (path) => api(path, { base: TARGET_URL });

const collections = ((await target('/collections?limit=-1')).data ?? []).map((c) => c.collection);
check(collections.includes('posts') && collections.includes('authors'), 'posts and authors exist on the target', JSON.stringify(collections.filter((c) => !c.startsWith('directus_'))));

const postFields = ((await target('/fields/posts')).data ?? []).map((f) => f.field);
const missing = ['id', 'status', 'title', 'slug', 'content', 'date_published', 'author'].filter((f) => !postFields.includes(f));
check(!missing.length, 'every posts field exists on the target', `missing ${missing.join(', ')}`);

const rel = ((await target('/relations/posts')).data ?? []).find((r) => r.field === 'author');
check(rel?.related_collection === 'authors', 'posts.author relates to authors on the target', JSON.stringify(rel ?? null));

const signups = await target('/items/newsletter_signups?limit=-1');
check(collections.includes('newsletter_signups'), 'newsletter_signups still exists on the target');
check(signups.data?.length === 2, 'its 2 signups are still there', `status ${signups.status}, ${signups.data?.length} rows`);

const targetPosts = (await target('/items/posts?aggregate[count]=*')).data?.[0]?.count;
const targetAuthors = (await target('/items/authors?aggregate[count]=*')).data?.[0]?.count;
check(Number(targetPosts) === 0 && Number(targetAuthors) === 0, 'no content items were copied', `posts ${targetPosts}, authors ${targetAuthors}`);

const sourceCollections = ((await api('/collections?limit=-1')).data ?? []).map((c) => c.collection);
const sourcePosts = (await api('/items/posts?aggregate[count]=*')).data?.[0]?.count;
check(Number(sourcePosts) === 4 && !sourceCollections.includes('newsletter_signups'), 'the source is unchanged', `posts ${sourcePosts}`);

done();
