import { api, check, done, fields } from './lib.mjs';

const f = Object.fromEntries((await fields('posts')).map((x) => [x.field, x.schema ?? {}]));
check(f.status?.is_indexed === true, '`status` is indexed', JSON.stringify(f.status));
check(f.author?.is_indexed === true, '`author` (the M2O, which gets no index by default) is indexed', JSON.stringify(f.author));
check(f.date_published?.is_indexed === true, '`date_published` is indexed', JSON.stringify(f.date_published));
check(f.slug?.is_unique === true || f.slug?.is_indexed === true, '`slug` is unique or indexed', JSON.stringify(f.slug));

const posts = (await api('/items/posts?limit=-1&fields=id,title,author,slug')).data ?? [];
check(posts.length === 4, 'all 4 posts still there', `${posts.length}`);
check(posts.every((p) => p.author && p.slug), 'authors and slugs intact', JSON.stringify(posts));

done();
