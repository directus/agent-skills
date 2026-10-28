import { execFileSync } from 'node:child_process';
import { WORK_DIR, check, done } from './lib.mjs';

// A `${VAR:?}` guard left blank for the operator to fill is fine: fill only what compose says is required.
const filled = {};
let config;
for (let i = 0; i < 10 && !config; i++) {
	try {
		config = JSON.parse(
			execFileSync('docker', ['compose', 'config', '--format', 'json'], {
				cwd: WORK_DIR,
				env: { ...process.env, ...filled },
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			}),
		);
	} catch (error) {
		const name = String(error.stderr).match(/required variable (\w+) is missing/)?.[1];
		if (!name || filled[name]) {
			check(false, 'docker compose config accepts the file', String(error.stderr ?? error.message).slice(0, 400));
			done();
		}
		filled[name] = `filled-by-check-${name.toLowerCase()}-0123456789abcdef`;
	}
}
if (Object.keys(filled).length) console.log(`INFO required variables left for the operator: ${Object.keys(filled).join(', ')}`);
check(true, 'docker compose config accepts the file');

const services = Object.entries(config.services ?? {});
const byImage = (re) => services.find(([, s]) => re.test(s.image ?? ''));
const [, directus] = byImage(/^directus\/directus/) ?? [];
if (!check(!!directus, 'a directus/directus service exists')) done();
const env = directus.environment ?? {};
const truthy = (v) => v !== undefined && !/^(false|0|)$/i.test(String(v));

check(directus.image === 'directus/directus:12.6.0', 'the image is pinned to 12.6.0', directus.image);

const [pgName, pg] = byImage(/^(postgres|postgis\/postgis)/) ?? [];
check(['pg', 'postgres', 'postgresql'].includes(env.DB_CLIENT), 'DB_CLIENT is Postgres (not the SQLite default)', env.DB_CLIENT);
check(!!pg && env.DB_HOST === pgName, 'DB_HOST is the Postgres service', `${env.DB_HOST} vs ${pgName}`);
check((pg?.volumes ?? []).some((v) => v.target?.startsWith('/var/lib/postgresql')), 'Postgres data is on a volume');

const uploadsVolume = (directus.volumes ?? []).some((v) => v.target === '/directus/uploads');
const remoteStorage = env.STORAGE_LOCATIONS && !/^local$/.test(env.STORAGE_LOCATIONS);
check(uploadsVolume || remoteStorage, 'uploads are on a volume or a storage driver');

check(
	String(env.SECRET ?? '').length >= 20 && !/change|replace|example|secret$/i.test(env.SECRET),
	'SECRET is set to a real value or required from the operator',
	String(env.SECRET),
);
check(String(env.PUBLIC_URL ?? '').replace(/\/$/, '') === 'https://cms.example.com', 'PUBLIC_URL is https://cms.example.com', env.PUBLIC_URL);
check(truthy(env.IP_TRUST_PROXY), 'IP_TRUST_PROXY is set behind Caddy', env.IP_TRUST_PROXY);
check(!!byImage(/^(redis|valkey)/) && (env.REDIS || env.REDIS_HOST) && env.REDIS_ENABLED !== 'false', 'Directus is connected to Redis');
if (truthy(env.CACHE_ENABLED)) check(truthy(env.CACHE_AUTO_PURGE), 'CACHE_ENABLED comes with CACHE_AUTO_PURGE', env.CACHE_AUTO_PURGE);

const health = (directus.healthcheck?.test ?? []).join(' ');
if (health) {
	check(!health.includes('/server/health'), 'the health check probes /server/ping, not /server/health (403 without a token)', health);
	check(!(/wget/.test(health) && /localhost/.test(health)), 'the health check does not wget localhost (::1 fails)', health);
}
console.log(`INFO health check: ${health || 'none'}`);
console.log(`INFO directus ports: ${JSON.stringify(directus.ports ?? [])}`);

done();
