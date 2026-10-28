#!/usr/bin/env node
// Rewrites markdown tables in skills/ without alignment padding: `| a | b |` and `| --- | --- |`. Padding is
// whitespace and dashes an agent pays tokens for and gets nothing from. The validator fails on padded tables.
// Usage: node scripts/compact-tables.mjs

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const splitCells = (line) =>
	line
		.trim()
		.replace(/^\||\|$/g, '')
		.split(/(?<!\\)\|/)
		.map((cell) => cell.trim());

const separatorCell = (cell) => {
	const left = cell.startsWith(':');
	const right = cell.endsWith(':') && cell.length > 1;
	return `${left ? ':' : ''}---${right ? ':' : ''}`;
};

export function compactTables(text) {
	let fenced = false;

	return text
		.split('\n')
		.map((line) => {
			if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
			if (fenced || !/^\s*\|.*\|\s*$/.test(line)) return line;
			const indent = line.match(/^\s*/)[0];
			const cells = splitCells(line);
			const isSeparator = cells.every((c) => /^:?-+:?$/.test(c));
			return `${indent}| ${(isSeparator ? cells.map(separatorCell) : cells).join(' | ')} |`;
		})
		.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
	const walk = (dir) =>
		readdirSync(dir).flatMap((name) => {
			const path = join(dir, name);
			return statSync(path).isDirectory() ? walk(path) : path.endsWith('.md') ? [path] : [];
		});
	let changed = 0;

	for (const file of walk(join(root, 'skills'))) {
		const text = readFileSync(file, 'utf8');
		const compact = compactTables(text);
		if (compact === text) continue;
		writeFileSync(file, compact);
		changed++;
	}

	console.log(`compacted tables in ${changed} file(s)`);
}
