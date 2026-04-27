// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BATTERY_PATH = '/sys/class/power_supply/BAT0';
const UPDATE_INTERVAL_SECONDS = 1;

function readNumber(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);

        if (!ok)
            return null;

        const text = new TextDecoder().decode(bytes).trim();
        const value = Number(text);

        return Number.isFinite(value) ? value : null;
    } catch {
        return null;
    }
}

function getBatteryPercent() {
    let now = readNumber(`${BATTERY_PATH}/energy_now`);
    let full = readNumber(`${BATTERY_PATH}/energy_full`);

    if (now === null || full === null) {
        now = readNumber(`${BATTERY_PATH}/charge_now`);
        full = readNumber(`${BATTERY_PATH}/charge_full`);
    }

    if (now === null || full === null || full <= 0)
        return 'BAT ?';

    return `${((now / full) * 100).toFixed(2)}%`;
}

export default class DecimalBatteryExtension extends Extension {
    enable() {
        this._label = new St.Label({
            text: getBatteryPercent(),
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'decimal-battery-label',
        });

        this._timeout = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            UPDATE_INTERVAL_SECONDS,
            () => {
                this._label.set_text(getBatteryPercent());
                return GLib.SOURCE_CONTINUE;
            }
        );

        const quickSettings = Main.panel.statusArea.quickSettings;

        if (quickSettings?._indicators) {
            quickSettings._indicators.insert_child_at_index(
                this._label,
                quickSettings._indicators.get_n_children()
            );
        } else {
            Main.panel._rightBox.insert_child_at_index(this._label, 0);
        }
    }

    disable() {
        if (this._timeout) {
            GLib.Source.remove(this._timeout);
            this._timeout = null;
        }

        this._label?.destroy();
        this._label = null;
    }
}