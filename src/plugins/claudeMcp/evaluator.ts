/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Bridges modules and ref-ids:
 *   - `resolveId` accepts either a webpack module id (positive) or a ref id
 *     (negative) and returns the underlying value. Module ids go through
 *     `wreq(id)` which forces the factory to run; ref ids look up the registry.
 *   - `evaluate` resolves a list of ids, eval's a user-supplied function-source,
 *     calls it with the resolved array, and parks the return value in the
 *     registry under a fresh ref id.
 *   - `searchDefinition` locates the module factory whose source contains a
 *     given function's stringified body — the renderer-only string-search
 *     fallback. Returns `external` when the value is defined outside any
 *     module factory (e.g. native code, top-level bundle code, user eval)
 *     and `ambiguous` when several factories match (common helpers).
 *     The CDP-backed exact answer lives in `./locator.ts` as `findDefinition`.
 */

import { wreq } from "@webpack";

import { hasModule, iterateModuleSources, type ModuleId } from "./modules";
import type { RefId, RefRegistry } from "./refs";

/**
 * An id that may refer to either a webpack module (non-negative) or a ref
 * registry slot (negative). Strings are accepted for the module side because
 * webpack ids are conventionally serialized as strings on the wire; numeric
 * inputs are coerced before dispatch.
 */
export type AnyId = ModuleId | RefId | number;

export type ResolveResult =
    | { kind: "module"; id: ModuleId; value: unknown }
    | { kind: "ref"; id: RefId; value: unknown };

export class UnknownIdError extends Error {
    constructor(public readonly id: AnyId, public readonly kind: "module" | "ref") {
        super(`Unknown ${kind} id: ${String(id)}`);
        this.name = "UnknownIdError";
    }
}

/**
 * Decide whether `id` should be treated as a ref id or a module id.
 *
 *   - A negative integer is always a ref.
 *   - A string parsing as a negative integer (e.g. "-3") is a ref.
 *   - Anything else (positive integers, non-numeric strings) is a module id.
 *
 * Module ids retain their original form (string or number) when handed to
 * `wreq`, since webpack indexes its factory map by the original key shape.
 */
function classifyId(id: AnyId): { kind: "ref"; id: RefId } | { kind: "module"; id: ModuleId } {
    if (typeof id === "number") {
        return Number.isInteger(id) && id < 0
            ? { kind: "ref", id }
            : { kind: "module", id: String(id) };
    }
    // string
    if (/^-\d+$/.test(id)) {
        return { kind: "ref", id: parseInt(id, 10) };
    }
    return { kind: "module", id };
}

export function resolveId(registry: RefRegistry, id: AnyId): ResolveResult {
    const c = classifyId(id);
    if (c.kind === "ref") {
        const slot = registry.get(c.id);
        if (!slot.found) throw new UnknownIdError(id, "ref");
        return { kind: "ref", id: c.id, value: slot.value };
    }
    if (!hasModule(c.id)) throw new UnknownIdError(id, "module");
    return { kind: "module", id: c.id, value: wreq(c.id) };
}

/**
 * Evaluate `definition` with the resolved values of `ids`.
 *
 *   1. `definition` is `eval`'d in indirect mode (no closure capture). It must
 *      produce a function value — typically an arrow function of the form
 *      `(modules) => ...`.
 *   2. The function is called with a single argument: the array of resolved
 *      values, in the same order as `ids`. (Module ids resolve via `wreq()`,
 *      ref ids via the registry.)
 *   3. The return value is awaited (so async definitions and returned promises
 *      resolve to their settled value) and parked in the registry under a
 *      fresh ref id. If it doesn't settle within `timeoutMs`, an
 *      `EvalTimeoutError` is thrown and nothing is parked.
 *
 * Both the new ref id and the value itself are returned so callers can decide
 * what subset to surface to the agent (typically just the id plus a debug
 * preview of the value).
 */
export async function evaluate(
    registry: RefRegistry,
    ids: readonly AnyId[],
    definition: string,
    timeoutMs: number
): Promise<{ refId: RefId; value: unknown }> {
    const resolved = ids.map(id => resolveId(registry, id).value);

    let fn: unknown;
    try {
        fn = (0, eval)(definition);
    } catch (err) {
        throw new Error(`Failed to evaluate definition: ${String(err)}`);
    }

    if (typeof fn !== "function") {
        throw new TypeError(`Definition must produce a function, got ${typeof fn}`);
    }

    const value = await withTimeout(
        (fn as (modules: unknown[]) => unknown)(resolved),
        timeoutMs
    );
    const refId = registry.assign(value);
    return { refId, value };
}

export class EvalTimeoutError extends Error {
    constructor(public readonly timeoutMs: number) {
        super(`Definition did not settle within ${timeoutMs}ms`);
        this.name = "EvalTimeoutError";
    }
}

async function withTimeout<T>(value: T | PromiseLike<T>, ms: number): Promise<T> {
    let handle: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            value,
            new Promise<never>((_, reject) => {
                handle = setTimeout(() => reject(new EvalTimeoutError(ms)), ms);
            })
        ]);
    } finally {
        if (handle !== undefined) clearTimeout(handle);
    }
}

export type SearchDefinitionResult =
    | { kind: "module"; moduleId: ModuleId }
    | { kind: "external" }
    | { kind: "ambiguous"; candidates: ModuleId[] };

/**
 * Renderer-only string-search heuristic for locating the webpack factory whose
 * body contains a given function's source. The high-precision answer is in
 * `findDefinition` (CDP-backed, in `./locator.ts`) — this is the no-debugger
 * fallback / cheap pre-check.
 *
 * Implementation: stringify `value` and `.includes(...)`-search every factory
 * source. Caveats:
 *   - Only functions with non-trivial bodies are reliably locatable. Single-
 *     expression arrows like `()=>0` will appear in many modules.
 *   - Webpack-bundled functions are typically wrapped inside a factory's body
 *     so the inclusion is genuine. Native / Discord-runtime / bundle-root
 *     functions return `external`.
 *   - Returns `ambiguous` whenever multiple factories happen to embed the same
 *     stringified body — common for tiny minified helpers.
 */
export function searchDefinition(value: unknown): SearchDefinitionResult {
    if (typeof value !== "function") {
        throw new TypeError(`searchDefinition only works on functions; got ${typeof value}`);
    }

    const needle = String(value);
    const candidates: ModuleId[] = [];

    for (const { id, source } of iterateModuleSources()) {
        // Skip the case where the factory IS this function — we want enclosing
        // factories, not self-matches.
        if (source === needle) continue;
        if (source.includes(needle)) candidates.push(id);
    }

    if (candidates.length === 0) return { kind: "external" };
    if (candidates.length === 1) return { kind: "module", moduleId: candidates[0] };
    return { kind: "ambiguous", candidates };
}
