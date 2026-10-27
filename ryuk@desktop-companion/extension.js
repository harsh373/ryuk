

import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Engine} from './lib/engine.js';
import {Sprite} from './lib/sprite.js';

const SPEEDS = [['Calm (0.5x)', 0.5], ['Slow (0.75x)', 0.75], ['Default (1x)', 1.0], ['Brisk (1.5x)', 1.5], ['Fast (2x)', 2.0]];
const ACTIVITY = [['Rare', 0.4], ['Normal', 1.0], ['Lively', 2.0]];
const TRICKS = [['Stand', 'stand'], ['Walk', 'walk'], ['Look around', 'look'], ['Sit', 'sit'],
    ['Dangle legs', 'dangle'], ['Sleep', 'sleep'], ['Draw', 'draw'], ['Check phone', 'phone'],
    ['Climb', 'climb'], ['Hop', 'hop']];
const DRAG_THRESHOLD = 6;    // px the mouse must move before a press becomes a drag (otherwise it is a click)
const BUBBLE_SECS = 6;        
const LOGIN_WINDOW_S = 20;   
function shellAgeSeconds() {
    try {
        const dec = new TextDecoder();
        const stat = dec.decode(GLib.file_get_contents('/proc/self/stat')[1]);
        const start = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]) / 100;
        const up = Number(dec.decode(GLib.file_get_contents('/proc/uptime')[1]).split(' ')[0]);
        return up - start;
    } catch (e) {
        return Infinity;
    }
}

