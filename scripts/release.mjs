#!/usr/bin/env node
// Packs each skill and writes an Agent Skills discovery index (RFC v0.2.0) to dist/, then tags v<version> and
// publishes a GitHub release with those files attached. directus.com/.well-known/agent-skills/* serves the latest
// release's files. Skips publishing if the release already exists, since changesets/action runs this on every push
// to main with no pending changesets.
// Archives come from committed files (git archive HEAD), so a local dry run matches what CI publishes.
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
	const raw = skillMd.match(/^description:\s*(.*)$/m)?.[1];
	if (!raw) throw new Error('SKILL.md has no description');
	if (raw.startsWith('"')) return JSON.parse(raw);
	if (raw.startsWith("'")) return raw.slice(1, -1).replaceAll("''", "'");
	return raw;
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);

const skills = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map(({ name }) => {
	const file = `${name}.tar.gz`;
	// A tree (not a commit) gives files at the archive root with no wrapper directory, per the RFC.
	run('git', ['archive', '--format=tar.gz', '-o', join(dist, file), `HEAD:skills/${name}`]);

	return {
		name,
		type: 'archive',
		description: description(run('git', ['show', `HEAD:skills/${name}/SKILL.md`])),
		// Versioned so a cached index never points at a newer archive with a different digest.
		url: `${tag}/${file}`,
		digest: `sha256:${createHash('sha256').update(readFileSync(join(dist, file))).digest('hex')}`,
	};
});

const index = { $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json', skills };
writeFileSync(join(dist, 'index.json'), JSON.stringify(index, null, '\t') + '\n');
console.log(`dist/: index.json and ${skills.length} skill archives`);

if (dryRun) process.exit(0);

let existing;
try {
	existing = JSON.parse(run('gh', ['release', 'view', tag, '--json', 'isDraft'], { stdio: ['ignore', 'pipe', 'ignore'] }));
} catch {}

// gh leaves a draft behind if an upload fails. Don't mistake it for a finished release.
if (existing?.isDraft) throw new Error(`${tag} is a draft, likely a failed upload. Delete it and rerun.`);
if (existing) {
	console.log(`${tag} already released`);
	process.exit(0);
}

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const notes = changelog.split(/^## /m).find((s) => s.startsWith(`${version}\n`));
if (!notes) throw new Error(`no CHANGELOG.md section for ${version}`);
writeFileSync(join(dist, 'notes.md'), notes.slice(version.length).trim() + '\n');

const assets = ['index.json', ...skills.map((s) => `${s.name}.tar.gz`)].map((f) => join(dist, f));
run('gh', ['release', 'create', tag, '--target', run('git', ['rev-parse', 'HEAD']).trim(), '--title', tag, '--notes-file', join(dist, 'notes.md'), ...assets], { stdio: 'inherit' });
