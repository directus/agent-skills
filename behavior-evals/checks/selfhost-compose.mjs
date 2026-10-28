import { check, composeConfig, done } from './lib.mjs';

const config = composeConfig();

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
