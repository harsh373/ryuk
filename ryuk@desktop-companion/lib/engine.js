// SPDX-License-Identifier: GPL-3.0-or-later
// Ryuk's brain
import {ACTIONS, PLANS, PHYS, WALL, CEIL, JUMP, FEED, DEFAULTS, frameSize, dragFrame} from './config.js';
import {Chooser, weighted} from './behaviors.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FRAME_FLOOR = 'stand';

export class Engine {
    constructor(rng = Math.random) {
        this.rng = rng;
        this.cfg = {...DEFAULTS};
        this.b = {x1: 0, y1: 32, x2: 1280, y2: 720};   // work area of the monitor he lives on
        this.chooser = new Chooser(rng);
        this.clock = 0;
        this.right = false;          // art faces left; right = mirrored
        this.surface = 'floor';      // floor | wall | ceiling | air | drag
        this.side = 'left';          // which wall, when surface === 'wall'
        this.x = 640; this.y = 720; this.vx = 0; this.vy = 0;
        this.plan = []; this.pending = null; this.drag = null;
        this.wallTarget = 0;
        this.apple = null;           // {x, y, vy, landed, bounced} while an apple is on the floor
        this.feeding = false;        // true from the moment feeding is requested until it has ended
        this._snap();
        this.plan = [{a: 'stand', secs: [2, 5]}];
        this._next();
    }

    get s() { return this.cfg.size; }
    _r([a, b]) { return a + this.rng() * (b - a); }

    
    setBounds(b) { this.b = {...b}; this._snap(); }
    setCfg(c) { Object.assign(this.cfg, c); this._snap(); }

    trigger(name) {                       // used by the menu; falls first if he is not on the floor
        if (!PLANS[name]) return;
        if (this.surface === 'drag') return;
        if (this.feeding) return;         // eating has priority: no other trick, and no second apple
        if (name === 'feed') this.feeding = true;
        this.chooser.mark(name, this.clock);
        if (this.surface === 'floor') {
            this.plan = PLANS[name].map(p => ({...p}));
            this._next();
        } else {
            this.pending = name;
            if (this.surface !== 'air') this._launch(0, 0, 'fall');
        }
    }

    feed() { this.trigger('feed'); }

    // Abandon feeding at any point (hide, drag, shutdown): the apple disappears and he goes back to idling.
    cancelFeed() {
        if (!this.feeding && !this.apple) return;
        this.feeding = false;
        this.apple = null;
        if (this.pending === 'feed') this.pending = null;
        if (this.surface === 'floor') {
            this.plan = [{a: 'stand', secs: [2, 4]}];
            this._next();
        }
    }

    beginDrag(px, py) {
        if (this.surface === 'drag') return;
        this.cancelFeed();
        this.plan = []; this.pending = null;
        this._rebase('drag', this.right);
        this.surface = 'drag';
        this.drag = {px, py, samples: [[this.clock, px, py]]};
        this._setAct('drag');
    }
    dragTo(px, py) {
        if (!this.drag) return;
        this.drag.px = px; this.drag.py = py;
        const sm = this.drag.samples;
        sm.push([this.clock, px, py]);
        while (sm.length > 2 && this.clock - sm[0][0] > 150) sm.shift();
    }
    endDrag() {
        if (!this.drag) return;
        const sm = this.drag.samples, f = sm[0], l = sm[sm.length - 1];
        const dt = Math.max(1, l[0] - f[0]) / 1000;
        const m = PHYS.throwMax;
        const vx = clamp((l[1] - f[1]) / dt * 0.5, -m, m);
        const vy = clamp((l[2] - f[2]) / dt * 0.5, -m, m);
        this.drag = null;
        if (this.y >= this.b.y2 - 2) { this.surface = 'air'; this._land(); }
        else this._launch(vx, vy, 'fall');
    }

