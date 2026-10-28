import { createItem, generateHash } from '@directus/sdk';
import { directus } from './directus.js';

// Stores a hashed invite code so the raw code is only ever in the email.
export async function createInvite(email: string, code: string) {
	const codeHash = await directus.request(generateHash(code));
	return directus.request(createItem('invites', { email, code_hash: codeHash }));
}
