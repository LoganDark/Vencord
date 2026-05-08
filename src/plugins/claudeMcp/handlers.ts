/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Request dispatcher for the plugin side of the MCP bridge. Maps each
 * `action` name (defined by the server-side wire contract) to a renderer
 * implementation built from `./modules.ts` and `./evaluator.ts`. Errors are
 * thrown as `HandlerError` (defined in `./client.ts`) so the protocol layer
 * can surface them as `{ ok: false, error, code, suggestions? }` replies.
 *
 * Handlers receive `params` already stripped of protocol fields (no `id`,
 * `replyTo`, or `action`). They return either a plain success object — which
 * gets spread into the reply envelope — or throw to signal failure.
 */

import { ensureIndex, getIndexReport, getUnloaded, iterateUnloadedSources, listChunkIds, loadChunks } from "./chunks";
import { HandlerError, type RequestHandler } from "./client";
import { EvalTimeoutError, evaluate, resolveId, searchDefinition, UnknownIdError } from "./evaluator";
import { locateFunction } from "./locator";
import {
    findByRegex,
    findByString,
    getModuleSource,
    hasModule,
    matchSource,
    type ModuleSources,
    testPatch,
    type PatchReplacement,
    type ReplaceFn
} from "./modules";
import { preview, type PreviewLimits } from "./preview";
import type { RefRegistry } from "./refs";

export function makeHandler(registry: RefRegistry): RequestHandler {
    return async (action, params) => {
        switch (action) {
            case "find_modules_by_string": return handleFindByString(params);
            case "find_modules_by_regex": return handleFindByRegex(params);
            case "read_module_source": return handleReadSource(params);
            case "match_module_source": return handleMatchSource(params);
            case "test_module_patch": return handleTestPatch(params);
            case "evaluate": return handleEvaluate(registry, params);
            case "inspect": return handleInspect(registry, params);
            case "search_definition": return handleSearchDefinition(registry, params);
            case "find_definition": return handleFindDefinition(registry, params);
            case "release_ref": return handleReleaseRef(registry, params);
            case "load_chunks": return handleLoadChunks(params);
            default:
                throw new HandlerError("UNKNOWN_ACTION", `Unknown action: ${JSON.stringify(action)}`);
        }
    };
}

type Scope = "loaded" | "unloaded" | "all";

function parseScope(input: unknown): Scope {
    if (input === undefined) return "loaded";
    if (input === "loaded" || input === "unloaded" || input === "all") return input;
    throw new HandlerError("INVALID_ARGUMENT", `scope must be "loaded", "unloaded" or "all"; got ${JSON.stringify(input)}`);
}

/**
 * Shared tail of both find handlers. `search` is run once over `wreq.m` and,
 * for non-default scopes, once more over the unloaded-chunk index (built on
 * first use). The index report rides along so a surprising result can be
 * diagnosed without a second call.
 */
async function findWithScope(scope: Scope, search: (sources?: ModuleSources) => string[]) {
    const moduleIds = scope === "unloaded" ? [] : search();
    if (scope === "loaded") return { moduleIds };

    const index = await ensureIndex();
    const unloaded = search(iterateUnloadedSources()).map(moduleId => ({
        moduleId,
        chunkId: getUnloaded(moduleId)!.chunkId
    }));
    return { moduleIds, unloaded, index };
}

function handleFindByString(params: Record<string, unknown>) {
    const needle = String(params.needle ?? "");
    if (!needle) throw new HandlerError("INVALID_ARGUMENT", "needle is required and must be non-empty");
    return findWithScope(parseScope(params.scope), sources => findByString(needle, sources));
}

function handleFindByRegex(params: Record<string, unknown>) {
    const re = parseRegex(params.pattern, params.flags);
    return findWithScope(parseScope(params.scope), sources => findByRegex(re, sources));
}

/** Source of a module from `wreq.m`, or from the unloaded index if it has been built. */
function resolveSource(moduleId: string): { source: string; loaded: true } | { source: string; loaded: false; chunkId: string } {
    if (hasModule(moduleId)) return { source: getModuleSource(moduleId)!, loaded: true };

    const unloaded = getUnloaded(moduleId);
    if (unloaded !== null) return { source: unloaded.source, loaded: false, chunkId: unloaded.chunkId };

    throw new HandlerError("MODULE_NOT_FOUND", `Module ${JSON.stringify(moduleId)} not found`, getIndexReport() === null
        ? ["The module may live in a chunk that is not loaded yet; search with scope \"all\" to index unloaded chunks first."]
        : []);
}

function handleReadSource(params: Record<string, unknown>) {
    const moduleId = String(params.moduleId);
    return { moduleId, ...resolveSource(moduleId) };
}

function handleMatchSource(params: Record<string, unknown>) {
    const moduleId = String(params.moduleId);
    const { source, ...where } = resolveSource(moduleId);
    const re = parseRegex(params.pattern, params.flags);

    const matches = matchSource(source, re).map(m => ({
        matched: m[0],
        index: m.index ?? -1,
        groups: m.slice(1).map(g => g ?? null)
    }));

    return { moduleId, ...where, matches };
}

