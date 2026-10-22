import { MODULE_ID } from "./constants.mjs";
import { COLOR_DEFAULTS, HEX_COLOR } from "./settings.mjs";
import { getHookElement } from "./compat.mjs";

/*
 * Color controls for the color settings in the settings window. The v11 settings window has no color field, and
 * the browser color picker has no alpha. So each color setting is a text field ("#rrggbbaa"), and this module adds
 * a color picker (the RGB part) and an alpha slider (0 to 100%) next to it. The three controls change each other.
 * The text field stays the value that core saves, so the setting also works if the controls are not added.
 */

/**
 * Handle the renderSettingsConfig hook. Add the color controls next to each color setting of this module.
 * If a core version renders the field differently and it is not found, the text field still works alone.
 * @param {Application} app
 * @param {HTMLElement|jQuery} html  jQuery in v11 and v12, HTMLElement from v13.
 */
export function addColorFields(app, html) {
  const root = getHookElement(html);
  for ( const [key, fallback] of Object.entries(COLOR_DEFAULTS) ) {
    const input = root.querySelector(`input[type="text"][name="${MODULE_ID}.${key}"]`);
    if ( !input || input.dataset.thaColorField ) continue;
    input.dataset.thaColorField = "true";
    attachColorControls(input, fallback);
  }
}

/* -------------------------------------------- */

/**
 * @param {HTMLInputElement} input  The text field of a color setting.
 * @param {string} fallback         The default color, used if the field has no valid color.
 */
function attachColorControls(input, fallback) {
  const start = splitColor(input.value) ?? splitColor(fallback);

  const picker = document.createElement("input");
  picker.type = "color";
  picker.className = "tha-color-picker";
  picker.value = start.rgb;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "tha-alpha-slider";
  Object.assign(slider, {min: 0, max: 100, step: 1, value: start.alpha});
  slider.dataset.tooltip = "TOKEN_HOVER_ART.Settings.ColorOpacity";

  const label = document.createElement("span");
  label.className = "tha-alpha-value";
  label.textContent = `${start.alpha}%`;

  const writeText = () => {
    input.value = joinColor(picker.value, Number(slider.value));
    label.textContent = `${slider.value}%`;
  };
  picker.addEventListener("input", writeText);
  slider.addEventListener("input", writeText);
  input.addEventListener("input", () => {
    const color = splitColor(input.value);
    if ( !color ) return;
    picker.value = color.rgb;
    slider.value = color.alpha;
    label.textContent = `${color.alpha}%`;
  });

  input.after(picker, slider, label);
}

/**
 * @param {string} value
 * @returns {{rgb: string, alpha: number}|null}  The "#rrggbb" part and the alpha in percent, or null if invalid.
 *                                                A color without alpha is fully opaque.
 */
function splitColor(value) {
  const match = HEX_COLOR.exec(value ?? "");
  if ( !match ) return null;
  const alpha = (match[2] === undefined) ? 100 : Math.round(parseInt(match[2], 16) / 2.55);
  return {rgb: `#${match[1]}`, alpha};
}

/**
 * @param {string} rgb    A "#rrggbb" color.
 * @param {number} alpha  The alpha in percent (0 to 100).
 * @returns {string}      The "#rrggbbaa" color.
 */
function joinColor(rgb, alpha) {
  return `${rgb}${Math.round(alpha * 2.55).toString(16).padStart(2, "0")}`;
}
