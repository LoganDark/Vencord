import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DEFAULTS, SERVER_INSTRUCTIONS } from './tools/descriptions.js';

export function createServer(): McpServer {
	return new McpServer(
		{ name: DEFAULTS.serverName, version: DEFAULTS.serverVersion },
		{ instructions: SERVER_INSTRUCTIONS },
	);
}
