import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { URL, WORK_DIR, api, check, done, rangeIncludes } from './lib.mjs';

const extDir = join(WORK_DIR, 'extensions');
const packages = readdirSync(extDir, { withFileTypes: true })
	.filter((d) => d.isDirectory() && existsSync(join(extDir, d.name, 'package.json')))
	.map((d) => ({ dir: join(extDir, d.name), pkg: JSON.parse(readFileSync(join(extDir, d.name, 'package.json'), 'utf8')) }))
	.filter((p) => p.pkg['directus:extension']);
const ext = packages[0];
if (!check(!!ext, 'an extension package exists in ./extensions')) done();

const host = ext.pkg['directus:extension'].host ?? '';
check(rangeIncludes(host, '12.6.0'), 'the host range includes 12.6.0', host);

const words = Array.from({ length: 450 }, (_, i) => `word${i}`).join(' ');
const create = (status) => api('/items/posts', { method: 'POST', body: { title: `Long ${status}`, status, content: `<p>${words}</p><h2>end</h2>` } });
const pub = (await create('published')).data;
const draft = (await create('draft')).data;

// Give auto reload a moment after the agent's last build.
await new Promise((r) => setTimeout(r, 3000));

const admin = await api(`/reading-time/${pub.id}`);
check(admin.status === 200, 'admin gets 200', `status ${admin.status} ${JSON.stringify(admin.errors ?? '')}`);
const body = await fetch(`${URL}/reading-time/${pub.id}`, {
	headers: { Authorization: `Bearer ${process.env.DIRECTUS_ADMIN_TOKEN ?? 'skills-evals-admin-token'}` },
	signal: AbortSignal.timeout(15_000),
})
	.then((r) => r.json())
	.catch(() => null);
check(body?.minutes === 3 || body?.data?.minutes === 3, 'minutes is 3 for 451 words', JSON.stringify(body));

const anon = await api(`/reading-time/${pub.id}`, { token: null });
check(anon.status >= 400 && anon.status < 500, 'Public (no read on posts) is refused with a 4xx', `status ${anon.status}`);

// Custom item rules need a license on 12.x, so test with two plain users: one can read posts, one can't.
async function userWith(name, permissions) {
	const policy = (await api('/policies', { method: 'POST', body: { name, app_access: false, admin_access: false } })).data;
	for (const p of permissions) await api('/permissions', { method: 'POST', body: { policy: policy.id, ...p } });
	const role = (await api('/roles', { method: 'POST', body: { name } })).data;
	await api('/access', { method: 'POST', body: { role: role.id, policy: policy.id } });
	const token = `${name.toLowerCase()}-token`;
	await api('/users', { method: 'POST', body: { email: `${name.toLowerCase()}@example.com`, password: 'check-password-123', role: role.id, token } });
	return token;
}
const reader = await userWith('Reader', [{ collection: 'posts', action: 'read', fields: ['*'] }]);
const outsider = await userWith('Outsider', []);

const readerDraft = await api(`/reading-time/${draft.id}`, { token: reader });
check(readerDraft.status === 200, 'a user who can read posts gets a draft', `status ${readerDraft.status}`);
const outsiderPub = await api(`/reading-time/${pub.id}`, { token: outsider });
check(outsiderPub.status >= 400 && outsiderPub.status < 500, "a user who can't read posts is refused (4xx)", `status ${outsiderPub.status}`);

const missing = await api('/reading-time/00000000-0000-0000-0000-000000000000');
check(missing.status >= 400 && missing.status < 500, 'a missing post gives a 4xx, not a 500 or a hang', `status ${missing.status}`);

done();
