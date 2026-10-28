import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORK_DIR, check, composeConfig, done, rangeIncludes } from './lib.mjs';

const read = (p) => (existsSync(join(WORK_DIR, p)) ? readFileSync(join(WORK_DIR, p), 'utf8') : '');
const json = (p) => JSON.parse(read(p) || '{}');
const major = (range) => Number(String(range ?? '').match(/(\d+)/)?.[1]);

const config = composeConfig();
const directus = Object.values(config.services).find((s) => /^directus\/directus/.test(s.image ?? ''));
const env = directus?.environment ?? {};
check(directus?.image === 'directus/directus:12.6.0', 'the image is 12.6.0', directus?.image);
check(!/\bnpx?\b/.test(JSON.stringify(directus?.command ?? '') + JSON.stringify(directus?.entrypoint ?? '')), 'no npm/npx in the command (12.1+ images have none)', JSON.stringify(directus?.command));
const health = (directus?.healthcheck?.test ?? []).join(' ');
check(!health.includes('/server/health'), 'the health check no longer probes /server/health (403 on 12.x)', health);
check(!(/wget/.test(health) && /localhost/.test(health)), 'the health check does not wget localhost', health);
check(!/^(false|0|)$/i.test(String(env.IP_TRUST_PROXY ?? '')), 'IP_TRUST_PROXY is set (behind Traefik)', env.IP_TRUST_PROXY);
check(env.SECRET === '4f9c2b7e1d8a6f3c0e5b9d2a7c4f1e8b', 'SECRET is unchanged', env.SECRET);

const sdk = json('site/package.json').dependencies?.['@directus/sdk'];
check(major(sdk) === 27, '@directus/sdk is on 27.x (the 12.6 SDK)', sdk);
const site = ['site/src/directus.ts', 'site/src/invites.ts', 'site/src/sync-schema.ts']
	.map(read)
	.join('\n')
	.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // comments may mention what was removed
check(!/generateHash/.test(site), 'generateHash is gone (removed with /utils/hash on 12.x)');
check(!/schemaDiff\([^)]*,\s*(true|false)\s*\)/.test(site), 'schemaDiff takes an options object, not a boolean');

const ext = json('extensions/acme-audit/package.json');
const extSdk = ext.devDependencies?.['@directus/extensions-sdk'];
check(major(extSdk) === 18, '@directus/extensions-sdk is on 18.x', extSdk);
const host = ext['directus:extension']?.host ?? '';
check(rangeIncludes(host, '12.6.0'), 'extension host covers 12.6.0', host);

const notes = read('UPGRADE.md');
check(!!notes, 'UPGRADE.md exists');
check(/back ?up|pg_dump|snapshot/i.test(notes), 'UPGRADE.md says to back up first');
check(/licen[cs]e/i.test(notes), 'UPGRADE.md covers the v12 license');
check(/11\.17/.test(notes), 'UPGRADE.md stops on 11.17 before 12');

done();
