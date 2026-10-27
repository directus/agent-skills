import { api, check, done } from './lib.mjs';

const flows = (await api('/flows?fields=id,status,trigger,options&limit=-1')).data ?? [];
const manual = flows.find((f) => f.trigger === 'manual' && f.status === 'active' && JSON.stringify(f.options?.collections ?? []).includes('posts'));
check(!!manual, 'an active manual flow on posts exists', JSON.stringify(flows.map((f) => [f.trigger, f.status])));

const published = (await api('/items/posts?filter[status][_eq]=published&sort=title&limit=2')).data ?? [];
const before = (await api('/items/posts?aggregate[count]=*')).data?.[0]?.count ?? 0;
if (manual) {
	const r = await api(`/flows/trigger/${manual.id}`, { method: 'POST', body: { collection: 'posts', keys: published.map((p) => p.id) } });
	check(r.status === 200, 'triggering the flow with two posts succeeds', `status ${r.status} ${JSON.stringify(r.errors ?? '')}`);
	await new Promise((res) => setTimeout(res, 3000));
}
const after = (await api('/items/posts?limit=-1&fields=title,status,slug')).data ?? [];
check(after.length === before + 2, 'exactly two copies created', `${before} → ${after.length}`);
for (const p of published) {
	const copy = after.find((a) => a.title === `${p.title} (copy)`);
	check(!!copy, `copy of "${p.title}" exists`, after.map((a) => a.title).join(' | '));
	check(copy?.status === 'draft', `copy of "${p.title}" is a draft`, copy?.status);
}

done();
