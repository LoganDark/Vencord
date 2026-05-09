import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DomainError } from '../errors/domain-error.js';
import type { Hub } from '../hub/index.js';
import { callPlugin } from './bridge.js';
import { PARAMS, SUMMARIES, TOOL_DESCRIPTIONS, TOOL_TITLES } from './descriptions.js';
import { returnDomainError, returnSuccess } from './tool-helpers.js';

interface Reply {
	moduleId: string | number;
	source: string;
}

export function registerReadModuleSourceTool(server: McpServer, hub: Hub): void {
	server.registerTool(
		'read_module_source',
		{
			title: TOOL_TITLES.read_module_source,
			description: TOOL_DESCRIPTIONS.read_module_source,
			inputSchema: {
				moduleId: PARAMS.moduleId,
				clientId: PARAMS.clientId,
			},
		},
		async ({ moduleId, clientId }) => {
			try {
				const data = await callPlugin<Reply>(hub, clientId, 'read_module_source', { moduleId });
				return returnSuccess(
					data,
					{ tool: 'read_module_source', clientId: clientId ?? null },
					SUMMARIES.moduleSourceRead(String(data.moduleId), data.source?.length ?? 0),
				);
			} catch (err) {
				if (err instanceof DomainError) return returnDomainError(err);
				throw err;
			}
		},
	);
}
