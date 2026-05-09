import { appendFile } from 'node:fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../logging/logger.js';
import { getFeedbackPath } from '../state/paths.js';
import { PARAMS, SUMMARIES, TOOL_DESCRIPTIONS, TOOL_TITLES } from './descriptions.js';
import { returnSuccess } from './tool-helpers.js';

/**
 * Format an entry as:
 *
 *     [<ISO timestamp>] cwd=<absolute cwd>
 *     <message body, trailing whitespace stripped>
 *
 *     <blank line>
 *
 * Header line is greppable; the blank-line separator delimits records for
 * eyeball scanning while still being trivially appended-to (never clobbers).
 */
export function formatEntry(timestamp: string, cwd: string, message: string): string {
	const body = message.replace(/\s+$/u, '');
	return `[${timestamp}] cwd=${cwd}\n${body}\n\n`;
}

export function registerRecordFeedbackTool(server: McpServer): void {
	server.registerTool(
		'record_feedback',
		{
			title: TOOL_TITLES.record_feedback,
			description: TOOL_DESCRIPTIONS.record_feedback,
			inputSchema: {
				message: PARAMS.feedbackMessage,
			},
		},
		async ({ message }) => {
			const cwd = process.cwd();
			const timestamp = new Date().toISOString();
			const path = getFeedbackPath();
			const block = formatEntry(timestamp, cwd, message);
			const bytesAppended = Buffer.byteLength(block, 'utf-8');

			logger.debug('record_feedback called', { path, cwd, timestamp, bytes: bytesAppended });

			await appendFile(path, block, 'utf-8');

			return returnSuccess(
				{ path, timestamp, cwd, bytesAppended },
				{ tool: 'record_feedback' },
				SUMMARIES.feedbackRecorded(path, timestamp),
			);
		},
	);
}
