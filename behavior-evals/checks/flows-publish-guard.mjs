import { api, check, done } from './lib.mjs';

const wait = () => new Promise((r) => setTimeout(r, 800));
const get = async (id) => (await api(`/items/posts/${id}`)).data ?? {};

const d = await api('/items/posts', { method: 'POST', body: { title: 'Empty draft', status: 'draft', content: null } });
check(d.status === 200, 'creating an empty draft works', JSON.stringify(d.errors ?? ''));
const id = d.data?.id;
await wait();

const t = await api(`/items/posts/${id}`, { method: 'PATCH', body: { title: 'Empty draft (renamed)' } });
check(t.status === 200, 'renaming an empty draft works', JSON.stringify(t.errors ?? ''));

const p = await api(`/items/posts/${id}`, { method: 'PATCH', body: { status: 'published' } });
check(p.status >= 400 && p.status < 500, 'publishing an empty post is rejected', `status ${p.status}`);
check(!!p.errors?.[0]?.message, 'the rejection has a message', JSON.stringify(p.errors));
check((await get(id)).status === 'draft', 'the empty post stays a draft', (await get(id)).status);

const c = await api('/items/posts', { method: 'POST', body: { title: 'Born published', status: 'published', content: '' } });
check(c.status >= 400 && c.status < 500, 'creating an empty post as published is rejected', `status ${c.status}`);

const both = await api(`/items/posts/${id}`, { method: 'PATCH', body: { status: 'published', content: '<p>Now it has content</p>' } });
check(both.status === 200, 'publishing while adding content in the same save works', JSON.stringify(both.errors ?? ''));

const ready = await api('/items/posts', { method: 'POST', body: { title: 'Ready draft', status: 'draft', content: '<p>Done</p>' } });
const pub = await api(`/items/posts/${ready.data?.id}`, { method: 'PATCH', body: { status: 'published' } });
check(pub.status === 200, 'publishing a draft that already has content works (status-only save)', JSON.stringify(pub.errors ?? ''));

const e = await api(`/items/posts/${ready.data?.id}`, { method: 'PATCH', body: { title: 'Ready (edited)' } });
check(e.status === 200, 'editing a published post works', JSON.stringify(e.errors ?? ''));

done();
