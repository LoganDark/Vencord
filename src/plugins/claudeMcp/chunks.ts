/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Index of modules that live in chunks Discord has not loaded yet.
 *
 * Webpack only knows a module once its chunk script has run and pushed the
 * factories into `wreq.m`. To read or search those modules *without* loading
 * them we fetch the chunk file ourselves and run it with a throwaway object
 * as `this`. A lazy chunk's entire top level is
 *
 *     (this.webpackChunkdiscord_app = this.webpackChunkdiscord_app || []).push([chunkIds, { id: factory, ... }])
 *
 * so the push lands in our object and webpack never sees it. Factory bodies
 * are only defined, never executed.
 *
 * Loading on demand is plain `wreq.e(chunkId)`: Discord fetches the same file
 * (now in the HTTP cache) and registers its factories through Vencord's
 * patcher proxy exactly like a user-triggered lazy import would.
 *
 * "Loaded" is always decided at query time by `id in wreq.m`, so the index
 * never goes stale when chunks get loaded by us or by Discord.
 *
 * Troubleshooting: every chunk in Discord's chunk map ends up in exactly one
 * bucket of `IndexReport.skipped` or is counted as indexed. If `scope: "all"`
 * searches stop finding things after a Discord update, read the report first:
 * a spike in `unexpectedShape` means CHUNK_PUSH_PREFIX or the push layout
 * changed; `chunksInMap: 0` means the `wreq.u` probe broke.
 */

import { wreq } from "@webpack";
import pLimit from "p-limit";

import { type ModuleId, sourceOf } from "./modules";

// Copied from src/debug/loadLazyChunks.ts (not exported there). `wreq.u`
// looks the chunk id up in an object literal, so a getter on Object.prototype
// catches that object, which has every chunk id as a key.
function getWebpackChunkMap() {
    const sym = Symbol();
    let chunksMap: unknown = null;

    Object.defineProperty(Object.prototype, sym, {
        get() {
            chunksMap = this;
            return "";
        },
        configurable: true
    });

    wreq.u(sym);
    delete Object.prototype[sym];

    return chunksMap as Record<PropertyKey, string> | null;
}

