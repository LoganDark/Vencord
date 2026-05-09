import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DomainError } from '../errors/domain-error.js';
import type { Hub } from '../hub/index.js';
import { callPlugin } from './bridge.js';
import { PARAMS, SUMMARIES, TOOL_DESCRIPTIONS, TOOL_TITLES } from './descriptions.js';
import { returnDomainError, returnSuccess } from './tool-helpers.js';

type Reply =
	| { kind: 'module'; moduleId: string | number }
	| { kind: 'external' }
	| { kind: 'ambiguous'; candidates: Array<string | number> };

export function registerSearchDefinitionTool(server: McpServer, hub: Hub): void {
	server.registerTool(
		'search_definition',
		{
			title: TOOL_TITLES.search_definition,
			description: TOOL_DESCRIPTIONS.search_definition,
			inputSchema: {
				ref: PARAMS.anyId,
				clientId: PARAMS.clientId,
			},
		},
		async ({ ref, clientId }) => {
			try {
				const data = await callPlugin<Reply>(hub, clientId, 'search_definition', { ref });
				const detail = data.kind === 'module'
					? String(data.moduleId)
					: data.kind === 'ambiguous'
						? data.candidates.map(String).join(', ')
						: undefined;
				return returnSuccess(
					data,
					{ tool: 'search_definition', clientId: clientId ?? null },
					SUMMARIES.searchDefinitionFound(data.kind, detail),
				);
			} catch (err) {
				if (err instanceof DomainError) return returnDomainError(err);
				throw err;
			}
		},
	);
}
