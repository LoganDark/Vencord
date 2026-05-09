/**
 * WebSocket hub: server-side counterpart to the Vencord plugin's `client.ts`.
 *
 * Same three-layer hierarchy as the plugin (connection → protocol → concrete),
 * with a fourth class on top that owns the WebSocketServer and manages the
 * pool of connected clients.
 *
 *   ConnectedClient (abstract): per-socket lifecycle + raw send.
 *   ClientProtocol  (abstract): id-tagged sendMessage + terminal reply,
 *                               dispatch of inbound messages by shape.
 *   HubClient       (concrete): handshake (extracts {clientId} from the
 *                               first frame) and auto-acks every inbound
 *                               request with an empty terminal reply.
 *   Hub:                         binds the WebSocketServer, instantiates one
 *                               HubClient per accepted connection, tracks
 *                               them, and tears them down on stop().
 *
 * Protocol on the wire (mirrors the plugin):
 *   - Request:        { id, ... }                  — expects { replyTo: id }
 *   - Terminal reply: { replyTo, ... }             — no id, not tracked
 *   - Replyable reply:{ id, replyTo, ... }         — both branches dispatch
 *   - Handshake:      { clientId, ... }            — first frame from plugin,
 *                                                    no id/replyTo
 */

import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { logger as defaultLogger } from '../logging/logger.js';

type Logger = typeof defaultLogger;

interface PendingReply<T> {
	resolve: (reply: Reply<T>) => void;
	reject: (err: Error) => void;
}

type MessageId = string;
export type Reply<T> = { id?: MessageId; replyTo: MessageId } & Omit<T, 'id' | 'replyTo'>;
export type Message<T> = { id: MessageId; replyTo?: MessageId } & Omit<T, 'id' | 'replyTo'>;

export abstract class ConnectedClient {
	protected readonly logger: Logger;
	private readonly ws: WebSocket;
	private closed = false;

	constructor(ws: WebSocket, logger: Logger) {
		this.ws = ws;
		this.logger = logger;

		ws.on('message', raw => {
			let data: unknown;
			try {
				data = JSON.parse(String(raw));
			} catch (e) {
				this.logger.error('Malformed data from client', { raw: String(raw), error: String(e) });
				return;
			}
			if (typeof data !== 'object' || data === null) {
				this.logger.warn('Non-object message from client', { data });
				return;
			}
			this.logger.debug('Message: %o', data);
			this.onReceive(data);
		});

		ws.on('close', () => {
			if (this.closed) return;
			this.closed = true;
			this.onConnectionClose();
		});

		ws.on('error', err => {
			this.logger.error('Socket error', { error: String(err) });
		});

		// Defer until after the constructor returns so subclass fields are initialized.
		queueMicrotask(() => {
			if (!this.closed) this.onConnectionOpen();
		});
	}

	close(code = 1000, reason = 'Hub stopped'): void {
		this.ws.close(code, reason);
	}

	protected send<T extends {}>(payload: T): void {
		if (this.ws.readyState !== WebSocket.OPEN) {
			throw new TypeError('Socket is not ready');
		}
		this.ws.send(JSON.stringify(payload));
	}

	protected abstract onConnectionOpen(): void;
	protected abstract onReceive(data: object): void;
	protected abstract onConnectionClose(): void;
}

export abstract class ClientProtocol extends ConnectedClient {
	private readonly pending = new Map<string, PendingReply<unknown>>();

	protected sendMessage<T extends { id?: never } = any>(data: T): Promise<Reply<unknown>> {
		const id: MessageId = randomUUID();
		const message = { id, ...data } as Message<T>;

		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });

			try {
				this.send(message);
			} catch (e) {
				this.pending.delete(id);
				reject(e instanceof Error ? e : new Error(String(e)));
			}
		});
	}

	protected reply<T extends { id?: never; replyTo?: never } = any>(replyTo: string, data: T): void {
		this.send({ replyTo, ...data });
	}

	protected replyMessage<T extends { id?: never; replyTo?: never } = any>(replyTo: string, data: T): Promise<Reply<unknown>> {
		return this.sendMessage({ replyTo, ...data });
	}

	protected onReceive(data: object): void {
		let isReply = false;
		let isMessage = false;

		if ('replyTo' in data && typeof data.replyTo === 'string') {
			isReply = true;
			const reply = data as Reply<unknown>;
			const pending = this.pending.get(reply.replyTo);

			if (pending) {
				this.pending.delete(reply.replyTo);
				pending.resolve(reply);
			} else {
				this.onUnknownClientReply(reply);
			}
		}

		if ('id' in data && typeof data.id === 'string') {
			isMessage = true;
			this.onClientRequest(data as Message<unknown>);
		}

		if (!isReply && !isMessage) {
			this.onUnstructured(data);
		}
	}

	protected onConnectionClose(): void {
		for (const { reject } of this.pending.values()) reject(new Error('Disconnected'));
		this.pending.clear();
	}

	/**
	 * Hook for messages with neither id nor replyTo. Default: warn and drop.
	 * The handshake `{clientId}` arrives here; HubClient overrides to consume it.
	 */
	protected onUnstructured(data: object): void {
		this.logger.warn('Message has no id or replyTo', { data });
	}

	protected abstract onClientRequest(msg: Message<unknown>): void;
	protected abstract onUnknownClientReply(reply: Reply<unknown>): void;
}

