/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Negative-id reference registry.
 *
 * The MCP protocol addresses webpack modules by their numeric webpack id
 * (always non-negative). To let agents work with values that aren't modules
 * — e.g., the result of `evaluate(...)`, or a function pulled out of a
 * module's exports — we mint synthetic *negative* ids that resolve to those
 * values via this registry.
 *
 * Lifetime: ids are assigned monotonically (never reused after release) so an
 * agent's earlier reference to id -3 won't accidentally point at something
 * new after a release+reassign cycle.
 */

export type RefId = number;

export class RefRegistry {
    private nextId: RefId = -1;
    private readonly slots = new Map<RefId, unknown>();

    /** Allocate a new slot, return its id. */
    assign(value: unknown): RefId {
        const id = this.nextId--;
        this.slots.set(id, value);
        return id;
    }

    has(id: RefId): boolean {
        return this.slots.has(id);
    }

    /**
     * Read a slot. Returns `{ found: false }` for unknown ids — we don't
     * return `undefined` directly because `undefined` is a valid stored value.
     */
    get(id: RefId): { found: true; value: unknown } | { found: false } {
        if (!this.slots.has(id)) return { found: false };
        return { found: true, value: this.slots.get(id) };
    }

    release(id: RefId): boolean {
        return this.slots.delete(id);
    }

    clear(): void {
        this.slots.clear();
    }

    size(): number {
        return this.slots.size;
    }

    ids(): RefId[] {
        return [...this.slots.keys()];
    }
}