async function handleLoadChunks(params: Record<string, unknown>) {
    const moduleIds = parseIdList(params.moduleIds, "moduleIds");
    const chunkIds = parseIdList(params.chunkIds, "chunkIds");
    if (moduleIds.length === 0 && chunkIds.length === 0) {
        throw new HandlerError("INVALID_ARGUMENT", "Pass at least one of moduleIds or chunkIds");
    }

    const toLoad = new Set(chunkIds);
    const alreadyLoaded: string[] = [];
    if (moduleIds.length > 0) {
        await ensureIndex();
        for (const id of moduleIds) {
            if (hasModule(id)) { alreadyLoaded.push(id); continue; }
            const unloaded = getUnloaded(id);
            if (unloaded === null) {
                throw new HandlerError("MODULE_NOT_FOUND", `Module ${JSON.stringify(id)} is neither loaded nor in any indexed chunk`);
            }
            toLoad.add(unloaded.chunkId);
        }
    }

    const known = new Set(listChunkIds());
    for (const id of toLoad) {
        if (!known.has(id)) throw new HandlerError("CHUNK_NOT_FOUND", `Chunk ${JSON.stringify(id)} is not in Discord's chunk map`);
    }

    try {
        await loadChunks([...toLoad]);
    } catch (err) {
        throw new HandlerError("CHUNK_LOAD_FAILED", `wreq.e rejected: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
        loadedChunks: [...toLoad],
        alreadyLoaded,
        modules: moduleIds.map(id => ({ moduleId: id, loaded: hasModule(id) }))
    };
}

function parseIdList(input: unknown, name: string): string[] {
    if (input === undefined) return [];
    if (!Array.isArray(input)) throw new HandlerError("INVALID_ARGUMENT", `${name} must be an array`);
    return input.map(String);
}

function handleTestPatch(params: Record<string, unknown>) {
    const moduleId = String(params.moduleId);
    if (!hasModule(moduleId)) {
        throw new HandlerError("MODULE_NOT_FOUND", `Module ${JSON.stringify(moduleId)} not found`);
    }
    if (!Array.isArray(params.replacements)) {
        throw new HandlerError("INVALID_ARGUMENT", "replacements must be an array");
    }
    const replacements = params.replacements.map(parseReplacement);

    let includeFinalSource = false;
    if (params.includeFinalSource !== undefined) {
        if (typeof params.includeFinalSource !== "boolean") {
            throw new HandlerError("INVALID_ARGUMENT", "includeFinalSource must be a boolean");
        }
        includeFinalSource = params.includeFinalSource;
    }

    return testPatch(moduleId, replacements, { includeFinalSource });
}

const DEFAULT_EVAL_TIMEOUT_MS = 30_000;

async function handleEvaluate(registry: RefRegistry, params: Record<string, unknown>) {
    if (!Array.isArray(params.ids)) {
        throw new HandlerError("INVALID_ARGUMENT", "ids must be an array");
    }
    const definition = String(params.definition ?? "");
    if (!definition) throw new HandlerError("INVALID_ARGUMENT", "definition is required");

    const previewLimits = parsePreviewLimits(params.previewLimits);

    const { timeoutMs = DEFAULT_EVAL_TIMEOUT_MS } = params;
    if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new HandlerError("INVALID_ARGUMENT", "timeoutMs must be a positive integer");
    }

    try {
        const { refId, value } = await evaluate(registry, params.ids, definition, timeoutMs);
        return { refId, preview: preview(value, previewLimits) };
    } catch (err) {
        if (err instanceof UnknownIdError) {
            const code = err.kind === "ref" ? "REF_NOT_FOUND" : "MODULE_NOT_FOUND";
            throw new HandlerError(code, err.message);
        }
        if (err instanceof EvalTimeoutError) {
            throw new HandlerError("EVAL_TIMEOUT", err.message, [
                "Pass a larger timeoutMs if the definition legitimately takes longer.",
                "The promise is still pending in the renderer; nothing was parked in the ref registry."
            ]);
        }
        throw new HandlerError("EVAL_FAILED", err instanceof Error ? err.message : String(err));
    }
}

function handleInspect(registry: RefRegistry, params: Record<string, unknown>) {
    const id = params.id;
    if (id === undefined || id === null) {
        throw new HandlerError("INVALID_ARGUMENT", "id is required");
    }

    const previewLimits = parsePreviewLimits(params.previewLimits);

    let resolved;
    try {
        resolved = resolveId(registry, id as any);
    } catch (err) {
        if (err instanceof UnknownIdError) {
            const code = err.kind === "ref" ? "REF_NOT_FOUND" : "MODULE_NOT_FOUND";
            throw new HandlerError(code, err.message);
        }
        throw err;
    }

    return {
        kind: resolved.kind,
        id: resolved.id,
        preview: preview(resolved.value, previewLimits)
    };
}

function handleSearchDefinition(registry: RefRegistry, params: Record<string, unknown>) {
    const value = resolveFunctionValue(registry, params, "search_definition");
    return searchDefinition(value);
}

async function handleFindDefinition(registry: RefRegistry, params: Record<string, unknown>) {
    const value = resolveFunctionValue(registry, params, "find_definition");

    let force = false;
    if (params.force !== undefined) {
        if (typeof params.force !== "boolean") {
            throw new HandlerError("INVALID_ARGUMENT", "force must be a boolean");
        }
        force = params.force;
    }

    const reply = await locateFunction(value as Function, force);
    if (!reply.ok) {
        throw new HandlerError(reply.code, reply.message);
    }
    if (reply.kind === "module") return { kind: "module", moduleId: reply.moduleId };
    return { kind: "external" };
}

function handleReleaseRef(registry: RefRegistry, params: Record<string, unknown>) {
    if (!Array.isArray(params.ids)) {
        throw new HandlerError("INVALID_ARGUMENT", "ids must be an array of ref ids (negative integers)");
    }
    const released: number[] = [];
    const notFound: number[] = [];
    for (const raw of params.ids) {
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isInteger(n) || n >= 0) {
            throw new HandlerError("INVALID_ARGUMENT", `ids must contain negative integer ref ids; got ${JSON.stringify(raw)}`);
        }
        if (registry.release(n)) released.push(n);
        else notFound.push(n);
    }
    return { released, notFound, remaining: registry.size() };
}

function resolveFunctionValue(
    registry: RefRegistry,
    params: Record<string, unknown>,
    actionName: string
): unknown {
    const ref = params.ref;
    if (ref === undefined || ref === null) {
        throw new HandlerError("INVALID_ARGUMENT", "ref is required");
    }
    let value: unknown;
    try {
        value = resolveId(registry, ref as any).value;
    } catch (err) {
        if (err instanceof UnknownIdError) {
            const code = err.kind === "ref" ? "REF_NOT_FOUND" : "MODULE_NOT_FOUND";
            throw new HandlerError(code, err.message);
        }
        throw err;
    }
    if (typeof value !== "function") {
        throw new HandlerError(
            "NOT_A_FUNCTION",
            `${actionName} requires a function value; got ${typeof value}`
        );
    }
    return value;
}

function parseRegex(pattern: unknown, flags: unknown): RegExp {
    try {
        return new RegExp(String(pattern ?? ""), String(flags ?? ""));
    } catch (err) {
        throw new HandlerError("INVALID_ARGUMENT", `Bad regex: ${err instanceof Error ? err.message : String(err)}`);
    }
}

function parseReplacement(r: unknown): PatchReplacement {
    if (r === null || typeof r !== "object") {
        throw new HandlerError("INVALID_ARGUMENT", "replacement must be an object");
    }
    const obj = r as Record<string, unknown>;
    const match = parseMatchNode(obj.match);
    const replace = parseReplaceNode(obj.replace);
    return { match, replace };
}

function parseMatchNode(node: unknown): string | RegExp {
    if (node === null || typeof node !== "object") {
        throw new HandlerError("INVALID_ARGUMENT", "patch match node must be an object");
    }
    const n = node as Record<string, unknown>;
    if (n.type === "string") return String(n.value);
    if (n.type === "regex") {
        const v = (n.value ?? {}) as Record<string, unknown>;
        return parseRegex(v.pattern, v.flags);
    }
    throw new HandlerError(
        "INVALID_ARGUMENT",
        `Match node type must be "string" or "regex"; got ${JSON.stringify(n.type)}`
    );
}

function parseReplaceNode(node: unknown): string | ReplaceFn {
    if (node === null || typeof node !== "object") {
        throw new HandlerError("INVALID_ARGUMENT", "patch replace node must be an object");
    }
    const n = node as Record<string, unknown>;
    if (n.type === "string") return String(n.value);
    if (n.type === "function") {
        let fn: unknown;
        try {
            fn = (0, eval)(String(n.value));
        } catch (err) {
            throw new HandlerError(
                "INVALID_ARGUMENT",
                `Function replace eval failed: ${err instanceof Error ? err.message : String(err)}`
            );
        }
        if (typeof fn !== "function") {
            throw new HandlerError("INVALID_ARGUMENT", "Function replace node must eval to a function");
        }
        return fn as ReplaceFn;
    }
    throw new HandlerError(
        "INVALID_ARGUMENT",
        `Replace node type must be "string" or "function"; got ${JSON.stringify(n.type)}`
    );
}

function parsePreviewLimits(input: unknown): PreviewLimits {
    if (input === undefined || input === null) return {};
    if (typeof input !== "object") {
        throw new HandlerError("INVALID_ARGUMENT", "previewLimits must be an object");
    }
    const obj = input as Record<string, unknown>;
    const out: PreviewLimits = {};
    for (const key of ["total", "depth", "keys", "string"] as const) {
        const v = obj[key];
        if (v === undefined) continue;
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
            throw new HandlerError(
                "INVALID_ARGUMENT",
                `previewLimits.${key} must be a non-negative integer`
            );
        }
        out[key] = v;
    }
    return out;
}
