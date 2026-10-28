#!/usr/bin/env node
// Packs each skill and writes an Agent Skills discovery index (RFC v0.2.0) to dist/, then tags v<version> and
// publishes a GitHub release with those files attached. directus.com/.well-known/agent-skills/* serves the latest
// release's files. Skips publishing if the release already exists, since changesets/action runs this on every push
// to main with no pending changesets.
// Usage: node scripts/release.mjs [--dry-run]   (--dry-run only builds dist/)

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const skillsDir = join(root, 'skills');
const dist = join(root, 'dist');
const dryRun = process.argv.includes('--dry-run');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const tag = `v${version}`;

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });

function description(skillMd) {
	const raw = skillMd.match(/^description:\s*(.*)$/m)[1];
	if (raw.startsWith('"')) return JSON.parse(raw);
	if (raw.startsWith("'")) return raw.slice(1, -1).replaceAll("''", "'");
	return raw;
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);

const skills = readdirSync(skillsDir).map((name) => {
	const dir = join(skillsDir, name);
	const file = `${name}.tar.gz`;
	// Files at the archive root, no wrapper directory, per the RFC.
	run('tar', ['-czf', join(dist, file), '-C', dir, ...readdirSync(dir).filter((f) => f !== '.DS_Store')], {
		env: { ...process.env, COPYFILE_DISABLE: '1' },
	});

	return {
		name,
		type: 'archive',
		description: description(readFileSync(join(dir, 'SKILL.md'), 'utf8')),
		// Versioned so a cached index never points at a newer archive with a different digest.
		url: `${tag}/${file}`,
		digest: `sha256:${createHash('sha256').update(readFileSync(join(dist, file))).digest('hex')}`,
	};
});

const index = { $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json', skills };
writeFileSync(join(dist, 'index.json'), JSON.stringify(index, null, '\t') + '\n');
console.log(`dist/: index.json and ${skills.length} skill archives`);

if (dryRun) process.exit(0);

try {
	run('gh', ['release', 'view', tag], { stdio: 'ignore' });
	console.log(`${tag} already released`);
	process.exit(0);
} catch {}

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const notes = changelog.split(/^## /m).find((s) => s.startsWith(`${version}\n`));
if (!notes) throw new Error(`no CHANGELOG.md section for ${version}`);
writeFileSync(join(dist, 'notes.md'), notes.slice(version.length).trim() + '\n');

const assets = ['index.json', ...skills.map((s) => `${s.name}.tar.gz`)].map((f) => join(dist, f));
run('gh', ['release', 'create', tag, '--target', run('git', ['rev-parse', 'HEAD']).trim(), '--title', tag, '--notes-file', join(dist, 'notes.md'), ...assets], { stdio: 'inherit' });
