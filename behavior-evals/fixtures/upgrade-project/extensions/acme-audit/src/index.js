import { defineHook } from '@directus/extensions-sdk';

export default defineHook(({ action }, { logger }) => {
	action('posts.items.update', ({ keys, payload }) => {
		if (payload.status === 'published') logger.info(`Published posts ${keys.join(', ')}`);
	});
});
