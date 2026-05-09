import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DomainError } from '../errors/domain-error.js';
import type { Hub } from '../hub/index.js';
import { callPlugin } from './bridge.js';
import { PARAMS, SUMMARIES, TOOL_DESCRIPTIONS, TOOL_TITLES } from './descriptions.js';
import { returnDomainError, returnSuccess } from './tool-helpers.js';

interface MatchView {
	matched: string;
	index: number;
	groups: (string | null)[];
}

interface Reply {
	moduleId: string | number;
	matches: MatchView[];
}

export function registerMatchModuleSourceTool(server: McpServer, hub: Hub): void {
	server.registerTool(
		'match_module_source',
		{
			title: TOOL_TITLES.match_module_source,
			description: TOOL_DESCRIPTIONS.match_module_source,
			inputSchema: {
				moduleId: PARAMS.moduleId,
				pattern: PARAMS.pattern,
				flags: PARAMS.flags,
				clientId: PARAMS.clientId,
			},
		},
		async ({ moduleId, pattern, flags, clientId }) => {
			try {
				const data = await callPlugin<Reply>(hub, clientId, 'match_module_source', {
					moduleId, pattern, flags,
				});
				return returnSuccess(
					data,
					{ tool: 'match_module_source', clientId: clientId ?? null },
					SUMMARIES.matchesFound(String(data.moduleId), data.matches?.length ?? 0),
				);
			} catch (err) {
				if (err instanceof DomainError) return returnDomainError(err);
				throw err;
			}
		},
	);
}
