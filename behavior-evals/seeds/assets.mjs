// Adds `Approved` and `Drafts` folders with two files each (small PNGs), for the asset library case.
import { URL, api } from '../checks/lib.mjs';

const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN ?? 'skills-evals-admin-token';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const folders = (await api('/folders', { method: 'POST', body: [{ name: 'Approved' }, { name: 'Drafts' }] })).data;
if (!folders) throw new Error('could not create folders');

for (const [folder, names] of [
	[folders[0].id, ['approved-logo.png', 'approved-banner.png']],
	[folders[1].id, ['draft-logo.png', 'draft-banner.png']],
]) {
	for (const name of names) {
		const form = new FormData();
		form.append('folder', folder);
		form.append('title', name.replace('.png', ''));
		form.append('file', new Blob([png], { type: 'image/png' }), name);
		const res = await fetch(`${URL}/files`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form });
		if (!res.ok) throw new Error(`upload ${name}: ${res.status} ${await res.text()}`);
	}
}
console.log('seeded assets');
