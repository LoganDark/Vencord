/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { getBuildNumber } from "@webpack/patcher";

import { McpClient } from "./client";
import { makeHandler } from "./handlers";
import { RefRegistry } from "./refs";

const URL = "ws://localhost:12420/mcp";
const RETRY_MS = 5000;
const CLIENT_ID_KEY = "ClaudeMcp_clientId";

const logger = new Logger("ClaudeMcp");

let client: McpClient | undefined;
let registry: RefRegistry | undefined;
let startToken = 0;

async function loadClientId() {
    let id = await DataStore.get<string>(CLIENT_ID_KEY);
    if (!id) {
        id = crypto.randomUUID();
        await DataStore.set(CLIENT_ID_KEY, id);
    }
    return id;
}

function collectClientInfo(): Record<string, unknown> {
    const versions = VencordNative?.native?.getVersions?.() ?? {};
    const buildNumber = getBuildNumber();
    return {
        releaseChannel: window.GLOBAL_ENV?.RELEASE_CHANNEL,
        buildNumber: buildNumber === -1 ? undefined : buildNumber,
        vencordVersion: VERSION,
        electronVersion: versions.electron,
        chromiumVersion: versions.chrome
    };
}

export default definePlugin({
    name: "ClaudeMcp",
    description: "Assist the Claude MCP server",
    authors: [Devs.LoganDark],

    patches: [],

    async start() {
        const myToken = ++startToken;

        let clientId: string;
        try {
            clientId = await loadClientId();
        } catch (err) {
            logger.error("Failed to load client ID:", err);
            return;
        }
        if (myToken !== startToken) return;

        registry = new RefRegistry();

        client = new McpClient({
            url: URL,
            retryMs: RETRY_MS,
            logger,
            clientId,
            helloExtras: collectClientInfo(),
            handler: makeHandler(registry)
        });
        client.start();
    },

    stop() {
        startToken++;
        client?.stop();
        client = undefined;
        registry?.clear();
        registry = undefined;
    }
});