// Copied from src/debug/loadLazyChunks.ts
const WORKER_ASSET_REGEX = /importScripts\(|self\.postMessage/;
const JSON_CHUNK_REGEX = /^[^{]*\{[^{]*\{[\w$]+\.exports=JSON\.parse\('/;

// A lazy chunk's whole top level. The chunk array name is captured rather
// than hardcoded so a rename on Discord's side doesn't break the check.
const CHUNK_PUSH_PREFIX = /^("use strict";)?\(this\.(\w+)=this\.\2\|\|\[\]\)\.push\(\[/;

const FETCH_CONCURRENCY = 50;

type SkipKind = "notJs" | "json" | "worker" | "unexpectedShape" | "fetchFailed";

export interface IndexReport {
    builtAt: string;
    durationMs: number;
    chunksInMap: number;
    indexedChunks: number;
    indexedModules: number;
    /** Every non-indexed chunk lands in exactly one bucket, with up to 5 example ids. */
    skipped: Record<SkipKind, { count: number; sample: string[] }>;
}

interface UnloadedEntry {
    chunkId: string;
    factory: Function;
}

const entries = new Map<ModuleId, UnloadedEntry>();
let report: IndexReport | null = null;
let building: Promise<IndexReport> | null = null;

export function getIndexReport(): IndexReport | null {
    return report;
}

/** Build the index once per session; concurrent callers share the same build. */
export function ensureIndex(): Promise<IndexReport> {
    if (report !== null) return Promise.resolve(report);
    building ??= buildIndex().finally(() => { building = null; });
    return building;
}

/** Chunk ids Discord knows about, straight from the chunk map. */
export function listChunkIds(): string[] {
    const map = getWebpackChunkMap();
    return map === null ? [] : Object.keys(map);
}

/** Look up an indexed module that is still not in `wreq.m`. */
export function getUnloaded(id: ModuleId): { chunkId: string; source: string } | null {
    const entry = entries.get(id);
    if (entry === undefined || id in wreq.m) return null;
    return { chunkId: entry.chunkId, source: sourceOf(entry.factory) };
}

/** Same shape as `iterateModuleSources`, for modules not yet in `wreq.m`. */
export function* iterateUnloadedSources(): Generator<{ id: ModuleId; source: string }> {
    for (const [id, entry] of entries) {
        if (id in wreq.m) continue;
        yield { id, source: sourceOf(entry.factory) };
    }
}

export async function loadChunks(chunkIds: readonly string[]): Promise<void> {
    await Promise.all(chunkIds.map(id => wreq.e(id)));
}

async function buildIndex(): Promise<IndexReport> {
    const start = Date.now();
    const chunkMap = getWebpackChunkMap();
    if (chunkMap === null) {
        throw new Error("Could not recover the webpack chunk map: the wreq.u probe in getWebpackChunkMap found no object");
    }

    const skipped: IndexReport["skipped"] = {
        notJs: { count: 0, sample: [] },
        json: { count: 0, sample: [] },
        worker: { count: 0, sample: [] },
        unexpectedShape: { count: 0, sample: [] },
        fetchFailed: { count: 0, sample: [] }
    };
    const skip = (kind: SkipKind, chunkId: string, detail?: string) => {
        const bucket = skipped[kind];
        bucket.count++;
        if (bucket.sample.length < 5) bucket.sample.push(detail === undefined ? chunkId : `${chunkId}: ${detail}`);
    };

    const found = new Map<ModuleId, UnloadedEntry>();
    let indexedChunks = 0;
    const limit = pLimit(FETCH_CONCURRENCY);
    const chunkIds = Object.keys(chunkMap);

    await Promise.all(chunkIds.map(chunkId => limit(async () => {
        const fileName = wreq.u(chunkId);
        if (fileName == null || !fileName.endsWith(".js") || fileName === "undefined.js") {
            return skip("notJs", chunkId, String(fileName));
        }

        let text: string;
        try {
            const res = await fetch(wreq.p + fileName);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            text = await res.text();
        } catch (err) {
            return skip("fetchFailed", chunkId, String(err));
        }

        if (WORKER_ASSET_REGEX.test(text)) return skip("worker", chunkId);
        if (JSON_CHUNK_REGEX.test(text)) return skip("json", chunkId);

        const factories = extractFactories(text);
        if (factories === null) return skip("unexpectedShape", chunkId, text.slice(0, 80));

        indexedChunks++;
        for (const id in factories) found.set(id, { chunkId, factory: factories[id] });
    })));

    entries.clear();
    for (const [id, entry] of found) entries.set(id, entry);

    report = {
        builtAt: new Date(start).toISOString(),
        durationMs: Date.now() - start,
        chunksInMap: chunkIds.length,
        indexedChunks,
        indexedModules: entries.size,
        skipped
    };
    return report;
}

/**
 * Run the chunk script with a plain object as `this`. The push goes into that
 * object; nothing reaches webpack and no factory body runs. Returns null if
 * the text doesn't have the expected single-push shape.
 */
function extractFactories(text: string): Record<string, Function> | null {
    if (!CHUNK_PUSH_PREFIX.test(text)) return null;

    const host: Record<string, unknown> = {};
    try {
        new Function(text).call(host);
    } catch {
        return null;
    }

    const pushed = Object.values(host).find(Array.isArray) as unknown[] | undefined;
    if (pushed === undefined || pushed.length !== 1) return null;

    const entry = pushed[0];
    if (!Array.isArray(entry) || !Array.isArray(entry[0]) || typeof entry[1] !== "object" || entry[1] === null) return null;

    return entry[1] as Record<string, Function>;
}
