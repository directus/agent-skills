// Copies the package.json version (bumped by `changeset version`) into the Claude Code plugin manifests.
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

function update(path, set) {
	const json = JSON.parse(readFileSync(path, 'utf8'));
	set(json);
	writeFileSync(path, JSON.stringify(json, null, '\t') + '\n');
}

update('.claude-plugin/plugin.json', (j) => (j.version = version));
update('.claude-plugin/marketplace.json', (j) => (j.metadata.version = version));
console.log(`plugin manifests set to ${version}`);
