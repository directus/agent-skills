import { TARGET_URL, api, check, done } from './lib.mjs';

const target = (path, opts = {}) => api(path, { ...opts, base: TARGET_URL });
const count = async (collection, base) =>
	Number((await api(`/items/${collection}?aggregate[count]=*`, { base })).data?.[0]?.count);

// Schema
const collections = ((await target('/collections?limit=-1')).data ?? []).map((c) => c.collection);
check(collections.includes('categories'), 'categories exists on production');
const rel = ((await target('/relations/posts')).data ?? []).find((r) => r.field === 'category');
check(rel?.related_collection === 'categories', 'posts.category relates to categories', JSON.stringify(rel ?? null));

// The lookup rows posts will point at, with dev's ids so references match.
const devCats = (await api('/items/categories?fields=id,name,slug&sort=id')).data ?? [];
const prodCats = (await target('/items/categories?fields=id,name,slug&sort=id&limit=-1')).data ?? [];
check(
	devCats.length === 3 && JSON.stringify(prodCats) === JSON.stringify(devCats),
	'production has the same categories as dev, with the same ids',
	JSON.stringify(prodCats),
);

// Editor role works: a user in it can write posts with a category and read categories, and can't delete.
const roles = (await target('/roles?fields=id,name&limit=-1')).data ?? [];
const editor = roles.find((r) => r.name === 'Editor');
check(!!editor, 'the Editor role exists on production', roles.map((r) => r.name).join(', '));
if (editor) {
	const u = await target('/users', {
		method: 'POST',
		body: {
			email: 'check-editor@example.com',
			password: 'Check-password-123!',
			role: editor.id,
			token: 'check-editor-token',
		},
	});
	const as = (path, opts = {}) => api(path, { ...opts, base: TARGET_URL, token: 'check-editor-token' });
	if (check(u.status === 200, 'a user can be added to Editor', JSON.stringify(u.errors ?? ''))) {
		const created = await as('/items/posts', {
			method: 'POST',
			body: { title: 'Editor check', status: 'draft', category: devCats[1]?.id },
		});
		check(
			created.status === 200 || created.status === 204,
			'an Editor creates a post with a category',
			`status ${created.status} ${JSON.stringify(created.errors ?? '')}`,
		);
		check((await as('/items/categories')).status === 200, 'an Editor reads categories');
		const id = created.data?.id ?? (await target('/items/posts?filter[title][_eq]=Editor check')).data?.[0]?.id;
		check((await as(`/items/posts/${id}`, { method: 'DELETE' })).status === 403, 'an Editor cannot delete posts');
		if (id) await target(`/items/posts/${id}`, { method: 'DELETE' });
	}
	await target('/users?filter[email][_eq]=check-editor@example.com').then(
		(r) => r.data?.[0] && target(`/users/${r.data[0].id}`, { method: 'DELETE' }),
	);
}

// The flow, complete and active.
const flows =
	(await target('/flows?fields=name,status,trigger,options,operations.key,operations.type&limit=-1')).data ?? [];
const notify = flows.find((f) => f.name === 'Notify on publish');
check(
	notify?.status === 'active' && notify.trigger === 'event' && notify.options?.scope?.includes('items.update'),
	'"Notify on publish" is on production, active, on post updates',
	JSON.stringify(notify ? { status: notify.status, trigger: notify.trigger, options: notify.options } : null),
);
check(
	JSON.stringify((notify?.operations ?? []).map((o) => o.type).sort()) === JSON.stringify(['condition', 'log']),
	'"Notify on publish" has its condition and log operations',
	JSON.stringify(notify?.operations ?? null),
);

// Production's own things.
const settings = (await target('/settings?fields=project_name,project_color,project_url')).data ?? {};
check(
	settings.project_name === 'Blog' &&
		settings.project_color === '#2ECDA7' &&
		settings.project_url === 'https://blog.example.com',
	"production's project settings are unchanged",
	JSON.stringify(settings),
);
check(
	roles.some((r) => r.name === 'Ops'),
	'the Ops role is still there',
);
check(
	flows.some((f) => f.name === 'Nightly backup ping' && f.status === 'active'),
	'the backup flow is still there and active',
);
check(
	collections.includes('newsletter_signups') && (await count('newsletter_signups', TARGET_URL)) === 2,
	'newsletter signups are intact',
);
const prodPosts = (await target('/items/posts?fields=title&limit=-1')).data ?? [];
const devPosts = (await api('/items/posts?fields=title&limit=-1')).data ?? [];
check(prodPosts.length === 4, "production's posts are intact and no posts were copied", `${prodPosts.length} posts`);

// The source is unchanged.
const devSettings = (await api('/settings?fields=project_name')).data ?? {};
check(
	devSettings.project_name === 'Blog DEV' && devPosts.length === 4 && (await count('categories')) === 3,
	'dev is unchanged',
);

done();
