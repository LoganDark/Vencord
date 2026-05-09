import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DomainError } from '../errors/domain-error.js';
import type { Hub } from '../hub/index.js';
import { callPlugin } from './bridge.js';
import { PARAMS, SUMMARIES, TOOL_DESCRIPTIONS, TOOL_TITLES } from './descriptions.js';
import { returnDomainError, returnSuccess } from './tool-helpers.js';

interface Reply {
	kind: 'module' | 'ref';
	id: string | number;
	preview: string;
}

export function registerInspectTool(server: McpServer, hub: Hub): void {
	server.registerTool(
		'inspect',
		{
			title: TOOL_TITLES.inspect,
			description: TOOL_DESCRIPTIONS.inspect,
			inputSchema: {
				id: PARAMS.anyId,
				previewLimits: PARAMS.previewLimits,
				clientId: PARAMS.clientId,
			},
		},
		async ({ id, previewLimits, clientId }) => {
			try {
				const data = await callPlugin<Reply>(hub, clientId, 'inspect', { id, previewLimits });
				return returnSuccess(
					data,
					{ tool: 'inspect', clientId: clientId ?? null },
					SUMMARIES.inspected(data.kind, String(data.id)),
				);
			} catch (err) {
				if (err instanceof DomainError) return returnDomainError(err);
				throw err;
			}
		},
	);
}
