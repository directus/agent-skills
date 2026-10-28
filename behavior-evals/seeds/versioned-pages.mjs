// Turns on content versioning for `pages`, as a site with an editorial review step has it. Run after editorial.
import { api } from '../checks/lib.mjs';

const r = await api('/collections/pages', { method: 'PATCH', body: { meta: { versioning: true } } });
if (r.status !== 200) throw new Error(JSON.stringify(r.errors));
console.log('versioned pages');
