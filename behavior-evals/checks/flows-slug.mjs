import { api, check, done } from './lib.mjs';

const flows = (await api('/flows?fields=id,status,trigger,options&limit=-1')).data ?? [];
check(flows.some((f) => f.status === 'active'), 'an active flow exists', `${flows.length} flows`);

const a = await api('/items/posts', { method: 'POST', body: { title: 'My New Post', status: 'draft', content: '<p>Body</p>' } });
check(a.status === 200, 'create post without slug succeeds', JSON.stringify(a.errors ?? ''));
await new Promise((r) => setTimeout(r, 1500));
if (a.data?.id) {
	const r = (await api(`/items/posts/${a.data.id}`)).data ?? {};
	check(r.slug === 'my-new-post', 'slug generated from title', r.slug);
	check(r.title === 'My New Post' && r.content === '<p>Body</p>' && r.status === 'draft', 'other fields kept', JSON.stringify(r));
}

const b = await api('/items/posts', { method: 'POST', body: { title: 'Custom', slug: 'my-custom-slug' } });
await new Promise((r) => setTimeout(r, 1500));
if (b.data?.id) {
	const r = (await api(`/items/posts/${b.data.id}`)).data ?? {};
	check(r.slug === 'my-custom-slug', 'explicit slug is not overwritten', r.slug);
}

const posts = (await api('/items/posts?filter[slug][_eq]=hello-world')).data ?? [];
const u = posts[0] ? await api(`/items/posts/${posts[0].id}`, { method: 'PATCH', body: { content: '<p>Edited</p>' } }) : { status: 0 };
check(u.status === 200, 'updating an existing post still works', JSON.stringify(u.errors ?? ''));

done();
