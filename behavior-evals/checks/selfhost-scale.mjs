import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
check(true, 'docker compose config accepts the file');

const directusServices = Object.values(config.services ?? {}).filter((s) => /^directus\/directus/.test(s.image ?? ''));
const directus = directusServices[0];
if (!check(!!directus, 'a directus/directus service exists')) done();
const env = directus.environment ?? {};
const truthy = (v) => v !== undefined && !/^(false|0|)$/i.test(String(v));

check(directus.image === 'directus/directus:12.6.0', 'the image is pinned to 12.6.0', directus.image);
const replicas = directusServices.length > 1 ? directusServices.length : Number(directus.deploy?.replicas ?? 1);
// A variable count (`replicas: ${DIRECTUS_REPLICAS}`, 1 for the first deploy) is fine when DEPLOY.md scales to 3.
const raw = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml', 'docker-stack.yml']
	.map((f) => (existsSync(join(WORK_DIR, f)) ? readFileSync(join(WORK_DIR, f), 'utf8') : ''))
	.join('\n');
const deployDoc = existsSync(join(WORK_DIR, 'DEPLOY.md')) ? readFileSync(join(WORK_DIR, 'DEPLOY.md'), 'utf8') : '';
const variableReplicas = /replicas:\s*\$\{/.test(raw) && /\b3\b/.test(deployDoc);
check(replicas === 3 || variableReplicas, '3 replicas', String(replicas));
check(!Object.values(config.services).some((s) => /^(postgres|redis|valkey)/.test(s.image ?? '')), 'no self-run Postgres or Redis (they are managed)');

check(['pg', 'postgres', 'postgresql'].includes(env.DB_CLIENT) && env.DB_HOST === 'db.internal', 'DB points at the managed Postgres', `${env.DB_CLIENT} ${env.DB_HOST}`);
check(/redis\.internal/.test(env.REDIS ?? env.REDIS_HOST ?? '') && env.REDIS_ENABLED !== 'false', 'Redis points at redis.internal', env.REDIS ?? env.REDIS_HOST);
check(env.SYNCHRONIZATION_STORE === 'redis', 'SYNCHRONIZATION_STORE=redis (schedules run once, not 3 times)', env.SYNCHRONIZATION_STORE);
check(!truthy(env.CACHE_ENABLED) || env.CACHE_STORE === 'redis', 'a shared cache (CACHE_STORE=redis) if caching is on', env.CACHE_STORE);
check(!truthy(env.CACHE_ENABLED) || truthy(env.CACHE_AUTO_PURGE), 'CACHE_AUTO_PURGE with the cache on', env.CACHE_AUTO_PURGE);
check(truthy(env.RATE_LIMITER_ENABLED) ? env.RATE_LIMITER_STORE === 'redis' : true, 'a shared rate limiter (RATE_LIMITER_STORE=redis) if enabled', env.RATE_LIMITER_STORE);

const locations = String(env.STORAGE_LOCATIONS ?? 'local').split(',').map((l) => l.trim().toUpperCase());
const s3 = locations.find((l) => env[`STORAGE_${l}_DRIVER`] === 's3');
check(!!s3 && locations[0] === s3, 'uploads go to S3 first (not a per-host volume)', env.STORAGE_LOCATIONS);
check(!!s3 && env[`STORAGE_${s3}_BUCKET`] === 'acme-cms-uploads' && env[`STORAGE_${s3}_REGION`] === 'us-east-1', 'the S3 bucket and region are set', JSON.stringify({ bucket: env[`STORAGE_${s3}_BUCKET`], region: env[`STORAGE_${s3}_REGION`] }));

check(String(env.SECRET ?? '').length >= 20 && !/change|replace|example|secret$/i.test(env.SECRET), 'one real SECRET for every replica', String(env.SECRET));
check(String(env.PUBLIC_URL ?? '').replace(/\/$/, '') === 'https://cms.example.com', 'PUBLIC_URL is https://cms.example.com', env.PUBLIC_URL);
check(truthy(env.IP_TRUST_PROXY), 'IP_TRUST_PROXY behind the load balancer', env.IP_TRUST_PROXY);

const health = (directus.healthcheck?.test ?? []).join(' ');
if (health) {
	check(!health.includes('/server/health'), 'the health check probes /server/ping, not /server/health', health);
	check(!(/wget/.test(health) && /localhost/.test(health)), 'the health check does not wget localhost', health);
}

const deploy = existsSync(join(WORK_DIR, 'DEPLOY.md')) ? readFileSync(join(WORK_DIR, 'DEPLOY.md'), 'utf8') : '';
check(!!deploy, 'DEPLOY.md exists');
check(
	/(one|1|single) (replica|instance|container|task)|replicas[ =:]+1|scale\S* [^\n]*=1|parallelism[: ]+1|bootstrap/i.test(deploy),
	'DEPLOY.md runs migrations from one replica before scaling out',
);
console.log(`INFO health check: ${health || 'none'}`);

done();
