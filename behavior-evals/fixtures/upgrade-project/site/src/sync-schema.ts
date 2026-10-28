import { schemaApply, schemaDiff, schemaSnapshot } from '@directus/sdk';
import { directus } from './directus.js';

// Copies schema from a staging instance (passed in) to this instance.
export async function syncFrom(staging: typeof directus) {
	const snapshot = await staging.request(schemaSnapshot());
	const diff = await directus.request(schemaDiff(snapshot, true));
	if (diff) await directus.request(schemaApply(diff));
}
