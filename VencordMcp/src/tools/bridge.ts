/**
 * Client-selection + plugin-call helpers shared by every module-introspection
 * tool. Tools take an optional `clientId`; if it's omitted, exactly-one
 * identified client is auto-selected. The plugin reply envelope is unwrapped
 * here so individual tool handlers only deal with success-shaped data.
 *
 * Wire contract (every tool):
 *   request:  { id, action: <name>, ...params }
 *   reply:    { replyTo, ok: true, ...data }
 *           | { replyTo, ok: false, error: string, code?: string, suggestions?: string[] }
 */

import { DomainError } from '../errors/domain-error.js';
import { logger } from '../logging/logger.js';
import type { Hub, HubClient } from '../hub/index.js';

export const PLUGIN_DEFAULT_TIMEOUT_MS = 30_000;

export class PluginCallError extends DomainError {
	constructor(code: string, message: string, suggestions: string[] = []) {
		super(code, message, [], suggestions);
	}
}

/**
 * Resolve `clientId` against the hub's identified-client map.
 *   - undefined + exactly one identified client → that client
 *   - undefined + zero or multiple → throws (NO_CLIENTS / AMBIGUOUS_CLIENT)
 *   - explicit clientId not in the map → throws CLIENT_NOT_FOUND
 */
export function pickClient(hub: Hub, clientId: string | undefined): HubClient {
	if (clientId !== undefined) {
		const c = hub.getClient(clientId);
		if (!c) {
			throw new PluginCallError(
				'CLIENT_NOT_FOUND',
				`No identified client with id ${JSON.stringify(clientId)}`,
				['Call list_sessions to see currently identified clientIds.'],
			);
		}
		return c;
	}

	const all = hub.getIdentifiedClients();
	if (all.size === 0) {
		throw new PluginCallError(
			'NO_CLIENTS',
			'No Vencord plugin sessions are currently connected and identified.',
			[
				'Make sure Discord is running with the Vencord ClaudeMcp plugin enabled.',
				'Check the server log for any "Hub error" or connection rejection.',
			],
		);
	}
	if (all.size > 1) {
		const ids = [...all.keys()];
		throw new PluginCallError(
			'AMBIGUOUS_CLIENT',
			`Multiple clients are connected; specify clientId explicitly. Available: ${ids.map(i => JSON.stringify(i)).join(', ')}`,
			['Call list_sessions for the full session map.'],
		);
	}
	return [...all.values()][0];
}

async function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
	let handle: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			p,
			new Promise<never>((_, reject) => {
				handle = setTimeout(
					() => reject(new PluginCallError('PLUGIN_TIMEOUT', message)),
					ms,
				);
			}),
		]);
	} finally {
		if (handle) clearTimeout(handle);
	}
}

/**
 * Send `{action, ...payload}` to the chosen client, await the reply, and
 * unwrap the {ok, ...} envelope. Returns the success data on `ok: true`;
 * throws PluginCallError on `ok: false` (with the plugin's code/error/
 * suggestions surfaced) or on disconnect/timeout.
 */
export async function callPlugin<T = Record<string, unknown>>(
	hub: Hub,
	clientId: string | undefined,
	action: string,
	payload: Record<string, unknown> = {},
	timeoutMs: number = PLUGIN_DEFAULT_TIMEOUT_MS,
): Promise<T> {
	const client = pickClient(hub, clientId);
	logger.debug('callPlugin', { action, payloadKeys: Object.keys(payload) });

	let reply: Record<string, unknown>;
	try {
		reply = await withTimeout(
			client.request(action, payload),
			timeoutMs,
			`Plugin did not reply to action ${JSON.stringify(action)} within ${timeoutMs}ms`,
		);
	} catch (err) {
		if (err instanceof PluginCallError) throw err;
		throw new PluginCallError(
			'PLUGIN_CALL_FAILED',
			err instanceof Error ? err.message : String(err),
		);
	}

	if (reply.ok === false) {
		const code = typeof reply.code === 'string' ? reply.code : 'PLUGIN_ERROR';
		const message = typeof reply.error === 'string' ? reply.error : 'Plugin reported an error';
		const suggestions = Array.isArray(reply.suggestions)
			? reply.suggestions.filter((s): s is string => typeof s === 'string')
			: [];
		throw new PluginCallError(code, message, suggestions);
	}

	if (reply.ok !== true) {
		throw new PluginCallError(
			'PLUGIN_PROTOCOL_ERROR',
			`Reply missing 'ok' field; got: ${JSON.stringify(reply).slice(0, 200)}`,
		);
	}

	return reply.result as T;
}
