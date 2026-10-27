import { api, check, done } from './lib.mjs';

const flows = (await api('/flows?fields=id,status,trigger,options,operations.type,operations.options&limit=-1')).data ?? [];
const manual = flows.find((f) => f.trigger === 'manual' && f.status === 'active' && JSON.stringify(f.options?.collections ?? []).includes('newsletters'));
check(!!manual, 'an active manual flow on newsletters exists', JSON.stringify(flows.map((f) => [f.trigger, f.status])));
const child = flows.find((f) => f.trigger === 'operation' && f.status === 'active');
check(!!child, 'an active sub-flow (operation trigger) exists');
const call = manual?.operations?.find((o) => o.type === 'trigger');
check(!!call && call.options?.flow === child?.id, 'the manual flow calls the sub-flow with a trigger operation');

const issue = ((await api('/items/newsletters?filter[title][_eq]=October issue')).data ?? [])[0];
// Agents often test their flow; start from an empty deliveries table so only our trigger counts.
const leftovers = ((await api('/items/deliveries?limit=-1&fields=id')).data ?? []).map((d) => d.id);
if (leftovers.length) await api('/items/deliveries', { method: 'DELETE', body: leftovers });
const activeIds = new Set(((await api('/items/subscribers?filter[active][_eq]=true&limit=-1&fields=id')).data ?? []).map((s) => s.id));
if (manual) {
	const r = await api(`/flows/trigger/${manual.id}`, { method: 'POST', body: { collection: 'newsletters', keys: [issue.id] } });
	check(r.status === 200, 'triggering the flow succeeds', `status ${r.status} ${JSON.stringify(r.errors ?? '')}`);
}

// Children may run after the response (async flows); wait until the count settles.
let count = -1;
for (let i = 0; i < 30; i++) {
	await new Promise((r) => setTimeout(r, 2000));
	const n = (await api('/items/deliveries?aggregate[count]=*')).data?.[0]?.count ?? 0;
	if (n === count) break;
	count = n;
}
const rows = (await api('/items/deliveries?limit=-1&fields=status,newsletter,subscriber')).data ?? [];
check(rows.length === 150, 'one delivery per active subscriber (150, past the default 100 query limit)', `${rows.length}`);
check(rows.every((r) => r.status === 'queued'), 'every delivery is queued');
check(rows.every((r) => activeIds.has(r.subscriber)), 'no inactive subscribers');
check(new Set(rows.map((r) => r.subscriber)).size === rows.length, 'no duplicate subscribers');
check(rows.every((r) => r.newsletter === issue.id), 'every delivery points at the triggered newsletter');

done();
