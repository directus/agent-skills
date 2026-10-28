#!/usr/bin/env node
// Behavior evals: give a fresh headless Claude a Directus task, then check the instance over the API.
// Each run gets a new Directus container (--image, default the version the skills are verified against) unless the case
// only writes files. Arms: `with` loads this repo as a plugin, `without` doesn't.
//
//   node behavior-evals/run.mjs [--case <name,...>] [--arms with,without] [--runs 1] [--model haiku] [--lanes 2]
//     [--image directus/directus:<tag>] [--clean]

import { spawn, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

const { values: args } = parseArgs({
	options: {
		case: { type: 'string' },
		arms: { type: 'string', default: 'with,without' },
		runs: { type: 'string', default: '1' },
		model: { type: 'string', default: 'haiku' },
		lanes: { type: 'string', default: '2' },
		'max-turns': { type: 'string', default: '40' },
		clean: { type: 'boolean', default: false },
		image: { type: 'string', default: 'directus/directus:12.6.0' },
	},
});

// --clean runs each agent with an empty Claude config (no user skills, CLAUDE.md, plugins, or MCP servers).
// Auth comes from a `claude setup-token` token in CLAUDE_CODE_OAUTH_TOKEN or this file.
const TOKEN_FILE = join(homedir(), '.config', 'directus-skills-evals', 'oauth-token');
const oauthToken = args.clean
	? (process.env.CLAUDE_CODE_OAUTH_TOKEN ?? (existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : ''))
	: '';
if (args.clean && !oauthToken) {
	console.error(`--clean needs CLAUDE_CODE_OAUTH_TOKEN or ${TOKEN_FILE}`);
	process.exit(1);
}

const IMAGE = args.image;
const TOKEN = 'skills-evals-admin-token';
// Per-case setup. seeds: run against the instance in order. target: start a second instance with these seeds.
// tools: shell commands allowed besides curl and jq. fixture: copied from fixtures/ into the work dir.
// extensions: mount <work>/extensions into the instance with auto reload. env: extra instance env vars.
// postgres: run on Postgres instead of SQLite (some queries behave differently). maxTurns: overrides --max-turns.
// instance: false for file-only cases.
const CASES = {
	translations: { seeds: ['posts'] },
	'access-public': { seeds: ['posts'] },
	'flows-slug': { seeds: ['posts'] },
	'flows-publish': { seeds: ['posts'] },
	'flows-duplicate': { seeds: ['posts'] },
	insights: { seeds: ['posts'] },
	'flows-publish-guard': { seeds: ['posts'] },
	'flows-newsletter-fanout': { seeds: ['subscribers'] },
	'access-editor-role': { seeds: ['posts'] },
	'insights-author-dashboard': { seeds: ['posts', 'authors'] },
	'model-indexes': { seeds: ['posts', 'authors'] },
	'sdk-latest-posts': { seeds: ['posts', 'authors'], tools: ['npm', 'node', 'env'] },
	'visual-editing-preview': { seeds: ['posts'] },
	'extensions-endpoint': { seeds: ['posts'], tools: ['npm', 'npx', 'node', 'ls'], extensions: true },
	'sync-schema': { seeds: ['posts', 'authors'], target: ['signups'] },
	'selfhost-compose': { instance: false, tools: ['openssl'] },
	'upgrade-project': { instance: false, fixture: 'upgrade-project', tools: ['npm view'] },
	'sdk-session': { seeds: ['posts', 'users'], tools: ['npm', 'node', 'env'], env: { ACCESS_TOKEN_TTL: '5s' } },
	'extensions-hook-audit': {
		seeds: ['posts', 'users', 'audit'],
		tools: ['npm', 'npx', 'node', 'ls'],
		extensions: true,
		maxTurns: 60,
	},
	'sync-partial': { seeds: ['posts', 'authors', 'events'], target: ['posts', 'signups'] },
	'selfhost-scale': { instance: false, tools: ['openssl'] },
	'json-filters': { seeds: ['products'], postgres: true },
};

const allCases = readdirSync(join(here, 'cases')).map((f) => f.replace(/\.md$/, ''));
const cases = args.case ? args.case.split(',') : allCases;
const arms = args.arms.split(',');
const jobs = [];
for (const c of cases)
	for (const arm of arms) for (let i = 1; i <= Number(args.runs); i++) jobs.push({ case: c, arm, run: i });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(here, 'results', stamp);
mkdirSync(outDir, { recursive: true });

const sh = (cmd, cmdArgs, opts = {}) => execFileSync(cmd, cmdArgs, { encoding: 'utf8', ...opts });

// A throwaway Postgres that publishes Directus's port; Directus joins its network namespace and reaches it on
// 127.0.0.1. No docker network needed (machines with many networks run out of address pools).
async function startPostgres(name, port) {
	const db = `${name}-pg`;
	try {
		sh('docker', ['rm', '-f', db], { stdio: 'ignore' });
	} catch {}
	sh('docker', ['run', '-d', '--name', db, '-p', `127.0.0.1:${port}:8055`, '--tmpfs', '/var/lib/postgresql/data',
		'-e', 'POSTGRES_USER=directus', '-e', 'POSTGRES_PASSWORD=directus', '-e', 'POSTGRES_DB=directus', 'postgres:16-alpine']);
	for (let i = 0; i < 60; i++) {
		try {
			sh('docker', ['exec', db, 'pg_isready', '-U', 'directus', '-h', '127.0.0.1'], { stdio: 'ignore' });
			break;
		} catch {}
		await new Promise((r) => setTimeout(r, 1000));
	}
	return ['--network', `container:${db}`, '-e', 'DB_CLIENT=pg', '-e', 'DB_HOST=127.0.0.1', '-e', 'DB_PORT=5432',
		'-e', 'DB_DATABASE=directus', '-e', 'DB_USER=directus', '-e', 'DB_PASSWORD=directus'];
}

async function startDirectus(lane, { target = false, extensionsDir, env = {}, postgres = false } = {}) {
	const name = `directus-skills-evals-${lane}${target ? '-target' : ''}`;
	const port = (target ? 18355 : 18255) + lane;
	try {
		sh('docker', ['rm', '-f', name, `${name}-pg`], { stdio: 'ignore' });
	} catch {}
	sh('docker', [
		'run',
		'-d',
		'--name',
		name,
		...(postgres ? await startPostgres(name, port) : ['-p', `127.0.0.1:${port}:8055`]),
		'--tmpfs',
		'/directus/database:uid=1000,gid=1000',
		'-e',
		'KEY=skills-evals-key',
		'-e',
		'SECRET=skills-evals-secret-not-for-production-use',
		...(postgres ? [] : ['-e', 'DB_CLIENT=sqlite3', '-e', 'DB_FILENAME=/directus/database/data.db']),
		'-e',
		'ADMIN_EMAIL=admin@example.com',
		'-e',
		'ADMIN_PASSWORD=skills-evals-password',
		'-e',
		`ADMIN_TOKEN=${TOKEN}`,
		'-e',
		`PUBLIC_URL=http://127.0.0.1:${port}`,
		'-e',
		'TELEMETRY=false',
		// Bind mounts on Docker Desktop don't deliver file events, so the extension watcher polls.
		...(extensionsDir
			? ['-v', `${extensionsDir}:/directus/extensions`, '-e', 'EXTENSIONS_AUTO_RELOAD=true', '-e', 'CHOKIDAR_USEPOLLING=true']
			: []),
		...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
		IMAGE,
	]);
	const url = `http://127.0.0.1:${port}`;
	for (let i = 0; i < 90; i++) {
		try {
			if ((await fetch(`${url}/server/ping`)).ok) return url;
		} catch {}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error(`Directus on lane ${lane} did not start`);
}

function runProcess(cmd, cmdArgs, opts) {
	return new Promise((resolve) => {
		const child = spawn(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
		let out = '';
		let err = '';
		child.stdout.on('data', (d) => (out += d));
		child.stderr.on('data', (d) => (err += d));
		child.on('close', (code) => resolve({ code, out, err }));
	});
}

const RULES = (tools) =>
	`The only shell commands available are ${tools.join(', ')}; anything else is blocked, so run one command at a ` +
	`time.${tools.includes('env') ? ' To set environment variables for a command, prefix it with env (env NAME=value node script.mjs).' : ''} ` +
	`You can't ask me questions: make reasonable choices and finish the task, then summarize what you did.\n\nTask: `;

const PREAMBLE = (url, target, tools) =>
	!url
		? `Work in the current directory. ${RULES(tools)}`
		: (target
				? `Two throwaway Directus test instances are running: the source at ${url} and the target at ${target}. `
				: `A throwaway Directus test instance is running at ${url}. `) +
			`Use this admin static token for every request${target ? ' to either' : ''}: ${TOKEN} (it's a local test token, ` +
			`fine to use inline). Work in the current directory. Do the Directus work directly against the instance with curl. ` +
			RULES(['curl', 'jq', ...tools]);

async function runJob(job, lane) {
	const config = CASES[job.case] ?? {};
	const tools = config.tools ?? [];
	const work = mkdtempSync(join(tmpdir(), `skills-eval-${job.case}-`));
	if (config.fixture) cpSync(join(here, 'fixtures', config.fixture), work, { recursive: true });
	const extensionsDir = config.extensions ? join(work, 'extensions') : undefined;
	if (extensionsDir) mkdirSync(extensionsDir);

	const url =
		config.instance === false ? undefined : await startDirectus(lane, { extensionsDir, env: config.env, postgres: config.postgres });
	const target = config.target ? await startDirectus(lane, { target: true }) : undefined;
	const env = { ...process.env, DIRECTUS_URL: url, DIRECTUS_TOKEN: TOKEN, DIRECTUS_ADMIN_TOKEN: TOKEN, WORK_DIR: work };
	if (target) env.TARGET_URL = target;
	for (const seed of config.seeds ?? []) sh('node', [join(here, 'seeds', `${seed}.mjs`)], { env });
	for (const seed of config.target ?? []) sh('node', [join(here, 'seeds', `${seed}.mjs`)], { env: { ...env, DIRECTUS_URL: target } });

	const prompt = PREAMBLE(url, target, tools) + readFileSync(join(here, 'cases', `${job.case}.md`), 'utf8');
	const claudeArgs = [
		'-p',
		prompt,
		'--model',
		args.model,
		'--output-format',
		'stream-json',
		'--verbose',
		'--max-turns',
		String(config.maxTurns ?? args['max-turns']),
		'--permission-mode',
		'acceptEdits',
		'--allowedTools',
		...(url ? ['Bash(curl:*)', 'Bash(jq:*)'] : []),
		...tools.map((t) => `Bash(${t}:*)`),
		'Read',
		'Write',
		'Edit',
		'Glob',
		'Grep',
		'Skill',
		'--strict-mcp-config',
		'--mcp-config',
		'{"mcpServers":{}}',
		'--no-session-persistence',
		...(job.arm === 'with' ? ['--plugin-dir', repo] : []),
	];
	const started = Date.now();
	const agentEnv = args.clean
		? {
				...env,
				CLAUDE_CODE_PLUGIN_DIRS: '',
				CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'skills-eval-config-')),
				CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
			}
		: env;
	const res = await runProcess('claude', claudeArgs, { cwd: work, env: agentEnv });
	const events = res.out
		.split('\n')
		.filter(Boolean)
		.flatMap((l) => {
			try {
				return [JSON.parse(l)];
			} catch {
				return [];
			}
		});
	const final = events.findLast((e) => e.type === 'result') ?? {};
	const skills = events
		.flatMap((e) => (e.type === 'assistant' ? (e.message?.content ?? []) : []))
		.filter((c) => c.type === 'tool_use' && c.name === 'Skill')
		.map((c) => c.input?.skill);

	const check = await runProcess('node', [join(here, 'checks', `${job.case}.mjs`)], { env });
	const lines = check.out.split('\n').filter((l) => /^(PASS|FAIL) /.test(l));
	const passed = lines.filter((l) => l.startsWith('PASS')).length;

	const result = {
		...job,
		passed,
		total: lines.length,
		checks: lines,
		info: check.out.split('\n').filter((l) => l.startsWith('INFO')),
		skills,
		turns: final.num_turns,
		costUsd: final.total_cost_usd,
		seconds: Math.round((Date.now() - started) / 1000),
		summary: final.result,
		// Checks exit 1 on a FAIL; a crash shows up as stderr or no FAIL line to explain the exit.
		error:
			res.code !== 0
				? res.err.slice(-2000)
				: check.err.trim() || !lines.length || (check.code !== 0 && passed === lines.length)
					? `checker crashed (exit ${check.code}, ${lines.length} checks): ${check.err.slice(-1000)}`
					: null,
	};
	writeFileSync(
		join(outDir, `${job.case}.${job.arm}.${job.run}.json`),
		JSON.stringify({ ...result, transcript: events }, null, 2),
	);
	console.log(
		`${job.case} [${job.arm} #${job.run}] ${passed}/${lines.length} checks, $${(final.total_cost_usd ?? 0).toFixed(2)}, skills: ${skills.join(', ') || 'none'}`,
	);
	return result;
}

const queue = [...jobs];
const results = [];
await Promise.all(
	Array.from({ length: Math.min(Number(args.lanes), jobs.length) }, async (_, lane) => {
		while (queue.length) {
			const job = queue.shift();
			try {
				results.push(await runJob(job, lane));
			} catch (error) {
				console.log(`${job.case} [${job.arm} #${job.run}] ERROR ${error.message}`);
				results.push({ ...job, passed: 0, total: 0, error: error.message });
			}
		}
		for (const name of [`directus-skills-evals-${lane}`, `directus-skills-evals-${lane}-target`]) {
			try {
				sh('docker', ['rm', '-f', name, `${name}-pg`], { stdio: 'ignore' });
			} catch {}
		}
	}),
);

const rows = cases.map((c) => {
	const cell = (arm) => {
		const rs = results.filter((r) => r.case === c && r.arm === arm);
		if (!rs.length) return '';
		const p = rs.reduce((s, r) => s + r.passed, 0);
		const t = rs.reduce((s, r) => s + r.total, 0);
		return `${p}/${t}${rs.some((r) => r.error) ? " (error)" : ""}`;
	};
	return `| ${c} | ${arms.map(cell).join(' | ')} |`;
});
const cost = results.reduce((s, r) => s + (r.costUsd ?? 0), 0);
const report = [
	`# Behavior evals ${stamp}`,
	'',
	`Image: ${IMAGE}. Model: ${args.model}. Runs per arm: ${args.runs}. Cost: $${cost.toFixed(2)}.`,
	'',
	`| Case | ${arms.join(' | ')} |`,
	`| --- | ${arms.map(() => '---').join(' | ')} |`,
	...rows,
	'',
].join('\n');
writeFileSync(join(outDir, 'summary.md'), report);
writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${report}\nResults: ${outDir}`);

// Fail when the plugin arm misses a check or any run errored. The `without` arm is a baseline and may fail.
const failed = results.some((r) => r.error || (r.arm === 'with' && r.passed < r.total));
process.exit(failed ? 1 : 0);
