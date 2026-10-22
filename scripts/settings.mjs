import { MODULE_ID, SETTINGS, POSITIONS } from "./constants.mjs";

/**
 * The color settings, with their defaults. The defaults give the original look of the display
 * (the background is black at 60% opacity: 0x99 / 0xff = 0.6).
 * The settings are hex strings, because the v11 settings window has no color field (see color-fields.mjs).
 */
export const COLOR_DEFAULTS = Object.freeze({
  [SETTINGS.BACKGROUND_COLOR]: "#00000099",
  [SETTINGS.BORDER_COLOR]: "#333333ff"
});

/** A color value in the form "#rrggbb" or "#rrggbbaa". Group 1 is the color, group 2 the optional alpha. */
export const HEX_COLOR = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i;

/**
 * Register the module settings.
 * @param {function(): void} onDisplayChange  Called when a setting that changes the visible display is changed.
 */
export function registerSettings(onDisplayChange) {
  game.settings.register(MODULE_ID, SETTINGS.POSITION, {
    name: "TOKEN_HOVER_ART.Settings.Position.Name",
    hint: "TOKEN_HOVER_ART.Settings.Position.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [POSITIONS.TOP_LEFT]: "TOKEN_HOVER_ART.Settings.Position.TopLeft",
      [POSITIONS.TOP_RIGHT]: "TOKEN_HOVER_ART.Settings.Position.TopRight",
      [POSITIONS.BOTTOM_LEFT]: "TOKEN_HOVER_ART.Settings.Position.BottomLeft",
      [POSITIONS.BOTTOM_RIGHT]: "TOKEN_HOVER_ART.Settings.Position.BottomRight"
    },
    default: POSITIONS.TOP_RIGHT,
    onChange: onDisplayChange
  });

  game.settings.register(MODULE_ID, SETTINGS.MAX_HEIGHT, {
    name: "TOKEN_HOVER_ART.Settings.MaxHeight.Name",
    hint: "TOKEN_HOVER_ART.Settings.MaxHeight.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: {min: 10, max: 90, step: 5},
    default: 40,
    onChange: onDisplayChange
  });

  registerColor(SETTINGS.BACKGROUND_COLOR, "TOKEN_HOVER_ART.Settings.BackgroundColor", onDisplayChange);

  game.settings.register(MODULE_ID, SETTINGS.SHOW_BORDER, {
    name: "TOKEN_HOVER_ART.Settings.ShowBorder.Name",
    hint: "TOKEN_HOVER_ART.Settings.ShowBorder.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: onDisplayChange
  });

  game.settings.register(MODULE_ID, SETTINGS.BORDER_WIDTH, {
    name: "TOKEN_HOVER_ART.Settings.BorderWidth.Name",
    hint: "TOKEN_HOVER_ART.Settings.BorderWidth.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: {min: 1, max: 10, step: 1},
    default: 1,
    onChange: onDisplayChange
  });

  registerColor(SETTINGS.BORDER_COLOR, "TOKEN_HOVER_ART.Settings.BorderColor", onDisplayChange);

  game.settings.register(MODULE_ID, SETTINGS.HIDE_DELAY, {
    name: "TOKEN_HOVER_ART.Settings.HideDelay.Name",
    hint: "TOKEN_HOVER_ART.Settings.HideDelay.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: {min: 0, max: 2000, step: 50},
    default: 250
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_FILTER, {
    name: "TOKEN_HOVER_ART.Settings.DefaultFilter.Name",
    hint: "TOKEN_HOVER_ART.Settings.DefaultFilter.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "*.png"
  });

  // A change takes effect after a reload, so the header buttons, the HUD, and open gallery windows all agree.
  game.settings.register(MODULE_ID, SETTINGS.OWNERS_MANAGE_GALLERY, {
    name: "TOKEN_HOVER_ART.Settings.OwnersManageGallery.Name",
    hint: "TOKEN_HOVER_ART.Settings.OwnersManageGallery.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_NAME, {
    name: "TOKEN_HOVER_ART.Settings.ShowName.Name",
    hint: "TOKEN_HOVER_ART.Settings.ShowName.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: onDisplayChange
  });

  game.settings.register(MODULE_ID, SETTINGS.ENABLED, {
    name: "TOKEN_HOVER_ART.Settings.Enabled.Name",
    hint: "TOKEN_HOVER_ART.Settings.Enabled.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: onDisplayChange
  });

  game.settings.register(MODULE_ID, SETTINGS.USE_CUSTOM_POSITION, {
    name: "TOKEN_HOVER_ART.Settings.UseCustomPosition.Name",
    hint: "TOKEN_HOVER_ART.Settings.UseCustomPosition.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: onDisplayChange
  });

  // The position that this user dragged the display to. See display-layout.mjs for the format.
  game.settings.register(MODULE_ID, SETTINGS.CUSTOM_POSITION, {
    scope: "client",
    config: false,
    type: Object,
    default: null,
    onChange: onDisplayChange
  });

  // The image height that this user resized the display to. See display-layout.mjs for the format.
  game.settings.register(MODULE_ID, SETTINGS.CUSTOM_SIZE, {
    scope: "client",
    config: false,
    type: Object,
    default: null,
    onChange: onDisplayChange
  });

  // The size of the HUD palette. Each user sets it with the resize grip of the palette.
  game.settings.register(MODULE_ID, SETTINGS.PALETTE_SIZE, {
    scope: "client",
    config: false,
    type: Object,
    default: {width: 350, height: 320}
  });
}

/**
 * @param {string} key  A value of SETTINGS.
 * @returns {*}
 */
export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

/**
 * @param {string} key  A key of COLOR_DEFAULTS.
 * @returns {string}    The color setting ("#rrggbb" or "#rrggbbaa"), or its default if the stored text is invalid.
 */
export function getColorSetting(key) {
  const value = getSetting(key);
  return HEX_COLOR.test(value) ? value : COLOR_DEFAULTS[key];
}

/**
 * Register a world color setting.
 * @param {string} key                  A key of COLOR_DEFAULTS.
 * @param {string} i18nPrefix           The localization prefix; ".Name" and ".Hint" are added.
 * @param {function(): void} onChange
 */
function registerColor(key, i18nPrefix, onChange) {
  game.settings.register(MODULE_ID, key, {
    name: `${i18nPrefix}.Name`,
    hint: `${i18nPrefix}.Hint`,
    scope: "world",
    config: true,
    type: String,
    default: COLOR_DEFAULTS[key],
    onChange
  });
}
