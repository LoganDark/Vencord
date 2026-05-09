import { parseArgs } from 'node:util';
import type { LogLevel } from '../logging/logger.js';

export type CliArgs = {
	logLevel: LogLevel;
	port: number;
};

const DEFAULT_PORT = 12420;

const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

function isValidLogLevel(value: string): value is LogLevel {
	return (VALID_LOG_LEVELS as readonly string[]).includes(value);
}

export function parseCli(argv: string[]): CliArgs {
	const { values } = parseArgs({
		args: argv,
		options: {
			verbose: { type: 'boolean', short: 'v' },
			'log-level': { type: 'string' },
			port: { type: 'string' },
		},
		strict: true,
	});

	let logLevel: LogLevel = 'info';

	const envLevel = process.env.LOG_LEVEL;
	if (envLevel && isValidLogLevel(envLevel)) {
		logLevel = envLevel;
	}

	if (values['log-level']) {
		const cliLevel = values['log-level'];
		if (isValidLogLevel(cliLevel)) {
			logLevel = cliLevel;
		}
	}

	if (values.verbose) {
		logLevel = 'debug';
	}

	let port = DEFAULT_PORT;
	const envPort = process.env.PORT;
	if (envPort && /^\d+$/.test(envPort)) {
		port = Number(envPort);
	}
	if (values.port) {
		if (!/^\d+$/.test(values.port)) {
			throw new Error(`Invalid --port value: ${values.port}`);
		}
		port = Number(values.port);
	}

	return { logLevel, port };
}
