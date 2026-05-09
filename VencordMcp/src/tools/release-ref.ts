import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DomainError } from '../errors/domain-error.js';
import type { Hub } from '../hub/index.js';
import { callPlugin } from './bridge.js';
import { PARAMS, SUMMARIES, TOOL_DESCRIPTIONS, TOOL_TITLES } from './descriptions.js';
import { returnDomainError, returnSuccess } from './tool-helpers.js';

interface Reply {
	released: number[];
	notFound: number[];
	remaining: number;
}

export function registerReleaseRefTool(server: McpServer, hub: Hub): void {
	server.registerTool(
		'release_ref',
		{
			title: TOOL_TITLES.release_ref,
			description: TOOL_DESCRIPTIONS.release_ref,
			inputSchema: {
				ids: PARAMS.refIdsArray,
				clientId: PARAMS.clientId,
			},
		},
		async ({ ids, clientId }) => {
			try {
				const data = await callPlugin<Reply>(hub, clientId, 'release_ref', { ids });
				return returnSuccess(
					data,
					{ tool: 'release_ref', clientId: clientId ?? null },
					SUMMARIES.refsReleased(data.released.length, data.notFound.length, data.remaining),
				);
			} catch (err) {
				if (err instanceof DomainError) return returnDomainError(err);
				throw err;
			}
		},
	);
}