    // advance the simulation by dtMs
    step(dtMs) {
        if (this.cfg.paused && this.surface !== 'drag') return;
        const a = this.act, sp = this.cfg.speed, s = this.s, b = this.b;
        // while moving, cap dt so a stalled shell can't cause a leap; while idle the timer sleeps for long spans
        const moving = this.surface !== 'floor' || a.def.move || this._appleMoving();
        const dt = Math.min(dtMs, moving ? 100 : 2500) / 1000;
        this.clock += dt * 1000;
        a.t += dt * 1000;
        this._stepApple(dt);
        switch (this.surface) {
        case 'floor':
            if (a.def.move) {
                this.x += a.dir * PHYS.walk * sp * s * dt;
                this._floorLimits(a);
            }
            break;
        case 'wall':
            if (a.name === 'climbWall') {
                this.y += a.dirY * PHYS.climb * sp * s * dt;
                if ((a.dirY < 0 && this.y <= a.toY) || (a.dirY > 0 && this.y >= a.toY)) {
                    this.y = a.toY; a.end = a.t;
                }
            }
            break;
        case 'ceiling':
            if (a.name === 'crawl') {
                this.x += a.dir * PHYS.crawl * sp * s * dt;
                this._ceilLimits(a);
            }
            break;
        case 'air':
            this.vy = Math.min(this.vy + PHYS.gravity * s * dt, PHYS.maxFall * s);
            this.x += this.vx * dt; this.y += this.vy * dt;
            if (a.name === 'jump' && this.vy > 0) this._setAct('fall');
            if (this.vx > 0) this.right = true; else if (this.vx < 0) this.right = false;
            { const m = PHYS.edgeMargin * s;
              const lo = b.x1 + m, hi = b.x2 - m;
              if (this.x < lo) { this.x = lo; this.vx = 0; }
              if (this.x > hi) { this.x = hi; this.vx = 0; } }
            if (this.y >= b.y2) this._land();
            break;
        case 'drag': {
            const k = 1 - Math.exp(-dt * 1000 / PHYS.dragSway);
            this.x += (this.drag.px - this.x) * k;
            const ty = clamp(this.drag.py + PHYS.dragOffsetY * s, b.y1 + 20, b.y2);
            this.y += (ty - this.y) * (1 - Math.exp(-dt * 1000 / 60));
            this.x = clamp(this.x, b.x1 + 20, b.x2 - 20);
            return;
        }
        }
        if (this.act === a && a.t >= a.end) this._next();
    }

    // what to draw
    view() {
        const a = this.act, s = this.s;
        let frame;
        if (this.surface === 'drag') frame = dragFrame((this.x - this.drag.px) / s);
        else frame = this._poseAt(a, a.t)[0];
        const [ax, ay] = this._anch(a.def);
        const [w, h] = frameSize(frame);
        const ox = Math.round(this.x - ax), oy = Math.round(this.y - ay);
        let apple = null;
        if (this.apple) {
            const sz = Math.round(FEED.size * s);
            apple = {x: Math.round(this.apple.x - sz / 2), y: Math.round(this.apple.y - sz - FEED.floorLift * s), w: sz, h: sz};
        }
        const flip = a.def.art === 'right' ? !this.right : this.right;   // art that faces right is mirrored to face left
        return {frame, flip, x: ox, y: oy, w: Math.round(w * s), h: Math.round(h * s), apple,
            hit: {x: Math.round(ox + w * s * 0.24), y: Math.round(oy + h * s * 0.04),
                w: Math.round(w * s * 0.52), h: Math.round(h * s * 0.9)}};
    }

    // ms until the next visible change; -1 = nothing will change (paused)
    wake() {
        if (this.cfg.paused && this.surface !== 'drag') return -1;
        const a = this.act;
        if (this.surface === 'air' || this.surface === 'drag' || a.def.move || this._appleMoving()) return PHYS.moveTickMs;
        const pose = this._poseRemaining(a);
        return clamp(Math.min(pose, a.end - a.t), 30, 2000);
    }

