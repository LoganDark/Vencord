import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Hub } from '../hub/index.js';
import { SUMMARIES, TOOL_DESCRIPTIONS, TOOL_TITLES } from './descriptions.js';
import { returnSuccess } from './tool-helpers.js';

export function registerListSessionsTool(server: McpServer, hub: Hub): void {
	server.registerTool(
		'list_sessions',
		{
			title: TOOL_TITLES.list_sessions,
			description: TOOL_DESCRIPTIONS.list_sessions,
			inputSchema: {},
		},
		async () => {
			const sessions = hub.listSessions();
			const count = Object.keys(sessions).length;
			return returnSuccess(
				{ sessions, count },
				{ tool: 'list_sessions' },
				SUMMARIES.sessionsListed(count),
			);
		},
	);
}
