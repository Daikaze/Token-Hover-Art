/*
 * Core APIs that moved between Foundry versions. The module supports v11 and later.
 *
 * Each getter tries the new namespaced location first and falls back to the v11/v12 global. The order matters:
 * from v13, a deprecated global logs a compatibility warning when it is read, so the global is read only when
 * the namespaced location does not exist.
 *
 * Sources: v11 and v12 from the installed client source. v13 from the official API documentation.
 */

/**
 * The Application V1 DocumentSheet. v13 moved it to foundry.appv1.api and deprecated Application V1.
 * @returns {typeof DocumentSheet}
 */
export function getDocumentSheetClass() {
  return foundry.appv1?.api?.DocumentSheet ?? DocumentSheet;
}

/**
 * The configured FilePicker class. v13 moved it to foundry.applications.apps and made it an ApplicationV2.
 * @returns {typeof FilePicker}
 */
export function getFilePickerClass() {
  return foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
}

/**
 * Load and compile a Handlebars template. v13 moved the template functions to foundry.applications.handlebars.
 * @param {string} path
 * @returns {Promise<Function>}
 */
export function getCompiledTemplate(path) {
  const fn = foundry.applications?.handlebars?.getTemplate ?? getTemplate;
  return fn(path);
}

/**
 * Load and compile several Handlebars templates.
 * @param {string[]} paths
 * @returns {Promise<Function[]>}
 */
export function preloadTemplates(paths) {
  const fn = foundry.applications?.handlebars?.loadTemplates ?? loadTemplates;
  return fn(paths);
}

/**
 * @param {string} path
 * @returns {boolean}  Is the path a video file? v13 moved VideoHelper to foundry.helpers.media.
 */
export function hasVideoExtension(path) {
  const helper = foundry.helpers?.media?.VideoHelper ?? VideoHelper;
  return helper.hasVideoExtension(path);
}

/**
 * Get the root HTML element of a render hook. Application V1 hooks pass a jQuery object;
 * ApplicationV2 hooks (the Token HUD from v13) pass an HTMLElement.
 * @param {HTMLElement|jQuery} html
 * @returns {HTMLElement}
 */
export function getHookElement(html) {
  return (html instanceof HTMLElement) ? html : html[0];
}
