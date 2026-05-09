import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DomainError } from '../errors/domain-error.js';
import type { Hub } from '../hub/index.js';
import { callPlugin } from './bridge.js';
import { PARAMS, SUMMARIES, TOOL_DESCRIPTIONS, TOOL_TITLES } from './descriptions.js';
import { returnDomainError, returnSuccess } from './tool-helpers.js';

type Reply =
	| { kind: 'module'; moduleId: string }
	| { kind: 'external' };

export function registerFindDefinitionTool(server: McpServer, hub: Hub): void {
	server.registerTool(
		'find_definition',
		{
			title: TOOL_TITLES.find_definition,
			description: TOOL_DESCRIPTIONS.find_definition,
			inputSchema: {
				ref: PARAMS.anyId,
				force: PARAMS.findDefinitionForce,
				clientId: PARAMS.clientId,
			},
		},
		async ({ ref, force, clientId }) => {
			try {
				const data = await callPlugin<Reply>(hub, clientId, 'find_definition', {
					ref,
					force: force ?? false,
				});
				const detail = data.kind === 'module' ? data.moduleId : undefined;
				return returnSuccess(
					data,
					{ tool: 'find_definition', clientId: clientId ?? null },
					SUMMARIES.findDefinitionFound(data.kind, detail),
				);
			} catch (err) {
				if (err instanceof DomainError) return returnDomainError(err);
				throw err;
			}
		},
	);
}
