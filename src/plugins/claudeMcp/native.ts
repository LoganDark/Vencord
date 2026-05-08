/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Main-process bridge to the Chrome DevTools Protocol for the ClaudeMcp plugin.
 *
 * Exposes one IPC method, `findDefinition(probeKey, force)`, which:
 *   1. attaches `webContents.debugger` (closing DevTools first iff `force` is
 *      true and DevTools is currently open — DevTools is NOT reopened after),
 *   2. evaluates `globalThis[probeKey]` to obtain a RemoteObject objectId for
 *      the function the renderer wants to locate,
 *   3. reads the function's `[[FunctionLocation]]` via Runtime.getProperties,
 *   4. fetches the containing script's source via Debugger.getScriptSource and
 *      regex-parses it for webpack factory-key boundaries,
 *   5. returns the moduleId of the enclosing factory (or "external" if the
 *      function lives outside any factory in that script).
 *
 * All CDP work happens in one short-lived attach/detach window per call, so the
 * conflict with DevTools is minimised — at rest the renderer's CDP target is
 * untouched and DevTools may be opened freely.
 *
 * `force: true` is intentionally surfaced as an opt-in escape hatch: the agent
 * is instructed to confirm with the user before passing it, since it closes
 * the user's DevTools window.
 */

import { Debugger, IpcMainInvokeEvent, WebContents } from "electron";

export type FindDefinitionReply =
    | { ok: true; kind: "module"; moduleId: string }
    | { ok: true; kind: "external" }
    | { ok: false; code: ErrorCode; message: string };

type ErrorCode =
    | "DEVTOOLS_OPEN"
    | "ATTACH_FAILED"
    | "PROBE_NOT_FOUND"
    | "PROBE_NOT_FUNCTION"
    | "NO_LOCATION"
    | "GET_SOURCE_FAILED"
    | "DETACHED_MID_CALL"
    | "INTERNAL_ERROR";

const PROTOCOL_VERSION = "1.3";
const OBJECT_GROUP = "vencord-mcp";

/**
 * Cache of raw factory-key positions found in a script's source. Filtering by
 * `validIds` happens at call time — the validIds set varies between calls (a
 * chunk loaded between calls adds new ids), but the raw match positions are a
 * pure function of the source text, so we cache them keyed by source identity
 * (a fresh wrapper object per unique source text). Indirection through
 * sourceKeyByScriptId lets WeakMap entries GC when scriptIds roll.
 */
const rawMatchesBySource = new WeakMap<{ source: string; }, RawMatch[]>();
const sourceKeyByScriptId = new Map<string, { source: string; }>();

interface RawMatch {
    moduleId: string;
    start: number; // byte offset of the id digit
}

interface FactoryEntry {
    moduleId: string;
    start: number; // byte offset of the id digit (== where the factory expression begins, modulo whitespace)
    end: number;   // byte offset (exclusive) where the next factory begins
}

export async function findDefinition(
    e: IpcMainInvokeEvent,
    probeKey: string,
    force: boolean,
    validIds: string[]
): Promise<FindDefinitionReply> {
    if (typeof probeKey !== "string" || probeKey.length === 0) {
        return { ok: false, code: "INTERNAL_ERROR", message: "probeKey must be a non-empty string" };
    }
    if (typeof force !== "boolean") force = false;
    if (!Array.isArray(validIds)) {
        return { ok: false, code: "INTERNAL_ERROR", message: "validIds must be a string array" };
    }
    const validIdSet = new Set(validIds.filter(s => typeof s === "string"));

    const sender = e.sender;
    const dbg = sender.debugger;

    let attachedHere = false;
    if (!dbg.isAttached()) {
        if (sender.isDevToolsOpened()) {
            if (!force) {
                return {
                    ok: false,
                    code: "DEVTOOLS_OPEN",
                    message: "DevTools is open on this WebContents; CDP cannot attach. Pass force: true to close DevTools (it will NOT be reopened) or close it manually."
                };
            }
            await closeDevTools(sender);
        }
        try {
            dbg.attach(PROTOCOL_VERSION);
            attachedHere = true;
        } catch (err) {
            return { ok: false, code: "ATTACH_FAILED", message: String(err) };
        }
    }

    // If something detaches us mid-call (user opens DevTools, etc.), reject the
    // pending command via this promise so we surface a clear error instead of
    // hanging.
    let detachReason: string | null = null;
    const onDetach = (_event: unknown, reason: string) => { detachReason = reason; };
    dbg.on("detach", onDetach);

    try {
        return await runFindDefinition(dbg, probeKey, validIdSet, () => detachReason);
    } catch (err) {
        if (detachReason !== null) {
            return { ok: false, code: "DETACHED_MID_CALL", message: `Debugger detached mid-call: ${detachReason}` };
        }
        return { ok: false, code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) };
    } finally {
        dbg.removeListener("detach", onDetach);
        try {
            await dbg.sendCommand("Runtime.releaseObjectGroup", { objectGroup: OBJECT_GROUP });
        } catch { /* best effort */ }
        if (attachedHere && dbg.isAttached()) {
            try { dbg.detach(); } catch { /* best effort */ }
        }
    }
}