    // ---- internals ----------
    _appleMoving() { return !!this.apple && !this.apple.landed; }
    _stepApple(dt) {
        const ap = this.apple;
        if (!ap || ap.landed) return;
        ap.vy = Math.min(ap.vy + PHYS.gravity * this.s * dt, PHYS.maxFall * this.s);
        ap.y += ap.vy * dt;
        if (ap.y >= this.b.y2) {
            ap.y = this.b.y2;
            if (!ap.bounced) { ap.bounced = true; ap.vy = -ap.vy * FEED.bounce; }
            else { ap.landed = true; ap.vy = 0; }
        }
    }

    _rate(a) { return a.def.move ? Math.max(0.4, this.cfg.speed) : 1; }
    _poseAt(a, t) {
        const def = a.def, tt = (t * this._rate(a)) % def.total;
        let acc = 0;
        for (const p of def.poses) { acc += p[1]; if (tt < acc) return p; }
        return def.poses[0];
    }
    _poseRemaining(a) {
        const def = a.def, r = this._rate(a), tt = (a.t * r) % def.total;
        let acc = 0;
        for (const p of def.poses) { acc += p[1]; if (tt < acc) return (acc - tt) / r; }
        return 100;
    }
    _anch(def, right = this.right) {
        return [(right ? def.w - def.anchor[0] : def.anchor[0]) * this.s, def.anchor[1] * this.s];
    }
    _origin() { return [this.x, this.y].map((v, i) => v - this._anch(this.act.def)[i]); }
    _project(name, right) {                       // where the anchor would be after switching to `name`
        const [ox, oy] = this._origin(), [ax, ay] = this._anch(ACTIONS[name], right);
        return {x: ox + ax, y: oy + ay};
    }
    _rebase(name, right) {                        // switch art but keep the picture where it is
        const [ox, oy] = this._origin();
        this.right = right;
        const [ax, ay] = this._anch(ACTIONS[name]);
        this.x = ox + ax; this.y = oy + ay;
    }
    _setAct(name, step = {}) {
        const secs = step.secs ? this._r(step.secs) * 1000 : Infinity;
        this.act = {name, def: ACTIONS[name], t: 0, end: secs, dir: 0, dirY: 0, to: null};
        return this.act;
    }

    _snap() {                                     // re-place him after bounds/size change
        const b = this.b, m = PHYS.edgeMargin * this.s;
        if (this.surface === 'floor') { this.y = b.y2; this.x = clamp(this.x, b.x1 + m * 0.7, b.x2 - m * 0.7); }
        else if (this.surface === 'wall') { this.x = this.side === 'left' ? b.x1 : b.x2; this.y = clamp(this.y, b.y1, b.y2); }
        else if (this.surface === 'ceiling') { this.y = b.y1; this.x = clamp(this.x, b.x1 + m, b.x2 - m); }
        else { this.x = clamp(this.x, b.x1, b.x2); this.y = Math.min(this.y, b.y2); }
        if (this.apple) {
            this.apple.x = clamp(this.apple.x, b.x1 + m, b.x2 - m);
            this.apple.y = this.apple.landed ? b.y2 : Math.min(this.apple.y, b.y2);
        }
    }

    _next() {
        for (let guard = 0; guard < 12; guard++) {
            let step = this.plan.shift();
            if (!step) { this._decide(); step = this.plan.shift(); }
            if (!step) step = {a: 'stand', secs: [2, 4]};
            if (step.fn) { if (this[`_fn_${step.fn}`](step)) return; continue; }
            this._start(step);
            return;
        }
    }

    _decide() {
        if (this.surface === 'floor') {
            const name = this.chooser.pick(this.cfg, this.clock);
            this.plan = PLANS[name].map(p => ({...p}));
        } else if (this.surface === 'ceiling') {
            this.plan = [{fn: 'ceilEnd'}];
        } else if (this.surface === 'wall') {
            this.plan = [{fn: 'wallNext'}];
        }
    }

