import { api, check, done } from './lib.mjs';

const EDITOR = 'editor-token';
const editor = (await api('/users/me?fields=id', { token: EDITOR })).data;

const field = (await api('/fields/posts/published_by')).data;
const rel = ((await api('/relations/posts')).data ?? []).find((r) => r.field === 'published_by');
check(!!field && rel?.related_collection === 'directus_users', 'posts.published_by relates to directus_users', JSON.stringify(rel ?? null));

const drafts = (await api('/items/posts', { method: 'POST', body: [{ title: 'Audit A', status: 'draft' }, { title: 'Audit B', status: 'draft' }] })).data ?? [];
const keys = drafts.map((d) => d.id);
await new Promise((r) => setTimeout(r, 2000));

const started = Date.now();
const pub = await api('/items/posts', { method: 'PATCH', token: EDITOR, body: { keys, data: { status: 'published' } } });
check(pub.status === 200, 'an editor publishes 2 posts in one request', `status ${pub.status} ${JSON.stringify(pub.errors ?? '')}`);
check(Date.now() - started < 10_000, 'the request finishes (no hook loop)', `${Date.now() - started}ms`);
await new Promise((r) => setTimeout(r, 1500));

const after = (await api(`/items/posts?filter[id][_in]=${keys.join(',')}&fields=id,status,date_published,published_by`)).data ?? [];
check(after.length === 2 && after.every((p) => p.date_published), 'both posts get date_published', JSON.stringify(after));
check(after.length === 2 && after.every((p) => p.published_by === editor?.id), 'both posts get published_by = the editor', JSON.stringify(after.map((p) => p.published_by)));

const rows = (await api(`/items/audit_log?filter[post][_in]=${keys.join(',')}&limit=-1`)).data ?? [];
check(rows.length === 2 && same(rows.map((r) => r.post), keys), 'one audit row per published post', JSON.stringify(rows));
check(rows.length > 0 && rows.every((r) => r.action === 'published' && r.user === editor?.id && r.date), 'audit rows have action, the editor, and a date', JSON.stringify(rows[0]));

const edit = await api(`/items/posts/${keys[0]}`, { method: 'PATCH', token: EDITOR, body: { title: 'Audit A (edited)' } });
await new Promise((r) => setTimeout(r, 1500));
const rows2 = (await api(`/items/audit_log?filter[post][_in]=${keys.join(',')}&limit=-1`)).data ?? [];
check(edit.status === 200 && rows2.length === 2, 'editing an already published post adds no audit row', `status ${edit.status}, ${rows2.length} rows`);

const forged = await api('/items/audit_log', { method: 'POST', token: EDITOR, body: { post: keys[0], action: 'published', user: editor?.id } });
check(forged.status === 403, 'editors still cannot write audit_log', `status ${forged.status}`);

done();

function same(a, b) {
	return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}