async function runFindDefinition(
    dbg: Debugger,
    probeKey: string,
    validIds: Set<string>,
    detachReason: () => string | null
): Promise<FindDefinitionReply> {
    const evalRes = await dbg.sendCommand("Runtime.evaluate", {
        expression: `globalThis[${JSON.stringify(probeKey)}]`,
        objectGroup: OBJECT_GROUP,
        returnByValue: false
    });
    if (detachReason() !== null) throw new Error("detached");

    if (evalRes.exceptionDetails) {
        return { ok: false, code: "INTERNAL_ERROR", message: `Runtime.evaluate exception: ${evalRes.exceptionDetails.text ?? "unknown"}` };
    }

    const obj = evalRes.result;
    if (!obj || obj.type === "undefined") {
        return { ok: false, code: "PROBE_NOT_FOUND", message: `globalThis[${JSON.stringify(probeKey)}] is undefined` };
    }
    if (obj.type !== "function") {
        return { ok: false, code: "PROBE_NOT_FUNCTION", message: `globalThis[${JSON.stringify(probeKey)}] is ${obj.type}, not a function` };
    }
    if (!obj.objectId) {
        return { ok: false, code: "INTERNAL_ERROR", message: "Function value returned without objectId" };
    }

    const propsRes = await dbg.sendCommand("Runtime.getProperties", {
        objectId: obj.objectId,
        ownProperties: false,
        accessorPropertiesOnly: false,
        generatePreview: false
    });
    if (detachReason() !== null) throw new Error("detached");

    const internal: { name: string; value?: { value?: { scriptId: string; lineNumber: number; columnNumber: number; }; }; }[]
        = propsRes.internalProperties ?? [];
    const locProp = internal.find(p => p.name === "[[FunctionLocation]]");
    const loc = locProp?.value?.value;
    if (!loc || typeof loc.scriptId !== "string") {
        return { ok: false, code: "NO_LOCATION", message: "Function has no [[FunctionLocation]] (native or already-collected)" };
    }

    const { scriptId, lineNumber, columnNumber } = loc;

    let source: string;
    try {
        // Debugger.enable is idempotent and required before getScriptSource.
        await dbg.sendCommand("Debugger.enable", {});
        const sourceRes = await dbg.sendCommand("Debugger.getScriptSource", { scriptId });
        source = sourceRes.scriptSource;
    } catch (err) {
        return { ok: false, code: "GET_SOURCE_FAILED", message: `Debugger.getScriptSource failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (detachReason() !== null) throw new Error("detached");

    const offset = lineColToOffset(source, lineNumber, columnNumber);
    const entries = getFactoryEntries(scriptId, source, validIds);
    const moduleId = findEnclosingModuleId(entries, offset);

    if (moduleId === null) return { ok: true, kind: "external" };
    return { ok: true, kind: "module", moduleId };
}

async function closeDevTools(sender: WebContents): Promise<void> {
    if (!sender.isDevToolsOpened()) return;
    await new Promise<void>(resolve => {
        const done = () => {
            sender.removeListener("devtools-closed", done);
            resolve();
        };
        sender.on("devtools-closed", done);
        sender.closeDevTools();
    });
}

function lineColToOffset(source: string, line: number, col: number): number {
    let offset = 0;
    let lineNo = 0;
    while (lineNo < line) {
        const next = source.indexOf("\n", offset);
        if (next === -1) return source.length;
        offset = next + 1;
        lineNo++;
    }
    return Math.min(offset + col, source.length);
}

function getFactoryEntries(scriptId: string, source: string, validIds: Set<string>): FactoryEntry[] {
    let key = sourceKeyByScriptId.get(scriptId);
    if (key && key.source !== source) key = undefined;
    if (!key) {
        key = { source };
        sourceKeyByScriptId.set(scriptId, key);
    }
    let raw = rawMatchesBySource.get(key);
    if (!raw) {
        raw = parseRawMatches(source);
        rawMatchesBySource.set(key, raw);
    }

    const entries: FactoryEntry[] = [];
    for (const m of raw) {
        if (!validIds.has(m.moduleId)) continue;
        entries.push({ moduleId: m.moduleId, start: m.start, end: source.length });
    }
    // Already sorted: parseRawMatches walks left-to-right and validIds filter preserves order.
    for (let i = 0; i < entries.length - 1; i++) {
        entries[i].end = entries[i + 1].start;
    }
    return entries;
}

/**
 * Scan a webpack bundle for plausible factory-table entries. Two recognized
 * forms (webpack chooses based on minifier settings):
 *
 *   <id>: function (...) { ... }   |   <id>: (...) => ...   |   <id>: identifier
 *   <id> (...) { ... }                                          (object-method shorthand)
 *
 * Discord ships shorthand factories at present, so the colon-less form is the
 * common case; we still match the colon form for portability across builds.
 *
 * Match shape: `<comma-or-brace> <whitespace> <id> <whitespace> <(-or-:>`. The
 * recorded `start` is the offset of the id digit itself, which is before any
 * inner-function position in the factory body and before the next factory's
 * matching position — exactly what binary search needs.
 *
 * False positives (`,0:foo` inside arbitrary module bodies) are accepted by
 * this regex on purpose; the caller drops them by filtering against the live
 * `wreq.m` key set, which is the authoritative list of real module ids.
 */
function parseRawMatches(source: string): RawMatch[] {
    const out: RawMatch[] = [];
    const re = /[,{]\s*(?:"(\d+)"|(\d+))(?=\s*[(:])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
        const id = m[1] ?? m[2];
        const idOffset = m[0].search(/\d/);
        out.push({ moduleId: id, start: m.index + idOffset });
    }
    return out;
}

function findEnclosingModuleId(entries: FactoryEntry[], offset: number): string | null {
    if (entries.length === 0) return null;
    // Largest start ≤ offset.
    let lo = 0;
    let hi = entries.length - 1;
    let ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (entries[mid].start <= offset) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    if (ans === -1) return null;
    const e = entries[ans];
    if (offset >= e.end) return null;
    return e.moduleId;
}
