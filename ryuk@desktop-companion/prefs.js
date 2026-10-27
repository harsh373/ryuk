// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class RyukPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'Ryuk', icon_name: 'face-devilish-symbolic'});
        window.add(page);

        const motion = new Adw.PreferencesGroup({title: 'Movement',
            description: 'Defaults are deliberately slow. Changes apply immediately.'});
        page.add(motion);
        const spin = (title, subtitle, key, lo, hi, step) => {
            const row = new Adw.SpinRow({title, subtitle, digits: 2,
                adjustment: new Gtk.Adjustment({lower: lo, upper: hi, step_increment: step, page_increment: step * 4})});
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            motion.add(row);
        };
        spin('Speed', 'Multiplier for walking and climbing speed', 'speed', 0.25, 3, 0.05);
        spin('Behaviour frequency', 'How often special behaviours happen (0 = never)', 'activity', 0, 3, 0.1);
        spin('Size', 'Sprite scale (1 = pack native 128 px)', 'size', 0.5, 2, 0.1);

        const toggles = new Adw.PreferencesGroup({title: 'Abilities'});
        page.add(toggles);
        const sw = (title, subtitle, key) => {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            toggles.add(row);
        };
        sw('Show Ryuk', '', 'visible');
        sw('Pause movement', '', 'paused');
        sw('Climbing', 'Walls and the ceiling', 'climbing');
        sw('Jumping', 'Hops and jumps off walls', 'jumping');
        sw('Dragging', 'Pick him up with the left mouse button', 'draggable');
        sw('Show Ryuk over fullscreen windows', 'Off = he hides while a window is fullscreen', 'show-over-fullscreen');
        sw('Keep running across logins', 'Off = he never starts by himself when you log in', 'launch-at-login');

        const reset = new Adw.PreferencesGroup();
        page.add(reset);
        const row = new Adw.ActionRow({title: 'Reset all settings to defaults'});
        const btn = new Gtk.Button({label: 'Reset', valign: Gtk.Align.CENTER});
        btn.connect('clicked', () => { for (const k of settings.list_keys()) settings.reset(k); });
        row.add_suffix(btn);
        reset.add(row);
    }
}