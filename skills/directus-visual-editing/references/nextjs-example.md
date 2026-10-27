# End-to-end example: Next.js App Router

A blog post page with gated preview, draft reads with fallback, and visual editing that refreshes on save. Assumes Next.js 15+, `@directus/sdk` 27, `@directus/visual-editing` 2.1, and a `posts` collection (`id`, `slug`, `status`, `title`, `description`) with **Enable Versions** on. Why each piece exists: [preview-security.md](preview-security.md), [content-versions.md](content-versions.md).

## Contents

- [Directus side](#directus-side)
- [Server code](#server-code)
- [Client component](#client-component)
- [Frame headers](#frame-headers)

## Directus side

1. Env: `CONTENT_SECURITY_POLICY_DIRECTIVES__FRAME_SRC=https://site.example.com` (restart).
2. Public policy: read on `posts`. Which rule depends on the license:
   - **Licensed:** item rule `status = published`, so the API never serves unpublished posts to Public.
   - **Unlicensed (core tier):** an item rule is a custom permission rule. Core can't save it, and an existing one is dropped when the instance runs unlicensed, so Public loses read on `posts` entirely and the site's reads fail with 403. On core, grant read on all `posts` fields (`fields: ["*"]`) with no rule. The page's `status = published` filter is not security: anyone calling the API directly sees unpublished posts. If those are sensitive, license the instance or keep unpublished work out of `posts`. Details: the `directus-access-control` skill (`references/licensing.md`).
3. A `preview-bot` user whose policy reads `posts` and `directus_versions` (all fields, no rules, so it also works on core). Generate its static token.
4. Settings > Project: **Preview Base URL** `https://site.example.com`; **Visual Editor URLs** add `https://site.example.com/blog/<some-slug>?preview_secret=<PREVIEW_SECRET>&version={{$version}}`. Live Preview only turns on the pencil when the preview URL's origin matches a Visual Editor URL, and the module opens this URL as its start page, so point it at a page that renders `<VisualEditing>`.
5. Settings > Data Model > `posts` > **Preview URL:** `{{$preview_base_url}}/blog/{{slug}}?preview_secret=<PREVIEW_SECRET>&version={{$version}}`.

`<PREVIEW_SECRET>` equals the site's `PREVIEW_SECRET`. Studio users who can read settings and collection metadata see it; it only unlocks read-only preview. Rotate it by changing the env var and both URLs.

Site env, all server-only (no `NEXT_PUBLIC_`). `DIRECTUS_PUBLIC_URL` must also exist at **build** time.

| Variable | Value |
| --- | --- |
| `DIRECTUS_URL` | Where the Next.js server reaches Directus. Can be an internal address (Docker network, private host). |
| `DIRECTUS_PUBLIC_URL` | The Studio's origin as the editor's browser sees it, for example `https://cms.example.com`. Used for `directusUrl` and `frame-ancestors`, which must match it exactly. |
| `DIRECTUS_PREVIEW_TOKEN` | The `preview-bot` static token. |
| `PREVIEW_SECRET` | 32+ random bytes (`openssl rand -hex 32`). Not a Directus token. |

Run `npm install @directus/sdk @directus/visual-editing server-only`.

## Server code

```ts
// lib/directus-schema.ts (minimal; full typing: the directus-sdk skill, references/typing.md)
export interface Post {
	id: number; // match your primary key type
	slug: string;
	status: string;
	title: string;
	description: string | null;
}

export interface Schema {
	posts: Post[];
}
```

```ts
// lib/directus.ts
import 'server-only';
import { createDirectus, rest } from '@directus/sdk';
import type { Schema } from './directus-schema';

// No token composable: each request picks its own credentials with withToken().
export const directus = createDirectus<Schema>(process.env.DIRECTUS_URL!).with(rest());
```

```ts
// lib/preview.ts
import 'server-only';
import { timingSafeEqual } from 'node:crypto';

const PUBLISHED_KEYS = new Set(['published', 'main']);

export type PreviewContext = ReturnType<typeof getPreviewContext>;

export function getPreviewContext(secret: string | null | undefined, rawVersion: string | null | undefined) {
	const given = Buffer.from(secret ?? '');
	const expected = Buffer.from(process.env.PREVIEW_SECRET ?? '');
	const preview = expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);

	if (!preview) return { preview: false as const, version: undefined, token: undefined };

	return {
		preview: true as const,
		version: rawVersion && !PUBLISHED_KEYS.has(rawVersion) ? rawVersion : undefined,
		token: process.env.DIRECTUS_PREVIEW_TOKEN!,
	};
}
```

```tsx
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { isDirectusError, readItem, readItems, withToken } from '@directus/sdk';
import { setAttr } from '@directus/visual-editing';
import { directus } from '@/lib/directus';
import { getPreviewContext, type PreviewContext } from '@/lib/preview';
import { VisualEditing } from './visual-editing';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function readPost(slug: string, ctx: PreviewContext) {
	const token = ctx.token ?? ''; // '' sends no header (Public)
	// Look up the id with a normal read: a version read by filter only returns items that have that version.
	const filter = ctx.preview ? { slug: { _eq: slug } } : { slug: { _eq: slug }, status: { _eq: 'published' } };
	const [match] = await directus.request(withToken(token, readItems('posts', { fields: ['id'], filter, limit: 1 })));
	if (!match) return null;

	const fields = ['id', 'title', 'description'] as const;

	if (ctx.version) {
		try {
			return await directus.request(withToken(token, readItem('posts', match.id, { fields, version: ctx.version })));
		} catch (error) {
			// 403: no saved version under that key. Fall back with the same token.
			if (!isDirectusError(error) || error.errors[0]?.extensions?.code !== 'FORBIDDEN') throw error;
		}
	}

	return directus.request(withToken(token, readItem('posts', match.id, { fields })));
}

export default async function PostPage({
	params,
	searchParams,
}: {
	params: Promise<{ slug: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { slug } = await params;
	const query = await searchParams; // renders per request with Cache-Control: private, no-store
	const ctx = getPreviewContext(first(query.preview_secret), first(query.version));

	const post = await readPost(slug, ctx);
	if (!post) notFound();

	// Attributes only for a verified preview.
	const edit = (field: string) =>
		ctx.preview ? setAttr({ collection: 'posts', item: post.id, fields: [field] }) : undefined;

	return (
		<article>
			<h1 data-directus={edit('title')}>{post.title}</h1>
			<p data-directus={edit('description')}>{post.description}</p>
			{ctx.preview && (
				<VisualEditing directusUrl={process.env.DIRECTUS_PUBLIC_URL!} revision={JSON.stringify(post)} />
			)}
		</article>
	);
}
```

## Client component

```tsx
// app/blog/[slug]/visual-editing.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apply } from '@directus/visual-editing';

export function VisualEditing({ directusUrl, revision }: { directusUrl: string; revision: string }) {
	const router = useRouter();

	useEffect(() => {
		let cancelled = false;
		let handle: Awaited<ReturnType<typeof apply>> = undefined;

		// router.refresh() re-runs the server page with the same URL, so the same version is read again.
		apply({ directusUrl, onSaved: () => router.refresh() }).then((h) => {
			if (cancelled) h?.remove();
			else handle = h;
		});

		return () => {
			cancelled = true;
			handle?.remove();
		};
	}, [directusUrl, router, revision]); // re-apply after each refresh renders new data

	return null;
}
```

## Frame headers

```ts
// next.config.ts
import type { NextConfig } from 'next';

// headers() runs during `next build` and its result is baked into the build output.
if (!process.env.DIRECTUS_PUBLIC_URL) throw new Error('DIRECTUS_PUBLIC_URL must be set at build time');
const studioOrigin = new URL(process.env.DIRECTUS_PUBLIC_URL).origin;

const nextConfig: NextConfig = {
	async headers() {
		return [
			{
				source: '/:path*',
				headers: [{ key: 'Content-Security-Policy', value: `frame-ancestors 'self' ${studioOrigin}` }],
			},
		];
	},
};

export default nextConfig;
```

- Changing `DIRECTUS_PUBLIC_URL` later means rebuilding. If one build is deployed to several environments, set this header in middleware (`proxy.ts` on Next.js 16) instead, where `process.env` is read per request.
- Internal links lose `preview_secret` and `version`, so the next page renders published. Carry both on links while `ctx.preview` is true if editors navigate inside the frame.

## Sources

- https://directus.com/docs/frameworks/nextjs/visual-editor
- https://directus.com/docs/guides/content/visual-editor/frontend-library
- https://github.com/directus/directus/blob/v12.5.1/packages/visual-editing/src/index.ts
- https://github.com/directus/directus/blob/v12.5.1/api/src/app.ts
- https://github.com/directus/directus/blob/v12.5.1/app/src/views/private/components/live-preview.vue
- https://github.com/directus/directus/blob/v12.5.1/packages/system-data/src/fields/settings.yaml
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/permissions.ts
- https://directus.com/docs/licensing/overview
- https://github.com/directus/directus/blob/v12.5.1/api/src/services/items.ts
- https://github.com/directus-labs/starters/tree/main/cms/nextjs/next.config.ts
- https://nextjs.org/docs/app/guides/self-hosting
