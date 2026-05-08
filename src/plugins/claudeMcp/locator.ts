/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Renderer-side wrapper around the native CDP `findDefinition` IPC. Stashes the
 * function under a unique `globalThis` key so the main process can grab it via
 * `Runtime.evaluate(globalThis[key])`, then cleans up the slot whether the call
 * succeeded or threw. Each call uses a fresh key so concurrent invocations
 * don't trample each other.
 */

import type { PluginNative } from "@utils/types";
import { wreq } from "@webpack";

import type { FindDefinitionReply } from "./native";

const Native = VencordNative.pluginHelpers.ClaudeMcp as PluginNative<typeof import("./native")>;

const PROBE_PREFIX = "__VENCORD_MCP_LOCATE__";
let probeCounter = 0;

function makeProbeKey(): string {
    probeCounter = (probeCounter + 1) | 0;
    return `${PROBE_PREFIX}${probeCounter}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function locateFunction(fn: Function, force: boolean): Promise<FindDefinitionReply> {
    const key = makeProbeKey();
    (globalThis as any)[key] = fn;
    try {
        // Pass live wreq.m keys so native can drop false-positive `<digit>:`
        // matches found inside unrelated module bodies. Snapshotting at call
        // time picks up dynamically-loaded chunks since the last call.
        const validIds = Object.keys(wreq.m);
        return await Native.findDefinition(key, force, validIds);
    } finally {
        try { delete (globalThis as any)[key]; } catch { /* best effort */ }
    }
}
