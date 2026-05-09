import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DomainError } from '../errors/domain-error.js';
import type { Hub } from '../hub/index.js';
import { callPlugin } from './bridge.js';
import { PARAMS, SUMMARIES, TOOL_DESCRIPTIONS, TOOL_TITLES } from './descriptions.js';
import { returnDomainError, returnSuccess } from './tool-helpers.js';

interface Reply {
	loadedChunks: string[];
	alreadyLoaded: string[];
	modules: Array<{ moduleId: string; loaded: boolean }>;
}

// May need to build the unloaded-chunk index first, then fetch the chunks.
const TIMEOUT_MS = 180_000;

export function registerLoadChunksTool(server: McpServer, hub: Hub): void {
	server.registerTool(
		'load_chunks',
		{
			title: TOOL_TITLES.load_chunks,
			description: TOOL_DESCRIPTIONS.load_chunks,
			inputSchema: {
				chunkIds: PARAMS.chunkIdsToLoad,
				moduleIds: PARAMS.moduleIdsToLoad,
				clientId: PARAMS.clientId,
			},
		},
		async ({ chunkIds, moduleIds, clientId }) => {
			try {
				const data = await callPlugin<Reply>(hub, clientId, 'load_chunks', { chunkIds, moduleIds }, TIMEOUT_MS);
				return returnSuccess(
					data,
					{ tool: 'load_chunks', clientId: clientId ?? null },
					SUMMARIES.chunksLoaded(data.loadedChunks.length, data.alreadyLoaded.length),
				);
			} catch (err) {
				if (err instanceof DomainError) return returnDomainError(err);
				throw err;
			}
		},
	);
}
