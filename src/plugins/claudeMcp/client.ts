/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";

export interface McpConnectionOptions {
    url: string;
    retryMs: number;
    logger: Logger;
}

export abstract class McpConnection {
    protected readonly logger: Logger;
    private readonly url: string;
    private readonly retryMs: number;

    private ws?: WebSocket;
    private retryTimer?: ReturnType<typeof setTimeout>;
    private stopped = false;

    constructor(opts: McpConnectionOptions) {
        this.url = opts.url;
        this.retryMs = opts.retryMs;
        this.logger = opts.logger;
    }

    start() {
        this.stopped = false;
        this.connect();
    }

    stop() {
        this.stopped = true;
        if (this.retryTimer != null) {
            clearTimeout(this.retryTimer);
            this.retryTimer = undefined;
        }
        this.ws?.close(1000, "Plugin stopped");
        this.ws = undefined;
    }

    protected send<T extends {}>(payload: T) {
        const { ws } = this;

        if (ws?.readyState !== WebSocket.OPEN) {
            throw new TypeError("Socket is not ready");
        }

        ws.send(JSON.stringify(payload));
    }

    protected abstract onConnectionOpen(): void;
    protected abstract onReceive(data: object): void;
    protected abstract onConnectionClose(): void;

    private connect() {
        if (this.stopped) return;

        let ws: WebSocket;
        try {
            ws = this.ws = new WebSocket(this.url);
        } catch (err) {
            this.logger.error("Failed to construct WebSocket:", err);
            this.scheduleReconnect();
            return;
        }

        let everOpen = false;

        ws.addEventListener("open", () => {
            if (this.stopped) {
                ws.close();
                return;
            }

            everOpen = true;
            this.logger.info("Connected");
            this.onConnectionOpen();
        });

        ws.addEventListener("message", m => {
            let data: object;
            try {
                data = JSON.parse(String(m.data));
            } catch (e) {
                this.logger.error("Malformed data from server: %o; %o", m.data, e);
                return;
            }

            this.logger.info("Message: %o", data);
            this.onReceive(data);
        });

        ws.addEventListener("close", () => {
            if (this.ws === ws) this.ws = undefined;
            this.onConnectionClose();
            if (this.stopped) return;
            if (everOpen) this.logger.info(`Disconnected, retrying in ${this.retryMs}ms`);
            this.scheduleReconnect();
        });

        ws.addEventListener("error", () => {
            // close fires after error; retry handled there
        });
    }

    private scheduleReconnect() {
        if (this.stopped || this.retryTimer != null) return;
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            this.connect();
        }, this.retryMs);
    }
}

type PendingReply<T> = {
    resolve: (reply: Reply<T>) => void;
    reject: (err: Error) => void;
};

type MessageId = string;
type Reply<T> = { id?: MessageId, replyTo: MessageId } & Omit<T, "id" | "replyTo">;
type Message<T> = { id: MessageId, replyTo?: MessageId } & Omit<T, "id" | "replyTo">;

export abstract class McpProtocol extends McpConnection {
    private readonly pending = new Map<string, PendingReply<never>>();

    protected sendMessage<T extends { id?: never } = any>(data: T): Promise<Reply<unknown>> {
        const id: MessageId = crypto.randomUUID();
        const message = { id, ...data } as Message<T>;

        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });

            try {
                this.send(message);
            } catch(e) {
                this.pending.delete(id);
                reject(e);
            }
        });
    }

    protected reply<T extends { id?: never, replyTo?: never } = any>(replyTo: string, data: T): void {
        this.send({ replyTo, ...data });
    }

    protected replyMessage<T extends { id?: never, replyTo?: never } = any>(replyTo: string, data: T): Promise<Reply<unknown>> {
        return this.sendMessage({ replyTo, ...data });
    }

    protected onReceive(data: unknown): void {
        if (typeof data !== "object" || data === null) {
            return;
        }

        let isReply = false;
        let isMessage = false;

        if ("replyTo" in data && typeof data.replyTo === "string") {
            isReply = true;
            const reply = data as Reply<unknown>;
            const pending = this.pending.get(reply.replyTo);

            if (pending) {
                this.pending.delete(reply.replyTo);
                pending.resolve(reply as any);
            } else {
                this.onUnknownServerReply(reply);
            }
        }

        if ("id" in data && typeof data.id === "string") {
            isMessage = true;
            const msg = data as Message<unknown>;
            this.onServerRequest(msg);
        }

        if (!isReply && !isMessage) {
            this.logger.warn("Message has no id or replyTo:", data);
        }
    }

    protected onConnectionClose(): void {
        for (const { reject } of this.pending.values()) reject(new Error("Disconnected"));
        this.pending.clear();
    }

    protected abstract onServerRequest(msg: Message<unknown>): void;
    protected abstract onUnknownServerReply(reply: Reply<unknown>): void;
}

/**
 * Thrown by request handlers to signal a tool-level error with a code that
 * gets surfaced verbatim to the MCP server (and on to Claude). Anything else
 * thrown out of a handler is treated as INTERNAL_ERROR.
 */
export class HandlerError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly suggestions: string[] = []
    ) {
        super(message);
        this.name = "HandlerError";
    }
}

/**
 * Server → plugin request handler. Receives the action name and the request
 * payload (everything except `id`/`replyTo`). Return value is spread into a
 * `{ ok: true, ... }` reply if it's a plain object, or wrapped as
 * `{ ok: true, value: ... }` if it's a primitive. Throwing a HandlerError
 * produces a `{ ok: false, error, code, suggestions? }` reply; any other
 * throw becomes `{ ok: false, error, code: "INTERNAL_ERROR" }`.
 */
export type RequestHandler = (
    action: string,
    params: Record<string, unknown>
) => unknown | Promise<unknown>;

export interface McpClientOptions extends McpConnectionOptions {
    clientId: string;
    helloExtras?: Record<string, unknown>;
    handler?: RequestHandler;
}

export class McpClient extends McpProtocol {
    private readonly clientId: string;
    private readonly helloExtras: Record<string, unknown>;
    private readonly handler?: RequestHandler;

    constructor(opts: McpClientOptions) {
        super(opts);
        this.clientId = opts.clientId;
        this.helloExtras = opts.helloExtras ?? {};
        this.handler = opts.handler;
    }

    protected onConnectionOpen(): void {
        this.send({
            action: "hello",
            params: { clientId: this.clientId, ...this.helloExtras }
        });
    }

    protected async onServerRequest(msg: Message<unknown>): Promise<void> {
        if (this.handler == null) {
            this.reply(msg.id, {});
            return;
        }

        const m = msg as Record<string, unknown> & { id: MessageId };
        const action = typeof m.action === "string" ? m.action : "";
        const params = (m.params != null && typeof m.params === "object" && !Array.isArray(m.params))
            ? m.params as Record<string, unknown>
            : {};

        try {
            const result = await this.handler(action, params);
            this.reply(msg.id, { ok: true, result } as any);
        } catch (err) {
            const code = err instanceof HandlerError ? err.code : "INTERNAL_ERROR";
            const message = err instanceof Error ? err.message : String(err);
            const errPayload: Record<string, unknown> = { ok: false, error: message, code };
            if (err instanceof HandlerError && err.suggestions.length > 0) {
                errPayload.suggestions = err.suggestions;
            }
            this.reply(msg.id, errPayload as any);
        }
    }

    protected onUnknownServerReply(reply: Reply<unknown>): void {}
}