export default class RyukExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._ids = [];            // [object, signalId]
        this._timer = 0;
        this._bubble = null; this._bubbleTimer = 0; this._bubbleCapId = 0;
        this._dragging = false; this._press = null;

        // GNOME
        if (!this._settings.get_boolean('launch-at-login') && shellAgeSeconds() < LOGIN_WINDOW_S) {
            this._loginTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
                this._loginTimer = 0;
                Main.extensionManager.disableExtension(this.uuid);
                return GLib.SOURCE_REMOVE;
            });
            return;
        }

        if (!Sprite.hasAssets(this.path)) {
            Main.notify('Ryuk', 'Sprites are missing. Run ./ryuk.sh install <zip> again.');
            return;
        }

        this._engine = new Engine();
        this._sprite = new Sprite(this.path);
        this._feedReady = Sprite.hasEatAssets(this.path);
        this._overview = false;
        this._mon = -1;
        this._buildMenu();
        this._connect(this._settings, 'changed', () => this._applySettings());
        this._connect(Main.layoutManager, 'monitors-changed', () => this._applyBounds());
        this._connect(global.display, 'workareas-changed', () => this._applyBounds());
        this._connect(Main.overview, 'showing', () => { this._overview = true; this._applySettings(); });
        this._connect(Main.overview, 'hiding', () => { this._overview = false; this._applySettings(); });
        this._connect(this._sprite.hit, 'button-press-event', (_a, ev) => this._onPress(ev));
        this._applyBounds(true);
        this._applySettings();
    }

    disable() {
        if (this._loginTimer) GLib.source_remove(this._loginTimer);
        this._loginTimer = 0;
        this._stopTimer();
        this._endGrab();
        this._hideBubble();
        this._engine?.cancelFeed();
        for (const [obj, id] of this._ids ?? []) obj.disconnect(id);
        this._ids = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._feedItem = null;
        this._sprite?.destroy();
        this._sprite = null;
        this._engine = null;
        this._settings = null;
    }

    _connect(obj, name, fn) { this._ids.push([obj, obj.connect(name, fn)]); }

    // ---- timer: runs only when something changes (about 3x/s idle, 25x/s moving) ----
    _stopTimer() {
        if (this._timer) GLib.source_remove(this._timer);
        this._timer = 0;
    }
    _schedule() {
        this._stopTimer();
        if (!this._running()) return;
        const ms = this._engine.wake();
        if (ms < 0) return;
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timer = 0;
            const now = GLib.get_monotonic_time();
            this._engine.step((now - this._last) / 1000);
            this._last = now;
            this._render();
            this._schedule();
            return GLib.SOURCE_REMOVE;
        });
    }
    _running() { return this._settings.get_boolean('visible') && !this._overview; }
    _render() { this._sprite.update(this._engine.view()); }

    // ---- settings -> engine ----
    _applySettings() {
        const s = this._settings;
        this._engine.setCfg({
            speed: s.get_double('speed'), activity: s.get_double('activity'), size: s.get_double('size'),
            climbing: s.get_boolean('climbing'), jumping: s.get_boolean('jumping'), paused: s.get_boolean('paused'),
        });
        this._sprite.setOverFullscreen(s.get_boolean('show-over-fullscreen'));
        // Hiding Ryuk (not just the overview) abandons a feeding in progress: no apple is left behind.
        if (!s.get_boolean('visible')) this._engine.cancelFeed();
        const show = this._running();
        this._sprite.setShown(show);
        this._sprite.setInteractive(show);          // clicks always work; dragging is checked in _onMotion
        if (!show) this._hideBubble();
        this._syncMenu();
        this._last = GLib.get_monotonic_time();
        if (show) this._render();
        this._schedule();
    }

    _workArea(i) {
        const r = Main.layoutManager.getWorkAreaForMonitor(i);
        return {x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y + r.height};
    }
    _applyBounds(initial = false) {
        const lm = Main.layoutManager;
        if (this._mon < 0 || this._mon >= lm.monitors.length) this._mon = lm.primaryIndex;
        this._engine.setBounds(this._workArea(this._mon));
        if (initial) {
            const b = this._engine.b;
            this._engine.x = b.x1 + (b.x2 - b.x1) * (0.2 + 0.6 * Math.random());
            this._engine.setBounds(b);
        }
        if (this._running()) this._render();
    }

    // ---- feeding ----
    _feed() {
        if (!this._feedReady || !this._running()) {
            console.log(`Ryuk: feed ignored (ready=${this._feedReady} running=${this._running()})`);
            return;
        }
        this._engine.feed();
        console.log(`Ryuk: feed requested, feeding=${this._engine.feeding} apple=${!!this._engine.apple}`);
        this._last = GLib.get_monotonic_time();
        this._render();                // show the apple at once, even if he is paused
        this._schedule();
    }

    // ---- click (apple bubble) and drag ----
    _canDrag() {
        return this._settings.get_boolean('draggable') && !this._settings.get_boolean('paused');
    }
    // press = maybe a click, maybe the start of a drag; it becomes a drag once the mouse has moved a few px
    _onPress(ev) {
        if (ev.get_button() !== Clutter.BUTTON_PRIMARY || this._grab) return Clutter.EVENT_PROPAGATE;
        this._hideBubble();
        const [px, py] = ev.get_coords();
        this._press = {px, py};
        this._dragging = false;
        this._grab = global.stage.grab(this._sprite.hit);
        this._dragIds = [
            this._sprite.hit.connect('motion-event', (_a, e) => this._onMotion(e)),
            this._sprite.hit.connect('button-release-event', () => this._onRelease()),
        ];
        return Clutter.EVENT_STOP;
    }
    _onRelease() {
        const wasClick = !this._dragging;
        this._endGrab();
        if (wasClick) this._showBubble();
        return Clutter.EVENT_STOP;
    }
    _onMotion(ev) {
        const [px, py] = ev.get_coords();
        if (!this._dragging) {
            if (!this._press || !this._canDrag() ||
                Math.hypot(px - this._press.px, py - this._press.py) < DRAG_THRESHOLD)
                return Clutter.EVENT_STOP;
            this._dragging = true;
            this._engine.beginDrag(this._press.px, this._press.py);     // also abandons any feeding
            this._last = GLib.get_monotonic_time();
            this._schedule();
        }
        const lm = Main.layoutManager;
        const i = lm.monitors.findIndex(m => px >= m.x && px < m.x + m.width && py >= m.y && py < m.y + m.height);
        if (i >= 0 && i !== this._mon) { this._mon = i; this._engine.setBounds(this._workArea(i)); }
        this._engine.dragTo(px, py);
        return Clutter.EVENT_STOP;
    }
    _endGrab() {
        if (this._dragIds) for (const id of this._dragIds) this._sprite?.hit.disconnect(id);
        this._dragIds = null;
        if (this._grab) {
            this._grab.dismiss(); this._grab = null;
            if (this._dragging) this._engine?.endDrag();
        }
        this._dragging = false; this._press = null;
        if (this._engine && this._running()) { this._last = GLib.get_monotonic_time(); this._schedule(); }
    }

    // small "Give Ryuk an apple" button that pops up above him when he is clicked
    _showBubble() {
        if (!this._engine || !this._running() || !this._feedReady || this._engine.feeding || this._bubble) return;
        const base = 'color: #ffffff; font-weight: bold; padding: 7px 14px; border-radius: 14px; ' +
            'border: 1px solid rgba(214, 40, 52, 0.9); background-color: rgba(24, 22, 30, 0.95);';
        const hover = base.replace('rgba(24, 22, 30, 0.95)', 'rgba(120, 18, 28, 0.97)');
        const btn = new St.Button({label: '\u{1F34E}  Give Ryuk an apple', reactive: true, can_focus: true,
            track_hover: true, style: base});
        btn.connect('notify::hover', () => btn.set_style(btn.hover ? hover : base));
        btn.connect('clicked', () => {
            console.log('Ryuk: apple button clicked');
            this._feed();                                   // feed first...
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {   // ...then close the bubble outside this signal handler
                this._hideBubble();
                return GLib.SOURCE_REMOVE;
            });
        });
        Main.layoutManager.addChrome(btn, {affectsInputRegion: true, trackFullscreen: false});
        this._bubble = btn;

        const v = this._engine.view(), b = this._engine.b;
        const w = btn.get_preferred_width(-1)[1], h = btn.get_preferred_height(-1)[1];
        const x = Math.max(b.x1 + 4, Math.min(b.x2 - w - 4, v.x + v.w / 2 - w / 2));
        const y = Math.max(b.y1 + 4, v.y - h - 2);
        btn.set_position(Math.round(x), Math.round(y));

        this._bubbleTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, BUBBLE_SECS, () => {
            this._bubbleTimer = 0;
            this._hideBubble();
            return GLib.SOURCE_REMOVE;
        });
        // a press anywhere outside the button closes it (decided by pointer position, not by event source)
        this._bubbleCapId = global.stage.connect('captured-event', (_s, e) => {
            const t = e.type();
            if ((t === Clutter.EventType.BUTTON_PRESS || t === Clutter.EventType.TOUCH_BEGIN) && this._bubble) {
                const [ex, ey] = e.get_coords();
                const [bx, by] = this._bubble.get_transformed_position();
                const [bw, bh] = this._bubble.get_transformed_size();
                const inside = ex >= bx && ex <= bx + bw && ey >= by && ey <= by + bh;
                if (!inside) this._hideBubble();
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }
    _hideBubble() {
        if (this._bubbleTimer) { GLib.source_remove(this._bubbleTimer); this._bubbleTimer = 0; }
        if (this._bubbleCapId) { global.stage.disconnect(this._bubbleCapId); this._bubbleCapId = 0; }
        if (this._bubble) {
            try { Main.layoutManager.removeChrome(this._bubble); this._bubble.destroy(); } catch (e) { console.error(`Ryuk: bubble cleanup failed: ${e}`); }
            this._bubble = null;
        }
    }

    // ---- panel menu ----
    _buildMenu() {
        const s = this._settings;
        const ind = this._indicator = new PanelMenu.Button(0.0, 'Ryuk', false);
        ind.add_child(new St.Icon({icon_name: 'face-devilish-symbolic', style_class: 'system-status-icon'}));
        const m = ind.menu;
        this._switches = {};
        const sw = (label, key) => {
            const it = new PopupMenu.PopupSwitchMenuItem(label, s.get_boolean(key));
            it.connect('toggled', (_i, state) => { if (s.get_boolean(key) !== state) s.set_boolean(key, state); });
            this._switches[key] = it;
            m.addMenuItem(it);
        };
        sw('Show Ryuk', 'visible');
        sw('Pause movement', 'paused');
        sw('Allow climbing', 'climbing');
        sw('Allow jumping', 'jumping');
        sw('Allow dragging', 'draggable');
        sw('Show over fullscreen', 'show-over-fullscreen');
        m.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._radios = {};
        const radio = (title, key, list) => {
            const sub = new PopupMenu.PopupSubMenuMenuItem(title);
            this._radios[key] = [];
            for (const [label, value] of list) {
                const it = new PopupMenu.PopupMenuItem(label);
                it.connect('activate', () => s.set_double(key, value));
                sub.menu.addMenuItem(it);
                this._radios[key].push([it, value]);
            }
            m.addMenuItem(sub);
        };
        radio('Speed', 'speed', SPEEDS);
        radio('Behaviours', 'activity', ACTIVITY);

        this._feedItem = new PopupMenu.PopupMenuItem(this._feedReady
            ? 'Give Ryuk an apple' : 'Give Ryuk an apple (frames missing: re-run install)');
        this._feedItem.connect('activate', () => this._feed());
        m.addMenuItem(this._feedItem);

        const tricks = new PopupMenu.PopupSubMenuMenuItem('Make him do...');
        for (const [label, name] of TRICKS) {
            const it = new PopupMenu.PopupMenuItem(label);
            it.connect('activate', () => { this._engine.trigger(name); this._last = GLib.get_monotonic_time(); this._schedule(); });
            tricks.menu.addMenuItem(it);
        }
        m.addMenuItem(tricks);
        m.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const prefs = new PopupMenu.PopupMenuItem('Preferences...');
        prefs.connect('activate', () => this.openPreferences());
        m.addMenuItem(prefs);
        const reset = new PopupMenu.PopupMenuItem('Reset to defaults');
        reset.connect('activate', () => { for (const k of s.list_keys()) s.reset(k); });
        m.addMenuItem(reset);
        const quit = new PopupMenu.PopupMenuItem('Exit Ryuk');
        quit.connect('activate', () => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            Main.extensionManager.disableExtension(this.uuid);
            return GLib.SOURCE_REMOVE;
        }));
        m.addMenuItem(quit);
        Main.panel.addToStatusArea(this.uuid, ind);
    }

    _syncMenu() {
        if (!this._indicator) return;
        const s = this._settings;
        for (const [key, it] of Object.entries(this._switches)) it.setToggleState(s.get_boolean(key));
        for (const [key, items] of Object.entries(this._radios)) {
            const cur = s.get_double(key);
            const nearest = items.reduce((a, b) => Math.abs(b[1] - cur) < Math.abs(a[1] - cur) ? b : a);
            for (const [it, v] of items) it.setOrnament(it === nearest[0] ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        }
        this._feedItem?.setSensitive(this._feedReady && this._running());
    }
}