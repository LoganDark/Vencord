import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DomainError } from '../errors/domain-error.js';
import type { Hub } from '../hub/index.js';
import { callPlugin } from './bridge.js';
import { PARAMS, SUMMARIES, TOOL_DESCRIPTIONS, TOOL_TITLES } from './descriptions.js';
import { returnDomainError, returnSuccess } from './tool-helpers.js';

interface Reply {
	moduleIds: Array<string | number>;
	/** Present only for non-default scopes. */
	unloaded?: Array<{ moduleId: string; chunkId: string }>;
}

// Building the unloaded-chunk index fetches every chunk file; give it room.
const SCOPED_TIMEOUT_MS = 180_000;

export function registerFindModulesByRegexTool(server: McpServer, hub: Hub): void {
	server.registerTool(
		'find_modules_by_regex',
		{
			title: TOOL_TITLES.find_modules_by_regex,
			description: TOOL_DESCRIPTIONS.find_modules_by_regex,
			inputSchema: {
				pattern: PARAMS.pattern,
				flags: PARAMS.flags,
				scope: PARAMS.scope,
				clientId: PARAMS.clientId,
			},
		},
		async ({ pattern, flags, scope, clientId }) => {
			try {
				const data = await callPlugin<Reply>(
					hub, clientId, 'find_modules_by_regex', { pattern, flags, scope },
					scope === undefined || scope === 'loaded' ? undefined : SCOPED_TIMEOUT_MS,
				);
				return returnSuccess(
					data,
					{ tool: 'find_modules_by_regex', clientId: clientId ?? null },
					SUMMARIES.modulesFound(data.moduleIds?.length ?? 0, data.unloaded?.length),
				);
			} catch (err) {
				if (err instanceof DomainError) return returnDomainError(err);
				throw err;
			}
		},
	);
}
