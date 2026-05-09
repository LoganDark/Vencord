import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { registerAllTools } from './tools/index.js';
import { parseCli } from './cli/args.js';
import { logger } from './logging/logger.js';
import { Hub } from './hub/index.js';

const args = parseCli(process.argv.slice(2));
logger.setLevel(args.logLevel);

const hub = new Hub({ port: args.port, logger });
hub.start();

const server = createServer();
registerAllTools(server, hub);

const transport = new StdioServerTransport();
await server.connect(transport);

logger.info('Server started', { transport: 'stdio', hubPort: args.port });

async function shutdown(reason: string): Promise<void> {
	logger.info(`Shutting down (${reason})...`);
	try { await server.close(); } catch (err) { logger.warn('server.close failed', { error: String(err) }); }
	try { await hub.stop(); } catch (err) { logger.warn('hub.stop failed', { error: String(err) }); }
}

process.on('SIGINT', async () => { await shutdown('SIGINT'); process.exit(0); });
process.on('SIGTERM', async () => { await shutdown('SIGTERM'); process.exit(0); });
