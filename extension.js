// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

const BATTERY_PATH = "/sys/class/power_supply/BAT0";
const UPDATE_INTERVAL_SECONDS = 1;

async function readNumber(path) {
  try {
    const file = Gio.File.new_for_path(path);

    const [, contents] = await new Promise((resolve, reject) => {
      file.load_contents_async(null, (_file, result) => {
        try {
          resolve(file.load_contents_finish(result));
        } catch (error) {
          reject(error);
        }
      });
    });

    const text = new TextDecoder().decode(contents).trim();
    const value = Number(text);

    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

async function getBatteryPercent() {
  let now = await readNumber(`${BATTERY_PATH}/energy_now`);
  let full = await readNumber(`${BATTERY_PATH}/energy_full`);

  if (now === null || full === null) {
    now = await readNumber(`${BATTERY_PATH}/charge_now`);
    full = await readNumber(`${BATTERY_PATH}/charge_full`);
  }

  if (now === null || full === null || full <= 0) {
    return "BAT ?";
  }

  return `${((now / full) * 100).toFixed(2)}%`;
}

export default class DecimalBatteryExtension extends Extension {
  enable() {
    this._label = new St.Label({
      text: "BAT ?",
      y_align: Clutter.ActorAlign.CENTER,
      style_class: "decimal-battery-label",
    });

    const quickSettings = Main.panel.statusArea.quickSettings;

    if (quickSettings?._indicators) {
      quickSettings._indicators.insert_child_at_index(
        this._label,
        quickSettings._indicators.get_n_children(),
      );
    } else {
      Main.panel._rightBox.insert_child_at_index(this._label, 0);
    }

    this._updateLabel();

    this._timeout = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      UPDATE_INTERVAL_SECONDS,
      () => {
        this._updateLabel();
        return GLib.SOURCE_CONTINUE;
      },
    );
  }

  disable() {
    if (this._timeout) {
      GLib.Source.remove(this._timeout);
      this._timeout = null;
    }

    this._label?.destroy();
    this._label = null;
  }

  async _updateLabel() {
    if (!this._label) {
      return;
    }

    this._label.set_text(await getBatteryPercent());
  }
}
