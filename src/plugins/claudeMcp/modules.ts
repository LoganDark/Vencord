/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Webpack module factory introspection — read-only, source-level operations
 * over `wreq.m`. No knowledge of references or evaluation; that lives in
 * `./evaluator.ts`.
 *
 * All operations are synchronous. Source extraction is `String(factory)` —
 * cached per-factory-identity in a WeakMap so iterating thousands of modules
 * for search isn't quadratic in stringification cost. The cache entry GCs
 * automatically if Vencord (or anything else) replaces a factory.
 */

import { wreq } from "@webpack";

export type ModuleId = string;

export type ReplaceFn = (substring: string, ...args: any[]) => string;

export interface PatchReplacement {
    match: string | RegExp;
    /**
     * Either a literal replacement (with `$&`/`$1` interpolation, like
     * `String.prototype.replace`) or a function called per match.
     */
    replace: string | ReplaceFn;
}

export interface PatchTrial {
    /** The matched substring. */
    matched: string;
    /** Index of the match in the input source for this step. */
    index: number;
    /** Capture groups, in order. `undefined` for non-participating groups. */
    groups: (string | undefined)[];
    /** Replacement text actually substituted in. */
    replacement: string;
}

/** Public per-step result (no `newSource` — that's an internal detail and gets
 *  duplicated as the next step's input). Trials carry enough info for an agent
 *  to reason about what changed. */
export type PatchStepResult =
    | { ok: true; trials: PatchTrial[] }
    | { ok: false; reason: "no-match" | "parse-error"; error?: string };

export interface PatchResult {
    moduleId: ModuleId;
    /** One step result per replacement, in order. Stops at first failure. */
    steps: PatchStepResult[];
    /** Length of the source after all successful steps, in chars. Always present. */
    finalSourceLength: number;
    /** Final patched source. Only present when `includeFinalSource: true` was passed. */
    finalSource?: string;
    /** Whether every step succeeded. Named `success` (not `ok`) so it doesn't
     *  collide with the wire-envelope's `ok` field. */
    success: boolean;
}

export interface TestPatchOptions {
    /** When true, the response includes the full patched source. Default false. */
    includeFinalSource?: boolean;
}

/** Internal-only step shape used during testPatch execution; carries the post-step
 *  source for chaining into the next step. Not exported. */
type InternalStepResult =
    | { ok: true; trials: PatchTrial[]; newSource: string }
    | { ok: false; reason: "no-match" };

const sourceCache = new WeakMap<Function, string>();

/**
 * Normalize a factory's `String(...)` output into the same `0,function(...){...}`
 * (or `0,(...) => ...` for arrows) expression form Vencord operates on internally
 * (`src/webpack/patchWebpack.ts:504-509`). This:
 *   - converts shorthand `id(args){body}` (which is only valid as an object method)
 *     into a standalone function expression that can be parsed and eval'd,
 *   - keeps existing `function(args){body}` and `(args)=>...` forms parseable too,
 *   - matches the form Vencord patches actually target, so users can copy patches
 *     authored against MCP tool output directly into Vencord plugins.
 */
function normalizeFactorySource(raw: string): string {
    const isArrowFunction = raw.startsWith("(");
    return "0," + (isArrowFunction ? "" : "function") + raw.slice(raw.indexOf("("));
}

export function sourceOf(factory: Function): string {
    let s = sourceCache.get(factory);
    if (s === undefined) {
        s = normalizeFactorySource(String(factory));
        sourceCache.set(factory, s);
    }
    return s;
}

export function listModuleIds(): ModuleId[] {
    return Object.keys(wreq.m);
}

export function hasModule(id: ModuleId): boolean {
    return id in wreq.m;
}

export function getFactory(id: ModuleId): Function | null {
    return (wreq.m[id] as Function | undefined) ?? null;
}

export function getModuleSource(id: ModuleId): string | null {
    const factory = getFactory(id);
    return factory === null ? null : sourceOf(factory);
}

/**
 * Iterate every (id, source) pair in the factory map.
 */
export function* iterateModuleSources(): Generator<{ id: ModuleId; source: string }> {
    for (const id in wreq.m) {
        const factory = wreq.m[id] as Function | undefined;
        if (factory == null) continue;
        yield { id, source: sourceOf(factory) };
    }
}

export type ModuleSources = Iterable<{ id: ModuleId; source: string }>;

export function findByString(needle: string, sources: ModuleSources = iterateModuleSources()): ModuleId[] {
    const out: ModuleId[] = [];
    for (const { id, source } of sources) {
        if (source.includes(needle)) out.push(id);
    }
    return out;
}

