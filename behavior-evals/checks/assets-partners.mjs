import { URL, api, check, done, userWithToken } from './lib.mjs';

const roles = (await api('/roles?fields=id,name,policies.policy.app_access,policies.policy.admin_access&limit=-1')).data ?? [];
const role = (re) => roles.find((r) => re.test(r.name));
const studio = (r) => {
	const p = (r?.policies ?? []).map((x) => x.policy).filter(Boolean);
	return p.some((x) => x.app_access) && !p.some((x) => x.admin_access);
};
const partner = role(/partner/i);
const marketing = role(/marketing/i);
check(studio(partner) && studio(marketing), 'Partner and Marketing roles with Studio access, no admin');
if (!partner || !marketing) done();
await userWithToken(partner.id, 'partner-check-token');
await userWithToken(marketing.id, 'marketing-check-token');
const P = (path, opts = {}) => api(path, { ...opts, token: 'partner-check-token' });
const M = (path, opts = {}) => api(path, { ...opts, token: 'marketing-check-token' });
const asset = async (id, token) => (await fetch(`${URL}/assets/${id}`, { headers: { Authorization: `Bearer ${token}` } })).status;

const folders = Object.fromEntries(((await api('/folders?limit=-1')).data ?? []).map((f) => [f.name, f.id]));
const files = (await api('/files?fields=id,title,folder&limit=-1')).data ?? [];
const approved = files.filter((f) => f.folder === folders.Approved);
const drafts = files.filter((f) => f.folder === folders.Drafts);

const list = await P('/files?fields=id,folder&limit=-1');
const seen = (list.data ?? []).map((f) => f.id);
check(list.status === 200 && approved.every((f) => seen.includes(f.id)), 'Partner lists the Approved files', `status ${list.status}`);
check(drafts.every((f) => !seen.includes(f.id)), 'Partner never sees other files', JSON.stringify(seen.length));
check((await asset(approved[0].id, 'partner-check-token')) === 200, 'Partner downloads an Approved file from /assets');
check((await asset(drafts[0].id, 'partner-check-token')) === 403, 'Partner cannot download a draft from /assets');
check((await P(`/files/${drafts[0].id}`)).status === 403, 'Partner cannot read a draft file record');

const form = new FormData();
form.append('file', new Blob([Buffer.from('x')], { type: 'text/plain' }), 'partner.txt');
const upload = await fetch(`${URL}/files`, { method: 'POST', headers: { Authorization: 'Bearer partner-check-token' }, body: form });
check(upload.status === 403, 'Partner cannot upload', `status ${upload.status}`);
const edit = await P(`/files/${approved[0].id}`, { method: 'PATCH', body: { title: 'hacked' } });
const del = await P(`/files/${approved[1].id}`, { method: 'DELETE' });
check(edit.status === 403 && del.status === 403, 'Partner cannot edit or delete', `${edit.status} ${del.status}`);

const mForm = new FormData();
mForm.append('folder', folders.Drafts);
mForm.append('file', new Blob([Buffer.from('x')], { type: 'text/plain' }), 'marketing.txt');
const mUpload = await fetch(`${URL}/files`, { method: 'POST', headers: { Authorization: 'Bearer marketing-check-token' }, body: mForm });
check(mUpload.status === 200, 'Marketing uploads', `status ${mUpload.status}`);

const move = await M(`/files/${drafts[0].id}`, { method: 'PATCH', body: { folder: folders.Approved } });
check(move.status === 200, 'Marketing moves a file into Approved', `status ${move.status} ${JSON.stringify(move.errors ?? '')}`);
check((await asset(drafts[0].id, 'partner-check-token')) === 200, 'Partner can download it right after the move');
const back = await M(`/files/${approved[0].id}`, { method: 'PATCH', body: { folder: folders.Drafts } });
check(back.status === 200 && (await asset(approved[0].id, 'partner-check-token')) === 403, 'a file moved out of Approved stops being downloadable', `status ${back.status}`);

done();
