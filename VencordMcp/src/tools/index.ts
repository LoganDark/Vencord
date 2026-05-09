import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Hub } from '../hub/index.js';
import { registerEvaluateTool } from './evaluate.js';
import { registerFindDefinitionTool } from './find-definition.js';
import { registerFindModulesByRegexTool } from './find-modules-by-regex.js';
import { registerFindModulesByStringTool } from './find-modules-by-string.js';
import { registerInspectTool } from './inspect.js';
import { registerListSessionsTool } from './list-sessions.js';
import { registerLoadChunksTool } from './load-chunks.js';
import { registerMatchModuleSourceTool } from './match-module-source.js';
import { registerReadModuleSourceTool } from './read-module-source.js';
import { registerRecordFeedbackTool } from './record-feedback.js';
import { registerReleaseRefTool } from './release-ref.js';
import { registerSearchDefinitionTool } from './search-definition.js';
import { registerTestModulePatchTool } from './test-module-patch.js';

export function registerAllTools(server: McpServer, hub: Hub): void {
	// Sessions
	registerListSessionsTool(server, hub);

	// Module discovery
	registerFindModulesByStringTool(server, hub);
	registerFindModulesByRegexTool(server, hub);
	registerLoadChunksTool(server, hub);

	// Module inspection
	registerReadModuleSourceTool(server, hub);
	registerMatchModuleSourceTool(server, hub);
	registerTestModulePatchTool(server, hub);

	// Live values
	registerEvaluateTool(server, hub);
	registerInspectTool(server, hub);
	registerSearchDefinitionTool(server, hub);
	registerFindDefinitionTool(server, hub);
	registerReleaseRefTool(server, hub);

	// Misc
	registerRecordFeedbackTool(server);
}
