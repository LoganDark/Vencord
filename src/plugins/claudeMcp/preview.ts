/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Compact, single-line preview of an arbitrary JS value, suitable for surfacing
 * the result of `evaluate` over the wire. Approximates `util.inspect` behavior
 * within the renderer.
 *
 *   - Primitives are rendered verbatim (strings JSON-quoted, bigints with `n`,
 *     symbols via `.toString()`, `null`/`undefined` literally).
 *   - Strings exceeding `string` chars are truncated with the original
 *     length appended.
 *   - Functions render up to `string` chars of their source.
 *   - Objects/arrays recurse up to `depth` and `keys` items, with a
 *     `...N more` tail when truncated. Class instances get a `ClassName` prefix
 *     (suppressed for plain `Object`).
 *   - Cycles produce `[Circular]`. Property reads that throw produce
 *     `<getter threw>`. The whole result is hard-capped at `total` chars.
 *
 * All four limits are configurable per-call; defaults aim at a one-line glance.
 * Pass higher values when the default truncation hides what you actually need.
 */

export interface PreviewLimits {
    /** Hard cap on the final rendered string. Default 400. */
    total?: number;
    /** Maximum nesting depth before objects/arrays render as `[ClassName]`. Default 2. */
    depth?: number;
    /** Maximum entries shown per object/array before `...N more`. Default 8. */
    keys?: number;
    /** Maximum chars of a string or function source before per-value truncation. Default 120. */
    string?: number;
}

type Caps = Required<PreviewLimits>;

const DEFAULTS: Caps = {
    total: 400,
    depth: 2,
    keys: 8,
    string: 120
};

export function preview(value: unknown, limits: PreviewLimits = {}): string {
    const caps: Caps = {
        total: limits.total ?? DEFAULTS.total,
        depth: limits.depth ?? DEFAULTS.depth,
        keys: limits.keys ?? DEFAULTS.keys,
        string: limits.string ?? DEFAULTS.string
    };

    let result: string;
    try {
        result = render(value, 0, new WeakSet(), caps);
    } catch (err) {
        result = `<preview failed: ${err instanceof Error ? err.message : String(err)}>`;
    }
    if (result.length > caps.total) {
        result = result.slice(0, caps.total) + `... (${result.length} chars)`;
    }
    return result;
}

function render(value: unknown, depth: number, seen: WeakSet<object>, caps: Caps): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";

    switch (typeof value) {
        case "boolean":
        case "number":
            return String(value);
        case "bigint":
            return `${value}n`;
        case "symbol":
            return value.toString();
        case "string":
            return renderString(value, caps);
        case "function":
            return renderFunction(value as Function, caps);
    }

    // object
    if (seen.has(value as object)) return "[Circular]";
    seen.add(value as object);

    if (depth >= caps.depth) {
        const cn = classNameOf(value);
        return cn ? `[${cn}]` : "[Object]";
    }

    if (Array.isArray(value)) return renderArray(value, depth, seen, caps);
    return renderObject(value as object, depth, seen, caps);
}

function renderString(s: string, caps: Caps): string {
    if (s.length <= caps.string) return JSON.stringify(s);
    return JSON.stringify(s.slice(0, caps.string)) + `... (${s.length} chars)`;
}

function renderFunction(fn: Function, caps: Caps): string {
    let src: string;
    try {
        src = String(fn);
    } catch {
        return `[Function ${fn.name || "(anonymous)"}]`;
    }
    if (src.length <= caps.string) return src;
    return src.slice(0, caps.string) + `... (${src.length} chars)`;
}

function renderArray(arr: unknown[], depth: number, seen: WeakSet<object>, caps: Caps): string {
    const len = arr.length;
    if (len === 0) return "[]";

    const limit = Math.min(len, caps.keys);
    const items: string[] = [];
    for (let i = 0; i < limit; i++) {
        let v: unknown;
        try { v = arr[i]; } catch { items.push("<getter threw>"); continue; }
        items.push(render(v, depth + 1, seen, caps));
    }
    let body = items.join(", ");
    if (len > limit) body += `, ...${len - limit} more`;
    return `[${body}]`;
}

function renderObject(obj: object, depth: number, seen: WeakSet<object>, caps: Caps): string {
    let keys: string[];
    try {
        keys = Object.keys(obj);
    } catch {
        const cn = classNameOf(obj);
        return cn ? `[${cn}]` : "[Object]";
    }

    const cn = classNameOf(obj);
    const prefix = cn ? `${cn} ` : "";

    if (keys.length === 0) return `${prefix}{}`;

    const limit = Math.min(keys.length, caps.keys);
    const items: string[] = [];
    for (let i = 0; i < limit; i++) {
        const k = keys[i];
        let v: unknown;
        try {
            v = (obj as Record<string, unknown>)[k];
        } catch {
            items.push(`${formatKey(k)}: <getter threw>`);
            continue;
        }
        items.push(`${formatKey(k)}: ${render(v, depth + 1, seen, caps)}`);
    }
    let body = items.join(", ");
    if (keys.length > limit) body += `, ...${keys.length - limit} more`;
    return `${prefix}{${body}}`;
}

function classNameOf(value: unknown): string | null {
    try {
        const c = (value as { constructor?: { name?: string } }).constructor?.name;
        return c && c !== "Object" ? c : null;
    } catch {
        return null;
    }
}

function formatKey(k: string): string {
    return /^[A-Za-z_$][A-Za-z_$0-9]*$/.test(k) ? k : JSON.stringify(k);
}