    _start(step) {
        const a = this._setAct(step.a, step);
        if (step.to) a.to = step.to;
        if (this.surface === 'floor' && a.def.move) {         // walking: choose direction
            const b = this.b, room = [this.x - b.x1, b.x2 - this.x];
            let dir = step.dir;
            if (dir === 'nearestWall') dir = room[0] < room[1] ? -1 : 1;
            else if (dir === 'toApple') dir = this.apple && this.apple.x < this.x ? -1 : 1;
            else if (dir === 'rand' || dir === undefined) {
                const away = room[0] > room[1] ? -1 : 1;     // lean towards the roomier side
                dir = this.rng() < 0.7 ? away : -away;
            }
            a.dir = dir; this.right = dir > 0;
        } else if (this.surface === 'ceiling' && a.def.move) {
            let dir = step.dir;
            if (dir === 'rand') dir = this.rng() < 0.5 ? -1 : 1;
            a.dir = dir; this.right = dir > 0;
        } else if (step.a === 'climbWall') {
            a.dirY = step.dirY; a.toY = step.toY;
        } else if (step.face === 'flip') this.right = !this.right;
        else if (step.face) this.right = step.face === 'right';
    }

    // floor walking limits
    _floorLimits(a) {
        const b = this.b, m = PHYS.edgeMargin * this.s;
        if (a.to === 'apple') {                               // stop beside the apple (or if it is gone)
            const dx = this.apple ? this.apple.x - this.x : 0;
            if (!this.apple || Math.abs(dx) <= FEED.grab * this.s || Math.sign(dx) !== a.dir) a.end = a.t;
            return;
        }
        if (a.to === 'wall') {
            const side = a.dir < 0 ? 'left' : 'right';
            const p = this._project('grabWall', side === 'right');
            if (side === 'left' ? p.x <= b.x1 : p.x >= b.x2) { this._enterWall(side, this._pickWallTarget()); return; }
            return;
        }
        if (this.x < b.x1 + m && a.dir < 0) { a.dir = 1; this.right = true; }      // turn around, never snap
        else if (this.x > b.x2 - m && a.dir > 0) { a.dir = -1; this.right = false; }
    }
    _ceilLimits(a) {
        const b = this.b, m = PHYS.edgeMargin * this.s;
        if (a.to === 'wall') {
            const side = a.dir < 0 ? 'left' : 'right';
            const p = this._project('grabWall', side === 'right');
            if (side === 'left' ? p.x <= b.x1 : p.x >= b.x2) this._enterWall(side, b.y2);
            return;
        }
        if (this.x < b.x1 + m && a.dir < 0) { a.dir = 1; this.right = true; }      // turn around, never snap
        else if (this.x > b.x2 - m && a.dir > 0) { a.dir = -1; this.right = false; }
    }

    _topY() { return this.b.y1 + (ACTIONS.climbWall.anchor[1] - ACTIONS.grabCeiling.anchor[1]) * this.s; }
    _pickWallTarget() {
        const top = this._topY(), floor = this.b.y2;
        if (floor - top < 240 * this.s || this.rng() < WALL.topChance) return top;
        return top + (floor - top) * (0.25 + 0.5 * this.rng());
    }

    _enterWall(side, target) {
        this._rebase('grabWall', side === 'right');
        this.surface = 'wall'; this.side = side;
        this.x = side === 'left' ? this.b.x1 : this.b.x2;
        this.wallTarget = target;
        this.plan = [{a: 'grabWall', secs: WALL.holdSecs}, {fn: 'wallNext'}];
        this._next();
    }
    _fn_wallNext() {
        const d = this.wallTarget - this.y, s = this.s;
        if (Math.abs(d) > 1.5) {
            const dir = Math.sign(d), seg = Math.min(Math.abs(d), this._r(WALL.segPx) * s);
            this.plan.unshift({a: 'climbWall', dirY: dir, toY: this.y + dir * seg},
                {a: 'grabWall', secs: WALL.holdSecs}, {fn: 'wallNext'});
            return false;
        }
        if (this.wallTarget <= this._topY() + 1.5) { this._enterCeiling(); return true; }
        if (this.wallTarget >= this.b.y2 - 1.5) { this._toFloor(); return true; }
        const pick = weighted(this.rng, [['down', WALL.endWeights.down],
            ['jump', this.cfg.jumping ? WALL.endWeights.jump : 0], ['drop', WALL.endWeights.drop]]);
        const away = this.side === 'left' ? 1 : -1;
        if (pick === 'jump') { this._launch(away * this._r(JUMP.wall.vx) * this.s, this._r(JUMP.wall.vy) * this.s, 'jump'); return true; }
        if (pick === 'drop') { this._launch(away * 30, 0, 'fall'); return true; }
        this.wallTarget = this.b.y2;
        return false;
    }
    _toFloor() {
        this._rebase(FRAME_FLOOR, this.side === 'left');
        this.surface = 'floor'; this.y = this.b.y2;
        this.plan = [{a: 'stand', secs: [2, 4]}];
        this._next();
    }

