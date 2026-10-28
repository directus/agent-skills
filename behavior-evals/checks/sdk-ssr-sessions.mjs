import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { URL, WORK_DIR, check, done } from './lib.mjs';

const file = join(WORK_DIR, 'server.mjs');
if (!check(existsSync(file), 'server.mjs exists')) done();
check(/from ['"]@directus\/sdk['"]/.test(readFileSync(file, 'utf8')), 'the server imports @directus/sdk');

// A pass-through in front of Directus that remembers every token Directus hands out, to spot one reaching the browser.
const issued = new Set();
const refreshes = { ok: 0, failed: 0 };
const proxy = createServer(async (req, res) => {
	const chunks = [];
	for await (const c of req) chunks.push(c);
	const headers = { ...req.headers };
	delete headers.host;
	const upstream = await fetch(URL + req.url, {
		method: req.method,
		headers,
		body: chunks.length ? Buffer.concat(chunks) : undefined,
	});
	const body = Buffer.from(await upstream.arrayBuffer());
	if (req.url.startsWith('/auth/')) {
		const data = (() => {
			try {
				return JSON.parse(body).data ?? {};
			} catch {
				return {};
			}
		})();
		for (const t of [data.access_token, data.refresh_token]) if (t) issued.add(t);
		for (const c of upstream.headers.getSetCookie()) issued.add(c.split(';')[0].split('=').slice(1).join('='));
		if (req.url.startsWith('/auth/refresh')) refreshes[upstream.ok ? 'ok' : 'failed']++;
	}
	const out = {};
	for (const [k, v] of upstream.headers)
		if (!['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie'].includes(k)) out[k] = v;
	const cookies = upstream.headers.getSetCookie();
	if (cookies.length) out['set-cookie'] = cookies;
	res.writeHead(upstream.status, out);
	res.end(body);
});
await new Promise((r) => proxy.listen(0, '127.0.0.1', r));

const port = 19000 + Math.floor(Math.random() * 500);
const server = spawn('node', [file], {
	cwd: WORK_DIR,
	env: { ...process.env, PORT: String(port), DIRECTUS_URL: `http://127.0.0.1:${proxy.address().port}` },
	stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));
const base = `http://127.0.0.1:${port}`;
let up = false;
for (let i = 0; i < 40 && !up; i++) {
	await new Promise((r) => setTimeout(r, 250));
	up = await fetch(base, { method: 'HEAD' }).then(
		() => true,
		() => false,
	);
}
const finish = () => {
	server.kill();
	proxy.close();
	console.log(`INFO refreshes through Directus: ${refreshes.ok} ok, ${refreshes.failed} failed`);
	done();
};
if (!check(up, `the server listens on PORT`, log.slice(-400))) finish();

// What the browser sees, kept so the token check at the end can search it.
const seen = [];
const call = async (path, { method = 'GET', cookie, body } = {}) => {
	const res = await fetch(base + path, {
		method,
		headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
		body: body ? JSON.stringify(body) : undefined,
		redirect: 'manual',
	}).catch((error) => ({ status: 0, error }));
	const text = res.text ? await res.text() : '';
	const setCookie = res.headers?.getSetCookie() ?? [];
	seen.push(text, ...setCookie);
	let json;
	try {
		json = JSON.parse(text);
	} catch {}
	return { status: res.status, json, setCookie };
};

const sessions = {};
for (const name of ['alice', 'bob']) {
	const r = await call('/login', {
		method: 'POST',
		body: { email: `${name}@example.com`, password: `${name}-password-123` },
	});
	sessions[name] = r.setCookie.map((c) => c.split(';')[0]).join('; ');
	check(r.status === 204 && !!sessions[name], `${name} logs in and gets a cookie`, `status ${r.status}`);
	check(
		r.setCookie.length > 0 && r.setCookie.every((c) => /;\s*httponly/i.test(c)),
		`${name}'s cookie is httpOnly`,
		r.setCookie.join(' | '),
	);
}
const bad = await call('/login', { method: 'POST', body: { email: 'alice@example.com', password: 'wrong' } });
check(bad.status === 401, 'a wrong password answers 401', `status ${bad.status}`);
check((await call('/tickets')).status === 401, 'GET /tickets without a session answers 401');

const expected = { alice: ['Acme', 'Globex'], bob: ['Acme'] };
const orgsOf = (r) => [...new Set((r.json?.tickets ?? []).map((t) => String(t).split(':')[0]))].sort().join(',');
const right = (name, r) => r.status === 200 && orgsOf(r) === expected[name].join(',');
for (const name of ['alice', 'bob']) {
	const r = await call('/tickets', { cookie: sessions[name] });
	check(
		right(name, r),
		`${name} gets their own tickets`,
		`status ${r.status}: ${orgsOf(r)}`,
	);
}

// Past the 5s access token lifetime, both users fire parallel requests.
const burst = async (label) => {
	await new Promise((r) => setTimeout(r, 7000));
	const jobs = [];
	for (let i = 0; i < 5; i++)
		for (const name of ['alice', 'bob']) jobs.push(call('/tickets', { cookie: sessions[name] }).then((r) => [name, r]));
	const results = await Promise.all(jobs);
	const wrong = results.filter(([name, r]) => !right(name, r)).map(([name, r]) => `${name}: ${r.status} ${orgsOf(r)}`);
	check(
		!wrong.length,
		`${label}: 10 parallel requests from two users all answer correctly`,
		wrong.slice(0, 4).join('; '),
	);
	for (const name of ['alice', 'bob']) {
		const r = await call('/tickets', { cookie: sessions[name] });
		check(right(name, r), `${label}: ${name}'s session still works afterwards`, `status ${r.status}: ${orgsOf(r)}`);
	}
};
await burst('after the access token expired');
await burst('after it expired again');

const out = await call('/logout', { method: 'POST', cookie: sessions.alice });
check(out.status === 204, 'alice logs out', `status ${out.status}`);
check((await call('/tickets', { cookie: sessions.alice })).status === 401, "alice's old cookie no longer works");
check(right('bob', await call('/tickets', { cookie: sessions.bob })), 'bob is still logged in');

const leaked = [...issued].filter((t) => t && t.length > 16 && seen.some((s) => s.includes(t)));
check(
	issued.size > 0 && !leaked.length,
	'no Directus token reaches the browser',
	`${leaked.length} of ${issued.size} tokens seen`,
);

// Logging out must end the Directus session too. Once access tokens have expired, no token issued during this check
// may still act as alice, as a bearer token or as a refresh token.
await new Promise((r) => setTimeout(r, 6000));
const whoAmI = async (token) => (await fetch(`${URL}/users/me?fields=email`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()))?.data?.email;
let aliceAlive = 0;
for (const t of issued) {
	if ((await whoAmI(t)) === 'alice@example.com') aliceAlive++;
	const refreshed = await fetch(`${URL}/auth/refresh`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ refresh_token: t, mode: 'json' }),
	}).then((r) => r.json());
	if (refreshed.data?.access_token && (await whoAmI(refreshed.data.access_token)) === 'alice@example.com') aliceAlive++;
}
check(aliceAlive === 0, "logout ends alice's Directus session", `${aliceAlive} token(s) still act as alice`);
finish();