export function findByRegex(re: RegExp, sources: ModuleSources = iterateModuleSources()): ModuleId[] {
    const out: ModuleId[] = [];
    for (const { id, source } of sources) {
        // .test() advances lastIndex on global regexes; reset to be safe.
        re.lastIndex = 0;
        if (re.test(source)) out.push(id);
    }
    return out;
}

/**
 * Run a regex against a module's source and return every match as a
 * structured record. If the regex isn't global a synthetic global copy is
 * used, so callers can pass either form.
 */
export function matchSource(source: string, re: RegExp): RegExpMatchArray[] {
    const globalRe = re.global ? re : new RegExp(re.source, re.flags + "g");
    return [...source.matchAll(globalRe)];
}

/**
 * Apply a chain of replacements to a module's source, recording every match
 * substituted at every step. Stops at the first replacement that doesn't
 * match anything (mirroring the way devCompanion treats "had no effect" as
 * patch failure). After all steps, the resulting source is checked with
 * `Function(...)` to confirm it still parses.
 *
 * Does NOT mutate `wreq.m` — purely a dry run.
 */
export function testPatch(
    id: ModuleId,
    replacements: readonly PatchReplacement[],
    opts: TestPatchOptions = {}
): PatchResult {
    const include = opts.includeFinalSource === true;
    const finish = (source: string, steps: PatchStepResult[], success: boolean): PatchResult => {
        const r: PatchResult = {
            moduleId: id,
            steps,
            finalSourceLength: source.length,
            success
        };
        if (include) r.finalSource = source;
        return r;
    };

    const initial = getModuleSource(id);
    if (initial === null) {
        return finish("", [{ ok: false, reason: "no-match", error: "Module not found" }], false);
    }

    let source = initial;
    const steps: PatchStepResult[] = [];

    for (const rep of replacements) {
        const step = applyReplacementWithTrace(source, rep);
        if (!step.ok) {
            steps.push({ ok: false, reason: "no-match" });
            return finish(source, steps, false);
        }
        steps.push({ ok: true, trials: step.trials });
        source = step.newSource;
    }

    // Verify the final source still parses by eval'ing it as an expression — same
    // approach Vencord uses to produce the actual replacement factory at
    // `src/webpack/patchWebpack.ts:600`. Source is already in the
    // `0,function(...)` / `0,(...) => ...` form, so eval just produces the
    // function value with no side effects on the body.
    try {
        (0, eval)(source);
    } catch (err) {
        steps.push({ ok: false, reason: "parse-error", error: String(err) });
        return finish(source, steps, false);
    }

    return finish(source, steps, true);
}

function applyReplacementWithTrace(source: string, rep: PatchReplacement): InternalStepResult {
    const trials: PatchTrial[] = [];

    // Wrap as a function replacer so we can capture per-match info regardless
    // of whether `rep.replace` was given as a string or a function. For string
    // replacements, we re-implement $-interpolation explicitly to avoid the
    // double-replace dance.
    const replacer: ReplaceFn = (matched, ...args) => {
        let offset = 0;
        const groups: (string | undefined)[] = [];
        for (const a of args) {
            if (typeof a === "number") { offset = a; break; }
            groups.push(a as string | undefined);
        }

        let replacement: string;
        if (typeof rep.replace === "function") {
            replacement = rep.replace(matched, ...args);
        } else {
            replacement = interpolateDollar(rep.replace, matched, groups, source, offset);
        }

        trials.push({ matched, index: offset, groups, replacement });
        return replacement;
    };

    const newSource = source.replace(rep.match as any, replacer);

    if (trials.length === 0) {
        return { ok: false, reason: "no-match" };
    }

    return { ok: true, trials, newSource };
}

/**
 * Implements `String.prototype.replace`'s $-interpolation against an explicit
 * match context. Supports `$$`, `$&`, `` $` ``, `$'`, `$n` (1-2 digits).
 * Named groups (`$<name>`) are not interpolated — they're rare in patches.
 */
function interpolateDollar(
    template: string,
    matched: string,
    groups: (string | undefined)[],
    source: string,
    offset: number
): string {
    return template.replace(/\$(\$|&|`|'|<[^>]+>|\d{1,2})/g, (_, ref: string) => {
        if (ref === "$") return "$";
        if (ref === "&") return matched;
        if (ref === "`") return source.slice(0, offset);
        if (ref === "'") return source.slice(offset + matched.length);
        if (ref.startsWith("<")) return "";
        const n = parseInt(ref, 10);
        // $0 is not a thing; $10+ falls back to $1 + literal "0" if there are <10 groups.
        if (n === 0) return "$0";
        if (n > groups.length && ref.length === 2) {
            const single = parseInt(ref[0], 10);
            if (single >= 1 && single <= groups.length) {
                return (groups[single - 1] ?? "") + ref[1];
            }
            return "$" + ref;
        }
        return groups[n - 1] ?? "";
    });
}