    _enterCeiling() {
        const away = this.side === 'left' ? 1 : -1;
        this._rebase('grabCeiling', away > 0);
        this.surface = 'ceiling'; this.y = this.b.y1;
        const plan = [{a: 'grabCeiling', secs: [2, 4]}];
        const n = Math.round(this._r(CEIL.segments));
        for (let i = 0; i < n; i++)
            plan.push({a: 'crawl', secs: CEIL.crawlSecs, dir: i === 0 ? away : 'rand'},
                {a: 'grabCeiling', secs: CEIL.holdSecs});
        plan.push({fn: 'ceilEnd'});
        this.plan = plan;
        this._next();
    }
    _fn_ceilEnd() {
        const pick = weighted(this.rng, Object.entries(CEIL.endWeights));
        if (pick === 'drop') { this._launch(0, 0, 'fall'); return true; }
        const dir = (this.x - this.b.x1) < (this.b.x2 - this.x) ? -1 : 1;
        this.plan.unshift({a: 'crawl', dir, to: 'wall', secs: [120, 120]});
        return false;
    }

    _fn_hop() {
        const dir = this.rng() < 0.5 ? -1 : 1;
        this._launch(dir * this._r(JUMP.hop.vx) * this.s, this._r(JUMP.hop.vy) * this.s, 'jump');
        return true;
    }

    // ---- apple feeding ------------
    _fn_feedStart() {                             // an apple drops in beside him2
        const b = this.b, s = this.s, m = PHYS.edgeMargin * s * 1.3;
        const room = [this.x - b.x1, b.x2 - this.x];
        let side = room[0] > room[1] ? -1 : 1;    // usually the roomier side
        if (this.rng() < 0.3) side = -side;
        const dist = this._r(FEED.dist) * s;
        let ax = this.x + side * dist;
        if (ax < b.x1 + m || ax > b.x2 - m) { side = -side; ax = this.x + side * dist; }
        ax = clamp(ax, b.x1 + m, b.x2 - m);
        this.apple = {x: ax, y: Math.max(b.y1 + 10, b.y2 - FEED.dropHeight * s), vy: 0, landed: false, bounced: false};
        this.right = ax >= this.x;
        return false;
    }
    _fn_feedGrab() { this.apple = null; return false; }      
    _fn_feedEnd() {                                          // satisfied: a little hop, or a contented sit
        this.feeding = false;
        this.apple = null;
        if (this.cfg.jumping && this.rng() < 0.5) return this._fn_hop();
        this.plan.unshift({a: 'feedSquat', secs: [2, 4]});
        return false;
    }

    _launch(vx, vy, name) {
        this._rebase(name, vx > 0 ? true : vx < 0 ? false : this.right);
        this.surface = 'air'; this.vx = vx; this.vy = vy;
        this.plan = [];
        this._setAct(name);
    }
    _land() {
        this.surface = 'floor'; this.y = this.b.y2; this.vx = this.vy = 0;
        this._rebase(FRAME_FLOOR, this.right);
        this.plan = [{a: 'land', secs: [1.04, 1.04]}];
        if (this.pending) { this.plan.push(...PLANS[this.pending].map(p => ({...p}))); this.pending = null; }
        this._next();
    }
}