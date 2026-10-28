#!/usr/bin/env node
// Checks every skill against the Agent Skills spec and AUTHORING.md. No dependencies.
// Usage: node scripts/validate.mjs [--strict]   (--strict also fails on TODO(verify) and DECISION markers)

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { compactTables } from './compact-tables.mjs';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const skillsDir = join(root, 'skills');
const strict = process.argv.includes('--strict');
const errors = [];
const warnings = [];

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKILL_MAX_LINES = 100;
const DESCRIPTION_SOFT_MAX = 450;
const REFERENCE_TOC_THRESHOLD = 100;

function parseFrontmatter(text) {
	const match = text.match(/^---\n([\s\S]*?)\n---\n/);
	if (!match) return null;
	const data = {};

	for (const line of match[1].split('\n')) {
		const kv = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
		if (kv) data[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
	}

	return data;
}

function checkLinks(file, text) {
	const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

	for (const [, target] of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
		if (/^(https?:|mailto:|#)/.test(target)) continue;
		const path = target.split('#')[0];
		if (!existsSync(resolve(dirname(file), path))) errors.push(`${rel(file)}: broken link ${target}`);
	}
}

function checkTables(file, text) {
	if (compactTables(text) !== text) errors.push(`${rel(file)}: padded markdown table (run node scripts/compact-tables.mjs)`);
}

function checkTodos(file, text) {
	const count = (text.match(/TODO\(verify\)|<!-- DECISION/g) ?? []).length;
	if (count) (strict ? errors : warnings).push(`${rel(file)}: ${count} TODO(verify) or DECISION marker(s)`);
}

// Codex reads agents/openai.yaml for the skill picker. Limits from codex-rs/skills (short_description 25-64 chars).
function checkCodexMetadata(dir, name) {
	const file = join(dir, 'agents', 'openai.yaml');

	if (!existsSync(file)) {
		errors.push(`${rel(dir)}: missing agents/openai.yaml (Codex metadata)`);
		return;
	}

	const text = readFileSync(file, 'utf8');
	const value = (key) => text.match(new RegExp(`^\\s+${key}:\\s*"(.*)"\\s*$`, 'm'))?.[1];
	const short = value('short_description');

	if (!value('display_name')) errors.push(`${rel(file)}: missing interface.display_name`);
	if (!short || short.length < 25 || short.length > 64)
		errors.push(`${rel(file)}: short_description must be 25-64 chars`);
	if (!value('default_prompt')?.includes(`$${name}`)) errors.push(`${rel(file)}: default_prompt must mention $${name}`);
}

const rel = (file) => file.replace(root + '/', '');

for (const name of readdirSync(skillsDir).filter((entry) => statSync(join(skillsDir, entry)).isDirectory())) {
	const dir = join(skillsDir, name);
	const skillFile = join(dir, 'SKILL.md');

	if (!existsSync(skillFile)) {
		errors.push(`skills/${name}: missing SKILL.md`);
		continue;
	}

	const text = readFileSync(skillFile, 'utf8');
	const fm = parseFrontmatter(text);

	if (!fm) {
		errors.push(`${rel(skillFile)}: missing frontmatter`);
		continue;
	}

	if (fm.name !== name) errors.push(`${rel(skillFile)}: name "${fm.name}" must match folder "${name}"`);
	if (!NAME_RE.test(fm.name ?? '') || fm.name.length > 64) errors.push(`${rel(skillFile)}: invalid name`);
	if (!fm.description) errors.push(`${rel(skillFile)}: missing description`);
	else if (fm.description.length > 1024)
		errors.push(`${rel(skillFile)}: description is ${fm.description.length} chars (max 1024)`);
	else if (fm.description.length > DESCRIPTION_SOFT_MAX)
		warnings.push(
			`${rel(skillFile)}: description is ${fm.description.length} chars (aim for <= ${DESCRIPTION_SOFT_MAX})`,
		);

	const lines = text.split('\n').length;
	if (lines > SKILL_MAX_LINES) warnings.push(`${rel(skillFile)}: ${lines} lines (router target <= ${SKILL_MAX_LINES})`);

	checkLinks(skillFile, text);
	checkTodos(skillFile, text);
	checkTables(skillFile, text);
	checkCodexMetadata(dir, name);

	// Every router sends agents on older majors to the base skill's version notes (AUTHORING.md).
	if (name !== 'directus-upgrade' && !/versions-v\d+\.md|version\s+notes/.test(text))
		errors.push(`${rel(skillFile)}: first checks must point older versions to the directus version notes`);

	const refDir = join(dir, 'references');
	if (!existsSync(refDir)) continue;

	for (const ref of readdirSync(refDir).filter((f) => f.endsWith('.md'))) {
		const refFile = join(refDir, ref);
		const refText = readFileSync(refFile, 'utf8');

		if (!text.includes(`references/${ref}`)) warnings.push(`${rel(refFile)}: not linked from SKILL.md`);
		if (!/^## Sources/m.test(refText)) errors.push(`${rel(refFile)}: missing "## Sources"`);

		if (refText.split('\n').length > REFERENCE_TOC_THRESHOLD && !/^- \[.+\]\(#/m.test(refText.slice(0, 1500))) {
			warnings.push(`${rel(refFile)}: over ${REFERENCE_TOC_THRESHOLD} lines without a table of contents`);
		}

		if (/—/.test(refText)) warnings.push(`${rel(refFile)}: contains em dashes`);

		checkLinks(refFile, refText);
		checkTodos(refFile, refText);
		checkTables(refFile, refText);
	}
}

for (const major of [9, 10, 11, 12]) {
	if (!existsSync(join(skillsDir, 'directus', 'references', `versions-v${major}.md`)))
		errors.push(`skills/directus/references: missing versions-v${major}.md`);
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(`\n${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
