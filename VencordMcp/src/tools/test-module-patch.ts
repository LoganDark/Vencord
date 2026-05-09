import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DomainError } from '../errors/domain-error.js';
import type { Hub } from '../hub/index.js';
import { callPlugin } from './bridge.js';
import { PARAMS, SUMMARIES, TOOL_DESCRIPTIONS, TOOL_TITLES } from './descriptions.js';
import { returnDomainError, returnSuccess } from './tool-helpers.js';

interface PatchTrial {
	matched: string;
	index: number;
	groups: (string | null)[];
	replacement: string;
}

interface PatchStepResult {
	ok: boolean;
	trials?: PatchTrial[];
	reason?: 'no-match' | 'parse-error';
	error?: string;
}

interface Reply {
	moduleId: string | number;
	steps: PatchStepResult[];
	finalSourceLength: number;
	finalSource?: string;
	success: boolean;
}

export function registerTestModulePatchTool(server: McpServer, hub: Hub): void {
	server.registerTool(
		'test_module_patch',
		{
			title: TOOL_TITLES.test_module_patch,
			description: TOOL_DESCRIPTIONS.test_module_patch,
			inputSchema: {
				moduleId: PARAMS.moduleId,
				replacements: PARAMS.replacements,
				includeFinalSource: PARAMS.includeFinalSource,
				clientId: PARAMS.clientId,
			},
		},
		async ({ moduleId, replacements, includeFinalSource, clientId }) => {
			try {
				const data = await callPlugin<Reply>(hub, clientId, 'test_module_patch', {
					moduleId, replacements, includeFinalSource,
				});
				return returnSuccess(
					data,
					{ tool: 'test_module_patch', clientId: clientId ?? null },
					SUMMARIES.patchTested(String(data.moduleId), Boolean(data.success), data.steps?.length ?? 0),
				);
			} catch (err) {
				if (err instanceof DomainError) return returnDomainError(err);
				throw err;
			}
		},
	);
}
