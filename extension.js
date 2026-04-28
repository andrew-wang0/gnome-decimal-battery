// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

const BATTERY_PATH = "/sys/class/power_supply/BAT0";
const UPDATE_INTERVAL_SECONDS = 1;

async function readText(path) {
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

    return new TextDecoder().decode(contents).trim();
  } catch {
    return null;
  }
}

async function readNumber(path) {
  const text = await readText(path);

  if (text === null) {
    return null;
  }

  const value = Number(text);

  return Number.isFinite(value) ? value : null;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  const totalMinutes = Math.round(seconds / 60);

  if (totalMinutes <= 0) {
    return "<1m";
  }

  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatEnergyRate(watts) {
  if (!Number.isFinite(watts) || watts <= 0) {
    return null;
  }

  return `${watts.toFixed(2)} W`;
}

async function getBatteryLabel() {
  const [
    status,
    energyNow,
    energyFull,
    chargeNow,
    chargeFull,
    powerNow,
    currentNow,
    voltageNow,
  ] = await Promise.all([
    readText(`${BATTERY_PATH}/status`),
    readNumber(`${BATTERY_PATH}/energy_now`),
    readNumber(`${BATTERY_PATH}/energy_full`),
    readNumber(`${BATTERY_PATH}/charge_now`),
    readNumber(`${BATTERY_PATH}/charge_full`),
    readNumber(`${BATTERY_PATH}/power_now`),
    readNumber(`${BATTERY_PATH}/current_now`),
    readNumber(`${BATTERY_PATH}/voltage_now`),
  ]);

  let now = energyNow;
  let full = energyFull;

  if (now === null || full === null) {
    now = chargeNow;
    full = chargeFull;
  }

  if (now === null || full === null || full <= 0) {
    return "BAT ?";
  }

  const parts = [`${((now / full) * 100).toFixed(2)}%`];
  const energyRate =
    formatEnergyRate(powerNow !== null ? powerNow / 1_000_000 : null) ??
    formatEnergyRate(
      currentNow !== null && voltageNow !== null
        ? (currentNow * voltageNow) / 1_000_000_000_000
        : null,
    );

  if (status === "Discharging") {
    let timeToEmptySeconds = null;

    if (energyNow !== null && powerNow !== null && powerNow > 0) {
      timeToEmptySeconds = (energyNow / powerNow) * 3600;
    } else if (chargeNow !== null && currentNow !== null && currentNow > 0) {
      timeToEmptySeconds = (chargeNow / currentNow) * 3600;
    }

    const timeToEmpty = formatDuration(timeToEmptySeconds);

    if (timeToEmpty !== null) {
      parts.push(timeToEmpty);
    }

    if (energyRate !== null) {
      parts.push(energyRate);
    }
  } else if (status === "Charging") {
    let timeToFullSeconds = null;

    if (
      energyNow !== null &&
      energyFull !== null &&
      powerNow !== null &&
      powerNow > 0
    ) {
      timeToFullSeconds = ((energyFull - energyNow) / powerNow) * 3600;
    } else if (
      chargeNow !== null &&
      chargeFull !== null &&
      currentNow !== null &&
      currentNow > 0
    ) {
      timeToFullSeconds = ((chargeFull - chargeNow) / currentNow) * 3600;
    }

    const timeToFull = formatDuration(timeToFullSeconds);

    if (timeToFull !== null) {
      parts.push(timeToFull);
    }

    if (energyRate !== null) {
      parts.push(energyRate);
    }
  }

  return parts.join(" | ");
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

    this._label.set_text(await getBatteryLabel());
  }
}
