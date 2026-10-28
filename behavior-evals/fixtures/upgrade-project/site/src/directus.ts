import { createDirectus, readItems, rest, staticToken } from '@directus/sdk';

export const directus = createDirectus(process.env.DIRECTUS_URL!)
	.with(staticToken(process.env.DIRECTUS_TOKEN!))
	.with(rest());

export async function getPosts() {
	return directus.request(
		readItems('posts', {
			fields: ['id', 'title', 'slug', { author: ['name'] }],
			filter: { status: { _eq: 'published' } },
			sort: ['-date_published'],
		}),
	);
}
