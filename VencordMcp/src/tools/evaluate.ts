import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DomainError } from '../errors/domain-error.js';
import type { Hub } from '../hub/index.js';
import { callPlugin, PLUGIN_DEFAULT_TIMEOUT_MS } from './bridge.js';
import { PARAMS, SUMMARIES, TOOL_DESCRIPTIONS, TOOL_TITLES } from './descriptions.js';
import { returnDomainError, returnSuccess } from './tool-helpers.js';

interface Reply {
	refId: number;
	/** Optional plugin-side debug preview of the value (typeof, ctor name, etc.). */
	preview?: string;
}

// Headroom over the plugin-side eval timeout so the plugin's EVAL_TIMEOUT
// reply wins the race against the wire's PLUGIN_TIMEOUT.
const WIRE_TIMEOUT_GRACE_MS = 5_000;

export function registerEvaluateTool(server: McpServer, hub: Hub): void {
	server.registerTool(
		'evaluate',
		{
			title: TOOL_TITLES.evaluate,
			description: TOOL_DESCRIPTIONS.evaluate,
			inputSchema: {
				ids: PARAMS.idsArray,
				definition: PARAMS.definition,
				previewLimits: PARAMS.previewLimits,
				timeoutMs: PARAMS.evalTimeoutMs,
				clientId: PARAMS.clientId,
			},
		},
		async ({ ids, definition, previewLimits, timeoutMs, clientId }) => {
			try {
				const wireTimeoutMs = Math.max(PLUGIN_DEFAULT_TIMEOUT_MS, (timeoutMs ?? 0) + WIRE_TIMEOUT_GRACE_MS);
				const data = await callPlugin<Reply>(
					hub, clientId, 'evaluate',
					{ ids, definition, previewLimits, timeoutMs },
					wireTimeoutMs,
				);
				return returnSuccess(
					data,
					{ tool: 'evaluate', clientId: clientId ?? null },
					SUMMARIES.evaluated(data.refId, ids.length),
				);
			} catch (err) {
				if (err instanceof DomainError) return returnDomainError(err);
				throw err;
			}
		},
	);
}
