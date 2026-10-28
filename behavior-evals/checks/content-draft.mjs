import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORK_DIR, api, check, done } from './lib.mjs';

// Judge what a reader sees: the page's hero live, and the page's hero in each of its versions.
const about = (await api('/items/pages?filter[permalink][_eq]=/about&fields=id')).data?.[0];
const heroOf = async (query = '') =>
	((await api(`/items/pages/${about?.id}?fields=blocks.collection,blocks.item:block_hero.headline${query}`)).data?.blocks ?? [])
		.map((b) => b.item?.headline)
		.find(Boolean);
const live = await heroOf();
check(live === 'About us', 'the live page is unchanged', live);

const versions = (await api(`/versions?filter[item][_eq]=${about?.id}&fields=id,key&limit=-1`)).data ?? [];
let staged;
for (const v of versions) if ((await heroOf(`&version=${encodeURIComponent(v.key)}`)) === 'Built for teams') staged = v;
const summary = existsSync(join(WORK_DIR, 'AGENT_SUMMARY.md')) ? readFileSync(join(WORK_DIR, 'AGENT_SUMMARY.md'), 'utf8') : '';
const explained = /version|draft|review|studio|can'?t|cannot|not able/i.test(summary);

if (process.env.CHECK_MODE === 'mcp') {
	// MCP has no versions tool: staging the change means a version saved some other way, or saying it can't be done here.
	check(!!staged || explained, 'the change is staged in a version, or the agent explains why it can only be done in the Studio', summary.slice(0, 300));
} else {
	check(!!staged, 'reading the About page in a content version shows the new headline', JSON.stringify(versions.map((v) => v.key)));
}

done();
