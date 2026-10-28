import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { URL, WORK_DIR, check, done } from './lib.mjs';

const script = join(WORK_DIR, 'report.mjs');
if (!check(existsSync(script), 'report.mjs exists')) done();
check(/from ['"]@directus\/sdk['"]/.test(readFileSync(script, 'utf8')), 'the script imports @directus/sdk');

// A stand-in for the gateway: rejects requests without `X-Source: report` and records what came through.
const seen = [];
const gateway = createServer(async (req, res) => {
	const ok = req.headers['x-source'] === 'report';
	seen.push({ method: req.method, path: req.url.split('?')[0], ok });
	if (!ok) {
		res.writeHead(400, { 'Content-Type': 'application/json' });
		return res.end(JSON.stringify({ errors: [{ message: 'missing X-Source' }] }));
	}
	const chunks = [];
	for await (const c of req) chunks.push(c);
	const headers = { ...req.headers };
	delete headers.host;
	const upstream = await fetch(URL + req.url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
	const type = upstream.headers.get('content-type');
	res.writeHead(upstream.status, type ? { 'Content-Type': type } : {});
	res.end(Buffer.from(await upstream.arrayBuffer()));
});
await new Promise((r) => gateway.listen(0, '127.0.0.1', r));
const gatewayUrl = `http://127.0.0.1:${gateway.address().port}`;

const started = Date.now();
const run = await new Promise((resolve) =>
	execFile(
		'node',
		[script],
		{
			cwd: WORK_DIR,
			timeout: 60_000,
			env: { ...process.env, DIRECTUS_URL: gatewayUrl, DIRECTUS_EMAIL: 'reader@example.com', DIRECTUS_PASSWORD: 'reader-password-123' },
		},
		(error, stdout, stderr) => resolve({ error, stdout, stderr }),
	),
);
gateway.close();
const seconds = (Date.now() - started) / 1000;

let out;
try {
	out = JSON.parse(run.stdout.trim().split('\n').at(-1));
} catch {}
if (!check(!run.error && !!out, 'the script runs through the gateway and prints JSON', String(run.stderr || run.error?.message).slice(-400))) done();

check(seen.length > 0 && seen.every((r) => r.ok), 'every request carries X-Source: report', JSON.stringify(seen.filter((r) => !r.ok)));
check(out.first === 4, 'first count is the number 4 (all posts the reader can see)', JSON.stringify(out.first));
check(seconds >= 10, 'it waits 10 seconds between counts', `${seconds.toFixed(1)}s`);
check(out.second === 4, 'second count still works after the 5s access token expires', JSON.stringify(out.second));
check(seen.some((r) => r.path === '/auth/logout' && r.method === 'POST'), 'it logs out', JSON.stringify(seen.map((r) => r.path)));

done();
