// Adds a non-admin "Editor" (read + update posts, nothing else) with a static token, and a "Reader" (read posts)
// who logs in with a password. Public stays without access. Run after posts.
import { api } from '../checks/lib.mjs';

async function user(name, permissions, extra) {
	const policy = (await api('/policies', { method: 'POST', body: { name, app_access: true, admin_access: false } })).data;
	for (const p of permissions) await api('/permissions', { method: 'POST', body: { policy: policy.id, fields: ['*'], ...p } });
	const role = (await api('/roles', { method: 'POST', body: { name } })).data;
	await api('/access', { method: 'POST', body: { role: role.id, policy: policy.id } });
	const u = await api('/users', { method: 'POST', body: { role: role.id, ...extra } });
	if (u.status !== 200) throw new Error(JSON.stringify(u.errors));
}

await user('Editor', [{ collection: 'posts', action: 'read' }, { collection: 'posts', action: 'update' }], {
	email: 'editor@example.com',
	password: 'editor-password-123',
	token: 'editor-token',
});
await user('Reader', [{ collection: 'posts', action: 'read' }], { email: 'reader@example.com', password: 'reader-password-123' });
console.log('seeded users');