/**
 * Per-session metadata. The two timestamp fields are populated by the hub
 * itself; the remaining fields are merged in from the plugin's `hello` payload
 * (minus the `action` and `clientId` protocol fields). The index signature lets
 * future hello fields (discord build, vencord version, platform, etc.) flow
 * through without code changes here.
 */
export interface SessionInfo {
	connectedAt: string;
	identifiedAt: string;
	[key: string]: unknown;
}

export interface HubClientCallbacks {
	onIdentify(clientId: string): void;
}

export class HubClient extends ClientProtocol {
	private readonly callbacks: HubClientCallbacks;
	private readonly connectedAt: string;
	private info: SessionInfo | null = null;

	constructor(ws: WebSocket, logger: Logger, callbacks: HubClientCallbacks) {
		super(ws, logger);
		this.callbacks = callbacks;
		this.connectedAt = new Date().toISOString();
	}

	getInfo(): SessionInfo | null {
		return this.info;
	}

	/**
	 * Public dispatch entry-point used by tools. Sends an `action`-tagged
	 * request to the plugin and returns the reply with the protocol fields
	 * stripped. Rejects on disconnect (via the underlying `sendMessage`).
	 */
	/**
	 * Sends `{action, params}` to the plugin and returns the reply envelope
	 * verbatim (minus the protocol's `id`/`replyTo` fields). The envelope is
	 * `{ok: true, result: <T>}` on success or `{ok: false, error, code, suggestions?}`
	 * on error. Caller (`callPlugin`) is responsible for unwrapping.
	 */
	async request(action: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
		const reply = await this.sendMessage<any>({ action, params: payload });
		const { id: _id, replyTo: _replyTo, ...envelope } = reply as Record<string, unknown>;
		void _id;
		void _replyTo;
		return envelope;
	}

	protected onConnectionOpen(): void {
		this.logger.info('Client connected');
	}

	protected onConnectionClose(): void {
		super.onConnectionClose();
		this.logger.info('Client disconnected');
	}

	protected onUnstructured(data: object): void {
		if (
			this.info === null
			&& 'action' in data && data.action === 'hello'
			&& 'params' in data && data.params != null && typeof data.params === 'object'
		) {
			const params = data.params as Record<string, unknown>;
			if (typeof params.clientId !== 'string') {
				super.onUnstructured(data);
				return;
			}
			const { clientId, ...extra } = params;
			this.info = {
				connectedAt: this.connectedAt,
				identifiedAt: new Date().toISOString(),
				...extra,
			};
			this.callbacks.onIdentify(clientId);
			return;
		}
		super.onUnstructured(data);
	}

	protected onClientRequest(msg: Message<unknown>): void {
		this.reply(msg.id, {});
	}

	protected onUnknownClientReply(_reply: Reply<unknown>): void {}
}

export interface HubOptions {
	port: number;
	path?: string;
	logger: Logger;
}

export class Hub {
	private readonly port: number;
	private readonly path: string;
	private readonly logger: Logger;
	private wss?: WebSocketServer;
	private readonly clients = new Set<HubClient>();
	private readonly identified = new Map<string, HubClient>();

	constructor(opts: HubOptions) {
		this.port = opts.port;
		this.path = opts.path ?? '/mcp';
		this.logger = opts.logger;
	}

	start(): void {
		if (this.wss) return;
		const wss = (this.wss = new WebSocketServer({ port: this.port, path: this.path }));

		wss.on('listening', () => {
			this.logger.info('Hub listening', { port: this.port, path: this.path });
		});

		wss.on('connection', ws => {
			const client: HubClient = new HubClient(ws, this.logger, {
				onIdentify: clientId => this.registerIdentified(clientId, client),
			});
			this.clients.add(client);
			ws.on('close', () => {
				this.clients.delete(client);
				for (const [id, c] of this.identified) {
					if (c === client) this.identified.delete(id);
				}
			});
		});

		wss.on('error', err => {
			this.logger.error('Hub error', { error: String(err) });
		});
	}

	async stop(): Promise<void> {
		const wss = this.wss;
		if (!wss) return;
		this.wss = undefined;

		for (const c of this.clients) c.close();
		this.clients.clear();
		this.identified.clear();

		await new Promise<void>((resolve, reject) => {
			wss.close(err => (err ? reject(err) : resolve()));
		});
	}

	getClient(clientId: string): HubClient | undefined {
		return this.identified.get(clientId);
	}

	getClients(): readonly HubClient[] {
		return [...this.clients];
	}

	getIdentifiedClients(): ReadonlyMap<string, HubClient> {
		return this.identified;
	}

	listSessions(): Record<string, SessionInfo> {
		const result: Record<string, SessionInfo> = {};
		for (const [clientId, client] of this.identified) {
			const info = client.getInfo();
			if (info) result[clientId] = info;
		}
		return result;
	}

	private registerIdentified(clientId: string, client: HubClient): void {
		const existing = this.identified.get(clientId);
		if (existing && existing !== client) {
			this.logger.warn('Replacing existing identified client', { clientId });
			existing.close(1000, 'Replaced by reconnect');
		}
		this.identified.set(clientId, client);
		this.logger.info('Client identified', { clientId });
	}
}
