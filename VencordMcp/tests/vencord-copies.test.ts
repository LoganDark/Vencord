/**
 * Guards the few snippets the ClaudeMcp plugin copies out of Vencord because
 * Vencord doesn't export them. Each copied block in the plugin is introduced by
 * a `// Copied from <path>` comment and runs until the next blank line; every
 * code line in that block must still appear verbatim in the named Vencord
 * file. When this fails after a Vencord update, re-copy the block.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const COPY_MARKER = /^\s*\/\/ Copied from (\S+)/;

const PLUGIN_FILES = ['src/plugins/claudeMcp/chunks.ts'];

interface CopiedBlock {
	pluginFile: string;
	sourceFile: string;
	line: number;
	codeLines: string[];
}

function collectCopiedBlocks(pluginFile: string): CopiedBlock[] {
	const lines = readFileSync(resolve(REPO_ROOT, pluginFile), 'utf8').split('\n');
	const blocks: CopiedBlock[] = [];

	for (let i = 0; i < lines.length; i++) {
		const marker = COPY_MARKER.exec(lines[i]);
		if (!marker) continue;

		const codeLines: string[] = [];
		for (let j = i + 1; j < lines.length && lines[j].trim() !== ''; j++) {
			const trimmed = lines[j].trim();
			if (!trimmed.startsWith('//')) codeLines.push(trimmed);
		}
		blocks.push({ pluginFile, sourceFile: marker[1], line: i + 1, codeLines });
	}

	return blocks;
}

describe('code copied from Vencord is still identical upstream', () => {
	for (const pluginFile of PLUGIN_FILES) {
		const blocks = collectCopiedBlocks(pluginFile);

		it(`${pluginFile} has at least one copied block`, () => {
			expect(blocks.length).toBeGreaterThan(0);
		});

		for (const block of blocks) {
			it(`${pluginFile}:${block.line} matches ${block.sourceFile}`, () => {
				const upstream = readFileSync(resolve(REPO_ROOT, block.sourceFile), 'utf8');
				const upstreamLines = new Set(upstream.split('\n').map(l => l.trim()));

				const missing = block.codeLines.filter(l => !upstreamLines.has(l));
				expect(missing, `lines no longer present verbatim in ${block.sourceFile}`).toEqual([]);
			});
		}
	}
});
