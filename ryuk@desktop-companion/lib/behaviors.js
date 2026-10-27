

import {BEHAVIORS} from './config.js';

// items
export function weighted(rng, items) {
    let total = 0;
    for (const [, w] of items)
        if (w > 0) total += w;
    if (total <= 0) return null;
    let r = rng() * total;
    let last = null;
    for (const [name, w] of items) {
        if (w <= 0) continue;
        last = name;
        r -= w;
        if (r <= 0) return name;
    }
    return last;
}

export class Chooser {
    constructor(rng, table = BEHAVIORS) {
        this.rng = rng;
        this.table = table;
        this.lastRun = new Map();
    }


    pick(cfg, nowMs) {
        const items = [];
        for (const b of this.table) {
            if (b.needs && !cfg[b.needs]) continue;
            const last = this.lastRun.get(b.name);
            if (b.cooldown && last !== undefined && nowMs - last < b.cooldown * 1000) continue;
            items.push([b.name, b.weight * (b.special ? cfg.activity : 1)]);
        }
        const name = weighted(this.rng, items) ?? 'stand';
        this.lastRun.set(name, nowMs);
        return name;
    }

    // Menu-triggered
    mark(name, nowMs) {
        this.lastRun.set(name, nowMs);
    }
}