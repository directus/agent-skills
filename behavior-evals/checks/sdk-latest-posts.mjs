import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { URL, WORK_DIR, api, check, done } from './lib.mjs';

const script = join(WORK_DIR, 'latest-posts.mjs');
if (!check(existsSync(script), 'latest-posts.mjs exists')) done();
const source = readFileSync(script, 'utf8');
const pkg = existsSync(join(WORK_DIR, 'package.json')) ? JSON.parse(readFileSync(join(WORK_DIR, 'package.json'), 'utf8')) : {};

check(!!pkg.dependencies?.['@directus/sdk'], '@directus/sdk is a dependency in package.json');
check(/from ['"]@directus\/sdk['"]/.test(source), 'the script imports @directus/sdk');
check(
	!source.includes(process.env.DIRECTUS_ADMIN_TOKEN ?? 'skills-evals-admin-token') && !source.includes(new globalThis.URL(URL).host),
	'URL and token come from env, not hardcoded',
);

let out;
try {
	out = JSON.parse(execFileSync('node', [script], { cwd: WORK_DIR, env: { ...process.env, DIRECTUS_URL: URL }, encoding: 'utf8', timeout: 30_000 }));
} catch (error) {
	check(false, 'the script runs and prints JSON', String(error.stderr ?? error.message).slice(0, 300));
	done();
}
check(true, 'the script runs and prints JSON');

const posts = out.posts ?? [];
check(
	JSON.stringify(posts.map((p) => p.title)) === JSON.stringify(['Third Post', 'Second Post']),
	'posts are the 2 newest published, newest first',
	JSON.stringify(posts.map((p) => p.title)),
);
check(posts[0]?.slug === 'third-post', 'posts include the slug', JSON.stringify(posts[0]));
// The seed assigns authors in no fixed order, so read the expected names.
const expected = ((await api('/items/posts?fields=author.name&filter[status][_eq]=published&sort=-date_published&limit=2')).data ?? []).map(
	(p) => p.author?.name,
);
check(
	posts.length > 0 && JSON.stringify(posts.map((p) => p.author)) === JSON.stringify(expected),
	"author is the author's name, not an id",
	JSON.stringify(posts.map((p) => p.author)),
);
check(out.total === 3, 'total is the number 3 (all published posts, not the page size)', JSON.stringify(out.total));

done();
