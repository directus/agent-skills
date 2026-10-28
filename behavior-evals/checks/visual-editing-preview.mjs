import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORK_DIR, api, check, done } from './lib.mjs';

const ADMIN = process.env.DIRECTUS_ADMIN_TOKEN ?? 'skills-evals-admin-token';
const meta = (await api('/collections/posts')).data?.meta ?? {};
const settings = (await api('/settings')).data ?? {};

check(meta.versioning === true, 'posts have versioning enabled');

const preview = meta.preview_url ?? '';
const site = (u) => u.includes('www.example.com') || (u.includes('{{$preview_base_url}}') && (settings.preview_base_url ?? '').includes('www.example.com'));
check(site(preview), 'the Preview URL points at https://www.example.com', preview);
check(/\{\{\s*(slug|id)\s*\}\}/.test(preview) && preview.includes('/blog/'), 'the Preview URL opens the post (/blog/{{slug}})', preview);
check(preview.includes('{{$version}}'), 'the Preview URL passes {{$version}}', preview);

const editorUrls = (settings.visual_editor_urls ?? []).map((u) => u.url ?? '');
check(editorUrls.some((u) => u.includes('www.example.com')), 'a Visual Editor URL points at the site', JSON.stringify(editorUrls));
check(editorUrls.length > 0 && editorUrls.every((u) => u.includes('{{$version}}')), 'every Visual Editor URL has {{$version}}', JSON.stringify(editorUrls));

const envFile = join(WORK_DIR, '.env.local');
const token = existsSync(envFile) ? readFileSync(envFile, 'utf8').match(/^DIRECTUS_PREVIEW_TOKEN=["']?([^"'\s]+)/m)?.[1] : undefined;
if (!check(!!token, '.env.local has DIRECTUS_PREVIEW_TOKEN')) done();
check(token !== ADMIN, 'the preview token is not the admin token');
check(![preview, ...editorUrls].some((u) => u.includes(token)), 'no token in the Preview or Visual Editor URLs');

const posts = (await api('/items/posts?fields=id,title,status&sort=title')).data ?? [];
const published = posts.find((p) => p.status === 'published');
const draft = posts.find((p) => p.status === 'draft');

// The agent may already have made a draft version of this post.
const versionId =
	(await api('/versions', { method: 'POST', body: { key: 'draft', name: 'Draft', collection: 'posts', item: published.id } })).data?.id ??
	(await api(`/versions?filter[collection][_eq]=posts&filter[item][_eq]=${published.id}&filter[key][_eq]=draft`)).data?.[0]?.id;
await api(`/versions/${versionId}/save`, { method: 'POST', body: { title: 'Changed in draft' } });

const asPreview = (path, opts = {}) => api(path, { ...opts, token });
const readDraft = await asPreview(`/items/posts/${published.id}?version=draft`);
check(readDraft.data?.title === 'Changed in draft', 'the preview token reads a post draft version', `status ${readDraft.status} ${JSON.stringify(readDraft.errors ?? readDraft.data?.title)}`);
const readUnpublished = await asPreview(`/items/posts/${draft.id}`);
check(readUnpublished.status === 200, 'the preview token reads unpublished posts', `status ${readUnpublished.status}`);
const write = await asPreview(`/items/posts/${published.id}`, { method: 'PATCH', body: { title: 'Hacked' } });
check(write.status === 403, 'the preview token cannot edit posts', `status ${write.status}`);
const schema = await asPreview('/collections', { method: 'POST', body: { collection: 'nope', schema: {} } });
check(schema.status === 403, 'the preview token is not an admin', `status ${schema.status}`);

done();
