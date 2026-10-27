import { api, check, done } from './lib.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const count = async () => (await api('/notifications?aggregate[count]=*')).data?.[0]?.count ?? 0;
const draft = ((await api('/items/posts?filter[status][_eq]=draft')).data ?? [])[0];
const published = ((await api('/items/posts?filter[status][_eq]=published')).data ?? [])[0];

const before = await count();
const t = await api(`/items/posts/${draft.id}`, { method: 'PATCH', body: { title: 'Secret Draft (edited)' } });
check(t.status === 200, 'title-only edit of a draft is not blocked', JSON.stringify(t.errors ?? ''));
await wait(2000);
check((await count()) === before, 'no notification for a title-only edit');

const p = await api(`/items/posts/${draft.id}`, { method: 'PATCH', body: { status: 'published' } });
check(p.status === 200, 'publishing succeeds', JSON.stringify(p.errors ?? ''));
await wait(2500);
const after = await count();
check(after > before, 'publishing creates a notification', `${before} → ${after}`);
const latest = ((await api('/notifications?sort=-id&limit=1&fields=subject,message,recipient.email')).data ?? [])[0];
check(JSON.stringify(latest ?? {}).includes('Secret Draft'), 'notification mentions the post title', JSON.stringify(latest));
check(latest?.recipient?.email === 'admin@example.com', 'notification goes to the admin', latest?.recipient?.email);

const before2 = await count();
const e = await api(`/items/posts/${published.id}`, { method: 'PATCH', body: { content: '<p>typo fix</p>' } });
await wait(2000);
check(e.status === 200, 'editing a published post is not blocked', JSON.stringify(e.errors ?? ''));
check((await count()) === before2, 'no notification when an already published post is edited');

done();
