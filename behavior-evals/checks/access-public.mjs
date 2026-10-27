import { api, check, done } from './lib.mjs';

const anon = await api('/items/posts?fields=title,status&limit=-1', { token: null });
const titles = (anon.data ?? []).map((p) => p.title);
check(!titles.some((t) => /Secret Draft/.test(t)), 'drafts are NOT readable anonymously', titles.join(', '));
check(!(anon.data ?? []).some((p) => p.status && p.status !== 'published'), 'no non-published rows leak', JSON.stringify(anon.data));

const one = ((await api('/items/posts?filter[status][_eq]=draft')).data ?? [])[0];
const direct = await api(`/items/posts/${one.id}?fields=title`, { token: null });
check(direct.status !== 200, 'a draft is not readable by id anonymously', `status ${direct.status}`);

// Informational: on the unlicensed core tier a filtered public rule is dropped, so published posts may be unreadable.
console.log(`INFO anonymous list status ${anon.status}, ${titles.length} rows: ${titles.join(', ')}`);

done();
