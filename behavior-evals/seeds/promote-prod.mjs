// The production side of a dev-to-prod promotion, after `posts` and `signups`: its own Ops role, a backup Flow, and
// production project settings.
import { api } from '../checks/lib.mjs';

async function post(path, body) {
	const r = await api(path, { method: 'POST', body });
	if (r.status !== 200 && r.status !== 204) throw new Error(`${path}: ${JSON.stringify(r.errors)}`);
	return r.data;
}

const policy = await post('/policies', { name: 'Ops', icon: 'engineering', app_access: true, admin_access: false });
await post('/permissions', { policy: policy.id, collection: 'newsletter_signups', action: 'read', fields: ['*'] });
const role = await post('/roles', { name: 'Ops', icon: 'engineering' });
await post('/access', { role: role.id, policy: policy.id });
const flow = await post('/flows', {
	name: 'Nightly backup ping',
	icon: 'backup',
	status: 'active',
	trigger: 'schedule',
	accountability: 'all',
	options: { cron: '0 3 * * *' },
});
const op = await post('/operations', { flow: flow.id, key: 'ping', type: 'log', position_x: 19, position_y: 1, options: { message: 'backup' } });
await api(`/flows/${flow.id}`, { method: 'PATCH', body: { operation: op.id } });
await api('/settings', { method: 'PATCH', body: { project_name: 'Blog', project_color: '#2ECDA7', project_url: 'https://blog.example.com' } });
console.log('seeded promote-prod');
