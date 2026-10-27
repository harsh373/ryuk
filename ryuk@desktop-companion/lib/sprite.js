
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {frameFile} from './config.js';

export class Sprite {
    constructor(dir) {
        this._dir = dir;
        this._key = '';
        this._appleKey = '';
        this._appleOn = false;     
        this._shown = false;
        this._wantShown = false;      
        this._overFullscreen = false;  
        this._fullscreen = false;     
        this._fsTimer = 0;
        this._unredirectOff = false;   

        this.body = new St.Widget({reactive: false, visible: false});
        this.body.set_pivot_point(0.5, 0.5);
        this.hit = new St.Widget({reactive: true, visible: false, track_hover: false});
        this.apple = new St.Widget({reactive: false, visible: false});

        // trackFullscreen: false -> the shell never touches our visibility; _apply() owns it
        Main.layoutManager.addChrome(this.body, {affectsInputRegion: false, trackFullscreen: false});
        Main.layoutManager.addChrome(this.apple, {affectsInputRegion: false, trackFullscreen: false});
        Main.layoutManager.addChrome(this.hit, {affectsInputRegion: true, trackFullscreen: false});

        console.log(`Ryuk: session=${GLib.getenv('XDG_SESSION_TYPE')}`);

        this._fsId = global.display.connect('in-fullscreen-changed', () => {
            console.log('Ryuk: in-fullscreen-changed fired');
            this._scheduleFsCheck();
        });
        this._monId = Main.layoutManager.connect('monitors-changed', () => this._scheduleFsCheck());
    }

    static hasAssets(dir) {
        return Gio.File.new_for_path(`${dir}/${frameFile('1')}`).query_exists(null);
    }

    // the apple-eating frames are generated at install time by tools/make-eat-frames.py
    static hasEatAssets(dir) {
        return ['E0', 'E3', 'E6a', 'E8', 'Apple'].every(f =>
            Gio.File.new_for_path(`${dir}/${frameFile(f)}`).query_exists(null));
    }

    update(v) {
        const key = `${v.frame}|${v.w}|${v.h}`;
        if (key !== this._key) {
            this._key = key;
            this.body.set_style(`background-image: url("file://${this._dir}/${frameFile(v.frame)}");` +
                `background-size: ${v.w}px ${v.h}px;`);
            this.body.set_size(v.w, v.h);
        }
        this.body.scale_x = v.flip ? -1 : 1;
        this.body.set_position(v.x, v.y);
        this.hit.set_position(v.hit.x, v.hit.y);
        this.hit.set_size(v.hit.w, v.hit.h);

        this._appleOn = !!v.apple;
        if (v.apple) {
            const ak = `${v.apple.w}|${v.apple.h}`;
            if (ak !== this._appleKey) {
                this._appleKey = ak;
                this.apple.set_style(`background-image: url("file://${this._dir}/${frameFile('Apple')}");` +
                    `background-size: ${v.apple.w}px ${v.apple.h}px;`);
                this.apple.set_size(v.apple.w, v.apple.h);
            }
            this.apple.set_position(v.apple.x, v.apple.y);
        }
        this._applyApple();             // cheap; the fullscreen logic in _apply() is not run per frame
    }

    setShown(on) {
        this._shown = on;
        this._wantShown = on;
        this._apply();
    }

    setOverFullscreen(on) {
        this._overFullscreen = !!on;
        this._fullscreen = this._readFullscreen();
        this._apply();                  // immediate, no debounce
    }

    setInteractive(on) { this.hit.reactive = on; }

    _readFullscreen() {
        try {
            const lm = Main.layoutManager;
            const mon = lm.findMonitorForActor(this.body) ?? lm.primaryMonitor;
            return !!mon && !!mon.inFullscreen;
        } catch (e) {
            console.error(`Ryuk: fullscreen check failed: ${e}`);
            return false;
        }
    }

    _scheduleFsCheck() {
        if (this._fsTimer)
            GLib.source_remove(this._fsTimer);
        this._fsTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            this._fsTimer = 0;
            this._fullscreen = this._readFullscreen();
            this._apply();
            return GLib.SOURCE_REMOVE;
        });
    }

    // the apple follows the body's visibility, so hiding Ryuk or fullscreen hides it too
    _applyApple() {
        this.apple.visible = this.body.visible && this._appleOn;
    }

    _apply() {
        const visible = this._wantShown && (this._overFullscreen || !this._fullscreen);
        this.body.visible = visible;
        this.hit.visible = visible;
        this._applyApple();

        const overFs = visible && this._fullscreen;
        this._setUnredirect(overFs);
        if (overFs)
            this._raise();

        const kids = Main.layoutManager.uiGroup.get_children();
        console.log(`Ryuk apply: fs=${this._fullscreen} visible=${visible} mapped=${this.body.mapped} ` +
            `bodyIdx=${kids.indexOf(this.body)} winGroupIdx=${kids.indexOf(global.window_group)} ` +
            `unredirectOff=${this._unredirectOff}`);
    }

    // A fullscreen window can be unredirected;
    _setUnredirect(off) {
        if (off === this._unredirectOff)
            return;
        try {
            if (off)
                global.compositor.disable_unredirect();
            else
                global.compositor.enable_unredirect();
            this._unredirectOff = off;
        } catch (e) {
            console.error(`Ryuk: unredirect toggle failed: ${e}`);
        }
    }

    // fullscreen transitions restack things, so put all actors back on top (hit stays last)
    _raise() {
        try {
            const ui = Main.layoutManager.uiGroup;
            ui.set_child_above_sibling(this.body, null);
            ui.set_child_above_sibling(this.apple, null);
            ui.set_child_above_sibling(this.hit, null);
        } catch (e) {
            console.error(`Ryuk: raise failed: ${e}`);
        }
    }

    destroy() {
        this._setUnredirect(false);
        if (this._fsTimer) {
            GLib.source_remove(this._fsTimer);
            this._fsTimer = 0;
        }
        if (this._fsId) {
            global.display.disconnect(this._fsId);
            this._fsId = 0;
        }
        if (this._monId) {
            Main.layoutManager.disconnect(this._monId);
            this._monId = 0;
        }
        Main.layoutManager.removeChrome(this.body);
        Main.layoutManager.removeChrome(this.apple);
        Main.layoutManager.removeChrome(this.hit);
        this.body.destroy();
        this.apple.destroy();
        this.hit.destroy();
    }
}